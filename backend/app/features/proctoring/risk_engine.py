import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple, List
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.features.proctoring.models import (
    ProctoringIncident,
    StudentRiskScore,
    RiskScoreHistory,
    FacultyAlert,
    RiskLevel,
    EventSeverity,
    AIClassification,
)
from app.features.proctoring.signaling import signaling_manager


class RiskScoringEngine:
    """
    Centralized Evidence-Based AI Cheating Detection & Dynamic Risk Scoring Engine.
    
    Calculates and maintains an audited dynamic risk score (0 to 100) per examination attempt.
    Crucial business rule: Risk score never interrupts, pauses, terminates, or restricts student exam.
    """

    # Configurable base event weights per specification
    DEFAULT_WEIGHTS: Dict[str, float] = {
        "NO_FACE": 10.0,
        "TEMPORARY_ABSENCE": 10.0,
        "MULTIPLE_PERSON": 25.0,
        "MULTIPLE_PERSON_IDENTITY_MISMATCH": 45.0,
        "IDENTITY_MISMATCH": 40.0,
        "LOOKING_AWAY": 5.0,
        "PAGE_HIDDEN": 20.0,
        "WINDOW_BLUR": 20.0,
        "FULLSCREEN_EXIT": 15.0,
        "UNAUTHORIZED_OBJECT": 25.0,
        "AUDIO_ANOMALY": 15.0,
        "CAMERA_STOPPED": 20.0,
        "EXTERNAL_ASSISTANCE": 35.0,
        "MONITORING_INTERRUPTED": 0.0,  # Zero points: classified strictly as technical/network interruption
    }

    # Classification thresholds
    THRESHOLDS = {
        "LOW": (0.0, 29.99),
        "MEDIUM": (30.0, 49.99),
        "HIGH": (50.0, 74.99),
        "CRITICAL": (75.0, 100.0),
    }

    @classmethod
    def get_risk_classification(cls, score: float) -> str:
        score = max(0.0, min(100.0, score))
        if score < 30.0:
            return RiskLevel.LOW.value
        elif score < 50.0:
            return RiskLevel.MEDIUM.value
        elif score < 75.0:
            return RiskLevel.HIGH.value
        else:
            return RiskLevel.CRITICAL.value

    @classmethod
    def calculate_incident_contribution(
        cls,
        incident_type: str,
        confidence: float,
        duration_seconds: float = 0.0,
        severity: str = "MEDIUM",
        ai_classification: str = "CONFIRMED"
    ) -> float:
        """
        Calculates raw risk contribution for an incident:
        Contribution = BaseWeight * Confidence * DurationMultiplier * ClassificationMultiplier
        """
        base_weight = cls.DEFAULT_WEIGHTS.get(incident_type, 10.0)
        if base_weight <= 0.0:
            return 0.0

        # Confidence weighting (bounded between 0.3 and 1.0)
        eff_conf = max(0.3, min(1.0, confidence if confidence > 0.0 else 0.8))

        # Duration multiplier: sustained incidents scale gradually up to 2x (e.g. 60s sustained)
        duration_mult = 1.0
        if duration_seconds > 5.0:
            duration_mult = 1.0 + min(1.0, (duration_seconds - 5.0) / 55.0)

        # AI Classification multiplier:
        # Confirmed = 1.0x, Suspicious = 0.7x, Inconclusive = 0.2x
        class_mult = 1.0
        if ai_classification == AIClassification.SUSPICIOUS.value:
            class_mult = 0.7
        elif ai_classification == AIClassification.INCONCLUSIVE.value:
            class_mult = 0.2

        # Severity boost
        sev_mult = 1.0
        if severity == EventSeverity.CRITICAL.value:
            sev_mult = 1.25
        elif severity == EventSeverity.HIGH.value:
            sev_mult = 1.1

        contribution = base_weight * eff_conf * duration_mult * class_mult * sev_mult
        return round(contribution, 2)

    @classmethod
    async def get_or_create_risk_score(
        cls,
        db: AsyncSession,
        exam_id: str,
        attempt_id: str,
        student_id: str
    ) -> StudentRiskScore:
        res = await db.execute(
            select(StudentRiskScore).where(StudentRiskScore.exam_attempt_id == attempt_id)
        )
        risk_score = res.scalar_one_or_none()
        if not risk_score:
            now = datetime.now(timezone.utc)
            risk_score = StudentRiskScore(
                id=str(uuid.uuid4()),
                exam_id=exam_id,
                exam_attempt_id=attempt_id,
                student_id=student_id,
                current_score=0.0,
                peak_score=0.0,
                risk_level=RiskLevel.LOW.value,
                incident_count=0,
                confirmed_incidents_count=0,
                suspicious_incidents_count=0,
                inconclusive_incidents_count=0,
                monitoring_status="NORMAL",
                last_calculated_at=now,
                created_at=now,
                updated_at=now,
            )
            db.add(risk_score)
            await db.flush()
        return risk_score

    @classmethod
    async def record_incident_and_update_risk(
        cls,
        db: AsyncSession,
        exam_id: str,
        attempt_id: str,
        student_id: str,
        incident_type: str,
        category: str,
        severity: str,
        confidence: float,
        evidence_url: Optional[str] = None,
        explanation: Optional[str] = None,
        duration_seconds: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
        existing_incident_id: Optional[str] = None,
        ai_classification: Optional[str] = None
    ) -> Tuple[ProctoringIncident, StudentRiskScore, bool]:
        """
        Creates or updates a ProctoringIncident and recalculates the dynamic risk score.
        Returns: (incident, risk_score, tier_changed)
        """
        now = datetime.now(timezone.utc)
        meta = metadata or {}

        # 1. Determine AI observation classification
        if not ai_classification:
            if incident_type == "MONITORING_INTERRUPTED":
                ai_classification = AIClassification.INCONCLUSIVE.value
            elif confidence >= 0.70 and evidence_url:
                ai_classification = AIClassification.CONFIRMED.value
            elif confidence >= 0.40:
                ai_classification = AIClassification.SUSPICIOUS.value
            else:
                ai_classification = AIClassification.INCONCLUSIVE.value

        # 2. Check for existing active incident (Frame deduplication / grouping)
        incident: Optional[ProctoringIncident] = None
        if existing_incident_id:
            inc_res = await db.execute(
                select(ProctoringIncident).where(ProctoringIncident.id == existing_incident_id)
            )
            incident = inc_res.scalar_one_or_none()

        if incident:
            # Update existing incident duration & peak confidence (prevents frame-by-frame penalty accumulation)
            incident.ended_at = now
            if duration_seconds > incident.duration_seconds:
                incident.duration_seconds = duration_seconds
            else:
                incident.duration_seconds = max(0.0, (now - incident.started_at).total_seconds())
            if confidence > incident.peak_confidence:
                incident.peak_confidence = confidence
            if evidence_url and not incident.primary_evidence_url:
                incident.primary_evidence_url = evidence_url
            incident.event_count += 1
            incident.updated_at = now
            # Recalculate contribution with new duration/confidence
            incident.risk_contribution = cls.calculate_incident_contribution(
                incident_type=incident.incident_type,
                confidence=incident.peak_confidence,
                duration_seconds=incident.duration_seconds,
                severity=incident.severity,
                ai_classification=incident.ai_classification
            )
        else:
            # Create new incident
            contribution = cls.calculate_incident_contribution(
                incident_type=incident_type,
                confidence=confidence,
                duration_seconds=duration_seconds,
                severity=severity,
                ai_classification=ai_classification
            )
            incident = ProctoringIncident(
                id=existing_incident_id or str(uuid.uuid4()),
                exam_id=exam_id,
                exam_attempt_id=attempt_id,
                student_id=student_id,
                incident_type=incident_type,
                category=category,
                severity=severity,
                ai_classification=ai_classification,
                peak_confidence=confidence,
                started_at=now - timedelta(seconds=duration_seconds) if duration_seconds > 0 else now,
                ended_at=now if duration_seconds > 0 else None,
                duration_seconds=duration_seconds,
                event_count=1,
                status="ACTIVE",
                primary_evidence_url=evidence_url,
                ai_explanation=explanation,
                review_status="PENDING",
                risk_contribution=contribution,
                metadata_json=meta,
                created_at=now,
                updated_at=now
            )
            db.add(incident)

        await db.flush()

        # 3. Recalculate total attempt risk score across all non-false-positive incidents
        risk_score, tier_changed = await cls.recalculate_attempt_score(
            db=db,
            attempt_id=attempt_id,
            trigger_event_type=incident_type,
            trigger_incident_id=incident.id,
            reason=f"Incident {incident_type} ({ai_classification})"
        )

        return incident, risk_score, tier_changed

    @classmethod
    async def recalculate_attempt_score(
        cls,
        db: AsyncSession,
        attempt_id: str,
        trigger_event_type: str = "MANUAL_RECALCULATION",
        trigger_incident_id: Optional[str] = None,
        reason: str = "Score Recalculation"
    ) -> Tuple[StudentRiskScore, bool]:
        """
        Recalculates the student risk score by summing valid incident contributions
        with decay and correlation suppression applied.
        """
        now = datetime.now(timezone.utc)

        # Fetch all incidents for this attempt
        inc_res = await db.execute(
            select(ProctoringIncident)
            .where(ProctoringIncident.exam_attempt_id == attempt_id)
            .order_by(ProctoringIncident.started_at.asc())
        )
        incidents = inc_res.scalars().all()

        if not incidents:
            # No incidents -> 0 score
            att_risk = await cls._fetch_or_create_default(db, attempt_id)
            return att_risk, False

        exam_id = incidents[0].exam_id
        student_id = incidents[0].student_id

        risk_score = await cls.get_or_create_risk_score(db, exam_id, attempt_id, student_id)
        old_score = risk_score.current_score
        old_level = risk_score.risk_level

        # Filter out incidents rejected as FALSE_POSITIVE by faculty
        valid_incidents = [inc for inc in incidents if inc.review_status != "FALSE_POSITIVE"]

        confirmed_count = sum(1 for inc in valid_incidents if inc.ai_classification == AIClassification.CONFIRMED.value)
        suspicious_count = sum(1 for inc in valid_incidents if inc.ai_classification == AIClassification.SUSPICIOUS.value)
        inconclusive_count = sum(1 for inc in valid_incidents if inc.ai_classification == AIClassification.INCONCLUSIVE.value)

        # Correlation suppression: e.g. PAGE_HIDDEN + WINDOW_BLUR within 2.0s count only once
        total_calculated = 0.0
        processed_tab_events: List[datetime] = []

        for inc in valid_incidents:
            # Check for correlated browser tab events
            if inc.incident_type in ("PAGE_HIDDEN", "WINDOW_BLUR", "BROWSER_TAB_SWITCH"):
                # If another tab event occurred within 3s, suppress duplicate
                is_duplicate_tab = any(
                    abs((inc.started_at - prev_t).total_seconds()) < 3.0
                    for prev_t in processed_tab_events
                )
                if is_duplicate_tab:
                    continue
                processed_tab_events.append(inc.started_at)

            # Decay factor: low-severity incidents older than 15 minutes decay by 20%
            age_minutes = max(0.0, (now - inc.started_at).total_seconds() / 60.0)
            decay = 1.0
            if age_minutes > 15.0 and inc.severity in (EventSeverity.LOW.value, EventSeverity.MEDIUM.value):
                decay = 0.80

            total_calculated += (inc.risk_contribution * decay)

        new_score = round(max(0.0, min(100.0, total_calculated)), 1)
        new_level = cls.get_risk_classification(new_score)
        tier_changed = (new_level != old_level)

        # Update Risk Score record
        risk_score.current_score = new_score
        if new_score > risk_score.peak_score:
            risk_score.peak_score = new_score
        risk_score.risk_level = new_level
        risk_score.incident_count = len(valid_incidents)
        risk_score.confirmed_incidents_count = confirmed_count
        risk_score.suspicious_incidents_count = suspicious_count
        risk_score.inconclusive_incidents_count = inconclusive_count
        risk_score.monitoring_status = (
            "CRITICAL_RISK" if new_level == RiskLevel.CRITICAL.value
            else "HIGH_RISK" if new_level == RiskLevel.HIGH.value
            else "SUSPICIOUS" if new_level == RiskLevel.MEDIUM.value
            else "NORMAL"
        )
        risk_score.last_calculated_at = now
        risk_score.updated_at = now

        # Append to audit history if score changed
        delta = round(new_score - old_score, 1)
        if abs(delta) >= 0.1 or tier_changed:
            history_entry = RiskScoreHistory(
                id=str(uuid.uuid4()),
                exam_attempt_id=attempt_id,
                risk_score_id=risk_score.id,
                score_before=old_score,
                score_after=new_score,
                delta=delta,
                trigger_event_type=trigger_event_type,
                trigger_incident_id=trigger_incident_id,
                risk_level=new_level,
                reason=reason,
                timestamp=now
            )
            db.add(history_entry)

        # If tier changed or significant alert threshold reached, create faculty alert
        if (tier_changed and new_level in (RiskLevel.MEDIUM.value, RiskLevel.HIGH.value, RiskLevel.CRITICAL.value)) or (new_score >= 75.0 and old_score < 75.0):
            alert_sev = (
                EventSeverity.CRITICAL.value if new_level == RiskLevel.CRITICAL.value
                else EventSeverity.HIGH.value if new_level == RiskLevel.HIGH.value
                else EventSeverity.MEDIUM.value
            )
            alert = FacultyAlert(
                id=str(uuid.uuid4()),
                exam_id=exam_id,
                exam_attempt_id=attempt_id,
                student_id=student_id,
                severity=alert_sev,
                title=f"Cheating Risk Escalation: {new_level} ({new_score}/100)",
                description=f"Candidate risk score reached {new_score}/100 ({new_level}). Triggered by {trigger_event_type}.",
                current_risk_score=new_score,
                risk_classification=new_level,
                incident_id=trigger_incident_id,
                created_at=now
            )
            db.add(alert)

        # Check if this incident was a browser lockdown violation (which sends its own canonical broadcast_violation)
        is_lockdown_violation = trigger_event_type in (
            "PAGE_HIDDEN",
            "WINDOW_BLUR",
            "FULLSCREEN_EXIT",
            "CONTEXT_MENU",
            "DEVTOOLS_OPENED",
            "SHORTCUT",
            "BROWSER_TAB_SWITCH",
            "TAB_SWITCH",
        )

        if not is_lockdown_violation:
            # Broadcast real-time alert to faculty over WebSocket
            try:
                await signaling_manager.broadcast_student_state(exam_id, student_id, {
                    "type": "faculty_alert",
                    "student_id": student_id,
                    "attempt_id": attempt_id,
                    "risk_score": new_score,
                    "risk_level": new_level,
                    "severity": alert_sev,
                    "trigger_event": trigger_event_type,
                    "title": alert.title,
                    "description": alert.description,
                    "timestamp": now.isoformat(),
                })
            except Exception as b_err:
                logger.debug(f"Broadcast faculty alert error: {b_err}")

            # Broadcast risk update to faculty monitor card
            try:
                await signaling_manager.broadcast_student_state(exam_id, student_id, {
                    "type": "risk_update",
                    "student_id": student_id,
                    "attempt_id": attempt_id,
                    "risk_score": new_score,
                    "risk_level": new_level,
                    "confirmed_count": confirmed_count,
                    "suspicious_count": suspicious_count,
                    "timestamp": now.isoformat(),
                })
            except Exception:
                pass

        await db.flush()
        return risk_score, tier_changed

    @classmethod
    async def _fetch_or_create_default(cls, db: AsyncSession, attempt_id: str) -> StudentRiskScore:
        res = await db.execute(
            select(StudentRiskScore).where(StudentRiskScore.exam_attempt_id == attempt_id)
        )
        item = res.scalar_one_or_none()
        if item:
            return item

        from app.features.attempts.models import ExamAttempt
        attempt = await db.get(ExamAttempt, attempt_id)
        now = datetime.now(timezone.utc)
        if attempt:
            default_score = StudentRiskScore(
                id=str(uuid.uuid4()),
                exam_id=attempt.exam_id,
                exam_attempt_id=attempt.id,
                student_id=attempt.student_id,
                current_score=0.0,
                peak_score=0.0,
                risk_level=RiskLevel.LOW.value,
                incident_count=0,
                confirmed_incidents_count=0,
                suspicious_incidents_count=0,
                inconclusive_incidents_count=0,
                monitoring_status="NORMAL",
                last_calculated_at=now,
                created_at=now,
                updated_at=now
            )
            db.add(default_score)
            await db.flush()
            return default_score
        
        # If attempt is not persisted yet, return a transient default without saving
        return StudentRiskScore(
            id=str(uuid.uuid4()),
            exam_id="00000000-0000-0000-0000-000000000000",
            exam_attempt_id=attempt_id,
            student_id="00000000-0000-0000-0000-000000000000",
            current_score=0.0,
            peak_score=0.0,
            risk_level=RiskLevel.LOW.value,
            incident_count=0,
            confirmed_incidents_count=0,
            suspicious_incidents_count=0,
            inconclusive_incidents_count=0,
            monitoring_status="NORMAL",
            last_calculated_at=now,
            created_at=now,
            updated_at=now
        )
