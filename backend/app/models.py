from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey,
    Float, UniqueConstraint, Index, JSON,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    bio = Column(Text, default="")
    avatar_url = Column(String(500), default="")
    role = Column(String(20), default="user")  # user | author | admin
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    books = relationship("Book", back_populates="owner", cascade="all,delete")
    reviews = relationship("Review", back_populates="user", cascade="all,delete")
    progress = relationship("BookProgress", back_populates="user", cascade="all,delete")
    subscription = relationship("UserSubscription", back_populates="user", uselist=False, cascade="all,delete")


class Book(Base):
    __tablename__ = "books"
    id = Column(Integer, primary_key=True)
    title = Column(String(300), nullable=False, index=True)
    author_name = Column(String(200), default="")
    description = Column(Text, default="")
    cover_url = Column(String(500), default="")
    genres = Column(JSON, default=list)  # list[str]
    language = Column(String(10), default="uk")
    is_premium = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    text_path = Column(String(500), default="")      # relative storage path
    audio_path = Column(String(500), default="")
    audio_url = Column(String(1000), default="")   # external audio URL (LibriVox etc.)
    text_url = Column(String(1000), default="")    # external text URL (Gutenberg, Archive.org etc.)
    total_chars = Column(Integer, default=0)
    total_seconds = Column(Float, default=0.0)
    status = Column(String(20), default="published")  # draft|published|banned
    views = Column(Integer, default=0)
    downloads = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    owner = relationship("User", back_populates="books")
    reviews = relationship("Review", back_populates="book", cascade="all,delete")


class BookProgress(Base):
    __tablename__ = "book_progress"
    __table_args__ = (UniqueConstraint("user_id", "book_id", name="uq_user_book_progress"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    text_position = Column(Integer, default=0)       # char offset
    audio_position = Column(Float, default=0.0)      # seconds
    last_mode = Column(String(10), default="text")   # text|audio
    completed = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="progress")
    book = relationship("Book")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("user_id", "book_id", name="uq_user_book_review"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1..5
    content = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="reviews")
    book = relationship("Book", back_populates="reviews")
    comments = relationship("Comment", back_populates="review", cascade="all,delete")


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    review_id = Column(Integer, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User")
    review = relationship("Review", back_populates="comments")
    parent = relationship("Comment", remote_side=[id])


class UserFollow(Base):
    __tablename__ = "user_follows"
    __table_args__ = (UniqueConstraint("follower_id", "followed_id", name="uq_follow"),)
    id = Column(Integer, primary_key=True)
    follower_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    followed_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=utcnow)


class BookFavorite(Base):
    __tablename__ = "book_favorites"
    __table_args__ = (UniqueConstraint("user_id", "book_id", name="uq_user_book_fav"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=utcnow)


class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(Integer, primary_key=True)
    code = Column(String(64), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    description = Column(String(500), default="")
    icon = Column(String(32), default="🏆")
    condition_type = Column(String(32), nullable=False)  # books_read, reviews_written, followers, minutes_listened
    condition_value = Column(Integer, nullable=False)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id", name="uq_user_ach"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    achievement_id = Column(Integer, ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False)
    earned_at = Column(DateTime, default=utcnow)


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"
    id = Column(Integer, primary_key=True)
    code = Column(String(32), unique=True, nullable=False)  # free | premium
    name = Column(String(64), nullable=False)
    price_monthly = Column(Float, default=0.0)
    features = Column(JSON, default=list)


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    plan_code = Column(String(32), default="free")
    stripe_sub_id = Column(String(120), default="")
    status = Column(String(32), default="active")  # active|canceled|past_due
    start_date = Column(DateTime, default=utcnow)
    end_date = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="subscription")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)


class ContentReport(Base):
    __tablename__ = "content_reports"
    id = Column(Integer, primary_key=True)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content_type = Column(String(32), nullable=False)  # book|review|comment|user
    content_id = Column(Integer, nullable=False)
    reason = Column(String(500), default="")
    status = Column(String(32), default="open")  # open|resolved|dismissed
    created_at = Column(DateTime, default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(32), nullable=False)  # follow|review|comment|achievement|system
    title = Column(String(200), default="")
    body = Column(String(500), default="")
    link = Column(String(500), default="")
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)


class BookEvent(Base):
    """Lightweight analytics: views, reads, completes."""
    __tablename__ = "book_events"
    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    event = Column(String(32), nullable=False)  # view|read|listen|complete|download
    value = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow)
