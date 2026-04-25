import logging
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, engine, get_db, run_migrations
from app.core.storage import save_upload
from app.deps import get_current_user
from app import models
from app.routers import auth, books, social, recommendations, achievements, author, admin
from app.services.achievements import seed_achievements
from app.services.catalog_sync import live_sync_books
from app.services.audio import populate_audio_urls
from app.services.text_scraper import run_scraper_forever
from app.services.booknet_scraper import run_booknet_forever

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations()
    from app.core.database import SessionLocal

    async def _background_catalog_warmup():
        def _run_sync():
            with SessionLocal() as bg_db:
                # Warm up catalog with diverse queries so first users see rich results.
                warmup_queries = [
                    # Ukrainian
                    "українська класика", "українська поезія", "українська проза",
                    "Тарас Шевченко", "Іван Франко", "Леся Українка",
                    "Михайло Коцюбинський", "Панас Мирний",
                    # World classics
                    "world classics", "shakespeare", "tolstoy", "dostoevsky",
                    "dickens", "victor hugo", "mark twain", "jules verne",
                    "jane austen", "chekhov", "kafka",
                    # Genres
                    "fantasy", "detective mystery", "science fiction",
                    "philosophy", "history", "adventure", "romance",
                    "poetry", "drama", "psychology",
                    # Popular titles
                    "war and peace", "crime and punishment", "the brothers karamazov",
                    "don quixote", "hamlet", "faust", "divine comedy",
                    "odyssey", "iliad", "pride and prejudice",
                ]
                for q in warmup_queries:
                    try:
                        live_sync_books(bg_db, q, limit=40)
                    except Exception:
                        bg_db.rollback()
                try:
                    asyncio.run(populate_audio_urls(bg_db))
                except Exception:
                    bg_db.rollback()

        await asyncio.to_thread(_run_sync)

    with SessionLocal() as db:
        seed_achievements(db)

    asyncio.create_task(_background_catalog_warmup())
    asyncio.create_task(run_scraper_forever(initial_delay=30.0))
    asyncio.create_task(run_booknet_forever(initial_delay=60.0))
    log.info("Startup complete; env=%s db=%s", settings.ENV, settings.DATABASE_URL.split("@")[-1])
    yield


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}


# Routers
app.include_router(auth.router)
app.include_router(books.router)
app.include_router(books.files_router)
app.include_router(social.router)
app.include_router(recommendations.router)
app.include_router(achievements.router)
app.include_router(author.router)
app.include_router(admin.router)


# Avatar upload
@app.post("/api/uploads/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: models.User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(400, "No file")
    rel = save_upload("avatars", file.file, file.filename, {"jpg", "jpeg", "png", "webp"})
    current.avatar_url = "/api/files/" + rel
    db.commit()
    return {"avatar_url": current.avatar_url}
