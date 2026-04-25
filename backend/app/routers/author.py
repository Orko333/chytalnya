from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db
from app.deps import get_current_user
from app.utils import book_to_out

router = APIRouter(prefix="/api/author", tags=["author"])


def _require_author(user: models.User) -> None:
    if user.role not in ("author", "admin"):
        raise HTTPException(403, "Author only")


@router.get("/books", response_model=List[schemas.BookOut])
def my_books(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _require_author(user)
    books = db.query(models.Book).filter_by(owner_id=user.id).order_by(models.Book.created_at.desc()).all()
    return [book_to_out(db, b) for b in books]


@router.get("/analytics/{book_id}")
def book_analytics(book_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    b = db.query(models.Book).filter_by(id=book_id).first()
    if not b:
        raise HTTPException(404, "Book not found")
    if b.owner_id != user.id and user.role != "admin":
        raise HTTPException(403, "Not your book")
    views = b.views or 0
    reads = db.query(func.count(models.BookEvent.id)).filter_by(book_id=b.id, event="read").scalar() or 0
    listens = db.query(func.count(models.BookEvent.id)).filter_by(book_id=b.id, event="listen").scalar() or 0
    completes = db.query(func.count(models.BookEvent.id)).filter_by(book_id=b.id, event="complete").scalar() or 0
    favorites = db.query(func.count(models.BookFavorite.id)).filter_by(book_id=b.id).scalar() or 0
    avg = db.query(func.coalesce(func.avg(models.Review.rating), 0.0)).filter_by(book_id=b.id).scalar() or 0.0
    reviews = db.query(func.count(models.Review.id)).filter_by(book_id=b.id).scalar() or 0
    return {
        "book_id": b.id, "title": b.title,
        "views": int(views), "reads": int(reads), "listens": int(listens),
        "completes": int(completes), "favorites": int(favorites),
        "avg_rating": round(float(avg), 2), "reviews_count": int(reviews),
    }


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _require_author(user)
    books = db.query(models.Book).filter_by(owner_id=user.id).all()
    total_views = sum(b.views or 0 for b in books)
    total_reviews = db.query(func.count(models.Review.id)).filter(
        models.Review.book_id.in_([b.id for b in books] or [0])
    ).scalar() or 0
    db.refresh(user)
    bonus_pts = int(user.creator_bonus_pts or 0)
    return {
        "books_count": len(books),
        "total_views": total_views,
        "total_reviews": int(total_reviews),
        "creator_bonus_pts": bonus_pts,
    }
