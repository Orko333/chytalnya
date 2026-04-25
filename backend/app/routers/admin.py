import asyncio
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db
from app.deps import require_admin
from app.utils import book_to_out

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserStatusIn(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None


@router.get("/users", response_model=List[schemas.AdminUserOut])
def list_users(db: Session = Depends(get_db), admin: models.User = Depends(require_admin), q: Optional[str] = None):
    query = db.query(models.User)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter((func.lower(models.User.email).like(like)) | (func.lower(models.User.username).like(like)))
    return query.order_by(models.User.id.desc()).limit(200).all()


@router.put("/users/{user_id}", response_model=schemas.AdminUserOut)
def update_user(user_id: int, data: UserStatusIn, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    u = db.query(models.User).filter_by(id=user_id).first()
    if not u:
        raise HTTPException(404)
    if data.is_active is not None:
        u.is_active = data.is_active
    if data.role in ("user", "author", "admin"):
        u.role = data.role
    db.commit()
    db.refresh(u)
    return u


@router.get("/reports", response_model=List[schemas.ReportOut])
def list_reports(db: Session = Depends(get_db), admin: models.User = Depends(require_admin), status: Optional[str] = None):
    q = db.query(models.ContentReport)
    if status:
        q = q.filter(models.ContentReport.status == status)
    return q.order_by(models.ContentReport.created_at.desc()).all()


class ReportUpdate(BaseModel):
    status: str  # resolved|dismissed|open


@router.put("/reports/{report_id}", response_model=schemas.ReportOut)
def update_report(report_id: int, data: ReportUpdate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    r = db.query(models.ContentReport).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(404)
    if data.status not in ("open", "resolved", "dismissed"):
        raise HTTPException(400, "Invalid status")
    r.status = data.status
    db.commit()
    db.refresh(r)
    return r


@router.delete("/content/{content_type}/{content_id}")
def delete_content(content_type: str, content_id: int, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    if content_type == "book":
        obj = db.query(models.Book).filter_by(id=content_id).first()
        if obj:
            obj.status = "banned"
            db.commit()
            return {"status": "banned"}
    elif content_type == "review":
        obj = db.query(models.Review).filter_by(id=content_id).first()
        if obj:
            db.delete(obj)
            db.commit()
            return {"status": "deleted"}
    elif content_type == "comment":
        obj = db.query(models.Comment).filter_by(id=content_id).first()
        if obj:
            db.delete(obj)
            db.commit()
            return {"status": "deleted"}
    raise HTTPException(404)


@router.post("/content/book/{book_id}/unban")
def unban_book(book_id: int, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    obj = db.query(models.Book).filter_by(id=book_id).first()
    if not obj:
        raise HTTPException(404)
    obj.status = "published"
    db.commit()
    return {"status": "published"}


@router.get("/stats")
def platform_stats(db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    return {
        "users": db.query(func.count(models.User.id)).scalar() or 0,
        "authors": db.query(func.count(models.User.id)).filter(models.User.role == "author").scalar() or 0,
        "books": db.query(func.count(models.Book.id)).scalar() or 0,
        "books_published": db.query(func.count(models.Book.id)).filter_by(status="published").scalar() or 0,
        "reviews": db.query(func.count(models.Review.id)).scalar() or 0,
        "reports_open": db.query(func.count(models.ContentReport.id)).filter_by(status="open").scalar() or 0,
        "premium_subs": db.query(func.count(models.UserSubscription.id)).filter_by(plan_code="premium", status="active").scalar() or 0,
    }


@router.get("/books", response_model=List[schemas.BookOut])
def all_books_admin(db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    books = db.query(models.Book).order_by(models.Book.created_at.desc()).limit(200).all()
    return [book_to_out(db, b) for b in books]


# ── booknet.ua scraper ──

_booknet_task: Optional[asyncio.Task] = None


@router.post("/scrape/booknet")
async def trigger_booknet_scrape(
    background_tasks: BackgroundTasks,
    pages: int = Query(default=5, ge=1, le=100, description="Catalog pages to scan (≈20 books each)"),
    books: int = Query(default=50, ge=1, le=500, description="Max books to import"),
    session_cookie: Optional[str] = Query(
        default=None,
        description="booknet.ua 'litera-frontend' cookie value. "
                    "Log in via a browser, copy the cookie, and pass it here to authenticate.",
    ),
    admin: models.User = Depends(require_admin),
):
    """
    Trigger a booknet.ua scrape run in the background.
    Free books only; already-imported books are skipped.
    Pass session_cookie to access books that require login.
    """
    global _booknet_task
    if _booknet_task and not _booknet_task.done():
        return {"status": "already_running"}

    from app.services.booknet_scraper import scrape_booknet

    async def _run():
        try:
            result = await scrape_booknet(
                max_pages=pages,
                max_books=books,
                session_cookie=session_cookie,
            )
            return result
        except Exception as exc:
            import logging
            logging.getLogger("booknet_scraper").error("Scrape task failed: %s", exc)

    _booknet_task = asyncio.create_task(_run())
    return {"status": "started", "max_pages": pages, "max_books": books}


@router.get("/scrape/booknet/status")
async def booknet_scrape_status(admin: models.User = Depends(require_admin)):
    """Check if a booknet scrape is currently running."""
    global _booknet_task
    if _booknet_task is None:
        return {"status": "idle"}
    if _booknet_task.done():
        exc = _booknet_task.exception()
        if exc:
            return {"status": "failed", "error": str(exc)}
        result = _booknet_task.result()
        return {"status": "done", "result": result}
    return {"status": "running"}

