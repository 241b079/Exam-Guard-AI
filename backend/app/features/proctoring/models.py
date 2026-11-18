import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, Integer, Boolean, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProctoringEventType(str, enum.Enum):
    NO_FACE = "NO_FACE"
    TEMPORARY_ABSENCE = "TEMPORARY_ABSENCE"
    IDENTITY_MISMATCH = "IDENTITY_MISMATCH"
    MULTIPLE_PERSON = "MULTIPLE_PERSON"
    MULTIPLE_PERSON_IDENTITY_MISMATCH = "MULTIPLE_PERSON_IDENTITY_MISMATCH"
    LOOKING_AWAY = "LOOKING_AWAY"
    UNAUTHORIZED_OBJECT = "UNAUTHORIZED_OBJECT"
    AUDIO_ANOMALY = "AUDIO_ANOMALY"
    RECOVERED = "RECOVERED"
    # Additional evidence-based categories
    BROWSER_TAB_SWITCH = "BROWSER_TAB_SWITCH"
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"
    CAMERA_STOPPED = "CAMERA_STOPPED"
    EXTERNAL_ASSISTANCE = "EXTERNAL_ASSISTANCE"
    MONITORING_INTERRUPTED = "MONITORING_INTERRUPTED"


class EventSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EventReviewStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    DISMISSED = "DISMISSED"
    FALSE_POSITIVE = "FALSE_POSITIVE"
    VALIDATED = "VALIDATED"


class IdentityDetectionStatus(str, enum.Enum):
    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    MULTIPLE = "MULTIPLE"
    NONE = "NONE"
    UNKNOWN = "UNKNOWN"


class AIClassification(str, enum.Enum):
    CONFIRMED = "CONFIRMED"        # Clear detection, supporting evidence, confidence >= 0.70
    SUSPICIOUS = "SUSPICIOUS"      # Potential violation, ambiguous or partial evidence
    INCONCLUSIVE = "INCONCLUSIVE"  # Poor camera, occlusion, or detection uncertainty


class DetectionSource(str, enum.Enum):
    VISION_AI = "VISION_AI"
    BROWSER_LOCKDOWN = "BROWSER_LOCKDOWN"
    AUDIO_AI = "AUDIO_AI"
    NETWORK_MONITOR = "NETWORK_MONITOR"


class RiskLevel(str, enum.Enum):
    LOW = "LOW"           # 0–29
    MEDIUM = "MEDIUM"     # 30–49
    HIGH = "HIGH"         # 50–74
    CRITICAL = "CRITICAL" # 75–100


class InvestigationStatus(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    UNDER_INVESTIGATION = "UNDER_INVESTIGATION"
    CLEARED = "CLEARED"
    VIOLATION_CONFIRMED = "VIOLATION_CONFIRMED"
    DISQUALIFIED = "DISQUALIFIED"
    INCONCLUSIVE = "INCONCLUSIVE"


class ReviewPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True
    )
    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="MEDIUM"
    )
    review_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDING",
        index=True
    )
    review_comment: Mapped[str] = mapped_column(Text, nullable=True)
    reviewed_by_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    duration: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    confidence: Mapped[float] = mapped_column(Float, nullable=True)
    face_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expected_identity: Mapped[str] = mapped_column(String(255), nullable=True)
    detected_identity_status: Mapped[str] = mapped_column(String(50), nullable=True)

    evidence_path: Mapped[str] = mapped_column(String(500), nullable=True)
    incident_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)

    # Evidence-based AI classification fields
    ai_classification: Mapped[str] = mapped_column(String(30), default="CONFIRMED", nullable=True)
    detection_source: Mapped[str] = mapped_column(String(50), default="VISION_AI", nullable=True)
    ai_explanation: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    exam = relationship("Exam", lazy="selectin")
    attempt = relationship("ExamAttempt", lazy="selectin")
    student = relationship("User", foreign_keys=[student_id], lazy="selectin")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id], lazy="selectin")


class ProctoringIncident(Base):
    """
    Authoritative incident grouping for related continuous frames or violation bursts.
    Prevents repeated point penalties for consecutive frames of the same event.
    """
    __tablename__ = "proctoring_incidents"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    incident_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), default="BEHAVIORAL_ANOMALY", nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False)
    ai_classification: Mapped[str] = mapped_column(String(30), default="SUSPICIOUS", nullable=False)

    peak_confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    event_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    primary_evidence_url: Mapped[str] = mapped_column(String(500), nullable=True)
    ai_explanation: Mapped[str] = mapped_column(Text, nullable=True)

    review_status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    review_comment: Mapped[str] = mapped_column(Text, nullable=True)
    risk_contribution: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    exam = relationship("Exam", lazy="selectin")
    attempt = relationship("ExamAttempt", lazy="selectin")
    student = relationship("User", foreign_keys=[student_id], lazy="selectin")


class StudentRiskScore(Base):
    """
    Centralized dynamic cheating risk score for an examination attempt (0 to 100).
    Separated strictly from examination state (high risk never terminates or restricts exam).
    """
    __tablename__ = "student_risk_scores"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    current_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    peak_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), default="LOW", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL

    incident_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confirmed_incidents_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    suspicious_incidents_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    inconclusive_incidents_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    monitoring_status: Mapped[str] = mapped_column(String(30), default="NORMAL", nullable=False)
    last_calculated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    exam = relationship("Exam", lazy="selectin")
    attempt = relationship("ExamAttempt", lazy="selectin")
    student = relationship("User", foreign_keys=[student_id], lazy="selectin")
    history = relationship("RiskScoreHistory", back_populates="risk_score_parent", cascade="all, delete-orphan", lazy="selectin")


class RiskScoreHistory(Base):
    """
    Immutable audit log of all risk score transitions and calculations.
    """
    __tablename__ = "risk_score_history"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    risk_score_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("student_risk_scores.id", ondelete="CASCADE"),
        nullable=True
    )
    score_before: Mapped[float] = mapped_column(Float, nullable=False)
    score_after: Mapped[float] = mapped_column(Float, nullable=False)
    delta: Mapped[float] = mapped_column(Float, nullable=False)
    trigger_event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_incident_id: Mapped[str] = mapped_column(String(36), nullable=True)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    risk_score_parent = relationship("StudentRiskScore", back_populates="history")


class FacultyAlert(Base):
    """
    Real-time alert notifications dispatched to faculty for high/critical incidents or tier escalations.
    """
    __tablename__ = "faculty_alerts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    current_risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_classification: Mapped[str] = mapped_column(String(20), nullable=False)
    evidence_url: Mapped[str] = mapped_column(String(500), nullable=True)
    ai_explanation: Mapped[str] = mapped_column(Text, nullable=True)
    incident_id: Mapped[str] = mapped_column(String(36), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    exam = relationship("Exam", lazy="selectin")
    attempt = relationship("ExamAttempt", lazy="selectin")
    student = relationship("User", foreign_keys=[student_id], lazy="selectin")


class ExaminationInvestigation(Base):
    """
    Post-examination AI investigation dossier.
    Generated upon exam attempt submission or completion.
    """
    __tablename__ = "examination_investigations"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    final_risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    risk_classification: Mapped[str] = mapped_column(String(20), default="LOW", nullable=False)
    review_priority: Mapped[str] = mapped_column(String(20), default="LOW", nullable=False)

    total_incidents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confirmed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    suspicious_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    inconclusive_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    monitoring_interruption_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    executive_summary: Mapped[str] = mapped_column(Text, nullable=True)
    incident_timeline_json: Mapped[list] = mapped_column(JSON, default=list, nullable=True)
    correlations_json: Mapped[list] = mapped_column(JSON, default=list, nullable=True)
    score_breakdown_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)
    limitations_notes: Mapped[str] = mapped_column(Text, nullable=True)

    investigation_status: Mapped[str] = mapped_column(
        String(30),
        default="PENDING_REVIEW",
        nullable=False,
        index=True
    )  # PENDING_REVIEW, UNDER_INVESTIGATION, CLEARED, VIOLATION_CONFIRMED, DISQUALIFIED, INCONCLUSIVE

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    exam = relationship("Exam", lazy="selectin")
    attempt = relationship("ExamAttempt", lazy="selectin")
    student = relationship("User", foreign_keys=[student_id], lazy="selectin")
    reviews = relationship("FacultyReview", back_populates="investigation", cascade="all, delete-orphan", lazy="selectin")


class FacultyReview(Base):
    """
    Formal faculty decision and incident validation audit entry.
    """
    __tablename__ = "faculty_reviews"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    investigation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("examination_investigations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    faculty_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    decision: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    incident_adjustments_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # Relationships
    investigation = relationship("ExaminationInvestigation", back_populates="reviews")
    faculty = relationship("User", foreign_keys=[faculty_id], lazy="selectin")


class DisqualificationRecord(Base):
    """
    Formal disqualification sanction record.
    Generated ONLY upon deliberate faculty decision after reviewing evidence.
    """
    __tablename__ = "disqualification_records"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    exam_attempt_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True
    )
    exam_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    faculty_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_summary: Mapped[str] = mapped_column(Text, nullable=False)
    final_risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    disqualified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    is_appealable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    appeal_status: Mapped[str] = mapped_column(String(30), default="NONE", nullable=False)

    # Relationships
    exam = relationship("Exam", lazy="selectin")
    attempt = relationship("ExamAttempt", lazy="selectin")
    student = relationship("User", foreign_keys=[student_id], lazy="selectin")
    faculty = relationship("User", foreign_keys=[faculty_id], lazy="selectin")
