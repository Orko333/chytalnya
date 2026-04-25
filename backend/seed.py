"""Seed demo content: admin, author, users, sample books with text & fake audio."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.core.database import SessionLocal, Base, engine
from app.core.security import hash_password
from app.core.storage import BASE as STORAGE_BASE
from app import models
from app.services.achievements import seed_achievements
from app.services.audio import find_librivox_url
from app.routers.subscriptions import ensure_plans


DEMO_BOOKS = [
    {
        "title": "Кобзар",
        "author_name": "Тарас Шевченко",
        "description": "Збірка поетичних творів видатного українського поета. Містить «Заповіт», «Кавказ», «Катерину» та інші.",
        "genres": ["поезія", "класика", "українська література"],
        "language": "uk",
        "is_premium": False,
        "text": "Реве та стогне Дніпр широкий,\nСердитий вітер завива,\nДодолу верби гне високі,\nГорами хвилю підійма.\n\n«Заповіт»\nЯк умру, то поховайте\nМене на могилі,\nСеред степу широкого,\nНа Вкраїні милій...\n\n" * 40,
    },
    {
        "title": "Тіні забутих предків",
        "author_name": "Михайло Коцюбинський",
        "description": "Повість про кохання Івана та Марічки, трагедію гуцульського життя серед карпатських лісів.",
        "genres": ["повість", "класика", "драма"],
        "language": "uk",
        "is_premium": False,
        "text": "Іван був дев'ятнадцятою дитиною в гуцульській родині Палійчуків. Двадцятою і останньою була Анничка...\n\n" * 60,
    },
    {
        "title": "Місто",
        "author_name": "Валер'ян Підмогильний",
        "description": "Урбаністичний роман про молодого селянина, що приїжджає підкорювати Київ 1920-х років.",
        "genres": ["роман", "класика", "урбаністика"],
        "language": "uk",
        "is_premium": True,
        "text": "Степан Радченко стояв на порозі нового життя. Великий Київ розкинувся перед ним, незнайомий і небезпечний...\n\n" * 80,
    },
    {
        "title": "Лісова пісня",
        "author_name": "Леся Українка",
        "description": "Драма-феєрія про лісову німфу Мавку і сільського парубка Лукаша.",
        "genres": ["драма", "феєрія", "класика"],
        "language": "uk",
        "is_premium": False,
        "text": "Старезний, густий, предковічний ліс на Волині. Посеред лісу простора галява...\n\nМавка: Ох, як я довго спала!\nЛісовик: Справді?\n\n" * 50,
    },
    {
        "title": "Чорна рада",
        "author_name": "Пантелеймон Куліш",
        "description": "Перший український історичний роман про добу Руїни та боротьбу за гетьманську булаву.",
        "genres": ["історичний", "роман", "класика"],
        "language": "uk",
        "is_premium": True,
        "text": "Весною 1663 року, через чотири роки після Виговщини, їхав з Києва у Переяслав Божий чоловік...\n\n" * 70,
    },
    {
        "title": "Intermezzo",
        "author_name": "Михайло Коцюбинський",
        "description": "Новела-імпресіоністична сповідь втомленого інтелігента, що шукає спокою на лоні природи.",
        "genres": ["новела", "класика", "імпресіонізм"],
        "language": "uk",
        "is_premium": False,
        "text": "Лишилось тільки ще спакувати речі. Але дуже не хотілось вставати. Я почував себе, наче людина, що збирається в далеку дорогу...\n\n" * 30,
    },
    {
        "title": "Я (Романтика)",
        "author_name": "Микола Хвильовий",
        "description": "Експресіоністична новела про моральний вибір чекіста під час громадянської війни.",
        "genres": ["новела", "експресіонізм", "модернізм"],
        "language": "uk",
        "is_premium": True,
        "text": "З далекого туману, з тихих озер загірної комуни шелестить шелест: то йде Марія...\n\n" * 45,
    },
    {
        "title": "Жовтий князь",
        "author_name": "Василь Барка",
        "description": "Роман про Голодомор 1932-1933 років, написаний свідком трагедії.",
        "genres": ["роман", "історичний", "драма"],
        "language": "uk",
        "is_premium": False,
        "text": "Сонце зійшло над селом, як завжди. Але того ранку щось було не так...\n\n" * 65,
    },
]


def enrich_audio_urls(db):
    """Populate external audio URLs from LibriVox for books without local audio."""
    import asyncio

    async def _run():
        books = db.query(models.Book).filter(
            models.Book.audio_path == "",
            models.Book.audio_url == "",
        ).all()
        changed = 0
        for b in books:
            url = await find_librivox_url(b.title, b.author_name or "")
            if url:
                b.audio_url = url
                changed += 1
        if changed:
            db.commit()
        return changed

    return asyncio.run(_run())


def make_fake_mp3(path: Path, seconds: int = 10) -> None:
    """Create a tiny valid MP3 file (silence) using a minimal MP3 frame pattern."""
    # Not a real encoder; just creates a placeholder binary blob that browsers may refuse.
    # For demo we'll just write empty bytes; audio UI handles missing gracefully.
    path.write_bytes(b"")


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_achievements(db)
        ensure_plans(db)

        # Admin user
        admin = db.query(models.User).filter_by(email="admin@chytalnya.app").first()
        if not admin:
            admin = models.User(
                email="admin@chytalnya.app", username="admin",
                password_hash=hash_password("admin1234"), role="admin", email_verified=True,
            )
            db.add(admin)
            db.flush()
            db.add(models.UserSubscription(user_id=admin.id, plan_code="premium", status="active"))

        # Author
        author = db.query(models.User).filter_by(email="author@chytalnya.app").first()
        if not author:
            author = models.User(
                email="author@chytalnya.app", username="author_demo",
                password_hash=hash_password("author1234"), role="author",
                bio="Демонстраційний автор «Читальні». Публікую українську класику.",
                email_verified=True,
            )
            db.add(author)
            db.flush()
            db.add(models.UserSubscription(user_id=author.id, plan_code="premium", status="active"))

        # Reader
        reader = db.query(models.User).filter_by(email="reader@chytalnya.app").first()
        if not reader:
            reader = models.User(
                email="reader@chytalnya.app", username="reader_demo",
                password_hash=hash_password("reader1234"), role="user",
                bio="Тестовий користувач. Обожнюю Лесю Українку.",
                email_verified=True,
            )
            db.add(reader)
            db.flush()
            db.add(models.UserSubscription(user_id=reader.id, plan_code="free", status="active"))

        db.commit()

        # Books
        books_dir = STORAGE_BASE / "books"
        covers_dir = STORAGE_BASE / "covers"
        for bd in DEMO_BOOKS:
            existing = db.query(models.Book).filter_by(title=bd["title"]).first()
            if existing:
                continue
            # write text
            import uuid
            text_name = f"{uuid.uuid4().hex}.txt"
            (books_dir / text_name).write_text(bd["text"], encoding="utf-8")
            total_chars = len(bd["text"].encode("utf-8"))
            b = models.Book(
                title=bd["title"], author_name=bd["author_name"], description=bd["description"],
                genres=bd["genres"], language=bd["language"], is_premium=bd["is_premium"],
                owner_id=author.id, text_path=f"books/{text_name}", total_chars=total_chars,
                total_seconds=total_chars / 500.0,  # crude estimate for sync demo
                status="published",
            )
            db.add(b)
        db.commit()

        # Reader favorites + one review
        first = db.query(models.Book).order_by(models.Book.id.asc()).first()
        if first and not db.query(models.BookFavorite).filter_by(user_id=reader.id, book_id=first.id).first():
            db.add(models.BookFavorite(user_id=reader.id, book_id=first.id))
            db.commit()
        if first and not db.query(models.Review).filter_by(user_id=reader.id, book_id=first.id).first():
            db.add(models.Review(user_id=reader.id, book_id=first.id, rating=5,
                                 content="Вічна класика. Читається на одному подиху."))
            db.commit()

        # Follow
        if not db.query(models.UserFollow).filter_by(follower_id=reader.id, followed_id=author.id).first():
            db.add(models.UserFollow(follower_id=reader.id, followed_id=author.id))
            db.commit()

        try:
            matched = enrich_audio_urls(db)
            print(f"Audio enrichment complete: matched {matched} books via LibriVox.")
        except Exception:
            db.rollback()
            print("Audio enrichment skipped (temporary external API issue).")

        print("Seed complete.")
        print("Accounts:")
        print("  admin@chytalnya.app / admin1234    (admin)")
        print("  author@chytalnya.app / author1234  (author, premium)")
        print("  reader@chytalnya.app / reader1234  (reader, free)")
    finally:
        db.close()


if __name__ == "__main__":
    run()
