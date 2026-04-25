"""
Background text scraper — downloads and caches book texts locally.

Workflow:
  Phase 1: books that already have text_url → download + save to /uploads/books/
  Phase 2: books with no text at all        → Gutendex search → download + save

Called at startup (initial batch) and then loops weekly.
"""
import asyncio
import logging
import re
import uuid
from html.parser import HTMLParser as _HTMLParser
from pathlib import Path
from typing import Optional

import httpx

from app import models
from app.core.config import settings
from app.core.database import SessionLocal

log = logging.getLogger("text_scraper")

_UPLOAD_BASE = Path(settings.UPLOAD_DIR).resolve() / "books"
_SEM = asyncio.Semaphore(4)  # max concurrent HTTP downloads


# ── Minimal HTML stripper (same logic as books.py, duplicated to avoid circular import) ──

class _Stripper(_HTMLParser):
    _BLOCK = frozenset({"p", "br", "div", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "li", "blockquote"})
    _SKIP = frozenset({"script", "style", "head", "nav", "footer", "header"})

    def __init__(self):
        super().__init__()
        self._buf: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, _attrs) -> None:
        if tag in self._SKIP:
            self._skip += 1
        if tag in self._BLOCK:
            self._buf.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP:
            self._skip = max(0, self._skip - 1)
        if tag in self._BLOCK:
            self._buf.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self._buf.append(data)

    def get_text(self) -> str:
        raw = "".join(self._buf)
        raw = re.sub(r"[ \t]{2,}", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def _strip_html(raw: bytes) -> bytes:
    try:
        p = _Stripper()
        p.feed(raw.decode("utf-8", errors="replace"))
        return p.get_text().encode("utf-8")
    except Exception:
        return raw


def _looks_like_html(data: bytes, ct: str) -> bool:
    if "html" in ct.lower():
        return True
    pfx = data.lstrip()[:20].lower()
    return pfx.startswith(b"<!doctype") or pfx.startswith(b"<html")


# ── Filesystem helpers (sync, called via asyncio.to_thread) ──

def _save_text_file(content: bytes) -> str:
    """Write content to uploads/books/{uuid}.txt. Returns relative path."""
    _UPLOAD_BASE.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.txt"
    dest = _UPLOAD_BASE / name
    dest.write_bytes(content)
    return f"books/{name}"


def _persist_to_db(book_id: int, rel_path: str, char_count: int, text_url: str = "") -> None:
    """Sync: update book record with text_path (and optionally text_url)."""
    with SessionLocal() as db:
        b = db.query(models.Book).filter(models.Book.id == book_id).first()
        if b:
            b.text_path = rel_path
            b.total_chars = char_count
            if text_url:
                b.text_url = text_url
            db.commit()


def _clear_text_url(book_id: int) -> None:
    """Sync: wipe text_url for a book whose URL is inaccessible (401/403/lend)."""
    with SessionLocal() as db:
        b = db.query(models.Book).filter(models.Book.id == book_id).first()
        if b:
            b.text_url = ""
            db.commit()


def _get_books_with_url(limit: int) -> list[tuple[int, str]]:
    """Sync: return [(book_id, text_url)] for books that have a URL but no local file."""
    with SessionLocal() as db:
        rows = (
            db.query(models.Book.id, models.Book.text_url)
            .filter(models.Book.text_url != "")
            .filter(models.Book.text_url.isnot(None))
            .filter(
                (models.Book.text_path == "") | models.Book.text_path.is_(None)
            )
            .limit(limit)
            .all()
        )
        return [(r.id, r.text_url) for r in rows]


def _get_books_without_text(limit: int) -> list[tuple[int, str, str]]:
    """Sync: return [(book_id, title, author)] for books with no text at all."""
    with SessionLocal() as db:
        rows = (
            db.query(models.Book.id, models.Book.title, models.Book.author_name)
            .filter(
                (models.Book.text_url == "") | models.Book.text_url.is_(None)
            )
            .filter(
                (models.Book.text_path == "") | models.Book.text_path.is_(None)
            )
            .limit(limit)
            .all()
        )
        return [(r.id, r.title or "", r.author_name or "") for r in rows]


def _count_uncached() -> int:
    """Sync: total books with text_url but no text_path."""
    with SessionLocal() as db:
        return (
            db.query(models.Book)
            .filter(models.Book.text_url != "")
            .filter(models.Book.text_url.isnot(None))
            .filter(
                (models.Book.text_path == "") | models.Book.text_path.is_(None)
            )
            .count()
        )


# ── Async fetch helpers ──

# Sentinel returned when a URL is permanently inaccessible (401/403)
_BLOCKED = object()


async def _fetch_url(url: str, client: httpx.AsyncClient):
    """
    Download URL with HTML stripping.
    Returns:
      bytes        — content if valid text (≥300 chars)
      _BLOCKED     — server returned 401 or 403 (lending/restricted)
      None         — any other failure (network error, 404, too short)
    """
    async with _SEM:
        try:
            resp = await client.get(url)
            if resp.status_code in (401, 403):
                return _BLOCKED
            if resp.status_code >= 400:
                return None
            data = resp.content
            ct = resp.headers.get("content-type", "")
            if _looks_like_html(data, ct):
                data = _strip_html(data)
            return data if len(data.strip()) >= 300 else None
        except Exception as exc:
            log.debug("Fetch failed %s: %s", url, exc)
            return None


async def _fetch(url: str, client: httpx.AsyncClient) -> Optional[bytes]:
    """Simplified fetch for Gutendex/IA search (treats blocked as None)."""
    result = await _fetch_url(url, client)
    return None if result is _BLOCKED else result


async def _cache_from_url(book_id: int, text_url: str, client: httpx.AsyncClient) -> str:
    """
    Download text_url → save locally → update DB.
    Returns: 'cached' | 'blocked' | 'failed'
    """
    result = await _fetch_url(text_url, client)
    if result is _BLOCKED:
        # Lending-library or restricted — wipe the bad URL so Phase 2 can try Gutendex/IA
        await asyncio.to_thread(_clear_text_url, book_id)
        log.debug("Cleared blocked URL for book %d: %s", book_id, text_url[:60])
        return "blocked"
    if result is None:
        return "failed"
    rel_path = await asyncio.to_thread(_save_text_file, result)
    await asyncio.to_thread(_persist_to_db, book_id, rel_path, len(result))
    log.info("Cached text for book %d (%d bytes) → %s", book_id, len(result), rel_path)
    return "cached"


async def _cache_from_gutendex(
    book_id: int, title: str, author: str, client: httpx.AsyncClient
) -> bool:
    """Search Gutendex, download first matching plain-text, save locally. Returns True on success."""
    q = f"{title} {author}".strip()[:100]
    if not q:
        return False
    try:
        resp = await client.get(
            "https://gutendex.com/books",
            params={"search": q},
            timeout=12.0,
        )
        if resp.status_code != 200:
            return False
        for item in (resp.json().get("results") or [])[:5]:
            fmts = item.get("formats") or {}
            url = (
                fmts.get("text/plain; charset=utf-8")
                or fmts.get("text/plain; charset=us-ascii")
                or fmts.get("text/plain")
                or ""
            )
            if not url:
                continue
            content = await _fetch(url, client)
            if content:
                rel_path = await asyncio.to_thread(_save_text_file, content)
                await asyncio.to_thread(_persist_to_db, book_id, rel_path, len(content), url)
                log.info(
                    "Gutendex found+cached book %d (%d bytes) → %s",
                    book_id, len(content), rel_path,
                )
                return True
    except Exception as exc:
        log.debug("Gutendex search failed for book %d: %s", book_id, exc)
    return False


async def _cache_from_ia_search(
    book_id: int, title: str, author: str, client: httpx.AsyncClient
) -> bool:
    """
    Search Internet Archive by title+author, try to fetch DjVu text.
    Good for Ukrainian and other non-English books not in Gutenberg.
    """
    if not title:
        return False
    # Build a lenient IA search query
    q_parts = [f'title:({title[:80]})']
    if author:
        q_parts.append(f'creator:({author[:60]})')
    q_parts.append('mediatype:texts')
    q = " AND ".join(q_parts)
    try:
        resp = await client.get(
            "https://archive.org/advancedsearch.php",
            params={
                "q": q,
                "fl[]": "identifier",
                "output": "json",
                "rows": "5",
            },
            timeout=12.0,
        )
        if resp.status_code != 200:
            return False
        docs = (resp.json().get("response") or {}).get("docs") or []
        for doc in docs[:5]:
            identifier = doc.get("identifier", "")
            if not identifier:
                continue
            text_url = f"https://archive.org/download/{identifier}/{identifier}_djvu.txt"
            content = await _fetch(text_url, client)
            if content:
                rel_path = await asyncio.to_thread(_save_text_file, content)
                await asyncio.to_thread(_persist_to_db, book_id, rel_path, len(content), text_url)
                log.info(
                    "IA search found+cached book %d (%d bytes) → %s",
                    book_id, len(content), rel_path,
                )
                return True
    except Exception as exc:
        log.debug("IA search failed for book %d: %s", book_id, exc)
    return False


# ── Public API ──

async def run_scraper_batch(batch_size: int = 150) -> dict:
    """
    Process one batch of uncached books.
    Returns {"cached": N, "found_new": M, "failed": K, "blocked": B}.
    """
    stats = {"cached": 0, "found_new": 0, "failed": 0, "blocked": 0}

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0, connect=10.0),
        follow_redirects=True,
        headers={"User-Agent": "Chytalnya/1.0 (text archiver; contact: admin@chytalnya.ua)"},
    ) as client:

        # Phase 1: books with existing text_url
        phase1 = await asyncio.to_thread(_get_books_with_url, batch_size)
        if phase1:
            results = await asyncio.gather(
                *[_cache_from_url(bid, url, client) for bid, url in phase1],
                return_exceptions=True,
            )
            for r in results:
                if r == "cached":
                    stats["cached"] += 1
                elif r == "blocked":
                    stats["blocked"] += 1  # URL cleared, book will retry via Phase 2
                else:
                    stats["failed"] += 1
            log.info(
                "Phase 1: %d cached, %d blocked/cleared, %d failed out of %d",
                stats["cached"], stats["blocked"], stats["failed"], len(phase1),
            )

        # Phase 2: books with no text at all — try Gutendex then IA search
        remaining = max(0, batch_size - len(phase1))
        if remaining > 0:
            phase2 = await asyncio.to_thread(_get_books_without_text, remaining)
            if phase2:

                async def _find_text(bid: int, t: str, a: str) -> bool:
                    """Try Gutendex first, then IA title search."""
                    return (
                        await _cache_from_gutendex(bid, t, a, client)
                        or await _cache_from_ia_search(bid, t, a, client)
                    )

                results2 = await asyncio.gather(
                    *[_find_text(bid, t, a) for bid, t, a in phase2],
                    return_exceptions=True,
                )
                for r in results2:
                    if r is True:
                        stats["found_new"] += 1
                log.info(
                    "Phase 2: %d/%d books found via Gutendex/IA search",
                    stats["found_new"], len(phase2),
                )

    log.info(
        "Scraper batch complete — cached=%d  found_new=%d  blocked=%d  failed=%d",
        stats["cached"], stats["found_new"], stats["blocked"], stats["failed"],
    )
    return stats


async def run_scraper_forever(initial_delay: float = 5.0) -> None:
    """
    Background loop: drain the uncached queue in batches, then sleep 1 week and repeat.
    Pass initial_delay (seconds) to let the app fully start before the first batch.
    """
    await asyncio.sleep(initial_delay)

    while True:
        log.info("Text scraper sweep started")
        total_cached = 0
        total_new = 0
        total_blocked = 0

        # Keep running batches until the queue is empty or nothing changes
        while True:
            remaining = await asyncio.to_thread(_count_uncached)
            if remaining == 0:
                break
            stats = await run_scraper_batch(batch_size=150)
            total_cached += stats["cached"]
            total_new += stats["found_new"]
            total_blocked += stats["blocked"]

            # Stop if nothing productive happened (no caches, no clears, no new finds)
            if stats["cached"] + stats["found_new"] + stats["blocked"] == 0:
                break

            # Brief pause between batches to avoid hammering external servers
            await asyncio.sleep(2.0)

        log.info(
            "Text scraper sweep done — total_cached=%d  total_new=%d  total_blocked=%d  sleeping 7 days",
            total_cached, total_new, total_blocked,
        )
        await asyncio.sleep(7 * 24 * 3600)  # one week
