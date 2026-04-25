"""Background external catalog sync runner.

Usage examples:
  python sync_external_books.py --once
  python sync_external_books.py --interval 600
"""
from __future__ import annotations

import argparse
import time

from app.core.database import SessionLocal
from app.services.catalog_sync import live_sync_books
from app.services.audio import populate_audio_urls

DEFAULT_QUERIES = [
    "українська класика",
    "світова класика",
    "фентезі",
    "детектив",
    "психологія",
    "філософія",
    "роман",
    "поезія",
    "драма",
    "історія",
]


def run_once(limit: int) -> None:
    with SessionLocal() as db:
        total = 0
        for q in DEFAULT_QUERIES:
            inserted = live_sync_books(db, q, limit=limit)
            total += inserted
            print(f"[sync] query='{q}' inserted={inserted}")
        try:
            import asyncio
            matched = asyncio.run(populate_audio_urls(db))
            print(f"[audio] matched={matched}")
        except Exception as exc:
            print(f"[audio] skipped: {exc}")
        print(f"[done] inserted_total={total}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Run one sync cycle")
    parser.add_argument("--interval", type=int, default=0, help="Repeat sync every N seconds")
    parser.add_argument("--limit", type=int, default=35, help="Per-query source fetch limit")
    args = parser.parse_args()

    if args.once or args.interval <= 0:
        run_once(args.limit)
        return

    while True:
        try:
            run_once(args.limit)
        except Exception as exc:
            print(f"[error] {exc}")
        time.sleep(max(30, args.interval))


if __name__ == "__main__":
    main()
