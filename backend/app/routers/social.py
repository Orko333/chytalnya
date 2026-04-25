from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.utils import review_to_out, notify, user_public, book_to_out

router = APIRouter(prefix="/api", tags=["social"])


# ===== Reviews =====
@router.post("/reviews", response_model=schemas.ReviewOut)
def create_review(data: schemas.ReviewCreate, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    b = db.query(models.Book).filter(models.Book.id == data.book_id).first()
    if not b:
        raise HTTPException(404, "Book not found")
    existing = db.query(models.Review).filter_by(user_id=current.id, book_id=data.book_id).first()
    if existing:
        raise HTTPException(400, "You already reviewed this book")
    r = models.Review(user_id=current.id, book_id=data.book_id, rating=data.rating, content=data.content)
    db.add(r)
    db.commit()
    db.refresh(r)
    # Notify book owner (author)
    if b.owner_id != current.id:
        notify(db, b.owner_id, "review", f"Нова рецензія на «{b.title}»",
               f"{current.username} поставив(ла) оцінку {data.rating}/5", f"/books/{b.id}")
    from app.services.achievements import evaluate_achievements
    evaluate_achievements(db, current)
    return review_to_out(db, r)


@router.get("/books/{book_id}/reviews", response_model=List[schemas.ReviewOut])
def list_reviews(book_id: int, db: Session = Depends(get_db)):
    rs = db.query(models.Review).filter_by(book_id=book_id).order_by(models.Review.created_at.desc()).all()
    return [review_to_out(db, r) for r in rs]


@router.put("/reviews/{review_id}", response_model=schemas.ReviewOut)
def update_review(review_id: int, data: schemas.ReviewUpdate, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    r = db.query(models.Review).filter_by(id=review_id).first()
    if not r:
        raise HTTPException(404, "Review not found")
    if r.user_id != current.id and current.role != "admin":
        raise HTTPException(403, "Forbidden")
    if data.rating is not None:
        r.rating = data.rating
    if data.content is not None:
        r.content = data.content
    db.commit()
    db.refresh(r)
    return review_to_out(db, r)


@router.delete("/reviews/{review_id}")
def delete_review(review_id: int, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    r = db.query(models.Review).filter_by(id=review_id).first()
    if not r:
        raise HTTPException(404, "Review not found")
    if r.user_id != current.id and current.role != "admin":
        raise HTTPException(403, "Forbidden")
    db.delete(r)
    db.commit()
    return {"status": "deleted"}


# ===== Comments (nested) =====
@router.post("/reviews/{review_id}/comments", response_model=schemas.CommentOut)
def add_comment(review_id: int, data: schemas.CommentCreate, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    r = db.query(models.Review).filter_by(id=review_id).first()
    if not r:
        raise HTTPException(404, "Review not found")
    if data.parent_id:
        parent = db.query(models.Comment).filter_by(id=data.parent_id, review_id=review_id).first()
        if not parent:
            raise HTTPException(400, "Invalid parent")
    c = models.Comment(user_id=current.id, review_id=review_id, parent_id=data.parent_id, content=data.content)
    db.add(c)
    db.commit()
    db.refresh(c)
    if r.user_id != current.id:
        notify(db, r.user_id, "comment", "Новий коментар до вашої рецензії",
               data.content[:120], f"/books/{r.book_id}")
    return schemas.CommentOut(
        id=c.id, user=user_public(current), review_id=c.review_id,
        parent_id=c.parent_id, content=c.content, created_at=c.created_at,
    )


@router.get("/reviews/{review_id}/comments", response_model=List[schemas.CommentOut])
def list_comments(review_id: int, db: Session = Depends(get_db)):
    cs = db.query(models.Comment).filter_by(review_id=review_id).order_by(models.Comment.created_at.asc()).all()
    return [
        schemas.CommentOut(
            id=c.id, user=user_public(c.user), review_id=c.review_id,
            parent_id=c.parent_id, content=c.content, created_at=c.created_at,
        ) for c in cs
    ]


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    c = db.query(models.Comment).filter_by(id=comment_id).first()
    if not c:
        raise HTTPException(404, "Not found")
    if c.user_id != current.id and current.role != "admin":
        raise HTTPException(403, "Forbidden")
    db.delete(c)
    db.commit()
    return {"status": "deleted"}


@router.get("/users/{username}/profile")
def user_profile(username: str, db: Session = Depends(get_db), current: Optional[models.User] = Depends(get_current_user_optional)):
    u = db.query(models.User).filter_by(username=username).first()
    if not u:
        raise HTTPException(404, "User not found")
    reviews_count = db.query(func.count(models.Review.id)).filter_by(user_id=u.id).scalar() or 0
    books_completed = db.query(func.count(models.BookProgress.id)).filter(
        models.BookProgress.user_id == u.id, models.BookProgress.completed == True  # noqa
    ).scalar() or 0
    return {
        "user": user_public(u).model_dump(),
        "reviews_count": int(reviews_count),
        "books_completed": int(books_completed),
        "is_me": bool(current and current.id == u.id),
    }


@router.get("/users/{username}/reviews", response_model=List[schemas.ReviewOut])
def user_reviews(username: str, db: Session = Depends(get_db)):
    u = db.query(models.User).filter_by(username=username).first()
    if not u:
        raise HTTPException(404, "User not found")
    rs = db.query(models.Review).filter_by(user_id=u.id).order_by(models.Review.created_at.desc()).all()
    return [review_to_out(db, r) for r in rs]


# ===== Reports =====
@router.post("/reports", response_model=schemas.ReportOut)
def create_report(data: schemas.ReportCreate, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    rep = models.ContentReport(reporter_id=current.id, **data.model_dump())
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return rep


# ===== Notifications =====
@router.get("/notifications", response_model=List[schemas.NotificationOut])
def list_notifications(db: Session = Depends(get_db), current: models.User = Depends(get_current_user), limit: int = 50):
    ns = db.query(models.Notification).filter_by(user_id=current.id).order_by(models.Notification.created_at.desc()).limit(limit).all()
    return ns


@router.post("/notifications/read-all")
def read_all_notifications(db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    db.query(models.Notification).filter_by(user_id=current.id, is_read=False).update({"is_read": True})
    db.commit()
    return {"status": "ok"}
