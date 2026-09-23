from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict
from app.features.attempts.models import AttemptStatus, ViolationType


class SaveAnswerRequest(BaseModel):
    question_id: str
    selected_option: Optional[str] = None
    answer_text: Optional[str] = None
    is_marked_for_review: bool = False


class AnswerResponse(BaseModel):
    id: str
    question_id: str
    selected_option: Optional[str] = None
    answer_text: Optional[str] = None
    is_marked_for_review: bool = False
    is_correct: Optional[bool] = None
    marks_awarded: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttemptResponse(BaseModel):
    id: str
    exam_id: str
    student_id: str
    started_at: datetime
    submitted_at: Optional[datetime] = None
    status: AttemptStatus
    total_score: Optional[float] = None
    max_possible_score: Optional[float] = None
    identity_verified: bool = False
    identity_verified_at: Optional[datetime] = None
    identity_verification_score: Optional[float] = None
    answers: List[AnswerResponse] = []
    time_remaining_seconds: int = 0
    violation_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class SubmitAttemptResponse(BaseModel):
    attempt_id: str
    exam_id: str
    exam_title: str
    status: AttemptStatus
    started_at: datetime
    submitted_at: datetime
    total_questions: int
    attempted_questions: int
    correct_mcq_count: int
    total_score: float
    max_possible_score: float
    short_answer_status: str = "Pending Review"


class CreateViolationRequest(BaseModel):
    violation_type: ViolationType
    timestamp: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


class ViolationResponse(BaseModel):
    id: str
    exam_attempt_id: str
    student_id: str
    violation_type: ViolationType
    timestamp: datetime
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttemptMonitoringStudentInfo(BaseModel):
    id: str
    name: str
    email: str
    roll_number: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AttemptMonitoringResponse(BaseModel):
    attempt_id: str
    exam_id: str
    student: AttemptMonitoringStudentInfo
    status: AttemptStatus
    started_at: datetime
    submitted_at: Optional[datetime] = None
    violation_count: int
    recent_violations: List[ViolationResponse] = []

    model_config = ConfigDict(from_attributes=True)
