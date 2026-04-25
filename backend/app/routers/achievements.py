from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db
from app.deps import get_current_user
from app.services.achievements import evaluate_achievements

router = APIRouter(prefix="/api/achievements", tags=["achievements"])


@router.get("", response_model=List[schemas.AchievementOut])
def list_achievements(db: Session = Depends(get_db), current: models.User = Depends(get_current_user)):
    evaluate_achievements(db, current)
    all_ach = db.query(models.Achievement).order_by(models.Achievement.condition_value.asc()).all()
    earned = {ua.achievement_id: ua.earned_at for ua in db.query(models.UserAchievement).filter_by(user_id=current.id).all()}
    out = []
    for a in all_ach:
        out.append(schemas.AchievementOut(
            id=a.id, code=a.code, name=a.name, description=a.description, icon=a.icon,
            condition_type=a.condition_type, condition_value=a.condition_value,
            earned=a.id in earned, earned_at=earned.get(a.id),
        ))
    return out
