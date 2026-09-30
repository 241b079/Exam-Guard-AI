from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict
from app.features.attempts.models import AttemptStatus, ViolationType, MediaSessionStatus



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
    attempt_number: int = 1
    started_at: datetime
    deadline: Optional[datetime] = None
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
    rejoin_count: int = 0
    max_rejoins: int = 2
    session_token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StartOrResumeAttemptRequest(BaseModel):
    session_token: Optional[str] = None
    is_rejoin: bool = False


class StudentActiveExamSummary(BaseModel):
    exam_id: str
    exam_title: str
    attempt_id: str
    attempt_number: int
    status: AttemptStatus
    time_remaining_seconds: int
    deadline: Optional[datetime] = None
    rejoin_count: int = 0
    max_rejoins: int = 2
    identity_verified: bool = False


class StudentExamStatusResponse(BaseModel):
    exam_id: str
    has_active_attempt: bool = False
    active_attempt_id: Optional[str] = None
    latest_attempt_status: Optional[str] = None
    latest_attempt_number: int = 0
    reexam_available: bool = False
    can_start_or_resume: bool = True
    time_remaining_seconds: int = 0
    rejoin_count: int = 0
    max_rejoins: int = 2


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


class MediaSessionResponse(BaseModel):
    id: str
    exam_attempt_id: str
    student_id: str
    status: MediaSessionStatus
    camera_active: bool = False
    mic_active: bool = False
    screen_active: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateMediaStatusRequest(BaseModel):
    status: Optional[MediaSessionStatus] = None
    camera_active: Optional[bool] = None
    mic_active: Optional[bool] = None
    screen_active: Optional[bool] = None


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
    attempt_number: int = 1
    status: AttemptStatus
    started_at: datetime
    submitted_at: Optional[datetime] = None
    violation_count: int
    recent_violations: List[ViolationResponse] = []
    media_session: Optional[MediaSessionResponse] = None
    rejoin_count: int = 0
    max_rejoins: int = 2

    model_config = ConfigDict(from_attributes=True)


class GradebookStudentInfo(BaseModel):
    id: str
    name: str
    email: str
    roll_number: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GradebookEntry(BaseModel):
    attempt_id: str
    exam_id: str
    exam_title: str
    student: GradebookStudentInfo
    attempt_number: int = 1
    status: AttemptStatus
    started_at: datetime
    submitted_at: Optional[datetime] = None
    total_score: float
    max_possible_score: float
    percentage: float
    evaluation_status: str  # "EVALUATED" | "NEEDS_GRADING"
    short_answer_count: int = 0
    evaluated_short_answer_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ExamGradebookResponse(BaseModel):
    exam_id: str
    exam_title: str
    total_marks: float
    total_submissions: int
    entries: List[GradebookEntry] = []

    model_config = ConfigDict(from_attributes=True)


class StudentCompletedResultItem(BaseModel):
    attempt_id: str
    exam_id: str
    exam_title: str
    attempt_number: int = 1
    started_at: datetime
    submitted_at: Optional[datetime] = None
    total_score: float
    max_possible_score: float
    percentage: float
    status: AttemptStatus
    evaluation_status: str  # "EVALUATED" | "NEEDS_GRADING"

    model_config = ConfigDict(from_attributes=True)


class AttemptReviewQuestionItem(BaseModel):
    question_id: str
    question_type: str  # "MCQ" | "SHORT_ANSWER"
    question_text: str
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    max_marks: float
    negative_marks: float = 0.0
    explanation: Optional[str] = None
    order_index: int = 0
    answer_id: Optional[str] = None
    selected_option: Optional[str] = None
    answer_text: Optional[str] = None
    is_correct: Optional[bool] = None
    marks_awarded: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class AttemptReviewResponse(BaseModel):
    attempt_id: str
    exam_id: str
    exam_title: str
    student: GradebookStudentInfo
    attempt_number: int = 1
    status: AttemptStatus
    started_at: datetime
    submitted_at: Optional[datetime] = None
    total_score: float
    max_possible_score: float
    percentage: float
    evaluation_status: str
    total_questions: int
    attempted_questions: int
    correct_mcq_count: int
    questions: List[AttemptReviewQuestionItem] = []

    model_config = ConfigDict(from_attributes=True)


class ManualGradeRequest(BaseModel):
    marks_awarded: float
    feedback: Optional[str] = None


class ManualGradeResponse(BaseModel):
    attempt_id: str
    answer_id: str
    question_id: str
    marks_awarded: float
    attempt_total_score: float
    attempt_max_score: float
    evaluation_status: str
    message: str


