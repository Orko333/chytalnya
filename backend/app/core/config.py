from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Читальня"
    ENV: str = "development"
    SECRET_KEY: str = "dev-secret-change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    DATABASE_URL: str = "postgresql://chytalnya:chytalnya_dev@localhost:5432/chytalnya"

    FRONTEND_ORIGIN: str = "http://localhost:5173"
    PUBLIC_FRONTEND_URL: str = "http://localhost:5173"

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_ID_PREMIUM: str = ""

    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 200

    # booknet.ua periodic scraper
    # Set BOOKNET_SESSION_COOKIE to the 'litera-frontend' cookie value from a logged-in browser session
    BOOKNET_SESSION_COOKIE: str = ""
    # How many books to import per periodic run (every BOOKNET_INTERVAL_MINUTES minutes)
    BOOKNET_BOOKS_PER_RUN: int = 5
    BOOKNET_INTERVAL_MINUTES: int = 30

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
