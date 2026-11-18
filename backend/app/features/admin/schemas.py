from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class UsersTelemetry(BaseModel):
    total: int = 0
    students: int = 0
    faculty: int = 0
    admins: int = 0
    active: int = 0
    inactive: int = 0


class ExamsTelemetry(BaseModel):
    total: int = 0
    draft: int = 0
    published: int = 0
    closed: int = 0


class AttemptsTelemetry(BaseModel):
    total: int = 0
    in_progress: int = 0
    submitted: int = 0
    graded: int = 0


class ViolationsTelemetry(BaseModel):
    total: int = 0
    by_type: Dict[str, int] = Field(default_factory=dict)


class ProctoringTelemetry(BaseModel):
    total_events: int = 0
    pending_review: int = 0
    confirmed: int = 0
    dismissed: int = 0
    false_positives: int = 0


class SystemHealthTelemetry(BaseModel):
    postgres: str = "healthy"
    postgres_latency_ms: float = 0.0
    redis: str = "healthy"
    server_time: str
    app_env: str = "development"


class ConnectionsTelemetry(BaseModel):
    active_candidate_sessions: int = 0


class RecentActivityItem(BaseModel):
    id: str
    type: str  # e.g., 'EXAM_CREATED', 'USER_REGISTERED', 'ATTEMPT_STARTED', 'VIOLATION_DETECTED'
    description: str
    timestamp: str


class AdminTelemetryResponse(BaseModel):
    users: UsersTelemetry
    exams: ExamsTelemetry
    attempts: AttemptsTelemetry
    violations: ViolationsTelemetry
    proctoring: ProctoringTelemetry
    connections: ConnectionsTelemetry
    system_health: SystemHealthTelemetry
    recent_activity: List[RecentActivityItem] = Field(default_factory=list)


class AdminSettingsResponse(BaseModel):
    face_match_threshold: float = 0.35
    multiple_person_grace_sec: float = 3.0
    looking_away_threshold_sec: float = 3.0
    object_detection_enabled: bool = True
    audio_anomaly_detection_enabled: bool = True
    strict_lockdown_enabled: bool = True
    max_rejoins_allowed: int = 3
    system_announcement: Optional[str] = None


class AdminSettingsUpdate(BaseModel):
    face_match_threshold: Optional[float] = Field(None, ge=0.1, le=0.9)
    multiple_person_grace_sec: Optional[float] = Field(None, ge=1.0, le=30.0)
    looking_away_threshold_sec: Optional[float] = Field(None, ge=1.0, le=30.0)
    object_detection_enabled: Optional[bool] = None
    audio_anomaly_detection_enabled: Optional[bool] = None
    strict_lockdown_enabled: Optional[bool] = None
    max_rejoins_allowed: Optional[int] = Field(None, ge=0, le=10)
    system_announcement: Optional[str] = None
