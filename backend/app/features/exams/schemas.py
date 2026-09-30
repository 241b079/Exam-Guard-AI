from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.features.exams.models import (
    ExamStatus,
    NegativeMarkingType,
    AssignmentType,
    AvailabilityType,
    AttemptPolicyType,
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

    # Attempt policy & rejoin settings
    attempt_policy: AttemptPolicyType = AttemptPolicyType.ONE_ATTEMPT
    max_attempts: int = Field(default=1, ge=1, description="Maximum allowed attempts")
    max_rejoins: int = Field(default=2, ge=0, description="Maximum allowed rejoin attempts per attempt")


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
    attempt_policy: Optional[AttemptPolicyType] = None
    max_attempts: Optional[int] = Field(None, ge=1)
    max_rejoins: Optional[int] = Field(None, ge=0)


class ExamResponse(ExamBase):
    id: str
    total_marks: float
    status: ExamStatus
    created_by_id: str
    question_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GrantReexamRequest(BaseModel):
    scope: str = Field(default="SELECTED", description="'SELECTED' or 'ALL'")
    student_ids: Optional[List[str]] = Field(default=[], description="List of student user IDs if scope is SELECTED")
    extra_attempts: int = Field(default=1, ge=1, le=10, description="Additional attempts to grant")


class ReexamPermissionResponse(BaseModel):
    id: str
    exam_id: str
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    student_roll_number: Optional[str] = None
    extra_attempts_allowed: int
    attempts_consumed: int
    remaining_attempts: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

