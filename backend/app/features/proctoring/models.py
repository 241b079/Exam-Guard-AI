import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProctoringEventType(str, enum.Enum):
    TAB_SWITCH = "TAB_SWITCH"
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    CAMERA_OFF = "CAMERA_OFF"
    MIC_OFF = "MIC_OFF"
    DEVTOOLS_OPENED = "DEVTOOLS_OPENED"
    DISCONNECTED = "DISCONNECTED"
    VOICE_DETECTED = "VOICE_DETECTED"
    SUSPICIOUS_KEYPRESS = "SUSPICIOUS_KEYPRESS"


class ProctoringSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

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

    event_type: Mapped[ProctoringEventType] = mapped_column(
        SQLEnum(ProctoringEventType, name="proctoring_event_type_enum"),
        nullable=False
    )
    severity: Mapped[ProctoringSeverity] = mapped_column(
        SQLEnum(ProctoringSeverity, name="proctoring_severity_enum"),
        nullable=False,
        default=ProctoringSeverity.LOW
    )
    details: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    snapshot_url: Mapped[str] = mapped_column(Text, nullable=True)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    attempt = relationship("ExamAttempt", lazy="selectin")
    exam = relationship("Exam", lazy="selectin")
    student = relationship("User", lazy="selectin")
