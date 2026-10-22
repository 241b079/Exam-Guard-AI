from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from app.features.students.schemas import ALLOWED_BATCHES, validate_batch_value


class FacultyProfileResponse(BaseModel):
    id: str
    user_id: str
    faculty_id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    assigned_batches: List[str] = []
    profile_picture_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FacultyProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    assigned_batches: Optional[List[str]] = None
    profile_picture_url: Optional[str] = None

    @field_validator("assigned_batches")
    @classmethod
    def check_batches(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        valid_batches = []
        for b in v:
            clean = validate_batch_value(b)
            if clean and clean not in valid_batches:
                valid_batches.append(clean)
        return valid_batches


class BatchSummaryResponse(BaseModel):
    batch: str
    student_count: int
    completed_count: int
    locked_count: int
    active_permission_count: int


class ProctoringIncidentSummary(BaseModel):
    id: str
    exam_id: str
    exam_title: Optional[str] = None
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    event_type: str
    severity: str
    review_status: str
    detected_at: datetime
    evidence_url: Optional[str] = None


class StudentSummaryItem(BaseModel):
    id: str
    user_id: str
    student_id: str
    name: str
    email: str
    batch: Optional[str] = None
    department: Optional[str] = None
    is_active: bool = True
    profile_completed: bool = False


class FacultyDashboardStatsResponse(BaseModel):
    total_exams: int
    published_exams: int
    total_students: int
    active_students: int
    total_submissions: int
    proctoring_total_events: int
    proctoring_pending_reviews: int
    proctoring_critical_high: int
    recent_incidents: List[ProctoringIncidentSummary] = []
    recent_students: List[StudentSummaryItem] = []
    batches: List[BatchSummaryResponse] = []

