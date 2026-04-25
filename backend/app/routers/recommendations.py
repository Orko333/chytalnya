from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.services.recommender import recommend_for_user
from app.utils import book_to_out

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.get("", response_model=List[schemas.RecommendationOut])
def personal(db: Session = Depends(get_db), current: models.User = Depends(get_current_user), k: int = 12):
    items = recommend_for_user(db, current.id, k=k)
    return [schemas.RecommendationOut(book=book_to_out(db, b), reason=reason, score=score) for b, score, reason in items]


@router.get("/trending", response_model=List[schemas.BookOut])
def trending(db: Session = Depends(get_db), limit: int = 12):
    books = db.query(models.Book).filter_by(status="published").order_by(models.Book.views.desc()).limit(limit).all()
    return [book_to_out(db, b) for b in books]


@router.get("/new", response_model=List[schemas.BookOut])
def new_releases(db: Session = Depends(get_db), limit: int = 12):
    books = db.query(models.Book).filter_by(status="published").order_by(models.Book.created_at.desc()).limit(limit).all()
    return [book_to_out(db, b) for b in books]
