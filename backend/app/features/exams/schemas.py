from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.features.exams.models import (
    ExamStatus,
    NegativeMarkingType,
    AssignmentType,
    AvailabilityType
)


class ExamBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    duration_minutes: int = Field(..., gt=0, description="Duration in minutes")
    negative_marking: NegativeMarkingType = NegativeMarkingType.NONE
    auto_submit: bool = True
    display_countdown: bool = True
    assignment_type: AssignmentType = AssignmentType.ALL_STUDENTS
    assigned_student_ids: Optional[List[str]] = []
    availability_type: AvailabilityType = AvailabilityType.ALWAYS
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class ExamCreate(ExamBase):
    pass


class ExamUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, gt=0)
    negative_marking: Optional[NegativeMarkingType] = None
    auto_submit: Optional[bool] = None
    display_countdown: Optional[bool] = None
    assignment_type: Optional[AssignmentType] = None
    assigned_student_ids: Optional[List[str]] = None
    availability_type: Optional[AvailabilityType] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[ExamStatus] = None


class ExamResponse(ExamBase):
    id: str
    total_marks: float
    status: ExamStatus
    created_by_id: str
    question_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
