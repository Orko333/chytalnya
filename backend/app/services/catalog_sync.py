"""Live external catalog sync with source-prioritized metadata quality scoring."""
from __future__ import annotations

from typing import Any
from xml.etree import ElementTree as ET

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models

_OPENLIB_SEARCH = "https://openlibrary.org/search.json"
_GUTENDEX_SEARCH = "https://gutendex.com/books"
_GOOGLE_BOOKS_SEARCH = "https://www.googleapis.com/books/v1/volumes"
_ARCHIVE_ADVANCED = "https://archive.org/advancedsearch.php"
_STANDARD_EBOOKS_OPDS = "https://standardebooks.org/opds/all"

_SOURCE_PRIORITY: dict[str, float] = {
    "google_books": 1.00,
    "standard_ebooks": 0.95,
    "openlibrary": 0.90,
    "internet_archive": 0.80,
    "gutendex": 0.75,
}


def _pick_owner_id(db: Session) -> int | None:
    admin = db.query(models.User).filter(models.User.role == "admin").first()
    if admin:
        return admin.id
    user = db.query(models.User).order_by(models.User.id.asc()).first()
    return user.id if user else None


def _normalize(value: str) -> str:
    return (value or "").strip().lower()


def _lang_to_app(lang: str) -> str:
    lang = (lang or "").lower()
    if lang in ("uk", "ukr", "ukrainian"):
        return "uk"
    if lang in ("pl", "pol", "polish"):
        return "pl"
    if lang in ("de", "ger", "deu", "german"):
        return "de"
    if lang in ("fr", "fre", "fra", "french"):
        return "fr"
    if lang in ("es", "spa", "spanish"):
        return "es"
    return "en"


def _book_exists(db: Session, title: str, author: str) -> models.Book | None:
    t = _normalize(title)
    a = _normalize(author)
    if not t:
        return None
    rows = db.query(models.Book).filter(func.lower(models.Book.title) == t).all()
    for row in rows:
        if _normalize(row.author_name or "") == a:
            return row
    return None


def _extract_openlibrary(query: str, limit: int) -> list[dict[str, Any]]:
    params = {
        "q": query,
        "limit": str(limit),
    }
    books: list[dict[str, Any]] = []
    with httpx.Client(timeout=10.0) as client:
        r = client.get(_OPENLIB_SEARCH, params=params)
        if r.status_code != 200:
            return books
        docs = r.json().get("docs", [])
        for d in docs:
            title = d.get("title") or ""
            author_name = (d.get("author_name") or [""])[0]
            if not title:
                continue
            cover_id = d.get("cover_i")
            cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else ""
            desc_bits = []
            if d.get("first_publish_year"):
                desc_bits.append(f"Перше видання: {d.get('first_publish_year')}")
            subjects = d.get("subject") or []
            if subjects:
                desc_bits.append("Теми: " + ", ".join(subjects[:5]))
            books.append({
                "source": "openlibrary",
                "title": title,
                "author_name": author_name,
                "description": " | ".join(desc_bits),
                "genres": [s for s in subjects[:5] if isinstance(s, str)],
                "language": "uk" if "ukr" in (d.get("language") or []) else _lang_to_app((d.get("language") or ["en"])[0]),
                "cover_url": cover_url,
            })
    return books


def _extract_gutendex(query: str, limit: int) -> list[dict[str, Any]]:
    params = {
        "search": query,
        "page": "1",
    }
    books: list[dict[str, Any]] = []
    with httpx.Client(timeout=10.0) as client:
        r = client.get(_GUTENDEX_SEARCH, params=params)
        if r.status_code != 200:
            return books
        rows = r.json().get("results", [])
        for d in rows[:limit]:
            title = d.get("title") or ""
            authors = d.get("authors") or []
            author_name = authors[0].get("name", "") if authors else ""
            if not title:
                continue
            subjects = d.get("subjects") or []
            formats = d.get("formats") or {}

            # Best plain text URL (Project Gutenberg serves real readable text)
            text_url = (
                formats.get("text/plain; charset=utf-8")
                or formats.get("text/plain; charset=us-ascii")
                or formats.get("text/plain")
                or ""
            )
            # Cover image from formats
            cover_url = formats.get("image/jpeg") or ""

            books.append({
                "source": "gutendex",
                "title": title,
                "author_name": author_name,
                "description": f"Gutenberg ID: {d.get('id')}",
                "genres": [s for s in subjects[:5] if isinstance(s, str)],
                "language": "uk" if "uk" in (d.get("languages") or []) else "en",
                "cover_url": cover_url,
                "text_url": text_url,
            })
    return books


def _extract_google_books(query: str, limit: int) -> list[dict[str, Any]]:
    params = {
        "q": query,
        "maxResults": str(min(max(limit, 1), 40)),
        "printType": "books",
        "langRestrict": "uk",
    }
    books: list[dict[str, Any]] = []
    with httpx.Client(timeout=10.0) as client:
        r = client.get(_GOOGLE_BOOKS_SEARCH, params=params)
        if r.status_code != 200:
            return books
        for item in (r.json().get("items") or []):
            info = item.get("volumeInfo") or {}
            title = info.get("title") or ""
            if not title:
                continue
            authors = info.get("authors") or [""]
            desc = info.get("description") or ""
            cats = info.get("categories") or []
            imgs = info.get("imageLinks") or {}
            cover = imgs.get("thumbnail") or imgs.get("smallThumbnail") or ""
            if cover.startswith("http://"):
                cover = "https://" + cover[len("http://"):]
            books.append({
                "source": "google_books",
                "title": title,
                "author_name": authors[0] if authors else "",
                "description": desc,
                "genres": [c for c in cats[:5] if isinstance(c, str)],
                "language": _lang_to_app(info.get("language") or "en"),
                "cover_url": cover,
            })
    return books


def _extract_internet_archive(query: str, limit: int) -> list[dict[str, Any]]:
    params = {
        "q": f"title:({query}) AND mediatype:texts",
        "fl[]": ["identifier", "title", "creator", "language", "subject"],
        "rows": str(limit),
        "page": "1",
        "output": "json",
    }
    books: list[dict[str, Any]] = []
    with httpx.Client(timeout=12.0) as client:
        r = client.get(_ARCHIVE_ADVANCED, params=params)
        if r.status_code != 200:
            return books
        docs = ((r.json().get("response") or {}).get("docs") or [])
        for d in docs:
            title = d.get("title") or ""
            if not title:
                continue
            creator = d.get("creator") or ""
            if isinstance(creator, list):
                creator = creator[0] if creator else ""
            language = d.get("language") or "en"
            if isinstance(language, list):
                language = language[0] if language else "en"
            subject = d.get("subject") or []
            if isinstance(subject, str):
                subject = [subject]
            identifier = d.get("identifier") or ""
            cover = f"https://archive.org/services/img/{identifier}" if identifier else ""
            # Use /download/ (not /stream/ which returns HTML viewer)
            ia_text_url = f"https://archive.org/download/{identifier}/{identifier}_djvu.txt" if identifier else ""
            books.append({
                "source": "internet_archive",
                "title": title,
                "author_name": creator,
                "description": f"Internet Archive ID: {identifier}" if identifier else "",
                "genres": [s for s in subject[:5] if isinstance(s, str)],
                "language": _lang_to_app(language),
                "cover_url": cover,
                "text_url": ia_text_url,
            })
    return books


def _extract_standard_ebooks(query: str, limit: int) -> list[dict[str, Any]]:
    books: list[dict[str, Any]] = []
    q = _normalize(query)
    with httpx.Client(timeout=14.0) as client:
        r = client.get(_STANDARD_EBOOKS_OPDS)
        if r.status_code != 200:
            return books
        try:
            root = ET.fromstring(r.text)
        except ET.ParseError:
            return books

        ns = {
            "a": "http://www.w3.org/2005/Atom",
            "dc": "http://purl.org/dc/terms/",
        }
        for entry in root.findall("a:entry", ns):
            title = (entry.findtext("a:title", default="", namespaces=ns) or "").strip()
            author_name = (entry.findtext("a:author/a:name", default="", namespaces=ns) or "").strip()
            if not title:
                continue
            hay = f"{_normalize(title)} {_normalize(author_name)}"
            if q and q not in hay:
                continue

            desc = (entry.findtext("a:summary", default="", namespaces=ns) or "").strip()
            cover_url = ""
            genres: list[str] = []
            for link in entry.findall("a:link", ns):
                rel = (link.attrib.get("rel") or "").lower()
                href = link.attrib.get("href") or ""
                typ = (link.attrib.get("type") or "").lower()
                if "image" in rel and href:
                    if href.startswith("/"):
                        href = "https://standardebooks.org" + href
                    elif href.startswith("./"):
                        href = "https://standardebooks.org/opds/" + href[2:]
                    cover_url = href
                if typ == "application/epub+zip" and not desc:
                    desc = "Standard Ebooks"
            for cat in entry.findall("a:category", ns):
                term = (cat.attrib.get("term") or "").strip()
                if term:
                    genres.append(term)

            books.append({
                "source": "standard_ebooks",
                "title": title,
                "author_name": author_name,
                "description": desc,
                "genres": genres[:5],
                "language": "en",
                "cover_url": cover_url,
            })
            if len(books) >= limit:
                break
    return books


def _metadata_score(item: dict[str, Any]) -> float:
    base = _SOURCE_PRIORITY.get(str(item.get("source") or ""), 0.5) * 10.0
    if item.get("cover_url"):
        base += 4.0
    if item.get("description") and len(str(item.get("description"))) >= 80:
        base += 3.0
    elif item.get("description"):
        base += 1.5
    genres = item.get("genres") or []
    if isinstance(genres, list):
        base += min(2.5, 0.7 * len(genres))
    if item.get("author_name"):
        base += 1.0
    return base


def _merge_candidates(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        title = _normalize(item.get("title", ""))
        author = _normalize(item.get("author_name", ""))
        if not title:
            continue
        key = f"{title}|{author}"
        grouped.setdefault(key, []).append(item)

    merged: list[dict[str, Any]] = []
    for group in grouped.values():
        best = max(group, key=_metadata_score)
        # Always carry forward the best text_url from any source in the group
        if not best.get("text_url"):
            for candidate in group:
                if candidate.get("text_url"):
                    best = dict(best)  # copy before mutating
                    best["text_url"] = candidate["text_url"]
                    break
        merged.append(best)
    return merged


def live_sync_books(db: Session, query: str, limit: int = 40) -> int:
    """
    Pull books from external sources in real time and upsert into local DB.
    Returns number of newly inserted books.
    """
    query = (query or "").strip()
    if not query:
        return 0

    owner_id = _pick_owner_id(db)
    if owner_id is None:
        return 0

    external: list[dict[str, Any]] = []
    for extractor in (
        _extract_google_books,
        _extract_openlibrary,
        _extract_standard_ebooks,
        _extract_internet_archive,
        _extract_gutendex,
    ):
        try:
            external.extend(extractor(query, limit=limit))
        except Exception:
            continue

    candidates = _merge_candidates(external)

    inserted = 0
    for item in candidates:
        title = item.get("title", "").strip()
        author_name = item.get("author_name", "").strip()
        if not title:
            continue

        existing = _book_exists(db, title, author_name)
        if existing:
            # Refresh metadata when new candidate has significantly higher quality.
            current_score = _metadata_score({
                "source": "local",
                "cover_url": existing.cover_url,
                "description": existing.description,
                "genres": existing.genres,
                "author_name": existing.author_name,
            })
            incoming_score = _metadata_score(item)
            if incoming_score > current_score + 1.0:
                if item.get("cover_url"):
                    existing.cover_url = item["cover_url"]
                if item.get("description"):
                    existing.description = item["description"]
                if item.get("genres"):
                    existing.genres = item["genres"]
                if item.get("language"):
                    existing.language = item["language"]
            # Always back-fill text_url / audio_url if currently missing
            if item.get("text_url") and not existing.text_url:
                existing.text_url = item["text_url"]
            continue

        # Only insert books that have a reliable readable text URL.
        # Skip IA _djvu.txt (403 blocked) and books with no text at all.
        text_url = item.get("text_url", "")
        if not text_url:
            continue
        if "archive.org/download/" in text_url and "_djvu.txt" in text_url:
            continue

        b = models.Book(
            title=title,
            author_name=author_name,
            description=item.get("description", ""),
            cover_url=item.get("cover_url", ""),
            genres=item.get("genres", []),
            language=item.get("language", "uk"),
            is_premium=False,
            owner_id=owner_id,
            status="published",
            text_url=item.get("text_url", ""),
        )
        db.add(b)
        inserted += 1

    if inserted:
        db.commit()
    else:
        db.flush()
    return inserted
