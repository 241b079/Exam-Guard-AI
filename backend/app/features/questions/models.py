import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, Integer, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class QuestionType(str, enum.Enum):
    MCQ = "MCQ"
    SHORT_ANSWER = "SHORT_ANSWER"


class Question(Base):
    __tablename__ = "questions"

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
    question_type: Mapped[QuestionType] = mapped_column(
        SQLEnum(QuestionType, name="question_type_enum"),
        nullable=False,
        default=QuestionType.MCQ
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Options list for MCQ e.g. ["Option A", "Option B", "Option C", "Option D"]
    options: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    
    # Correct option text or index for MCQ; expected answer for SHORT_ANSWER
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    
    marks: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    negative_marks: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    explanation: Mapped[str] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

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
    exam = relationship("Exam", back_populates="questions")
