from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.features.questions.models import QuestionType


class QuestionBase(BaseModel):
    question_type: QuestionType = QuestionType.MCQ
    question_text: str = Field(..., min_length=1)
    options: Optional[List[str]] = []
    correct_answer: str = Field(..., min_length=1)
    marks: float = Field(..., gt=0)
    negative_marks: float = Field(0.0, ge=0)
    explanation: Optional[str] = None
    order_index: int = 0


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    question_type: Optional[QuestionType] = None
    question_text: Optional[str] = None
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    marks: Optional[float] = Field(None, gt=0)
    negative_marks: Optional[float] = Field(None, ge=0)
    explanation: Optional[str] = None
    order_index: Optional[int] = None


class QuestionResponse(QuestionBase):
    id: str
    exam_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionImportRow(BaseModel):
    row_number: int
    question_type: str
    question_text: str
    options: Optional[List[str]] = []
    correct_answer: str
    marks: float
    negative_marks: float = 0.0
    explanation: Optional[str] = None
    is_valid: bool = True
    errors: List[str] = []


class QuestionImportPreviewResponse(BaseModel):
    total_rows: int
    valid_count: int
    invalid_count: int
    rows: List[QuestionImportRow]
