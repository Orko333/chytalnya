from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from app.core.config import settings

_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations() -> None:
    """Apply incremental schema changes that create_all won't handle for existing tables."""
    _ADD_COLUMNS = [
        ("books", "text_url", "VARCHAR(1000) DEFAULT ''"),
    ]
    with engine.connect() as conn:
        for table, col, col_def in _ADD_COLUMNS:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}"))
                conn.commit()
            except Exception:
                # Column already exists – ignore
                conn.rollback()

        # Fix Internet Archive /stream/ URLs → /download/ (stream returns HTML, download returns text)
        try:
            result = conn.execute(text(
                "UPDATE books SET text_url = REPLACE(text_url, 'archive.org/stream/', 'archive.org/download/') "
                "WHERE text_url LIKE '%archive.org/stream/%'"
            ))
            conn.commit()
            if result.rowcount:
                print(f"[migration] Fixed {result.rowcount} IA stream→download URLs")
        except Exception as e:
            conn.rollback()
            print(f"[migration] IA URL fix failed: {e}")
