import os
import uuid
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings

BASE = Path(settings.UPLOAD_DIR).resolve()
BASE.mkdir(parents=True, exist_ok=True)
(BASE / "covers").mkdir(exist_ok=True)
(BASE / "books").mkdir(exist_ok=True)
(BASE / "audio").mkdir(exist_ok=True)
(BASE / "avatars").mkdir(exist_ok=True)


def _safe_ext(filename: str, allowed: set[str]) -> str:
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if ext not in allowed:
        raise ValueError(f"File extension .{ext} not allowed")
    return ext


def save_upload(sub: str, fileobj: BinaryIO, filename: str, allowed_ext: set[str]) -> str:
    ext = _safe_ext(filename, allowed_ext)
    name = f"{uuid.uuid4().hex}.{ext}"
    rel = f"{sub}/{name}"
    dest = BASE / rel
    with open(dest, "wb") as f:
        while True:
            chunk = fileobj.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
    return rel  # relative path, served via /api/files/...


def absolute_path(rel: str) -> Path:
    p = (BASE / rel).resolve()
    if not str(p).startswith(str(BASE)):
        raise ValueError("Invalid path")
    return p


def delete_file(rel: str) -> None:
    try:
        p = absolute_path(rel)
        if p.exists():
            p.unlink()
    except Exception:
        pass
