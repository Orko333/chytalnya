import asyncio
import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

log = logging.getLogger(__name__)


async def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        log.warning("SMTP not configured; email to %s suppressed. Subject: %s", to, subject)
        log.warning("EMAIL BODY (dev):\n%s", text or html)
        return False
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text or "This email requires an HTML-capable reader.")
    msg.add_alternative(html, subtype="html")
    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
            timeout=20,
        )
        return True
    except Exception as e:
        log.exception("Failed to send email to %s: %s", to, e)
        return False


def send_email_sync(to: str, subject: str, html: str, text: str | None = None) -> bool:
    try:
        return asyncio.run(send_email(to, subject, html, text))
    except RuntimeError:
        # Already in a loop
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(send_email(to, subject, html, text))
        finally:
            loop.close()
