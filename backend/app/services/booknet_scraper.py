"""
booknet.ua scraper — imports free Ukrainian books into the platform.

Architecture:
  1. Login to booknet.ua (session persisted in httpx.AsyncClient)
  2. Walk catalog pages (/top/all?page=N) collecting "Безкоштовно" books
  3. For each free book: scrape metadata from book page + full text from reader
  4. Save cover image locally; insert/skip Book record; save text file

Reader pagination:
  - First page of a chapter: GET /reader/{slug}-b{bookId}?c={chapterId}
    (first chapter omits ?c= param)
  - Sub-pages within a chapter: POST /reader/get-page with CSRF token
  - CSRF token: <meta name="csrf-token"> on every reader page

Rate limiting: 1.5 s between requests.
"""

import asyncio
import json
import logging
import re
import uuid
import hashlib
from pathlib import Path
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from app.core.config import settings
from app.core.database import SessionLocal
from app import models

log = logging.getLogger("booknet_scraper")

_BASE = "https://booknet.ua"
_ST   = "https://st.booknet.ua"

# Credentials
_LOGIN  = "a7654837383@gmail.com"
_PASSWD = "Qwerty"

_UPLOAD_BASE   = Path(settings.UPLOAD_DIR).resolve() / "books"
_COVER_BASE    = Path(settings.UPLOAD_DIR).resolve() / "covers"

# Sentinel: how long to wait between requests
_DELAY = 1.5  # seconds

# Zero-width / invisible DRM characters to strip from scraped text
_DRM_RE = re.compile(r"[\u200b\u200c\u200d\u2060\ufeff\u00ad]")

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "uk-UA,uk;q=0.9",
}

# ── system user id used as owner for imported books ──
_SYSTEM_OWNER_ID: Optional[int] = None


def _get_system_owner_id() -> int:
    global _SYSTEM_OWNER_ID
    if _SYSTEM_OWNER_ID is not None:
        return _SYSTEM_OWNER_ID
    with SessionLocal() as db:
        user = db.query(models.User).filter(models.User.role == "admin").first()
        if not user:
            user = db.query(models.User).order_by(models.User.id).first()
        if not user:
            raise RuntimeError("No users in DB — cannot import books")
        _SYSTEM_OWNER_ID = user.id
        return _SYSTEM_OWNER_ID


# ── helpers ──

def _extract_csrf(html: str) -> str:
    """Extract CSRF token from Yii2 meta tag."""
    m = re.search(r'<meta\s+name="csrf-token"\s+content="([^"]+)"', html)
    return m.group(1) if m else ""


def _strip_drm(text: str) -> str:
    """Remove invisible DRM watermark characters from reader text."""
    return _DRM_RE.sub("", text)


def _cover_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:16]


async def _delay() -> None:
    await asyncio.sleep(_DELAY)


# ── login ──

async def _login(client: httpx.AsyncClient) -> bool:
    """Login to booknet.ua. Returns True on success."""
    try:
        resp = await client.get(
            f"{_BASE}/auth/login",
            params={"classic": "1", "link": f"{_BASE}/"},
        )
        resp.raise_for_status()
        csrf = _extract_csrf(resp.text)
        if not csrf:
            log.error("No CSRF token found on login page")
            return False

        await _delay()
        post_resp = await client.post(
            f"{_BASE}/auth/login",
            params={"classic": "1", "link": f"{_BASE}/"},
            data={
                "_csrf": csrf,
                "LoginForm[login]": _LOGIN,
                "LoginForm[password]": _PASSWD,
                "LoginForm[rememberMe]": "1",
                "LoginForm[type]": "v3",
                "LoginForm[captcha]": "",
            },
        )
        # Successful login redirects away from /auth/login
        if "/auth/login" not in str(post_resp.url):
            log.info("booknet.ua login OK (redirected to %s)", post_resp.url)
            return True
        # Check if still on login page (means failure)
        if "LoginForm" in post_resp.text and "error" in post_resp.text.lower():
            log.error("booknet.ua login failed — check credentials")
            return False
        # Some redirects still succeed
        if post_resp.status_code in (200, 302):
            log.info("booknet.ua login likely OK (status %d)", post_resp.status_code)
            return True
        log.error("booknet.ua login failed — status %d", post_resp.status_code)
        return False
    except Exception as exc:
        log.error("Login exception: %s", exc)
        return False


# ── catalog scraping ──

def _parse_catalog_page(html: str) -> list[dict]:
    """
    Parse a /top/all?page=N HTML page.
    Returns list of dicts: {slug_id, title, author, cover_url, is_free}
    where slug_id = 'book-title-slug-b218155'
    """
    soup = BeautifulSoup(html, "html.parser")
    books = []

    # Book cards — booknet.ua catalog uses .bn_book-genre wrapper divs
    for card in soup.select(".bn_book-genre"):
        # Title link — href="/book/{slug}-b{id}"
        link = card.select_one(".bn_book-genre__title-link")
        if not link:
            continue
        href = link.get("href", "")
        m = re.search(r"/book/(.+-b(\d+))$", href)
        if not m:
            continue
        slug_id = m.group(1)   # e.g. "povya-b218155"
        book_id = int(m.group(2))

        # Title
        title = link.get_text(strip=True) or slug_id

        # Author
        author_el = card.select_one(".bn_book-genre__author a")
        author = author_el.get_text(strip=True) if author_el else ""

        # Cover (120px thumbnail; upgraded to 220px in _get_book_meta)
        img = card.select_one(".bn_book-genre__image img")
        cover_url = img.get("src", "") if img else ""
        if cover_url and cover_url.startswith("/"):
            cover_url = _ST + cover_url

        # Free / paid label
        price_el = card.select_one(".bn_book-genre__price")
        price_text = price_el.get_text(strip=True) if price_el else ""
        is_free = "безкоштовно" in price_text.lower()

        books.append({
            "slug_id": slug_id,
            "book_id": book_id,
            "title": title,
            "author": author,
            "cover_url": cover_url,
            "is_free": is_free,
        })

    return books


async def _get_catalog_page(client: httpx.AsyncClient, page: int) -> list[dict]:
    """Fetch and parse one catalog page. Returns [] on error."""
    try:
        resp = await client.get(
            f"{_BASE}/top/all",
            params={"page": str(page)},
        )
        if resp.status_code != 200:
            log.warning("Catalog page %d returned %d", page, resp.status_code)
            return []
        return _parse_catalog_page(resp.text)
    except Exception as exc:
        log.warning("Error fetching catalog page %d: %s", page, exc)
        return []


def _count_catalog_pages(html: str) -> int:
    """Extract total page count from catalog HTML."""
    soup = BeautifulSoup(html, "html.parser")
    # Look for last page number in pagination
    pagination = soup.select(".pagination a, .pager a")
    max_page = 1
    for a in pagination:
        href = a.get("href", "")
        m = re.search(r"page=(\d+)", href)
        if m:
            max_page = max(max_page, int(m.group(1)))
    return max_page


# ── book metadata ──

async def _get_book_meta(client: httpx.AsyncClient, slug_id: str) -> Optional[dict]:
    """
    Fetch /book/{slug_id} and extract description, genres, cover (high-res).
    Returns None on failure.
    """
    try:
        resp = await client.get(f"{_BASE}/book/{slug_id}")
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")

        # Description — booknet.ua uses .bn_book__about-content
        desc_el = soup.select_one(".bn_book__about-content")
        description = desc_el.get_text(separator="\n", strip=True) if desc_el else ""

        # Genres — header genre links + tags block
        genre_els = soup.select("a.bn_book__header-genre, .bn_book__tags a")
        genres = list(dict.fromkeys(
            a.get_text(strip=True) for a in genre_els if a.get_text(strip=True)
        ))

        # High-res cover (220px version)
        cover_el = soup.select_one("img[src*='/covers/']")
        cover_url = ""
        if cover_el:
            raw_src = cover_el.get("src", "")
            # Upgrade to 220px version
            cover_url = re.sub(r"/covers/\d+/", "/covers/220/", raw_src)
            if cover_url.startswith("/"):
                cover_url = _ST + cover_url

        # Check paid status — look for subscription price element
        price_el = soup.select_one(".bn_book__price, [class*='subscribe'], [class*='subscription']")
        price_text = price_el.get_text(strip=True).lower() if price_el else ""
        is_paid = "передплата" in price_text or "грн" in price_text

        return {
            "description": description,
            "genres": genres,
            "cover_url": cover_url,
            "is_paid": is_paid,
        }
    except Exception as exc:
        log.debug("Error fetching book meta for %s: %s", slug_id, exc)
        return None


# ── reader/text scraping ──

async def _get_chapter_page(
    client: httpx.AsyncClient,
    slug_id: str,
    chapter_id: Optional[int],
    page: int,
    csrf: str,
    rsid: str,
) -> tuple[str, str, int]:
    """
    Get one page of a chapter.
    Returns (text, csrf_token, total_pages).
    - page=1: GET /reader/{slug_id}?c={chapter_id}
    - page>1: POST /reader/get-page
    """
    if page == 1:
        # GET request — first page of chapter
        params = {}
        if chapter_id is not None:
            params["c"] = str(chapter_id)
        try:
            resp = await client.get(f"{_BASE}/reader/{slug_id}", params=params)
            if resp.status_code != 200:
                return ("", csrf, 1)
            html = resp.text
            new_csrf = _extract_csrf(html) or csrf
            soup = BeautifulSoup(html, "html.parser")
            text = _extract_reader_page_text(soup)
            total_pages = _extract_total_pages(soup)
            return (text, new_csrf, total_pages)
        except Exception as exc:
            log.debug("Error fetching chapter %s p%d: %s", slug_id, page, exc)
            return ("", csrf, 1)
    else:
        # POST request — subsequent pages
        try:
            post_data = {
                "chapterId": str(chapter_id),
                "page": str(page),
                "rsid": rsid,
                "font": "",
                "theme": "",
                "screen_w": "1470",
                "screen_h": "838",
                "screen_d": "30",
                "referrer": "",
                "tz": "-180",
                "_csrf": csrf,
            }
            resp = await client.post(
                f"{_BASE}/reader/get-page",
                data=post_data,
                headers={"X-Requested-With": "XMLHttpRequest"},
            )
            if resp.status_code != 200:
                return ("", csrf, page)
            # Response is JSON {"status": 1, "data": "<HTML>"}
            html_fragment = _parse_post_response(resp.text)
            soup = BeautifulSoup(html_fragment, "html.parser")
            text = _extract_reader_page_text(soup)
            return (text, csrf, page)
        except Exception as exc:
            log.debug("Error fetching chapter %s p%d via POST: %s", slug_id, page, exc)
            return ("", csrf, page)


def _parse_post_response(response_text: str) -> str:
    """Parse /reader/get-page JSON response. Returns HTML string from 'data' field."""
    try:
        data = json.loads(response_text)
        if data.get("status") == 1:
            return data.get("data", "")
        return ""
    except Exception:
        # Fallback: treat as raw HTML (for robustness)
        return response_text


def _extract_reader_page_text(soup: BeautifulSoup) -> str:
    """Extract plain text from reader page soup."""
    # Primary container — booknet.ua uses .reader-text (full page) or bare <p> tags (POST fragment)
    container = (
        soup.select_one(".reader-text")
        or soup.select_one(".jsReaderText")
        or soup
    )
    # Remove pagination div
    for el in container.select(".reader-pagination"):
        el.decompose()
    # Get text from paragraphs
    paragraphs = container.select("p")
    if paragraphs:
        lines = [p.get_text(separator=" ", strip=True) for p in paragraphs]
    else:
        lines = [container.get_text(separator="\n", strip=True)]
    raw = "\n\n".join(l for l in lines if l)
    return _strip_drm(raw)


def _extract_total_pages(soup: BeautifulSoup) -> int:
    """Extract total page count for the current chapter from pagination."""
    # Count page links in Reader.goTo() calls
    scripts = " ".join(s.string or "" for s in soup.find_all("script") if not s.get("src"))
    page_nums = re.findall(r"Reader\.goTo\((\d+)\)", scripts)
    if page_nums:
        return max(int(p) for p in page_nums)
    # Fallback: count pagination links
    pag = soup.select(".reader-pagination a[onclick*='goTo']")
    if pag:
        nums = re.findall(r"goTo\((\d+)\)", " ".join(a.get("onclick", "") for a in pag))
        if nums:
            return max(int(n) for n in nums)
    return 1


def _extract_chapter_list(html: str) -> list[tuple[int, str]]:
    """
    Extract [(chapter_id, chapter_title), ...] from the reader page chapter select.
    """
    soup = BeautifulSoup(html, "html.parser")
    select = soup.select_one("select.js-chapter-change, select.audio_track_list")
    if not select:
        return []
    result = []
    for opt in select.select("option"):
        val = opt.get("value", "")
        if val and val.isdigit():
            result.append((int(val), opt.get_text(strip=True)))
    return result


async def _scrape_book_text(
    client: httpx.AsyncClient, slug_id: str
) -> Optional[str]:
    """
    Scrape the full text of a book from the reader.
    Returns plain text string, or None on failure.
    """
    rsid = uuid.uuid4().hex  # random reader session ID

    # Fetch first chapter to get chapter list + CSRF token
    try:
        resp = await client.get(f"{_BASE}/reader/{slug_id}")
        if resp.status_code != 200:
            log.warning("Reader returned %d for %s", resp.status_code, slug_id)
            return None
        html = resp.text
    except Exception as exc:
        log.warning("Error fetching reader for %s: %s", slug_id, exc)
        return None

    csrf = _extract_csrf(html)
    chapters = _extract_chapter_list(html)
    if not chapters:
        # Single-chapter book — just use what we have
        soup = BeautifulSoup(html, "html.parser")
        text = _extract_reader_page_text(soup)
        total_pages = _extract_total_pages(soup)
        all_text = [text]
        for page_num in range(2, total_pages + 1):
            await _delay()
            page_text, csrf, _ = await _get_chapter_page(
                client, slug_id, None, page_num, csrf, rsid
            )
            if page_text:
                all_text.append(page_text)
        return "\n\n".join(t for t in all_text if t) or None

    # First chapter text is already in the initial HTML
    soup = BeautifulSoup(html, "html.parser")
    first_chapter_text = _extract_reader_page_text(soup)
    first_chapter_total_pages = _extract_total_pages(soup)

    all_text: list[str] = []
    if first_chapter_text:
        all_text.append(first_chapter_text)

    # Fetch remaining pages of the first chapter
    first_chapter_id = chapters[0][0]
    for page_num in range(2, first_chapter_total_pages + 1):
        await _delay()
        page_text, csrf, _ = await _get_chapter_page(
            client, slug_id, first_chapter_id, page_num, csrf, rsid
        )
        if page_text:
            all_text.append(page_text)

    log.info(
        "[%s] Ch1 done: %d pages, %d chapters total",
        slug_id, first_chapter_total_pages, len(chapters),
    )

    # Fetch remaining chapters
    for ch_idx, (chapter_id, chapter_title) in enumerate(chapters[1:], start=2):
        await _delay()
        page_text, csrf, total_pages = await _get_chapter_page(
            client, slug_id, chapter_id, 1, csrf, rsid
        )
        if page_text:
            # Prepend chapter title as a heading
            all_text.append(f"\n\n{chapter_title}\n\n{page_text}")
        else:
            all_text.append(f"\n\n{chapter_title}\n\n")

        # Remaining pages of this chapter
        for page_num in range(2, total_pages + 1):
            await _delay()
            sub_text, csrf, _ = await _get_chapter_page(
                client, slug_id, chapter_id, page_num, csrf, rsid
            )
            if sub_text:
                all_text.append(sub_text)

        if ch_idx % 5 == 0:
            log.debug("[%s] Progress: chapter %d/%d", slug_id, ch_idx, len(chapters))

    full_text = "\n\n".join(t for t in all_text if t)
    if len(full_text.strip()) < 200:
        log.warning("[%s] Text too short (%d chars), skipping", slug_id, len(full_text))
        return None
    return full_text


# ── cover download ──

async def _download_cover(client: httpx.AsyncClient, cover_url: str) -> str:
    """Download cover image, save locally. Returns /api/files/covers/{name} or ''."""
    if not cover_url:
        return ""
    try:
        resp = await client.get(cover_url, timeout=15.0)
        if resp.status_code != 200:
            return ""
        _COVER_BASE.mkdir(parents=True, exist_ok=True)
        ext = cover_url.rsplit(".", 1)[-1].lower()
        if ext not in ("jpg", "jpeg", "png", "webp"):
            ext = "jpg"
        name = f"{_cover_hash(cover_url)}.{ext}"
        dest = _COVER_BASE / name
        if not dest.exists():
            dest.write_bytes(resp.content)
        return f"/api/files/covers/{name}"
    except Exception as exc:
        log.debug("Cover download failed for %s: %s", cover_url, exc)
        return ""


# ── DB helpers ──

def _book_exists(booknet_url: str) -> bool:
    """Check if a book with this text_url (booknet reader URL) already exists."""
    with SessionLocal() as db:
        return db.query(models.Book).filter(models.Book.text_url == booknet_url).first() is not None


def _save_text_file(content: str) -> str:
    """Write text to uploads/books/{uuid}.txt. Returns relative path."""
    _UPLOAD_BASE.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.txt"
    dest = _UPLOAD_BASE / name
    dest.write_text(content, encoding="utf-8")
    return f"books/{name}"


def _insert_book(
    title: str,
    author: str,
    description: str,
    genres: list[str],
    cover_local: str,
    text_path: str,
    text_url: str,
    owner_id: int,
) -> int:
    """Insert a new Book record. Returns the new book id."""
    with SessionLocal() as db:
        book = models.Book(
            title=title,
            author_name=author,
            description=description,
            genres=genres,
            cover_url=cover_local,
            text_path=text_path,
            text_url=text_url,
            total_chars=0,  # will update after save
            language="uk",
            is_premium=False,
            status="published",
            owner_id=owner_id,
        )
        db.add(book)
        db.commit()
        db.refresh(book)
        return book.id


def _update_book_chars(book_id: int, char_count: int) -> None:
    with SessionLocal() as db:
        b = db.query(models.Book).filter(models.Book.id == book_id).first()
        if b:
            b.total_chars = char_count
            db.commit()


# ── main scraper entry point ──

async def scrape_booknet(
    max_pages: int = 5,
    max_books: int = 50,
    session_cookie: Optional[str] = None,
) -> dict:
    """
    Scrape booknet.ua for free Ukrainian books.

    Args:
        max_pages: how many catalog pages to scan (each has ~20 books)
        max_books: stop after importing this many books
        session_cookie: booknet.ua 'litera-frontend' session cookie value.
            If provided, skips the login step.  Obtain by logging in via a
            browser and copying the cookie named 'litera-frontend'.

    Returns:
        {"imported": N, "skipped": N, "failed": N}
    """
    stats = {"imported": 0, "skipped": 0, "failed": 0}

    owner_id = _get_system_owner_id()

    init_cookies: dict = {}
    if session_cookie:
        init_cookies["litera-frontend"] = session_cookie
        log.info("Using provided session cookie for booknet.ua")

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=10.0),
        follow_redirects=True,
        headers=_HEADERS,
        cookies=init_cookies,
    ) as client:
        # Login (only if no session cookie provided)
        logged_in = bool(session_cookie)
        if not logged_in:
            logged_in = await _login(client)
        if not logged_in:
            log.warning("Proceeding without login — only truly public books will be scraped")

        page_num = 1
        while page_num <= max_pages and stats["imported"] < max_books:
            await _delay()
            catalog_books = await _get_catalog_page(client, page_num)
            if not catalog_books:
                log.info("Catalog page %d empty or failed, stopping", page_num)
                break

            log.info(
                "Catalog page %d: %d books (%d free)",
                page_num,
                len(catalog_books),
                sum(1 for b in catalog_books if b["is_free"]),
            )

            for entry in catalog_books:
                if stats["imported"] >= max_books:
                    break

                if not entry["is_free"]:
                    stats["skipped"] += 1
                    continue

                slug_id = entry["slug_id"]
                reader_url = f"{_BASE}/reader/{slug_id}"

                # Skip already-imported
                if _book_exists(reader_url):
                    log.debug("Already imported: %s", slug_id)
                    stats["skipped"] += 1
                    continue

                log.info("Importing %s — %s by %s", slug_id, entry["title"], entry["author"])

                # Get extra metadata
                await _delay()
                meta = await _get_book_meta(client, slug_id)
                if meta and meta.get("is_paid"):
                    log.debug("Book %s turned out to be paid, skipping", slug_id)
                    stats["skipped"] += 1
                    continue

                description = (meta or {}).get("description", "")
                genres = (meta or {}).get("genres", [])
                cover_url_high = (meta or {}).get("cover_url", "") or entry["cover_url"]

                # Download cover
                await _delay()
                cover_local = await _download_cover(client, cover_url_high)

                # Scrape full text
                log.info("Scraping text for %s...", slug_id)
                text = await _scrape_book_text(client, slug_id)
                if not text:
                    log.warning("No text scraped for %s", slug_id)
                    stats["failed"] += 1
                    continue

                # Save text file
                text_path = await asyncio.to_thread(_save_text_file, text)

                # Insert into DB
                book_id = await asyncio.to_thread(
                    _insert_book,
                    entry["title"],
                    entry["author"],
                    description,
                    genres,
                    cover_local,
                    text_path,
                    reader_url,
                    owner_id,
                )
                await asyncio.to_thread(_update_book_chars, book_id, len(text))

                log.info(
                    "Imported book %d: '%s' (%d chars, %d genres)",
                    book_id, entry["title"], len(text), len(genres),
                )
                stats["imported"] += 1

            page_num += 1

    log.info(
        "booknet scrape done — imported=%d skipped=%d failed=%d",
        stats["imported"], stats["skipped"], stats["failed"],
    )
    return stats


# ── Periodic background task ──

async def run_booknet_forever(initial_delay: float = 120.0) -> None:
    """
    Background loop that periodically scrapes booknet.ua for new free books.
    Reads BOOKNET_SESSION_COOKIE, BOOKNET_BOOKS_PER_RUN, BOOKNET_INTERVAL_MINUTES
    from settings.  Does nothing if BOOKNET_SESSION_COOKIE is empty.
    """
    await asyncio.sleep(initial_delay)

    # Import here to avoid circular imports at module load time
    from app.core.config import settings

    if not settings.BOOKNET_SESSION_COOKIE:
        log.info(
            "BOOKNET_SESSION_COOKIE not set — booknet periodic scraper disabled. "
            "Set it in .env to enable automatic book importing."
        )
        return

    # Track which catalog page we're on; rotate through pages so we don't
    # always import the same books.
    catalog_page = 1
    interval_s = settings.BOOKNET_INTERVAL_MINUTES * 60

    log.info(
        "booknet periodic scraper started — every %d min, %d books/run",
        settings.BOOKNET_INTERVAL_MINUTES,
        settings.BOOKNET_BOOKS_PER_RUN,
    )

    while True:
        try:
            result = await scrape_booknet(
                max_pages=2,
                max_books=settings.BOOKNET_BOOKS_PER_RUN,
                session_cookie=settings.BOOKNET_SESSION_COOKIE,
            )
            imported = result.get("imported", 0)
            log.info(
                "booknet periodic run (page ~%d): imported=%d skipped=%d failed=%d",
                catalog_page,
                imported,
                result.get("skipped", 0),
                result.get("failed", 0),
            )
            # Advance page window so next run picks different books
            catalog_page = (catalog_page % 50) + 1
        except Exception as exc:
            log.warning("booknet periodic scrape error: %s", exc)

        await asyncio.sleep(interval_s)

