import mimetypes
import os
import re
import uuid
from datetime import datetime, timezone
from html.parser import HTMLParser as _HTMLParser
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
import httpx
from fastapi.responses import StreamingResponse, FileResponse, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db
from app.core.storage import save_upload, absolute_path, delete_file
from app.core.config import settings
from app.deps import get_current_user, get_current_user_optional
from app.services.catalog_sync import live_sync_books
from app.utils import book_to_out

router = APIRouter(prefix="/api/books", tags=["books"])


# ── Premium access helper ─────────────────────────────────────────────────────

def _has_book_access(book: models.Book, user: Optional[models.User], db: Session) -> bool:
    """Return True if user is allowed to access a (possibly premium) book."""
    from app.routers.payments import has_book_access
    return has_book_access(book, user, db)



ALLOWED_COVER = {"jpg", "jpeg", "png", "webp"}
ALLOWED_TEXT = {"txt", "md"}
ALLOWED_AUDIO = {"mp3", "m4a", "ogg", "wav"}


# ── HTML stripping for external text proxying ─────────────────────────────────
class _HtmlStripper(_HTMLParser):
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


def _strip_html_bytes(raw: bytes) -> bytes:
    try:
        p = _HtmlStripper()
        p.feed(raw.decode("utf-8", errors="replace"))
        return p.get_text().encode("utf-8")
    except Exception:
        return raw


def _looks_like_html(content: bytes, content_type: str) -> bool:
    if "html" in content_type.lower():
        return True
    prefix = content.lstrip()[:20].lower()
    return prefix.startswith(b"<!doctype") or prefix.startswith(b"<html")


def _save_text_locally(content: bytes) -> str:
    """Write fetched text to uploads/books/{uuid}.txt; return relative path."""
    from app.core.config import settings
    base = Path(settings.UPLOAD_DIR).resolve() / "books"
    base.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.txt"
    (base / name).write_bytes(content)
    return f"books/{name}"


@router.get("", response_model=List[schemas.BookOut])
def list_books(
    db: Session = Depends(get_db),
    q: Optional[str] = None,
    genre: Optional[str] = None,
    language: Optional[str] = None,
    sort: str = Query("new", pattern="^(new|popular|rating)$"),
    limit: int = Query(50, le=100),
    offset: int = 0,
    owner_id: Optional[int] = None,
    status: Optional[str] = None,
):
    # Real-time ingestion from external sources when user searches catalog
    if q and offset == 0:
        try:
            live_sync_books(db, query=q, limit=min(max(limit, 20), 40))
        except Exception:
            # External APIs should never break local catalog response
            db.rollback()

    query = db.query(models.Book)
    if status:
        query = query.filter(models.Book.status == status)
    else:
        query = query.filter(models.Book.status == "published")
    # Always exclude Russian-language books from the public catalog
    if not language:
        query = query.filter(
            (models.Book.language != "ru") | models.Book.language.is_(None)
        )
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(or_(
            func.lower(models.Book.title).like(like),
            func.lower(models.Book.author_name).like(like),
            func.lower(models.Book.description).like(like),
        ))
    if language:
        query = query.filter(models.Book.language == language)
    if owner_id is not None:
        query = query.filter(models.Book.owner_id == owner_id)
    if genre:
        from sqlalchemy import text as _text
        query = query.filter(
            _text("EXISTS (SELECT 1 FROM json_array_elements_text(books.genres) AS g WHERE g = :genre_val)")
        ).params(genre_val=genre)
    if sort == "popular":
        query = query.order_by(models.Book.views.desc())
    elif sort == "rating":
        avg_sub = (
            db.query(models.Review.book_id, func.coalesce(func.avg(models.Review.rating), 0).label("avg_r"))
            .group_by(models.Review.book_id)
            .subquery()
        )
        query = query.outerjoin(avg_sub, models.Book.id == avg_sub.c.book_id).order_by(avg_sub.c.avg_r.desc())
    else:
        query = query.order_by(models.Book.created_at.desc())
    books = query.offset(offset).limit(limit).all()
    outs = [book_to_out(db, b) for b in books]
    return outs


@router.post("/sync/external")
def sync_external_books(
    q: str = Query(..., min_length=2),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current: models.User = Depends(get_current_user),
):
    """Manual trigger to fetch external books into local catalog."""
    if current.role not in ("admin", "author"):
        raise HTTPException(403, "Недостатньо прав")
    inserted = live_sync_books(db, query=q, limit=limit)
    return {"status": "ok", "inserted": inserted, "query": q}


@router.get("/{book_id}", response_model=schemas.BookOut)
def get_book(book_id: int, db: Session = Depends(get_db), current: Optional[models.User] = Depends(get_current_user_optional)):
    b = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not b or (b.status == "banned" and (not current or current.role != "admin")):
        raise HTTPException(404, "Book not found")
    b.views = (b.views or 0) + 1
    db.add(models.BookEvent(book_id=b.id, user_id=current.id if current else None, event="view"))
    db.commit()
    return book_to_out(db, b)


@router.post("", response_model=schemas.BookOut)
def create_book(
    title: str = Form(...),
    author_name: str = Form(""),
    description: str = Form(""),
    genres: str = Form(""),  # comma-separated
    language: str = Form("uk"),
    is_premium: bool = Form(False),
    cover: Optional[UploadFile] = File(None),
    text_file: Optional[UploadFile] = File(None),
    audio_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current: models.User = Depends(get_current_user),
):
    if current.role not in ("author", "admin"):
        # Auto-promote user to author on first upload (community platform)
        current.role = "author"
        db.commit()

    genres_list = [g.strip() for g in genres.split(",") if g.strip()]
    b = models.Book(
        title=title, author_name=author_name, description=description,
        genres=genres_list, language=language, is_premium=bool(is_premium),
        owner_id=current.id, status="published",
    )
    db.add(b)
    db.flush()

    if cover and cover.filename:
        b.cover_url = "/api/files/" + save_upload("covers", cover.file, cover.filename, ALLOWED_COVER)
    if text_file and text_file.filename:
        rel = save_upload("books", text_file.file, text_file.filename, ALLOWED_TEXT)
        b.text_path = rel
        try:
            p = absolute_path(rel)
            b.total_chars = p.stat().st_size
        except Exception:
            pass
    if audio_file and audio_file.filename:
        rel = save_upload("audio", audio_file.file, audio_file.filename, ALLOWED_AUDIO)
        b.audio_path = rel
        try:
            p = absolute_path(rel)
            b.total_seconds = max(60.0, p.stat().st_size / 16000.0)  # rough estimate; frontend corrects on load
        except Exception:
            pass
    db.commit()
    db.refresh(b)
    return book_to_out(db, b)


@router.put("/{book_id}", response_model=schemas.BookOut)
def update_book(book_id: int, data: schemas.BookUpdate, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    b = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not b:
        raise HTTPException(404, "Book not found")
    if b.owner_id != current.id and current.role != "admin":
        raise HTTPException(403, "Not owner")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return book_to_out(db, b)


@router.delete("/{book_id}")
def delete_book(book_id: int, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    b = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not b:
        raise HTTPException(404, "Book not found")
    if b.owner_id != current.id and current.role != "admin":
        raise HTTPException(403, "Not owner")
    if b.text_path:
        delete_file(b.text_path)
    if b.audio_path:
        delete_file(b.audio_path)
    db.delete(b)
    db.commit()
    return {"status": "deleted"}


# ===== Streaming =====
@router.get("/{book_id}/stream/text")
async def stream_text(book_id: int, db: Session = Depends(get_db), current: Optional[models.User] = Depends(get_current_user_optional)):
    b = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not b:
        raise HTTPException(404, "Book not found")

    if not _has_book_access(b, current, db):
        raise HTTPException(403, "Ця книга доступна лише за передплатою")

    db.add(models.BookEvent(book_id=b.id, user_id=current.id if current else None, event="read"))
    db.commit()

    # 0. Text stored in DB (survives ephemeral disk loss on Render free tier)
    if getattr(b, "text_content", ""):
        return Response(
            content=b.text_content.encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Text-Source": "db"},
        )

    # 1. Local file takes priority
    if b.text_path:
        p = absolute_path(b.text_path)
        if p.exists():
            try:
                file_bytes = p.read_bytes()
                # Backfill text_content so text survives future redeploys
                if file_bytes and not getattr(b, "text_content", ""):
                    b.text_content = file_bytes.decode("utf-8", errors="replace")
                    db.commit()
            except Exception:
                db.rollback()
            return FileResponse(
                p, media_type="text/plain; charset=utf-8",
                headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
            )
        else:
            # File gone after ephemeral disk wipe — clear stale path so scraper re-processes
            try:
                b.text_path = ""
                db.commit()
            except Exception:
                db.rollback()

    # Helper: fetch URL, auto-strip HTML, return content or None
    async def _fetch_text(url: str, client: httpx.AsyncClient) -> Optional[bytes]:
        try:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return None
            content = resp.content
            ct = resp.headers.get("content-type", "")
            if _looks_like_html(content, ct):
                content = _strip_html_bytes(content)
            # Reject results that are too short to be real text (< 200 chars)
            if len(content.strip()) < 200:
                return None
            return content
        except Exception:
            return None

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        # 2. Existing text_url (Gutenberg or Internet Archive /download/)
        text_url = getattr(b, "text_url", "") or ""
        # Fix old /stream/ IA URLs on the fly
        if "archive.org/stream/" in text_url:
            text_url = text_url.replace("archive.org/stream/", "archive.org/download/")
            b.text_url = text_url
            try:
                db.commit()
            except Exception:
                db.rollback()

        if text_url:
            content = await _fetch_text(text_url, client)
            if content:
                # Persist locally so the next read is served from disk (no external call)
                try:
                    rel = _save_text_locally(content)
                    b.text_path = rel
                    b.total_chars = len(content)
                    b.text_content = content.decode("utf-8", errors="replace")
                    db.commit()
                except Exception:
                    db.rollback()
                return Response(
                    content=content,
                    media_type="text/plain; charset=utf-8",
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Text-Source": "external"},
                )
            else:
                # URL failed — clear blocked IA _djvu.txt URLs so scraper re-discovers via Gutendex
                if "archive.org/download/" in text_url and "_djvu.txt" in text_url:
                    try:
                        b.text_url = ""
                        db.commit()
                    except Exception:
                        db.rollback()
                    text_url = ""

        # 3. Gutendex real-time fallback: search for the book by title+author and grab plain text URL
        # Clean IA-style formatting: "Title ; Subtitle" → "Title", "Author, 1775-1817" → "Author"
        title_q = re.sub(r'\s*[;:].*$', '', (b.title or "")).strip()[:80]
        author_q = re.sub(r',\s*\d{4}.*$', '', (b.author_name or "")).strip()[:60]
        search_q = f"{title_q} {author_q}".strip()
        if search_q:
            try:
                gr = await client.get(
                    "https://gutendex.com/books",
                    params={"search": search_q[:100]},
                    timeout=10.0,
                )
                if gr.status_code == 200:
                    for item in (gr.json().get("results") or [])[:5]:
                        fmts = item.get("formats") or {}
                        candidate_url = (
                            fmts.get("text/plain; charset=utf-8")
                            or fmts.get("text/plain; charset=us-ascii")
                            or fmts.get("text/plain")
                            or ""
                        )
                        if not candidate_url:
                            continue
                        content = await _fetch_text(candidate_url, client)
                        if content:
                            # Persist URL and save locally for instant future reads
                            try:
                                rel = _save_text_locally(content)
                                b.text_url = candidate_url
                                b.text_path = rel
                                b.total_chars = len(content)
                                b.text_content = content.decode("utf-8", errors="replace")
                                db.commit()
                            except Exception:
                                db.rollback()
                            return Response(
                                content=content,
                                media_type="text/plain; charset=utf-8",
                                headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Text-Source": "gutendex"},
                            )
            except Exception:
                pass

    raise HTTPException(404, "Текст книги недоступний")


_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


@router.get("/{book_id}/stream/audio")
async def stream_audio(book_id: int, request: Request, db: Session = Depends(get_db), current: Optional[models.User] = Depends(get_current_user_optional)):
    b = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not b:
        raise HTTPException(404, "Book not found")

    if not _has_book_access(b, current, db):
        raise HTTPException(403, "Ця книга доступна лише за передплатою")

    db.add(models.BookEvent(book_id=b.id, user_id=current.id if current else None, event="listen"))
    db.commit()

    # 1. External audio URL (LibriVox etc.) — proxy stream to avoid browser CORS issues
    if b.audio_url:
        async def iter_remote_audio():
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                async with client.stream("GET", b.audio_url) as resp:
                    if resp.status_code >= 400:
                        return
                    async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                        if chunk:
                            yield chunk

        return StreamingResponse(
            iter_remote_audio(),
            media_type="audio/mpeg",
            headers={"Cache-Control": "private, no-store", "X-Audio-Proxy": "external"},
        )

    # 2. Local audio file — range-aware streaming
    if b.audio_path:
        p = absolute_path(b.audio_path)
        if p.exists():
            file_size = p.stat().st_size
            media_type = mimetypes.guess_type(str(p))[0] or "audio/mpeg"
            range_header = request.headers.get("range")
            start, end = 0, file_size - 1
            status_code = 200
            if range_header:
                m = _RANGE_RE.match(range_header)
                if m:
                    s, e = m.groups()
                    if s:
                        start = int(s)
                    if e:
                        end = int(e)
                    if start >= file_size:
                        raise HTTPException(416, "Range not satisfiable")
                    end = min(end, file_size - 1)
                    status_code = 206
            length = end - start + 1

            def iterfile():
                with open(p, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk = f.read(min(64 * 1024, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk

            headers = {
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Cache-Control": "private, no-store",
            }
            return StreamingResponse(iterfile(), status_code=status_code, media_type=media_type, headers=headers)

    # 3. TTS fallback — stream on-demand via edge-tts, no storage
    text_excerpt: str = ""

    if b.text_path:
        try:
            text_p = absolute_path(b.text_path)
            if text_p.exists():
                raw = text_p.read_text(encoding="utf-8", errors="replace")
                text_excerpt = raw[:4000].strip()
        except Exception:
            pass

    if not text_excerpt and getattr(b, "text_url", ""):
        # Fetch first 4000 chars from external URL for TTS
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                async with client.stream("GET", b.text_url) as resp:
                    if resp.status_code < 400:
                        buf: list[bytes] = []
                        collected = 0
                        async for chunk in resp.aiter_bytes(chunk_size=8 * 1024):
                            buf.append(chunk)
                            collected += len(chunk)
                            if collected >= 16 * 1024:  # 16KB is plenty for 4000 chars
                                break
                        raw_bytes = b"".join(buf)
                        text_excerpt = raw_bytes.decode("utf-8", errors="replace")[:4000].strip()
        except Exception:
            pass

    if text_excerpt:
        try:
            from app.services.audio import tts_bytes_async
            audio_bytes = await tts_bytes_async(text_excerpt, lang=b.language or "uk")
            if audio_bytes:
                return Response(
                    content=audio_bytes,
                    media_type="audio/mpeg",
                    headers={
                        "Content-Length": str(len(audio_bytes)),
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "private, no-store",
                        "X-TTS-Generated": "1",
                    },
                )
        except Exception:
            pass

    raise HTTPException(404, "Аудіо для цієї книги недоступне")


# ===== Progress =====
@router.get("/{book_id}/progress", response_model=schemas.ProgressOut)
def get_progress(book_id: int, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    p = db.query(models.BookProgress).filter_by(user_id=current.id, book_id=book_id).first()
    if not p:
        p = models.BookProgress(user_id=current.id, book_id=book_id)
        db.add(p)
        db.commit()
        db.refresh(p)
    return schemas.ProgressOut(
        book_id=book_id, text_position=p.text_position, audio_position=p.audio_position,
        last_mode=p.last_mode, completed=p.completed, updated_at=p.updated_at,
    )


@router.post("/{book_id}/progress", response_model=schemas.ProgressOut)
def set_progress(book_id: int, data: schemas.ProgressIn, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    b = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not b:
        raise HTTPException(404, "Book not found")
    p = db.query(models.BookProgress).filter_by(user_id=current.id, book_id=book_id).first()
    if not p:
        p = models.BookProgress(user_id=current.id, book_id=book_id)
        db.add(p)
        db.flush()
    was_completed = p.completed
    if data.text_position is not None:
        p.text_position = max(0, int(data.text_position))
    if data.audio_position is not None:
        p.audio_position = max(0.0, float(data.audio_position))
    if data.last_mode in ("text", "audio"):
        p.last_mode = data.last_mode
    if data.completed is not None:
        p.completed = bool(data.completed)
    # Cross-sync: if text progress changed, estimate audio position; and vice versa
    if b.total_chars and b.total_seconds:
        if data.text_position is not None and data.audio_position is None:
            frac = min(1.0, p.text_position / max(1, b.total_chars))
            p.audio_position = frac * b.total_seconds
        elif data.audio_position is not None and data.text_position is None:
            frac = min(1.0, p.audio_position / max(0.1, b.total_seconds))
            p.text_position = int(frac * b.total_chars)
    db.commit()
    db.refresh(p)

    if p.completed and not was_completed:
        db.add(models.BookEvent(book_id=book_id, user_id=current.id, event="complete"))
        db.commit()
        from app.services.achievements import evaluate_achievements
        evaluate_achievements(db, current)

    return schemas.ProgressOut(
        book_id=book_id, text_position=p.text_position, audio_position=p.audio_position,
        last_mode=p.last_mode, completed=p.completed, updated_at=p.updated_at,
    )


# ===== Completed IDs (bulk) =====
@router.get("/me/completed-ids")
def my_completed_ids(db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    """Return list of book_ids the current user has marked as completed."""
    ids = (
        db.query(models.BookProgress.book_id)
        .filter_by(user_id=current.id, completed=True)
        .all()
    )
    return {"ids": [r[0] for r in ids]}


@router.get("/{book_id}/access", response_model=schemas.BookAccessOut)
def book_access(
    book_id: int,
    db: Session = Depends(get_db),
    current: Optional[models.User] = Depends(get_current_user_optional),
):
    """Check whether current user may access a book's content."""
    from app.routers.payments import has_book_access
    b = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not b or b.status == "banned":
        raise HTTPException(404, "Book not found")
    if not b.is_premium:
        return schemas.BookAccessOut(can_access=True, reason="free", is_premium=False)
    if not current:
        return schemas.BookAccessOut(can_access=False, reason="", is_premium=True, requires="login")
    if current.role == "admin":
        return schemas.BookAccessOut(can_access=True, reason="admin", is_premium=True)
    if b.owner_id == current.id:
        return schemas.BookAccessOut(can_access=True, reason="owner", is_premium=True)

    now = datetime.now(timezone.utc)

    # Platform premium
    sub = db.query(models.UserSubscription).filter_by(
        user_id=current.id, plan_code="premium", status="active"
    ).first()
    if sub:
        ed = sub.end_date
        if ed and ed.tzinfo is None:
            ed = ed.replace(tzinfo=timezone.utc)
        if ed is None or ed > now:
            return schemas.BookAccessOut(can_access=True, reason="platform_premium", is_premium=True)

    # Author subscription
    a_sub = db.query(models.UserAuthorSub).filter_by(
        user_id=current.id, author_id=b.owner_id, status="active"
    ).first()
    if a_sub:
        ed = a_sub.end_date
        if ed and ed.tzinfo is None:
            ed = ed.replace(tzinfo=timezone.utc)
        if ed is None or ed > now:
            return schemas.BookAccessOut(can_access=True, reason="author_sub", is_premium=True)

    # Determine what's needed
    author_plan = db.query(models.AuthorSubPlan).filter_by(
        author_id=b.owner_id, is_active=True
    ).first()
    return schemas.BookAccessOut(
        can_access=False,
        reason="",
        is_premium=True,
        requires="author_sub" if author_plan else "platform_premium",
        author_sub_price=author_plan.price_monthly if author_plan else None,
        platform_sub_price=4.99,
    )


# ===== Favorites =====
@router.post("/{book_id}/favorite")
def favorite(book_id: int, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    exists = db.query(models.BookFavorite).filter_by(user_id=current.id, book_id=book_id).first()
    if exists:
        db.delete(exists)
        db.commit()
        return {"favorited": False}
    db.add(models.BookFavorite(user_id=current.id, book_id=book_id))
    db.commit()
    return {"favorited": True}


@router.get("/me/favorites", response_model=List[schemas.BookOut])
def my_favorites(db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    favs = db.query(models.BookFavorite).filter_by(user_id=current.id).all()
    books = [db.query(models.Book).get(f.book_id) for f in favs]
    return [book_to_out(db, b) for b in books if b]


# ===== Files (static) — protected for premium via stream endpoints; public for covers/avatars =====
from fastapi import APIRouter as _AR
files_router = _AR(prefix="/api/files", tags=["files"])


@files_router.get("/{subpath:path}")
def serve_file(subpath: str):
    try:
        p = absolute_path(subpath)
    except ValueError:
        raise HTTPException(400, "Bad path")
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "Not found")
    # Only allow covers and avatars through this public endpoint
    if not (subpath.startswith("covers/") or subpath.startswith("avatars/")):
        raise HTTPException(403, "Forbidden")
    return FileResponse(p)
