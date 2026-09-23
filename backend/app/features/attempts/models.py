import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, Boolean, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    EXPIRED = "EXPIRED"


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[AttemptStatus] = mapped_column(
        SQLEnum(AttemptStatus, name="attempt_status_enum"),
        nullable=False,
        default=AttemptStatus.IN_PROGRESS
    )
    total_score: Mapped[float] = mapped_column(Float, nullable=True)
    max_possible_score: Mapped[float] = mapped_column(Float, nullable=True)

    # Pre-exam Identity Verification Audit Fields
    identity_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    identity_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    identity_verification_score: Mapped[float] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    exam = relationship("Exam", back_populates="attempts")
    student = relationship("User", lazy="selectin")
    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan", lazy="selectin")
    violations = relationship("ExamViolation", back_populates="attempt", cascade="all, delete-orphan", lazy="selectin")


class ViolationType(str, enum.Enum):
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"
    CONTEXT_MENU = "CONTEXT_MENU"
    COPY_ATTEMPT = "COPY_ATTEMPT"
    PASTE_ATTEMPT = "PASTE_ATTEMPT"
    CUT_ATTEMPT = "CUT_ATTEMPT"
    PAGE_HIDDEN = "PAGE_HIDDEN"
    WINDOW_BLUR = "WINDOW_BLUR"


class ExamViolation(Base):
    __tablename__ = "exam_violations"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    violation_type: Mapped[ViolationType] = mapped_column(
        SQLEnum(ViolationType, name="violation_type_enum"),
        nullable=False,
        index=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    attempt = relationship("ExamAttempt", back_populates="violations")
    student = relationship("User", lazy="selectin")


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    question_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    selected_option: Mapped[str] = mapped_column(Text, nullable=True)
    answer_text: Mapped[str] = mapped_column(Text, nullable=True)
    is_marked_for_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=True)
    marks_awarded: Mapped[float] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    attempt = relationship("ExamAttempt", back_populates="answers")
    question = relationship("Question", lazy="selectin")
