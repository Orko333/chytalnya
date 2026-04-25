import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password, create_access_token, create_refresh_token, decode_token,
)
from app.core.email import send_email
from app.core.config import settings
from app.core.storage import save_upload
from app.deps import get_current_user
from app.utils import user_public

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_tokens(user: models.User) -> schemas.TokenPair:
    return schemas.TokenPair(
        access_token=create_access_token(str(user.id), {"role": user.role, "username": user.username}),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/register", response_model=schemas.TokenPair)
def register(data: schemas.RegisterIn, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(400, "Email already registered")
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(400, "Username taken")
    u = models.User(
        email=str(data.email).lower(),
        username=data.username,
        password_hash=hash_password(data.password),
        role="user",
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    # default free subscription
    db.add(models.UserSubscription(user_id=u.id, plan_code="free", status="active"))
    db.commit()
    return _issue_tokens(u)


@router.post("/login", response_model=schemas.TokenPair)
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.email == str(data.email).lower()).first()
    if not u or not verify_password(data.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    if not u.is_active:
        raise HTTPException(403, "Account disabled")
    return _issue_tokens(u)


@router.post("/refresh", response_model=schemas.TokenPair)
def refresh(data: schemas.RefreshIn, db: Session = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid refresh token")
    u = db.query(models.User).filter(models.User.id == int(payload["sub"])).first()
    if not u or not u.is_active:
        raise HTTPException(401, "User invalid")
    return _issue_tokens(u)


@router.get("/me", response_model=schemas.UserOut)
def me(current: models.User = Depends(get_current_user)):
    current.bio = current.bio or ""
    current.avatar_url = current.avatar_url or ""
    return current


@router.put("/me", response_model=schemas.UserOut)
def update_me(data: schemas.UserUpdate, db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    if data.username and data.username != current.username:
        if db.query(models.User).filter(models.User.username == data.username).first():
            raise HTTPException(400, "Username taken")
        current.username = data.username
    if data.bio is not None:
        current.bio = data.bio
    if data.avatar_url is not None:
        current.avatar_url = data.avatar_url
    db.commit()
    db.refresh(current)
    return current

@router.post("/me/avatar", response_model=schemas.UserOut)
def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: models.User = Depends(get_current_user),
):
    try:
        rel = save_upload("avatars", file.file, file.filename or "avatar.png", {"png", "jpg", "jpeg", "webp", "gif"})
    except ValueError as e:
        raise HTTPException(400, str(e))
    current.avatar_url = "/api/files/" + rel
    db.commit()
    db.refresh(current)
    return current



def _hash_token(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


@router.post("/forgot-password")
async def forgot_password(data: schemas.ForgotIn, bg: BackgroundTasks, db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.email == str(data.email).lower()).first()
    # Always pretend success to avoid email enumeration
    if u:
        raw = secrets.token_urlsafe(32)
        tok = models.PasswordResetToken(
            user_id=u.id,
            token_hash=_hash_token(raw),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
        db.add(tok)
        db.commit()
        link = f"{settings.PUBLIC_FRONTEND_URL}/reset-password?token={raw}"
        html = f"""
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin:auto; padding:24px;">
            <h2 style="color:#4f46e5;">Читальня — скидання паролю</h2>
            <p>Привіт, <b>{u.username}</b>!</p>
            <p>Ви (або хтось інший) запросили скидання паролю. Посилання діє 30 хвилин:</p>
            <p><a href="{link}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Встановити новий пароль</a></p>
            <p style="color:#666;font-size:12px;">Якщо ви не робили запит — просто проігноруйте це повідомлення.</p>
        </div>
        """
        text = f"Перейдіть за посиланням для скидання паролю: {link}"
        bg.add_task(send_email, u.email, "Читальня — скидання паролю", html, text)
    return {"status": "ok"}


@router.post("/reset-password")
def reset_password(data: schemas.ResetIn, db: Session = Depends(get_db)):
    th = _hash_token(data.token)
    tok = db.query(models.PasswordResetToken).filter(models.PasswordResetToken.token_hash == th).first()
    if not tok or tok.used or tok.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired token")
    u = db.query(models.User).filter(models.User.id == tok.user_id).first()
    if not u:
        raise HTTPException(400, "User not found")
    u.password_hash = hash_password(data.password)
    tok.used = True
    db.commit()
    return {"status": "ok"}
