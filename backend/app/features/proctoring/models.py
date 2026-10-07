import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, Integer, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProctoringEventType(str, enum.Enum):
    NO_FACE = "NO_FACE"
    TEMPORARY_ABSENCE = "TEMPORARY_ABSENCE"
    IDENTITY_MISMATCH = "IDENTITY_MISMATCH"
    MULTIPLE_PERSON = "MULTIPLE_PERSON"
    MULTIPLE_PERSON_IDENTITY_MISMATCH = "MULTIPLE_PERSON_IDENTITY_MISMATCH"
    RECOVERED = "RECOVERED"


class EventSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EventReviewStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    DISMISSED = "DISMISSED"
    FALSE_POSITIVE = "FALSE_POSITIVE"


class IdentityDetectionStatus(str, enum.Enum):
    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    MULTIPLE = "MULTIPLE"
    NONE = "NONE"
    UNKNOWN = "UNKNOWN"


class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

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
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True
    )
    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="MEDIUM"
    )
    review_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDING",
        index=True
    )
    review_comment: Mapped[str] = mapped_column(Text, nullable=True)
    reviewed_by_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    duration: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    confidence: Mapped[float] = mapped_column(Float, nullable=True)
    face_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expected_identity: Mapped[str] = mapped_column(String(255), nullable=True)
    detected_identity_status: Mapped[str] = mapped_column(String(50), nullable=True)

    evidence_path: Mapped[str] = mapped_column(String(500), nullable=True)
    incident_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)

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
    exam = relationship("Exam", lazy="selectin")
    attempt = relationship("ExamAttempt", lazy="selectin")
    student = relationship("User", foreign_keys=[student_id], lazy="selectin")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id], lazy="selectin")
