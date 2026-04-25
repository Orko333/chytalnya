"""Audio services: edge-tts TTS streaming + LibriVox URL lookup."""
from __future__ import annotations
import asyncio
import logging
from typing import AsyncGenerator
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# Voice map: ISO-639-1 language code → edge-tts voice name
_VOICE_MAP: dict[str, str] = {
    "uk": "uk-UA-PolinaNeural",
    "en": "en-US-JennyNeural",
    "de": "de-DE-KatjaNeural",
    "fr": "fr-FR-DeniseNeural",
    "es": "es-ES-ElviraNeural",
    "pl": "pl-PL-AgnieszkaNeural",
    "ru": "ru-RU-SvetlanaNeural",
}
_DEFAULT_VOICE = "uk-UA-PolinaNeural"


async def _tts_bytes(text: str, voice: str) -> bytes:
    """Generate MP3 bytes from text using edge-tts."""
    try:
        import edge_tts  # type: ignore
        import io
        buf = io.BytesIO()
        communicate = edge_tts.Communicate(text, voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()
    except Exception as exc:
        logger.warning("edge-tts failed: %s", exc)
        return b""


async def _tts_stream(text: str, voice: str) -> AsyncGenerator[bytes, None]:
    """Stream MP3 chunks from edge-tts."""
    try:
        import edge_tts  # type: ignore
        communicate = edge_tts.Communicate(text, voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]
    except Exception as exc:
        logger.warning("edge-tts stream failed: %s", exc)
        return


def stream_tts(text: str, lang: str = "uk"):
    """Return a sync generator of MP3 bytes for StreamingResponse."""
    voice = _VOICE_MAP.get(lang, _DEFAULT_VOICE)
    # Run async generator in a new event loop (called from sync FastAPI endpoint)
    loop = asyncio.new_event_loop()
    try:
        chunks = loop.run_until_complete(_collect_chunks(text, voice))
    finally:
        loop.close()
    for chunk in chunks:
        yield chunk


async def _collect_chunks(text: str, voice: str) -> list[bytes]:
    chunks: list[bytes] = []
    async for chunk in _tts_stream(text, voice):
        chunks.append(chunk)
    return chunks


async def tts_bytes_async(text: str, lang: str = "uk") -> bytes:
    """Async: generate full MP3 bytes for given text (for use from async endpoints)."""
    voice = _VOICE_MAP.get(lang, _DEFAULT_VOICE)
    return await _tts_bytes(text, voice)


# ── LibriVox lookup ─────────────────────────────────────────────────────────

_LIBRIVOX_API = "https://librivox.org/api/feed/audiobooks/"


async def find_librivox_url(title: str, author: str = "") -> str | None:
    """
    Search LibriVox for a matching audiobook and return the first chapter's MP3 URL.
    Strategy: catalog search → RSS feed first-enclosure → fallback page URL.
    Returns None if not found or on error.
    """
    try:
        import httpx
        params: dict[str, str] = {"format": "json", "limit": "3"}
        # Strip subtitle for better matching
        query = title.lower().split(":")[0].strip()
        params["title"] = query
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(_LIBRIVOX_API, params=params)
            if r.status_code != 200:
                return None
            data = r.json()
            books = data.get("books")
            if not books:
                return None
            book = books[0]

            # 1. Sections array (present when using extended API)
            sections = book.get("sections") or []
            if isinstance(sections, list) and sections:
                url = sections[0].get("listen_url", "")
                if url:
                    return url

            # 2. Fetch RSS feed and extract first chapter MP3
            url_rss = book.get("url_rss") or ""
            if url_rss:
                try:
                    rss_r = await client.get(url_rss, timeout=8.0)
                    if rss_r.status_code == 200:
                        root = ET.fromstring(rss_r.text)
                        for item in root.iter("item"):
                            enc = item.find("enclosure")
                            if enc is not None:
                                mp3_url = enc.get("url", "")
                                if mp3_url and mp3_url.endswith(".mp3"):
                                    return mp3_url
                except Exception:
                    pass

            # 3. Fallback: book page URL (signals audio exists even if not streamable)
            return book.get("url_librivox") or None
    except Exception as exc:
        logger.debug("LibriVox lookup failed for '%s': %s", title, exc)
        return None


async def populate_audio_urls(db) -> int:
    """
    Background task: for each book without audio, try to find a LibriVox URL.
    Returns count of books updated.
    """
    from app import models  # late import to avoid circular
    updated = 0
    books = db.query(models.Book).filter(
        models.Book.audio_url == "",
        models.Book.audio_path == "",
    ).all()
    for b in books:
        url = await find_librivox_url(b.title, b.author_name or "")
        if url:
            b.audio_url = url
            updated += 1
    if updated:
        db.commit()
    return updated
