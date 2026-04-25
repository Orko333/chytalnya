from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

import stripe

from app import models, schemas
from app.core.database import get_db
from app.core.config import settings
from app.deps import get_current_user

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


PLANS = [
    {"code": "free", "name": "Безкоштовно", "price_monthly": 0.0, "features": [
        "Доступ до безкоштовних книг",
        "Синхронізація тексту та аудіо",
        "Рецензії та коментарі",
    ]},
    {"code": "premium", "name": "Преміум", "price_monthly": 4.99, "features": [
        "Все з безкоштовного тарифу",
        "Доступ до преміум-бібліотеки",
        "Офлайн-доступ до контенту",
        "Розумні рекомендації",
        "Без реклами",
    ]},
]


def ensure_plans(db: Session) -> None:
    for p in PLANS:
        existing = db.query(models.SubscriptionPlan).filter_by(code=p["code"]).first()
        if not existing:
            db.add(models.SubscriptionPlan(**p))
    db.commit()


@router.get("/plans", response_model=list[schemas.PlanOut])
def plans(db: Session = Depends(get_db)):
    ensure_plans(db)
    return db.query(models.SubscriptionPlan).order_by(models.SubscriptionPlan.price_monthly.asc()).all()


@router.get("/current", response_model=schemas.SubStatus)
def current(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sub = db.query(models.UserSubscription).filter_by(user_id=user.id).first()
    if not sub:
        sub = models.UserSubscription(user_id=user.id, plan_code="free", status="active")
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return schemas.SubStatus(plan_code=sub.plan_code, status=sub.status, end_date=sub.end_date)


@router.post("/checkout", response_model=schemas.CheckoutOut)
def checkout(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    # If Stripe keys are real, create a real session. Otherwise create a demo session that auto-activates.
    sub = db.query(models.UserSubscription).filter_by(user_id=user.id).first()
    if not sub:
        sub = models.UserSubscription(user_id=user.id)
        db.add(sub)

    if settings.STRIPE_SECRET_KEY.startswith("sk_") and settings.STRIPE_PRICE_ID_PREMIUM.startswith("price_"):
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            session = stripe.checkout.Session.create(
                mode="subscription",
                line_items=[{"price": settings.STRIPE_PRICE_ID_PREMIUM, "quantity": 1}],
                success_url=f"{settings.PUBLIC_FRONTEND_URL}/subscriptions?status=success",
                cancel_url=f"{settings.PUBLIC_FRONTEND_URL}/subscriptions?status=cancel",
                client_reference_id=str(user.id),
                customer_email=user.email,
            )
            return schemas.CheckoutOut(checkout_url=session.url, session_id=session.id)
        except Exception as e:
            raise HTTPException(500, f"Stripe error: {e}")

    # Demo mode: auto-activate
    sub.plan_code = "premium"
    sub.status = "active"
    sub.start_date = datetime.now(timezone.utc)
    sub.end_date = datetime.now(timezone.utc) + timedelta(days=30)
    sub.stripe_sub_id = "demo_sub_" + str(user.id)
    db.commit()
    return schemas.CheckoutOut(
        checkout_url=f"{settings.PUBLIC_FRONTEND_URL}/subscriptions?status=success&demo=1",
        session_id="demo_session",
    )


@router.post("/cancel")
def cancel(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sub = db.query(models.UserSubscription).filter_by(user_id=user.id).first()
    if not sub:
        raise HTTPException(404, "No subscription")
    sub.plan_code = "free"
    sub.status = "canceled"
    db.commit()
    return {"status": "canceled"}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.STRIPE_WEBHOOK_SECRET.startswith("whsec_"):
        return {"ok": True, "demo": True}
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(400, f"Webhook error: {e}")
    etype = event.get("type", "")
    obj = event.get("data", {}).get("object", {})
    if etype == "checkout.session.completed":
        user_id = int(obj.get("client_reference_id") or 0)
        sub_id = obj.get("subscription") or ""
        if user_id:
            sub = db.query(models.UserSubscription).filter_by(user_id=user_id).first()
            if not sub:
                sub = models.UserSubscription(user_id=user_id)
                db.add(sub)
            sub.plan_code = "premium"
            sub.status = "active"
            sub.stripe_sub_id = sub_id
            sub.start_date = datetime.now(timezone.utc)
            sub.end_date = datetime.now(timezone.utc) + timedelta(days=30)
            db.commit()
    elif etype in ("customer.subscription.deleted", "customer.subscription.updated"):
        sub_id = obj.get("id") or ""
        status = obj.get("status", "")
        sub = db.query(models.UserSubscription).filter(models.UserSubscription.stripe_sub_id == sub_id).first()
        if sub:
            if status in ("canceled", "unpaid", "incomplete_expired"):
                sub.plan_code = "free"
                sub.status = "canceled"
            else:
                sub.status = status or sub.status
            db.commit()
    return {"ok": True}
