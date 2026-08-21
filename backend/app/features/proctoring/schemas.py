from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict
from app.features.proctoring.models import ProctoringEventType, ProctoringSeverity


class LogProctoringEventRequest(BaseModel):
    attempt_id: str
    event_type: ProctoringEventType
    severity: ProctoringSeverity = ProctoringSeverity.LOW
    details: Optional[Dict[str, Any]] = None
    snapshot_url: Optional[str] = None


class ProctoringEventResponse(BaseModel):
    id: str
    attempt_id: str
    exam_id: str
    student_id: str
    event_type: ProctoringEventType
    severity: ProctoringSeverity
    details: Optional[Dict[str, Any]] = None
    snapshot_url: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class LiveCandidateResponse(BaseModel):
    attempt_id: str
    student_id: str
    student_name: str
    student_email: str
    student_roll_no: Optional[str] = None
    status: str
    started_at: datetime
    submitted_at: Optional[datetime] = None
    trust_score: int  # 0 - 100
    risk_level: str   # LOW, MEDIUM, HIGH
    tab_switch_count: int
    fullscreen_exit_count: int
    camera_off_count: int
    total_violations: int
    latest_event: Optional[ProctoringEventResponse] = None
    is_live: bool = True
    last_seen: Optional[datetime] = None


class LiveExamProctoringResponse(BaseModel):
    exam_id: str
    exam_title: str
    duration_minutes: int
    enable_proctoring: bool
    total_candidates: int
    active_candidates_count: int
    flagged_candidates_count: int
    candidates: List[LiveCandidateResponse]


class ProctoringOverviewItem(BaseModel):
    exam_id: str
    exam_title: str
    status: str
    enable_proctoring: bool
    total_attempts: int
    active_attempts: int
    flagged_attempts: int
