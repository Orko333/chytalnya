from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ===== Auth =====
class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=6, max_length=128)


# ===== User =====
class UserOut(ORMBase):
    id: int
    email: EmailStr
    username: str
    bio: Optional[str] = ""
    avatar_url: Optional[str] = ""
    role: str
    email_verified: bool = False
    created_at: datetime


class UserPublic(ORMBase):
    id: int
    username: str
    bio: Optional[str] = ""
    avatar_url: Optional[str] = ""
    role: str
    created_at: datetime


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=64)
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


# ===== Books =====
class BookBase(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    author_name: str = ""
    description: str = ""
    genres: List[str] = []
    language: str = "uk"
    is_premium: bool = False


class BookCreate(BookBase):
    pass


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author_name: Optional[str] = None
    description: Optional[str] = None
    genres: Optional[List[str]] = None
    language: Optional[str] = None
    is_premium: Optional[bool] = None
    status: Optional[str] = None


class BookOut(ORMBase):
    id: int
    title: str
    author_name: str = ""
    description: str = ""
    cover_url: str = ""
    genres: List[str] = []
    language: str = "uk"
    is_premium: bool = False
    owner_id: int
    owner_username: str = ""
    has_text: bool = False
    has_audio: bool = False
    audio_url: str = ""
    text_url: str = ""
    total_chars: int = 0
    total_seconds: float = 0.0
    status: str = "published"
    views: int = 0
    avg_rating: float = 0.0
    reviews_count: int = 0
    created_at: datetime


# ===== Progress =====
class ProgressIn(BaseModel):
    text_position: Optional[int] = None
    audio_position: Optional[float] = None
    last_mode: Optional[str] = None
    completed: Optional[bool] = None


class ProgressOut(ORMBase):
    book_id: int
    text_position: int
    audio_position: float
    last_mode: str
    completed: bool
    updated_at: datetime


# ===== Reviews & Comments =====
class ReviewCreate(BaseModel):
    book_id: int
    rating: int = Field(ge=1, le=5)
    content: str = ""


class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    content: Optional[str] = None


class ReviewOut(ORMBase):
    id: int
    user: UserPublic
    book_id: int
    rating: int
    content: str
    created_at: datetime
    comments_count: int = 0


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    parent_id: Optional[int] = None


class CommentOut(ORMBase):
    id: int
    user: UserPublic
    review_id: int
    parent_id: Optional[int]
    content: str
    created_at: datetime


# ===== Social =====


# ===== Achievements =====
class AchievementOut(ORMBase):
    id: int
    code: str
    name: str
    description: str
    icon: str
    condition_type: str
    condition_value: int
    earned: bool = False
    earned_at: Optional[datetime] = None


# ===== Subscriptions =====
class PlanOut(ORMBase):
    code: str
    name: str
    price_monthly: float
    features: List[str] = []


class SubStatus(BaseModel):
    plan_code: str
    status: str
    end_date: Optional[datetime] = None


class CheckoutOut(BaseModel):
    checkout_url: str
    session_id: str


# ===== Payments =====
class FakeCardIn(BaseModel):
    card_number: str = Field(min_length=13, max_length=23)  # allows spaces/dashes
    expiry: str = Field(pattern=r"^\d{2}/\d{2}$")
    cvv: str = Field(min_length=3, max_length=4, pattern=r"^\d{3,4}$")
    cardholder: str = Field(min_length=2, max_length=120)


class CheckoutInitOut(BaseModel):
    payment_id: int
    amount: float
    currency: str
    description: str


class ConfirmIn(FakeCardIn):
    payment_id: int


class PaymentOut(BaseModel):
    id: int
    kind: str
    amount: float
    currency: str
    status: str
    card_last4: str
    description: str
    created_at: datetime


class AuthorSubPlanOut(BaseModel):
    author_id: int
    price_monthly: float
    description: str
    is_active: bool


class AuthorSubPlanSet(BaseModel):
    price_monthly: float = Field(ge=0.99, le=99.99)
    description: str = Field(default="", max_length=500)
    is_active: bool = True


class UserAuthorSubOut(BaseModel):
    author_id: int
    status: str
    end_date: Optional[datetime] = None


class BookAccessOut(BaseModel):
    can_access: bool
    reason: str          # free | owner | admin | platform_premium | author_sub
    is_premium: bool
    requires: Optional[str] = None   # None | platform_premium | author_sub | login
    author_sub_price: Optional[float] = None
    platform_sub_price: float = 4.99


# ===== Admin =====
class ReportCreate(BaseModel):
    content_type: str
    content_id: int
    reason: str = ""


class ReportOut(ORMBase):
    id: int
    reporter_id: int
    content_type: str
    content_id: int
    reason: str
    status: str
    created_at: datetime


class AdminUserOut(UserOut):
    is_active: bool


# ===== Notifications =====
class NotificationOut(ORMBase):
    id: int
    type: str
    title: str
    body: str
    link: str
    is_read: bool
    created_at: datetime


# ===== Recommendations =====
class RecommendationOut(BaseModel):
    book: BookOut
    reason: str = ""
    score: float = 0.0
