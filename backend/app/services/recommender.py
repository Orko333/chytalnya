"""Content-based + naive collaborative recommender."""
from typing import List, Tuple

import numpy as np
from sqlalchemy.orm import Session
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app import models


def _book_doc(b: models.Book) -> str:
    parts = [b.title or "", b.author_name or "", b.description or "", " ".join(b.genres or []), b.language or ""]
    return " ".join(parts).lower()


def recommend_for_user(db: Session, user_id: int, k: int = 12) -> List[Tuple[models.Book, float, str]]:
    books = db.query(models.Book).filter(models.Book.status == "published").all()
    if not books:
        return []

    # User signals: favorites, reviews (>=4), completed
    fav_ids = {f.book_id for f in db.query(models.BookFavorite).filter_by(user_id=user_id).all()}
    high_reviews = db.query(models.Review).filter(
        models.Review.user_id == user_id, models.Review.rating >= 4
    ).all()
    completed = db.query(models.BookProgress).filter_by(user_id=user_id, completed=True).all()
    seed_ids = fav_ids | {r.book_id for r in high_reviews} | {p.book_id for p in completed}

    docs = [_book_doc(b) for b in books]
    idx_by_id = {b.id: i for i, b in enumerate(books)}

    if not seed_ids:
        # Cold start: popular + highly rated
        ranked = sorted(books, key=lambda b: (b.views or 0, len(b.reviews or [])), reverse=True)
        return [(b, 0.0, "Популярне зараз") for b in ranked[:k]]

    try:
        vec = TfidfVectorizer(min_df=1, stop_words=None, max_features=5000)
        X = vec.fit_transform(docs)
        seed_idxs = [idx_by_id[i] for i in seed_ids if i in idx_by_id]
        if not seed_idxs:
            return []
        seed_vec = X[seed_idxs].mean(axis=0)
        seed_arr = np.asarray(seed_vec)
        sims = cosine_similarity(seed_arr, X).flatten()
    except Exception:
        sims = np.zeros(len(books))

    # Collaborative boost: books favorited by users who share ≥1 seed
    cf_scores = np.zeros(len(books))
    try:
        similar_users = {
            f.user_id for f in db.query(models.BookFavorite).filter(
                models.BookFavorite.book_id.in_(list(seed_ids)),
                models.BookFavorite.user_id != user_id,
            ).all()
        }
        if similar_users:
            their_favs = db.query(models.BookFavorite).filter(
                models.BookFavorite.user_id.in_(list(similar_users))
            ).all()
            for f in their_favs:
                if f.book_id in idx_by_id:
                    cf_scores[idx_by_id[f.book_id]] += 1
            if cf_scores.max() > 0:
                cf_scores = cf_scores / cf_scores.max()
    except Exception:
        pass

    total = 0.7 * sims + 0.3 * cf_scores
    order = np.argsort(-total)
    results: List[Tuple[models.Book, float, str]] = []
    for i in order:
        b = books[i]
        if b.id in seed_ids:
            continue
        reason = "Схоже на ваші обрані" if sims[i] >= cf_scores[i] else "Подобається схожим читачам"
        results.append((b, float(total[i]), reason))
        if len(results) >= k:
            break
    return results
