from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict
from app.features.proctoring.models import (
    ProctoringEventType,
    EventSeverity,
    EventReviewStatus,
    IdentityDetectionStatus,
    RiskLevel,
    InvestigationStatus,
    ReviewPriority,
    AIClassification,
)


class ContinuousVerificationResponse(BaseModel):
    state: str
    is_suspicious: bool
    face_count: int
    similarity: Optional[float] = None
    confidence: Optional[float] = None
    message: str
    incident_id: Optional[str] = None
    event_created: bool = False
    event_id: Optional[str] = None
    evidence_captured: bool = False
    risk_score: Optional[float] = 0.0
    risk_level: Optional[str] = "LOW"


class ProctoringEventResponse(BaseModel):
    id: str
    exam_id: str
    exam_title: Optional[str] = None
    exam_attempt_id: Optional[str] = None
    attempt_number: Optional[int] = None
    attempt_started_at: Optional[datetime] = None
    attempt_submitted_at: Optional[datetime] = None
    attempt_status: Optional[str] = None
    student_id: str
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    student_roll_number: Optional[str] = None
    event_type: str
    severity: str
    review_status: str
    review_comment: Optional[str] = None
    reviewed_by_id: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    detected_at: datetime
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration: float
    confidence: Optional[float] = None
    face_count: int
    expected_identity: Optional[str] = None
    detected_identity_status: Optional[str] = None
    evidence_url: Optional[str] = None
    incident_id: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None
    ai_classification: Optional[str] = "CONFIRMED"
    detection_source: Optional[str] = "VISION_AI"
    ai_explanation: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProctoringEventReviewPatch(BaseModel):
    review_status: EventReviewStatus
    review_comment: Optional[str] = None


class SFUTokenRequest(BaseModel):
    exam_id: str
    attempt_id: Optional[str] = None


class SFUTokenResponse(BaseModel):
    sfu_enabled: bool
    server_url: str
    token: str
    room_name: str
    identity: str
    role: str


class ProctoringEventsListResponse(BaseModel):
    total: int
    events: List[ProctoringEventResponse]


# ── AI Risk Scoring & Investigation Schemas ──

class StudentRiskScoreResponse(BaseModel):
    id: str
    exam_id: str
    exam_attempt_id: str
    student_id: str
    current_score: float
    peak_score: float
    risk_level: str
    incident_count: int
    confirmed_incidents_count: int
    suspicious_incidents_count: int
    inconclusive_incidents_count: int
    monitoring_status: str
    last_calculated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FacultyAlertResponse(BaseModel):
    id: str
    exam_id: str
    exam_attempt_id: str
    student_id: str
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    severity: str
    title: str
    description: str
    current_risk_score: float
    risk_classification: str
    evidence_url: Optional[str] = None
    ai_explanation: Optional[str] = None
    incident_id: Optional[str] = None
    is_read: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExaminationInvestigationResponse(BaseModel):
    id: str
    exam_id: str
    exam_attempt_id: str
    student_id: str
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    student_roll_number: Optional[str] = None
    exam_title: Optional[str] = None
    final_risk_score: float
    risk_classification: str
    review_priority: str
    total_incidents: int
    confirmed_count: int
    suspicious_count: int
    inconclusive_count: int
    monitoring_interruption_count: int
    executive_summary: Optional[str] = None
    incident_timeline_json: List[Dict[str, Any]] = []
    correlations_json: List[Dict[str, Any]] = []
    score_breakdown_json: Dict[str, Any] = {}
    limitations_notes: Optional[str] = None
    investigation_status: str
    generated_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FacultyDecisionRequest(BaseModel):
    decision: str  # CLEARED, VIOLATION_CONFIRMED, DISQUALIFIED, UNDER_INVESTIGATION, INCONCLUSIVE
    reason: Optional[str] = None
    notes: Optional[str] = None
    incident_reviews: Optional[Dict[str, str]] = None  # incident_id -> "VALIDATED" | "FALSE_POSITIVE"


class IncidentReviewRequest(BaseModel):
    status: str  # VALIDATED, FALSE_POSITIVE, INCONCLUSIVE
    comment: Optional[str] = None
