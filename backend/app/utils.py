"""Helpers shared between routers."""
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models, schemas


def book_to_out(db: Session, book: models.Book) -> schemas.BookOut:
    avg, cnt = db.query(func.coalesce(func.avg(models.Review.rating), 0.0), func.count(models.Review.id)) \
        .filter(models.Review.book_id == book.id).one()
    return schemas.BookOut(
        id=book.id, title=book.title, author_name=book.author_name or "",
        description=book.description or "", cover_url=book.cover_url or "",
        genres=book.genres or [], language=book.language or "uk",
        is_premium=book.is_premium, owner_id=book.owner_id,
        has_text=bool(book.text_path) or bool(getattr(book, "text_url", "")),
        has_audio=bool(book.audio_path) or bool(book.audio_url) or bool(book.text_path),
        audio_url=book.audio_url or "",
        text_url=getattr(book, "text_url", "") or "",
        total_chars=book.total_chars or 0, total_seconds=book.total_seconds or 0.0,
        status=book.status, views=book.views or 0,
        avg_rating=round(float(avg or 0.0), 2), reviews_count=int(cnt or 0),
        created_at=book.created_at,
    )


def user_public(u: models.User) -> schemas.UserPublic:
    return schemas.UserPublic(
        id=u.id, username=u.username, bio=u.bio or "",
        avatar_url=u.avatar_url or "", role=u.role, created_at=u.created_at,
    )


def review_to_out(db: Session, r: models.Review) -> schemas.ReviewOut:
    cnt = db.query(func.count(models.Comment.id)).filter(models.Comment.review_id == r.id).scalar()
    return schemas.ReviewOut(
        id=r.id, user=user_public(r.user), book_id=r.book_id,
        rating=r.rating, content=r.content or "", created_at=r.created_at,
        comments_count=int(cnt or 0),
    )


def notify(db: Session, user_id: int, type_: str, title: str, body: str = "", link: str = "") -> None:
    n = models.Notification(user_id=user_id, type=type_, title=title, body=body, link=link)
    db.add(n)
    db.commit()
