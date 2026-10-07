from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict
from app.features.proctoring.models import (
    ProctoringEventType,
    EventSeverity,
    EventReviewStatus,
    IdentityDetectionStatus,
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


class ProctoringEventResponse(BaseModel):
    id: str
    exam_id: str
    exam_attempt_id: Optional[str] = None
    student_id: str
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    student_roll_number: Optional[str] = None
    event_type: ProctoringEventType
    severity: EventSeverity
    review_status: EventReviewStatus
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
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProctoringEventReviewPatch(BaseModel):
    review_status: EventReviewStatus
    review_comment: Optional[str] = None


class ProctoringEventsListResponse(BaseModel):
    total: int
    events: List[ProctoringEventResponse]
