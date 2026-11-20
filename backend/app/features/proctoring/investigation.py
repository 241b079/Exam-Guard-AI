import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.core.logging import logger
from app.features.users.models import User, UserRole
from app.features.exams.models import Exam
from app.features.attempts.models import ExamAttempt, AttemptStatus
from app.features.proctoring.models import (
    ProctoringIncident,
    ProctoringEvent,
    StudentRiskScore,
    RiskScoreHistory,
    ExaminationInvestigation,
    FacultyReview,
    DisqualificationRecord,
    InvestigationStatus,
    ReviewPriority,
    RiskLevel,
    AIClassification,
)
from app.features.proctoring.risk_engine import RiskScoringEngine


class PostExaminationInvestigationService:
    """
    Automated Post-Examination AI Investigation Dossier & Faculty Review Engine.
    
    Generates structured, objective evidence reports after an exam attempt is submitted
    and enables faculty to review timeline, validate/reject incidents, and render final decisions.
    """

    @classmethod
    async def generate_investigation_report_background(cls, attempt_id: str) -> None:
        """
        Background task runner that acquires an independent database session to synthesize
        the post-examination investigation report without delaying the student submission endpoint.
        """
        from app.core.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                await cls.generate_investigation_report(session, attempt_id)
        except Exception as inv_err:
            logger.warning(f"Background investigation generation error for attempt {attempt_id}: {inv_err}")

    @classmethod
    async def generate_investigation_report(
        cls,
        db: AsyncSession,
        attempt_id: str
    ) -> ExaminationInvestigation:
        """
        Synthesizes all proctoring evidence, incident groupings, and score history
        into an authoritative post-exam investigation dossier.
        """
        now = datetime.now(timezone.utc)

        # 1. Fetch Attempt, Exam, Student
        att_res = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(
                selectinload(ExamAttempt.exam),
                selectinload(ExamAttempt.student).selectinload(User.student_profile)
            )
        )
        attempt = att_res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam attempt not found")

        exam: Exam = attempt.exam
        student: User = attempt.student

        # 2. Fetch Risk Score
        risk_res = await db.execute(
            select(StudentRiskScore).where(StudentRiskScore.exam_attempt_id == attempt_id)
        )
        risk_score_record = risk_res.scalar_one_or_none()
        final_risk = risk_score_record.current_score if risk_score_record else 0.0
        risk_class = (
            risk_score_record.risk_level
            if risk_score_record
            else RiskScoringEngine.get_risk_classification(final_risk)
        )

        # 3. Fetch all Incidents
        inc_res = await db.execute(
            select(ProctoringIncident)
            .where(ProctoringIncident.exam_attempt_id == attempt_id)
            .order_by(ProctoringIncident.started_at.asc())
        )
        incidents = inc_res.scalars().all()

        total_incidents = len(incidents)
        confirmed_count = sum(1 for i in incidents if i.ai_classification == AIClassification.CONFIRMED.value)
        suspicious_count = sum(1 for i in incidents if i.ai_classification == AIClassification.SUSPICIOUS.value)
        inconclusive_count = sum(1 for i in incidents if i.ai_classification == AIClassification.INCONCLUSIVE.value)
        interruption_count = sum(1 for i in incidents if i.incident_type == "MONITORING_INTERRUPTED")

        # 4. Construct Chronological Incident Timeline
        timeline = []
        exam_start = attempt.started_at
        for inc in incidents:
            rel_seconds = max(0, int((inc.started_at - exam_start).total_seconds())) if exam_start else 0
            rel_min = rel_seconds // 60
            rel_sec = rel_seconds % 60
            offset_str = f"+{rel_min:02d}m {rel_sec:02d}s"

            timeline.append({
                "incident_id": inc.id,
                "incident_type": inc.incident_type,
                "category": inc.category,
                "severity": inc.severity,
                "ai_classification": inc.ai_classification,
                "offset_time": offset_str,
                "started_at": inc.started_at.isoformat(),
                "ended_at": inc.ended_at.isoformat() if inc.ended_at else None,
                "duration_seconds": round(inc.duration_seconds, 1),
                "peak_confidence": round(inc.peak_confidence, 2),
                "primary_evidence_url": inc.primary_evidence_url,
                "evidence_url": inc.primary_evidence_url,
                "ai_explanation": inc.ai_explanation or f"Incident of type {inc.incident_type} observed.",
                "risk_contribution": round(inc.risk_contribution, 1),
                "review_status": inc.review_status,
                "review_comment": inc.review_comment,
            })

        # 5. Cross-Incident Correlation Analysis
        correlations = cls._analyze_incident_correlations(incidents)

        # 6. Score Breakdown by category
        breakdown: Dict[str, float] = {}
        for inc in incidents:
            if inc.review_status != "FALSE_POSITIVE":
                breakdown[inc.incident_type] = round(
                    breakdown.get(inc.incident_type, 0.0) + inc.risk_contribution, 1
                )

        # 7. Formulate Limitations & Uncertainty Notes
        limitations = []
        if interruption_count > 0:
            limitations.append(f"{interruption_count} temporary camera or network monitoring interruption(s) occurred. Technical interruptions were not counted toward cheating risk.")
        if inconclusive_count > 0:
            limitations.append(f"{inconclusive_count} detection(s) marked inconclusive due to lighting or camera occlusion.")
        if not limitations:
            limitations.append("Camera, audio, and browser integrity telemetry remained continuous without unmonitored gaps.")

        # 8. Determine Recommended Faculty Review Priority
        if final_risk >= 75.0 or any(i.incident_type == "MULTIPLE_PERSON_IDENTITY_MISMATCH" for i in incidents):
            review_priority = ReviewPriority.URGENT.value
        elif final_risk >= 50.0 or any(i.incident_type == "IDENTITY_MISMATCH" for i in incidents):
            review_priority = ReviewPriority.HIGH.value
        elif final_risk >= 30.0 or total_incidents >= 3:
            review_priority = ReviewPriority.MEDIUM.value
        else:
            review_priority = ReviewPriority.LOW.value

        # 9. AI Executive Summary (Objective & Non-Accusatory)
        summary = (
            f"Examination session for {student.name} ({student.email}) lasted {exam.duration_minutes} minutes. "
            f"AI telemetry observed {total_incidents} suspicious event(s) resulting in a final Cheating Risk Score of "
            f"{final_risk}/100 ({risk_class}). Breakdown: {confirmed_count} confirmed, {suspicious_count} suspicious, "
            f"{inconclusive_count} inconclusive. Recommended faculty review priority: {review_priority}. "
            f"Final determination is reserved exclusively for the instructor."
        )

        # 10. Check for existing investigation record to update or insert
        inv_res = await db.execute(
            select(ExaminationInvestigation).where(ExaminationInvestigation.exam_attempt_id == attempt_id)
        )
        investigation = inv_res.scalar_one_or_none()

        if investigation:
            investigation.final_risk_score = final_risk
            investigation.risk_classification = risk_class
            investigation.review_priority = review_priority
            investigation.total_incidents = total_incidents
            investigation.confirmed_count = confirmed_count
            investigation.suspicious_count = suspicious_count
            investigation.inconclusive_count = inconclusive_count
            investigation.monitoring_interruption_count = interruption_count
            investigation.executive_summary = summary
            investigation.incident_timeline_json = timeline
            investigation.correlations_json = correlations
            investigation.score_breakdown_json = breakdown
            investigation.limitations_notes = " • ".join(limitations)
            investigation.updated_at = now
        else:
            investigation = ExaminationInvestigation(
                id=str(uuid.uuid4()),
                exam_id=exam.id,
                exam_attempt_id=attempt.id,
                student_id=student.id,
                final_risk_score=final_risk,
                risk_classification=risk_class,
                review_priority=review_priority,
                total_incidents=total_incidents,
                confirmed_count=confirmed_count,
                suspicious_count=suspicious_count,
                inconclusive_count=inconclusive_count,
                monitoring_interruption_count=interruption_count,
                executive_summary=summary,
                incident_timeline_json=timeline,
                correlations_json=correlations,
                score_breakdown_json=breakdown,
                limitations_notes=" • ".join(limitations),
                investigation_status=InvestigationStatus.PENDING_REVIEW.value,
                generated_at=now,
                updated_at=now,
            )
            db.add(investigation)

        await db.commit()
        await db.refresh(investigation)
        return investigation

    @classmethod
    def _analyze_incident_correlations(cls, incidents: List[ProctoringIncident]) -> List[Dict[str, Any]]:
        """
        Identifies co-occurring patterns across different telemetry streams
        (e.g., looking away + tab switch, or multiple people + voice activity).
        """
        correlations = []
        n = len(incidents)
        for i in range(n):
            for j in range(i + 1, n):
                inc_a = incidents[i]
                inc_b = incidents[j]
                time_diff = abs((inc_a.started_at - inc_b.started_at).total_seconds())

                if time_diff <= 15.0 and inc_a.incident_type != inc_b.incident_type:
                    # Pattern 1: Tab switch + Looking away (potential secondary monitor / notes lookup)
                    if {inc_a.incident_type, inc_b.incident_type} & {"PAGE_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT"} and \
                       {inc_a.incident_type, inc_b.incident_type} & {"LOOKING_AWAY"}:
                        correlations.append({
                            "pattern": "DUAL_MONITOR_OR_REFERENCE_LOOKUP",
                            "description": "Candidate exited active exam window simultaneously with looking away from screen.",
                            "incidents": [inc_a.id, inc_b.id],
                            "time_window_seconds": round(time_diff, 1),
                            "confidence_weight": 0.85
                        })
                    # Pattern 2: Multi-person + Audio anomaly
                    elif {inc_a.incident_type, inc_b.incident_type} & {"MULTIPLE_PERSON", "MULTIPLE_PERSON_IDENTITY_MISMATCH"} and \
                         {inc_a.incident_type, inc_b.incident_type} & {"AUDIO_ANOMALY"}:
                        correlations.append({
                            "pattern": "VERBAL_COLLABORATION",
                            "description": "Secondary person presence coincided with acoustic anomaly in room.",
                            "incidents": [inc_a.id, inc_b.id],
                            "time_window_seconds": round(time_diff, 1),
                            "confidence_weight": 0.90
                        })

        return correlations

    @classmethod
    async def submit_faculty_decision(
        cls,
        db: AsyncSession,
        attempt_id: str,
        faculty_user: User,
        decision: str,
        reason: Optional[str] = None,
        notes: Optional[str] = None,
        incident_reviews: Optional[Dict[str, str]] = None
    ) -> ExaminationInvestigation:
        """
        Applies faculty post-exam decision:
        - CLEARED: Clears student, confirms standard evaluation.
        - VIOLATION_CONFIRMED: Flags confirmed policy violation with review notes.
        - DISQUALIFIED: Formal disqualification requiring mandatory justification.
        - FALSE_POSITIVE adjustments: Updates incident review status and recalculates risk score.
        """
        now = datetime.now(timezone.utc)

        # 1. Fetch Investigation
        inv_res = await db.execute(
            select(ExaminationInvestigation)
            .where(ExaminationInvestigation.exam_attempt_id == attempt_id)
            .options(
                selectinload(ExaminationInvestigation.exam),
                selectinload(ExaminationInvestigation.attempt)
            )
        )
        investigation = inv_res.scalar_one_or_none()
        if not investigation:
            # Generate if not exists yet
            investigation = await cls.generate_investigation_report(db, attempt_id)

        # 2. Authorization check
        exam: Exam = investigation.exam
        if faculty_user.role == UserRole.FACULTY and exam.created_by_id != faculty_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to review investigations for this exam"
            )

        # 3. Handle individual incident validations / false-positive rejections
        recalculate_needed = False
        if incident_reviews:
            for inc_id, inc_status in incident_reviews.items():
                inc_item = await db.get(ProctoringIncident, inc_id)
                if inc_item and inc_item.exam_attempt_id == attempt_id:
                    inc_item.review_status = inc_status
                    if inc_status == "FALSE_POSITIVE":
                        recalculate_needed = True

        if recalculate_needed:
            await RiskScoringEngine.recalculate_attempt_score(
                db=db,
                attempt_id=attempt_id,
                trigger_event_type="FALSE_POSITIVE_REJECTION",
                reason="Faculty marked one or more incidents as false positives"
            )

        # 4. Handle Disqualification Decision
        if decision == InvestigationStatus.DISQUALIFIED.value:
            if not reason or not reason.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Explicit justification reason is mandatory when disqualifying a student."
                )

            # Check for existing disqualification record
            disq_res = await db.execute(
                select(DisqualificationRecord).where(DisqualificationRecord.exam_attempt_id == attempt_id)
            )
            disq_rec = disq_res.scalar_one_or_none()
            if not disq_rec:
                disq_rec = DisqualificationRecord(
                    id=str(uuid.uuid4()),
                    exam_attempt_id=attempt_id,
                    exam_id=exam.id,
                    student_id=investigation.student_id,
                    faculty_id=faculty_user.id,
                    reason=reason.strip(),
                    evidence_summary=notes or investigation.executive_summary or "Faculty review confirmed policy violation.",
                    final_risk_score=investigation.final_risk_score,
                    disqualified_at=now,
                    is_appealable=True,
                    appeal_status="NONE"
                )
                db.add(disq_rec)

            # Update Attempt: mark total_score zeroed and disqualified
            attempt: ExamAttempt = investigation.attempt
            if attempt:
                attempt.total_score = 0.0

            investigation.investigation_status = InvestigationStatus.DISQUALIFIED.value

        elif decision in (InvestigationStatus.CLEARED.value, InvestigationStatus.VIOLATION_CONFIRMED.value, InvestigationStatus.UNDER_INVESTIGATION.value, InvestigationStatus.INCONCLUSIVE.value):
            investigation.investigation_status = decision

        # 5. Record FacultyReview audit trail
        review_audit = FacultyReview(
            id=str(uuid.uuid4()),
            investigation_id=investigation.id,
            exam_attempt_id=attempt_id,
            faculty_id=faculty_user.id,
            decision=decision,
            reason=reason,
            notes=notes,
            incident_adjustments_json=incident_reviews or {},
            created_at=now
        )
        db.add(review_audit)

        investigation.updated_at = now
        await db.commit()
        await db.refresh(investigation)

        # Regenerate report with updated scores/timeline
        return await cls.generate_investigation_report(db, attempt_id)
