"""Achievement evaluation engine — 26 achievements across 8 categories."""
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models
from app.utils import notify


ACHIEVEMENT_DEFS = [
    # ── Reading milestones ──────────────────────────────────────────────────
    ("first_steps",       "Перші кроки",          "Завершіть свою першу книгу",            "📖", "books_completed",  1),
    ("bookworm",          "Книгогриз",             "Завершіть 5 книг",                      "🐛", "books_completed",  5),
    ("devoted_reader",    "Відданий читач",        "Завершіть 15 книг",                     "📚", "books_completed",  15),
    ("literary_marathon", "Літературний марафон",  "Завершіть 30 книг",                     "🏃", "books_completed",  30),
    ("completionist",     "Перфекціоніст",         "Завершіть 75 книг",                     "🏆", "books_completed",  75),
    ("legendary_reader",  "Легендарний читач",     "Завершіть 150 книг — справжня легенда", "👑", "books_completed",  150),
    # ── Audio listening ─────────────────────────────────────────────────────
    ("night_owl",         "Нічна сова",            "Прослухайте 300 хвилин аудіо",          "🦉", "minutes_listened", 300),
    ("audiophile",        "Аудіофіл",              "Прослухайте 1 500 хвилин аудіо",        "🎧", "minutes_listened", 1500),
    ("audio_marathon",    "Аудіо-марафон",         "Прослухайте 5 000 хвилин — ви невтомні","🔊", "minutes_listened", 5000),
    # ── Reviews & opinions ──────────────────────────────────────────────────
    ("critic",            "Критик",                "Напишіть свою першу рецензію",          "✍️", "reviews_written",  1),
    ("opinion_leader",    "Лідер думок",           "Напишіть 10 рецензій",                  "💬", "reviews_written",  10),
    ("literary_pundit",   "Літературний пундит",   "Напишіть 30 рецензій",                  "🎓", "reviews_written",  30),
    # ── Followers ───────────────────────────────────────────────────────────
    ("rising_star",       "Висхідна зірка",        "Отримайте 5 підписників",               "⭐", "followers",        5),
    ("popular",           "Популярний",            "Отримайте 25 підписників",              "🌟", "followers",        25),
    ("celebrity",         "Зірка",                 "Отримайте 100 підписників",             "💫", "followers",        100),
    ("influencer",        "Інфлюенсер",            "Отримайте 500 підписників",             "👑", "followers",        500),
    # ── Favorites / collection ───────────────────────────────────────────────
    ("explorer",          "Дослідник",             "Додайте 5 книг до обраного",            "🧭", "favorites",        5),
    ("collector",         "Колекціонер",           "Зберіть 25 книг в обраному",            "📦", "favorites",        25),
    ("book_hoarder",      "Книжковий скарбник",    "Зберіть 75 книг — справжній архів!",    "🗝️", "favorites",        75),
    # ── Social — following ───────────────────────────────────────────────────
    ("social_butterfly",  "Соціальний метелик",    "Підпишіться на 10 авторів",             "🦋", "following_count",  10),
    ("connected",         "Широкі зв'язки",        "Підпишіться на 25 авторів",             "🌐", "following_count",  25),
    # ── Genre exploration ────────────────────────────────────────────────────
    ("genre_explorer",    "Мандрівник жанрами",    "Прочитайте книги 3-х різних жанрів",   "🗺️", "genres_explored",  3),
    ("all_rounder",       "Всеїдний читач",        "Прочитайте книги 8-ми різних жанрів",  "🎭", "genres_explored",  8),
    # ── Author achievements ──────────────────────────────────────────────────
    ("debut_author",      "Дебютант",              "Опублікуйте свою першу книгу",          "✨", "books_published",  1),
    ("prolific_author",   "Плідний автор",         "Опублікуйте 5 книг",                    "📝", "books_published",  5),
    # ── Premium ──────────────────────────────────────────────────────────────
    ("premium_member",    "Преміум читач",         "Активуйте підписку Преміум",            "💎", "has_premium",      1),
]


def seed_achievements(db: Session) -> None:
    existing_codes = {a.code for a in db.query(models.Achievement).all()}
    for code, name, desc, icon, cond, val in ACHIEVEMENT_DEFS:
        if code not in existing_codes:
            db.add(models.Achievement(code=code, name=name, description=desc, icon=icon,
                                      condition_type=cond, condition_value=val))
    db.commit()


def _metric(db: Session, user_id: int, metric: str) -> int:
    if metric == "books_completed":
        return db.query(func.count(models.BookProgress.id)).filter(
            models.BookProgress.user_id == user_id,
            models.BookProgress.completed == True,  # noqa: E712
        ).scalar() or 0

    if metric == "reviews_written":
        return db.query(func.count(models.Review.id)).filter(
            models.Review.user_id == user_id
        ).scalar() or 0

    if metric == "followers":
        return db.query(func.count(models.UserFollow.id)).filter(
            models.UserFollow.followed_id == user_id
        ).scalar() or 0

    if metric == "following_count":
        return db.query(func.count(models.UserFollow.id)).filter(
            models.UserFollow.follower_id == user_id
        ).scalar() or 0

    if metric == "favorites":
        return db.query(func.count(models.BookFavorite.id)).filter(
            models.BookFavorite.user_id == user_id
        ).scalar() or 0

    if metric == "minutes_listened":
        total = db.query(func.coalesce(func.sum(models.BookProgress.audio_position), 0.0)).filter(
            models.BookProgress.user_id == user_id
        ).scalar() or 0.0
        return int(float(total) / 60.0)

    if metric == "genres_explored":
        # Count unique genres from completed books
        completed_book_ids = [
            row[0] for row in db.query(models.BookProgress.book_id).filter(
                models.BookProgress.user_id == user_id,
                models.BookProgress.completed == True,  # noqa: E712
            ).all()
        ]
        if not completed_book_ids:
            return 0
        genre_set: set[str] = set()
        for book in db.query(models.Book).filter(models.Book.id.in_(completed_book_ids)).all():
            for g in (book.genres or []):
                genre_set.add(g.lower().strip())
        return len(genre_set)

    if metric == "books_published":
        return db.query(func.count(models.Book.id)).filter(
            models.Book.owner_id == user_id,
            models.Book.status == "published",
        ).scalar() or 0

    if metric == "has_premium":
        sub = db.query(models.UserSubscription).filter(
            models.UserSubscription.user_id == user_id,
            models.UserSubscription.status == "active",
        ).first()
        return 1 if sub else 0

    return 0


def evaluate_achievements(db: Session, user: models.User) -> list[models.Achievement]:
    earned = []
    achievements = db.query(models.Achievement).all()
    earned_ids = {
        ua.achievement_id for ua in db.query(models.UserAchievement).filter_by(user_id=user.id).all()
    }
    metrics_cache: dict[str, int] = {}
    for a in achievements:
        if a.id in earned_ids:
            continue
        val = metrics_cache.get(a.condition_type)
        if val is None:
            val = _metric(db, user.id, a.condition_type)
            metrics_cache[a.condition_type] = val
        if val >= a.condition_value:
            db.add(models.UserAchievement(user_id=user.id, achievement_id=a.id))
            earned.append(a)
    if earned:
        db.commit()
        for a in earned:
            notify(db, user.id, "achievement", f"🏅 Нове досягнення: {a.icon} {a.name}",
                   a.description, "/achievements")
    return earned
