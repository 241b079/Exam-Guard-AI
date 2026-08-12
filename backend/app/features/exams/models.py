import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Float, Boolean, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ExamStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class NegativeMarkingType(str, enum.Enum):
    NONE = "NONE"
    PER_QUESTION = "PER_QUESTION"


class AssignmentType(str, enum.Enum):
    ALL_STUDENTS = "ALL_STUDENTS"
    SELECTED_STUDENTS = "SELECTED_STUDENTS"


class AvailabilityType(str, enum.Enum):
    ALWAYS = "ALWAYS"
    SCHEDULED = "SCHEDULED"


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    total_marks: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    status: Mapped[ExamStatus] = mapped_column(
        SQLEnum(ExamStatus, name="exam_status_enum"),
        nullable=False,
        default=ExamStatus.DRAFT
    )
    negative_marking: Mapped[NegativeMarkingType] = mapped_column(
        SQLEnum(NegativeMarkingType, name="negative_marking_enum"),
        nullable=False,
        default=NegativeMarkingType.NONE
    )
    auto_submit: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_countdown: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    assignment_type: Mapped[AssignmentType] = mapped_column(
        SQLEnum(AssignmentType, name="assignment_type_enum"),
        nullable=False,
        default=AssignmentType.ALL_STUDENTS
    )
    assigned_student_ids: Mapped[list] = mapped_column(JSON, nullable=True, default=list)

    availability_type: Mapped[AvailabilityType] = mapped_column(
        SQLEnum(AvailabilityType, name="availability_type_enum"),
        nullable=False,
        default=AvailabilityType.ALWAYS
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

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
    creator = relationship("User", backref="created_exams", lazy="selectin")
    questions = relationship("Question", back_populates="exam", cascade="all, delete-orphan", lazy="selectin")
    attempts = relationship("ExamAttempt", back_populates="exam", cascade="all, delete-orphan", lazy="selectin")
