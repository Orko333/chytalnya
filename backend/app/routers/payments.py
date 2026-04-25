"""
Fake Stripe payment system.

Card validation flow:
  POST /api/payments/platform/checkout  → create pending Payment, return payment_id+amount
  POST /api/payments/platform/confirm   → validate fake card → activate platform premium
  POST /api/payments/platform/cancel    → cancel platform subscription

  POST /api/payments/author/{author_id}/checkout → init author sub payment
  POST /api/payments/author/{author_id}/confirm  → confirm + activate author sub
  POST /api/payments/author/{author_id}/cancel   → cancel author sub

  GET  /api/payments/history            → user payment history
  GET  /api/payments/author-sub/{id}    → is current user subscribed to author?

  GET  /api/payments/author-plan/me     → my author plan (author only)
  PUT  /api/payments/author-plan/me     → create/update my author plan
  GET  /api/payments/author-plan/me/stats → subscriber count + revenue
  GET  /api/payments/author-plan/{author_id} → any author's public plan

Test cards (Luhn-valid, VISA format):
  4242 4242 4242 4242  → success
  4000 0000 0000 0002  → declined: insufficient funds
  4000 0000 0000 0069  → declined: do not honor
  4000 0000 0000 0119  → declined: expired card (bank-side)
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db
from app.deps import get_current_user

router = APIRouter(prefix="/api/payments", tags=["payments"])

PLATFORM_PRICE = 4.99
CURRENCY = "USD"


# ── Card validation ───────────────────────────────────────────────────────────

def _luhn_check(digits_only: str) -> bool:
    """Standard Luhn algorithm."""
    nums = [int(c) for c in digits_only]
    total = 0
    for i, d in enumerate(reversed(nums)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _validate_expiry(expiry: str) -> bool:
    """True if card is not yet expired (valid through end of stated month)."""
    try:
        month_s, year_s = expiry.split("/")
        m, y = int(month_s), int(year_s) + 2000
        if not (1 <= m <= 12):
            return False
        # Card is valid through the last instant of the expiry month
        next_m = m % 12 + 1
        next_y = y + (1 if m == 12 else 0)
        exp_end = datetime(next_y, next_m, 1, tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < exp_end
    except Exception:
        return False


def _simulate_decline(digits: str) -> Optional[str]:
    """Return decline code or None if approved."""
    if digits.endswith("0002"):
        return "insufficient_funds"
    if digits.endswith("0069"):
        return "do_not_honor"
    if digits.endswith("0119"):
        return "expired_card"
    return None


def _process_card(card: schemas.FakeCardIn) -> str:
    """Validate card fields; return last4 or raise HTTPException."""
    digits = card.card_number.replace(" ", "").replace("-", "")
    if not digits.isdigit() or not (13 <= len(digits) <= 19):
        raise HTTPException(422, "Невірний формат номера картки")
    if not _luhn_check(digits):
        raise HTTPException(422, "Невірний номер картки (перевірка Luhn не пройшла)")
    if not _validate_expiry(card.expiry):
        raise HTTPException(422, "Термін дії картки закінчився")
    decline = _simulate_decline(digits)
    if decline == "insufficient_funds":
        raise HTTPException(402, "Недостатньо коштів на рахунку. Спробуйте іншу картку.")
    if decline == "do_not_honor":
        raise HTTPException(402, "Банк відхилив транзакцію. Зверніться до свого банку.")
    if decline == "expired_card":
        raise HTTPException(402, "Картка заблокована банком. Зверніться до свого банку.")
    return digits[-4:]


# ── Access helper (shared with books.py) ─────────────────────────────────────

def has_book_access(book: models.Book, user: Optional[models.User], db: Session) -> bool:
    """Return True if user may access a premium book."""
    if not book.is_premium:
        return True
    if not user:
        return False
    if user.role == "admin":
        return True
    if book.owner_id == user.id:
        return True
    now = datetime.now(timezone.utc)
    # Author subscription only
    a_sub = db.query(models.UserAuthorSub).filter_by(
        user_id=user.id, author_id=book.owner_id, status="active"
    ).first()
    if a_sub:
        ed = a_sub.end_date
        if ed and ed.tzinfo is None:
            ed = ed.replace(tzinfo=timezone.utc)
        if ed is None or ed > now:
            return True
    return False


# ── Platform premium ──────────────────────────────────────────────────────────

@router.post("/platform/checkout", response_model=schemas.CheckoutInitOut)
def platform_checkout(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Initiate a platform premium payment. Returns payment_id to use in /confirm."""
    now = datetime.now(timezone.utc)
    sub = db.query(models.UserSubscription).filter_by(user_id=user.id).first()
    if sub and sub.plan_code == "premium" and sub.status == "active":
        ed = sub.end_date
        if ed and ed.tzinfo is None:
            ed = ed.replace(tzinfo=timezone.utc)
        if ed is None or ed > now:
            raise HTTPException(400, "У вас вже активна преміум підписка")

    payment = models.Payment(
        user_id=user.id,
        kind="platform_premium",
        amount=PLATFORM_PRICE,
        currency=CURRENCY,
        status="pending",
        description="Читальня Преміум — 1 місяць",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return schemas.CheckoutInitOut(
        payment_id=payment.id,
        amount=PLATFORM_PRICE,
        currency=CURRENCY,
        description="Читальня Преміум — 1 місяць",
    )


@router.post("/platform/confirm", response_model=schemas.PaymentOut)
def platform_confirm(
    data: schemas.ConfirmIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Confirm payment with fake card details → activate platform premium."""
    payment = db.query(models.Payment).filter_by(
        id=data.payment_id, user_id=user.id,
        kind="platform_premium", status="pending",
    ).first()
    if not payment:
        raise HTTPException(404, "Платіж не знайдено або вже оброблено")

    try:
        last4 = _process_card(data)
    except HTTPException:
        payment.status = "failed"
        db.commit()
        raise

    payment.status = "succeeded"
    payment.card_last4 = last4
    payment.fake_pi_id = f"pi_fake_{uuid.uuid4().hex}"
    db.commit()

    now = datetime.now(timezone.utc)
    sub = db.query(models.UserSubscription).filter_by(user_id=user.id).first()
    if not sub:
        sub = models.UserSubscription(user_id=user.id)
        db.add(sub)
    sub.plan_code = "premium"
    sub.status = "active"
    sub.start_date = now
    sub.end_date = now + timedelta(days=30)
    sub.stripe_sub_id = payment.fake_pi_id
    db.commit()
    db.refresh(payment)

    return schemas.PaymentOut(
        id=payment.id, kind=payment.kind, amount=payment.amount, currency=payment.currency,
        status=payment.status, card_last4=payment.card_last4,
        description=payment.description, created_at=payment.created_at,
    )


@router.post("/platform/cancel")
def platform_cancel(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    sub = db.query(models.UserSubscription).filter_by(user_id=user.id).first()
    if not sub or sub.plan_code != "premium":
        raise HTTPException(400, "Немає активної преміум підписки")
    sub.plan_code = "free"
    sub.status = "canceled"
    db.commit()
    return {"status": "canceled"}


@router.get("/platform/status", response_model=schemas.SubStatus)
def platform_status(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    sub = db.query(models.UserSubscription).filter_by(user_id=user.id).first()
    if not sub:
        return schemas.SubStatus(plan_code="free", status="active", end_date=None)
    return schemas.SubStatus(plan_code=sub.plan_code, status=sub.status, end_date=sub.end_date)


# ── Author subscriptions ──────────────────────────────────────────────────────

@router.post("/author/{author_id}/checkout", response_model=schemas.CheckoutInitOut)
def author_checkout(
    author_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    author = db.query(models.User).filter_by(id=author_id).first()
    if not author or author.role not in ("author", "admin"):
        raise HTTPException(404, "Автора не знайдено")
    if author_id == user.id:
        raise HTTPException(400, "Не можна підписатися на самого себе")

    plan = db.query(models.AuthorSubPlan).filter_by(author_id=author_id, is_active=True).first()
    if not plan:
        raise HTTPException(404, "Цей автор не налаштував платну підписку")

    now = datetime.now(timezone.utc)
    existing = db.query(models.UserAuthorSub).filter_by(
        user_id=user.id, author_id=author_id, status="active"
    ).first()
    if existing:
        ed = existing.end_date
        if ed and ed.tzinfo is None:
            ed = ed.replace(tzinfo=timezone.utc)
        if ed is None or ed > now:
            raise HTTPException(400, "Ви вже підписані на цього автора")

    payment = models.Payment(
        user_id=user.id,
        kind="author_sub",
        target_id=author_id,
        amount=plan.price_monthly,
        currency=CURRENCY,
        status="pending",
        description=f"Підписка на автора @{author.username} — 1 місяць",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return schemas.CheckoutInitOut(
        payment_id=payment.id,
        amount=plan.price_monthly,
        currency=CURRENCY,
        description=f"Підписка на автора @{author.username} — 1 місяць",
    )


@router.post("/author/{author_id}/confirm", response_model=schemas.PaymentOut)
def author_confirm(
    author_id: int,
    data: schemas.ConfirmIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    payment = db.query(models.Payment).filter_by(
        id=data.payment_id, user_id=user.id,
        kind="author_sub", status="pending", target_id=author_id,
    ).first()
    if not payment:
        raise HTTPException(404, "Платіж не знайдено або вже оброблено")

    try:
        last4 = _process_card(data)
    except HTTPException:
        payment.status = "failed"
        db.commit()
        raise

    payment.status = "succeeded"
    payment.card_last4 = last4
    payment.fake_pi_id = f"pi_fake_{uuid.uuid4().hex}"
    db.commit()

    now = datetime.now(timezone.utc)
    a_sub = db.query(models.UserAuthorSub).filter_by(user_id=user.id, author_id=author_id).first()
    if not a_sub:
        a_sub = models.UserAuthorSub(user_id=user.id, author_id=author_id)
        db.add(a_sub)
    a_sub.status = "active"
    a_sub.start_date = now
    a_sub.end_date = now + timedelta(days=30)
    db.commit()
    db.refresh(payment)

    return schemas.PaymentOut(
        id=payment.id, kind=payment.kind, amount=payment.amount, currency=payment.currency,
        status=payment.status, card_last4=payment.card_last4,
        description=payment.description, created_at=payment.created_at,
    )


@router.post("/author/{author_id}/cancel")
def author_cancel(
    author_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    a_sub = db.query(models.UserAuthorSub).filter_by(
        user_id=user.id, author_id=author_id, status="active"
    ).first()
    if not a_sub:
        raise HTTPException(400, "Немає активної підписки на цього автора")
    a_sub.status = "canceled"
    db.commit()
    return {"status": "canceled"}


@router.get("/author-sub/{author_id}", response_model=schemas.UserAuthorSubOut)
def author_sub_status(
    author_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    a_sub = db.query(models.UserAuthorSub).filter_by(
        user_id=user.id, author_id=author_id
    ).first()
    if not a_sub:
        return schemas.UserAuthorSubOut(author_id=author_id, status="none", end_date=None)
    return schemas.UserAuthorSubOut(author_id=author_id, status=a_sub.status, end_date=a_sub.end_date)


# ── Author plan management ────────────────────────────────────────────────────

@router.get("/author-plan/me", response_model=Optional[schemas.AuthorSubPlanOut])
def get_my_plan(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role not in ("author", "admin"):
        raise HTTPException(403, "Тільки для авторів")
    plan = db.query(models.AuthorSubPlan).filter_by(author_id=user.id).first()
    if not plan:
        return None
    return schemas.AuthorSubPlanOut(
        author_id=plan.author_id, price_monthly=plan.price_monthly,
        description=plan.description, is_active=plan.is_active,
    )


@router.put("/author-plan/me", response_model=schemas.AuthorSubPlanOut)
def set_my_plan(
    data: schemas.AuthorSubPlanSet,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role not in ("author", "admin"):
        raise HTTPException(403, "Тільки для авторів")
    plan = db.query(models.AuthorSubPlan).filter_by(author_id=user.id).first()
    if not plan:
        plan = models.AuthorSubPlan(author_id=user.id)
        db.add(plan)
    plan.price_monthly = data.price_monthly
    plan.description = data.description
    plan.is_active = data.is_active
    db.commit()
    db.refresh(plan)
    return schemas.AuthorSubPlanOut(
        author_id=plan.author_id, price_monthly=plan.price_monthly,
        description=plan.description, is_active=plan.is_active,
    )


@router.get("/author-plan/me/stats")
def my_plan_stats(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role not in ("author", "admin"):
        raise HTTPException(403, "Тільки для авторів")
    count = (
        db.query(func.count(models.UserAuthorSub.id))
        .filter_by(author_id=user.id, status="active")
        .scalar()
    ) or 0
    revenue = (
        db.query(func.sum(models.Payment.amount))
        .filter(
            models.Payment.kind == "author_sub",
            models.Payment.target_id == user.id,
            models.Payment.status == "succeeded",
        )
        .scalar()
    ) or 0.0
    return {"subscribers": int(count), "total_revenue": float(revenue)}


@router.get("/author-plan/{author_id}", response_model=Optional[schemas.AuthorSubPlanOut])
def get_author_plan(author_id: int, db: Session = Depends(get_db)):
    plan = db.query(models.AuthorSubPlan).filter_by(author_id=author_id, is_active=True).first()
    if not plan:
        return None
    return schemas.AuthorSubPlanOut(
        author_id=plan.author_id, price_monthly=plan.price_monthly,
        description=plan.description, is_active=plan.is_active,
    )


@router.get("/my-author-subs")
def my_author_subs(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """List all author subscriptions (any status) for the current user."""
    subs = db.query(models.UserAuthorSub).filter_by(user_id=user.id).all()
    result = []
    for s in subs:
        author = db.query(models.User).filter_by(id=s.author_id).first()
        plan = db.query(models.AuthorSubPlan).filter_by(author_id=s.author_id).first()
        result.append({
            "author_id": s.author_id,
            "author_username": author.username if author else "",
            "author_avatar_url": author.avatar_url or "" if author else "",
            "status": s.status,
            "end_date": s.end_date.isoformat() if s.end_date else None,
            "price_monthly": plan.price_monthly if plan else 0.0,
            "plan_description": plan.description if plan else "",
        })
    return result


# ── Payment history ───────────────────────────────────────────────────────────

@router.get("/history", response_model=List[schemas.PaymentOut])
def payment_history(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    payments = (
        db.query(models.Payment)
        .filter_by(user_id=user.id)
        .order_by(models.Payment.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        schemas.PaymentOut(
            id=p.id, kind=p.kind, amount=p.amount, currency=p.currency,
            status=p.status, card_last4=p.card_last4,
            description=p.description, created_at=p.created_at,
        )
        for p in payments
    ]
