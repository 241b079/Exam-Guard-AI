import uuid
import hashlib
import json
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
    OverallRiskLevel,
    AIClassification,
)
from app.features.proctoring.risk_engine import RiskScoringEngine
from app.features.proctoring.aggregation import ExamIntegrityAggregator
from app.features.proctoring.notification_service import NotificationService


class PostExaminationInvestigationService:
    """
    Automated Post-Examination AI Investigation Dossier & Faculty Review Engine.
    
    Generates structured, objective evidence reports after an exam attempt is submitted
    and enables faculty to review timeline, validate/reject incidents, render final decisions,
    and authorize result publication.
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
        into an authoritative post-exam investigation dossier using ExamIntegrityAggregator.
        """
        now = datetime.now(timezone.utc)

        # 1. Fetch Attempt, Exam, Student
        att_res = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(
                selectinload(ExamAttempt.exam),
                selectinload(ExamAttempt.student)
            )
        )
        attempt = att_res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam attempt not found")

        exam: Exam = attempt.exam
        student: User = attempt.student

        # 2. Run Intelligent Cheating Assessment & Multi-Factor Aggregation
        agg_data = await ExamIntegrityAggregator.aggregate_attempt_assessment(db, attempt)

        final_risk = agg_data["final_risk_score"]
        overall_risk_str = agg_data["overall_risk_level"]
        risk_class = RiskScoringEngine.get_risk_classification(final_risk)

        # 3. Determine Recommended Faculty Review Priority
        if overall_risk_str in (OverallRiskLevel.CRITICAL_RISK.value, OverallRiskLevel.HIGH_RISK.value) or final_risk >= 50.0:
            review_priority = ReviewPriority.URGENT.value if final_risk >= 75.0 else ReviewPriority.HIGH.value
        elif overall_risk_str == OverallRiskLevel.MODERATE_RISK.value or final_risk >= 30.0:
            review_priority = ReviewPriority.MEDIUM.value
        else:
            review_priority = ReviewPriority.LOW.value

        # 4. Formulate Limitations & Uncertainty Notes
        interruption_count = sum(
            1 for item in agg_data["timeline_items"]
            if item.get("category_group") == "TECHNICAL_INTERRUPTION"
        )
        inconclusive_count = agg_data["low_confidence_count"]

        limitations = []
        if interruption_count > 0:
            limitations.append(f"{interruption_count} temporary camera or network monitoring interruption(s) occurred. Technical interruptions were not counted toward cheating risk.")
        if inconclusive_count > 0:
            limitations.append(f"{inconclusive_count} detection(s) marked low-confidence / inconclusive due to lighting or camera occlusion.")
        if not limitations:
            limitations.append("Camera, audio, and browser integrity telemetry remained continuous without unmonitored gaps.")

        # 5. Check for existing investigation record to update or insert
        inv_res = await db.execute(
            select(ExaminationInvestigation).where(ExaminationInvestigation.exam_attempt_id == attempt_id)
        )
        investigation = inv_res.scalar_one_or_none()

        executive_summary = agg_data["ai_recommendation"]

        if investigation:
            investigation.final_risk_score = final_risk
            investigation.risk_classification = risk_class
            investigation.review_priority = review_priority
            investigation.total_incidents = agg_data["independent_incident_count"]
            investigation.confirmed_count = agg_data["high_confidence_count"]
            investigation.suspicious_count = agg_data["suspicious_count"]
            investigation.inconclusive_count = inconclusive_count
            investigation.monitoring_interruption_count = interruption_count
            investigation.overall_risk_level = overall_risk_str
            investigation.ai_assessment_status = "COMPLETED"
            investigation.total_evidence_count = agg_data["total_evidence_count"]
            investigation.independent_incident_count = agg_data["independent_incident_count"]
            investigation.high_confidence_count = agg_data["high_confidence_count"]
            investigation.low_confidence_count = agg_data["low_confidence_count"]
            investigation.resolved_count = agg_data["resolved_count"]
            investigation.evidence_breakdown_json = agg_data["evidence_breakdown_json"]
            investigation.ai_recommendation = executive_summary
            investigation.executive_summary = executive_summary
            investigation.incident_timeline_json = agg_data["timeline_items"]
            investigation.recommended_verdict = agg_data.get("recommended_verdict", "CLEARED")
            investigation.auto_disqualification_recommended = agg_data.get("auto_disqualification_recommended", False)
            investigation.auto_disqualification_reason = agg_data.get("auto_disqualification_reason")
            investigation.limitations_notes = " • ".join(limitations)
            investigation.updated_at = now
            if not investigation.assessment_started_at:
                investigation.assessment_started_at = attempt.submitted_at or now
            investigation.assessment_completed_at = now
        else:
            investigation = ExaminationInvestigation(
                id=str(uuid.uuid4()),
                exam_id=exam.id,
                exam_attempt_id=attempt.id,
                student_id=student.id,
                final_risk_score=final_risk,
                risk_classification=risk_class,
                review_priority=review_priority,
                total_incidents=agg_data["independent_incident_count"],
                confirmed_count=agg_data["high_confidence_count"],
                suspicious_count=agg_data["suspicious_count"],
                inconclusive_count=inconclusive_count,
                monitoring_interruption_count=interruption_count,
                overall_risk_level=overall_risk_str,
                ai_assessment_status="COMPLETED",
                total_evidence_count=agg_data["total_evidence_count"],
                independent_incident_count=agg_data["independent_incident_count"],
                high_confidence_count=agg_data["high_confidence_count"],
                low_confidence_count=agg_data["low_confidence_count"],
                resolved_count=agg_data["resolved_count"],
                evidence_breakdown_json=agg_data["evidence_breakdown_json"],
                ai_recommendation=executive_summary,
                executive_summary=executive_summary,
                incident_timeline_json=agg_data["timeline_items"],
                recommended_verdict=agg_data.get("recommended_verdict", "CLEARED"),
                auto_disqualification_recommended=agg_data.get("auto_disqualification_recommended", False),
                auto_disqualification_reason=agg_data.get("auto_disqualification_reason"),
                correlations_json=[],
                score_breakdown_json={},
                limitations_notes=" • ".join(limitations),
                investigation_status=InvestigationStatus.PENDING_REVIEW.value,
                model_version="v2.1",
                assessment_started_at=attempt.started_at or now,
                assessment_completed_at=now,
                generated_at=now,
                updated_at=now,
            )
            db.add(investigation)

        # 6. Cryptographic SHA-256 Audit Hash Chaining (Verifiable Tamper-Proof Evidence)
        timeline_hashes = [
            f"{item.get('event_id') or item.get('incident_id')}_{item.get('timestamp')}_{item.get('risk_contribution', 0.0)}"
            for item in agg_data["timeline_items"]
        ]
        audit_payload = {
            "attempt_id": attempt.id,
            "exam_id": exam.id,
            "student_id": student.id,
            "final_risk_score": final_risk,
            "overall_risk_level": overall_risk_str,
            "recommended_verdict": investigation.recommended_verdict,
            "auto_disqualification_recommended": investigation.auto_disqualification_recommended,
            "high_confidence_count": agg_data["high_confidence_count"],
            "timeline_hash": hashlib.sha256("".join(sorted(timeline_hashes)).encode()).hexdigest(),
            "timestamp": now.isoformat(),
        }
        computed_audit_hash = hashlib.sha256(json.dumps(audit_payload, sort_keys=True).encode()).hexdigest()
        investigation.audit_hash = computed_audit_hash

        # 7. Autonomous Adjudication Engine (Phase 3 Tri-State Verdict Auto-Execution)
        rec_verdict = investigation.recommended_verdict
        auto_disq = investigation.auto_disqualification_recommended
        disq_reason = investigation.auto_disqualification_reason

        # Do not override existing manual faculty review decision if one was already submitted
        has_existing_faculty_review = False
        rev_res = await db.execute(
            select(FacultyReview).where(FacultyReview.investigation_id == investigation.id)
        )
        if rev_res.scalars().first():
            has_existing_faculty_review = True

        if not has_existing_faculty_review:
            if rec_verdict == "AUTO_CLEARED":
                investigation.autonomous_verdict = "AUTO_CLEARED"
                investigation.investigation_status = InvestigationStatus.CLEARED.value
                attempt.integrity_status = "CLEARED"

                # Respect exam-level auto_publish_results policy
                can_auto_publish = getattr(exam, "auto_publish_results", True)
                if can_auto_publish:
                    investigation.autonomous_action_taken = "Autonomously cleared & published by AI Proctor"
                    attempt.publication_status = "PUBLISHED"
                    if not attempt.published_at:
                        attempt.published_at = now
                    attempt.published_by_id = None

                    await NotificationService.create_notification(
                        db=db,
                        user_id=student.id,
                        notif_type="RESULT_PUBLISHED",
                        title="Exam Results Published (AI Verified)",
                        message=f"Your exam '{exam.title}' has been autonomously cleared and published by Exam-Guard AI. Audit Hash: {computed_audit_hash[:16]}...",
                        exam_id=exam.id,
                        exam_attempt_id=attempt.id,
                    )
                else:
                    investigation.autonomous_action_taken = "Autonomously cleared by AI Proctor. Result publication controlled by faculty policy."

            elif rec_verdict == "AUTO_DISQUALIFIED" or auto_disq:
                investigation.autonomous_verdict = "AUTO_DISQUALIFIED"
                investigation.auto_disqualification_recommended = True
                investigation.auto_disqualification_reason = disq_reason or "Critical examination integrity violations confirmed by Autonomous AI Proctor"
                investigation.autonomous_action_taken = f"Auto-disqualification packaged: {investigation.auto_disqualification_reason}"
                investigation.investigation_status = InvestigationStatus.PENDING_REVIEW.value
                investigation.review_priority = ReviewPriority.URGENT.value
                attempt.integrity_status = "PENDING_REVIEW"

            else:
                investigation.autonomous_verdict = "PENDING_REVIEW"
                investigation.autonomous_action_taken = "Borderline metrics routed to instructor review queue"
                investigation.investigation_status = InvestigationStatus.PENDING_REVIEW.value
                attempt.integrity_status = "PENDING_REVIEW"

        await db.commit()
        await db.refresh(investigation)

        # Dispatch notification to faculty if high risk or critical risk detected
        if overall_risk_str in (OverallRiskLevel.HIGH_RISK.value, OverallRiskLevel.CRITICAL_RISK.value):
            await NotificationService.create_notification(
                db=db,
                user_id=exam.created_by_id,
                notif_type="HIGH_RISK_ALERT",
                title=f"High Risk Exam Submission: {student.name}",
                message=f"Candidate {student.name} submitted {exam.title} with AI Assessment: {overall_risk_str.replace('_', ' ').title()}.",
                exam_id=exam.id,
                exam_attempt_id=attempt.id
            )

        return investigation

    @classmethod
    async def submit_faculty_decision(
        cls,
        db: AsyncSession,
        attempt_id: str,
        faculty_user: User,
        decision: str,
        reason: Optional[str] = None,
        notes: Optional[str] = None,
        incident_reviews: Optional[Dict[str, str]] = None,
        publish_result: bool = False
    ) -> ExaminationInvestigation:
        """
        Applies faculty post-exam decision:
        - CLEARED: Clears candidate, confirms academic integrity.
        - CONFIRMED_VIOLATION / VIOLATION_CONFIRMED: Flags confirmed policy violation with review notes.
        - DISQUALIFIED: Formal disqualification requiring mandatory justification.
        - UNDER_INVESTIGATION / INVESTIGATION_REQUIRED: Escalates for further review.
        - Individual evidence actions: CONFIRM_VIOLATION, FALSE_POSITIVE, DISMISS, REQUEST_INVESTIGATION, ESCALATE.
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
            investigation = await cls.generate_investigation_report(db, attempt_id)

        exam: Exam = investigation.exam
        attempt: ExamAttempt = investigation.attempt

        # 2. Authorization check
        if faculty_user.role == UserRole.FACULTY and exam.created_by_id != faculty_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to review investigations for this exam"
            )

        previous_status = investigation.investigation_status

        # Standardize decision label
        norm_decision = decision.upper()
        if norm_decision in ("CONFIRMED_VIOLATION", "VIOLATION_CONFIRMED"):
            canonical_decision = InvestigationStatus.VIOLATION_CONFIRMED.value
        elif norm_decision in ("CLEARED", "CLEAR"):
            canonical_decision = InvestigationStatus.CLEARED.value
        elif norm_decision in ("DISQUALIFIED", "DISQUALIFY"):
            canonical_decision = InvestigationStatus.DISQUALIFIED.value
        elif norm_decision in ("UNDER_INVESTIGATION", "INVESTIGATION_REQUIRED"):
            canonical_decision = InvestigationStatus.UNDER_INVESTIGATION.value
        elif norm_decision in ("PENDING_REVIEW", "PENDING"):
            canonical_decision = InvestigationStatus.PENDING_REVIEW.value
        else:
            canonical_decision = decision

        # 3. Handle individual incident/evidence validations or false-positive adjustments
        recalculate_needed = False
        related_evidence_ids = []
        if incident_reviews:
            for item_id, rev_status in incident_reviews.items():
                related_evidence_ids.append(item_id)
                # Check if it's a ProctoringIncident
                inc_item = await db.get(ProctoringIncident, item_id)
                if inc_item and inc_item.exam_attempt_id == attempt_id:
                    inc_item.review_status = rev_status
                    if rev_status == "FALSE_POSITIVE":
                        recalculate_needed = True

                # Check if it's a ProctoringEvent
                ev_item = await db.get(ProctoringEvent, item_id)
                if ev_item and ev_item.exam_attempt_id == attempt_id:
                    ev_item.review_status = rev_status
                    if rev_status == "FALSE_POSITIVE":
                        recalculate_needed = True

        if recalculate_needed:
            await RiskScoringEngine.recalculate_attempt_score(
                db=db,
                attempt_id=attempt_id,
                trigger_event_type="FALSE_POSITIVE_REJECTION",
                reason="Faculty marked one or more incidents as false positives"
            )

        # 4. Handle Disqualification Decision
        if canonical_decision == InvestigationStatus.DISQUALIFIED.value:
            if not reason or not reason.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Explicit justification reason is mandatory when disqualifying a student."
                )

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

            if attempt:
                attempt.total_score = 0.0
                attempt.integrity_status = "DISQUALIFIED"
                attempt.publication_status = "DISQUALIFIED"

            investigation.investigation_status = InvestigationStatus.DISQUALIFIED.value

        else:
            investigation.investigation_status = canonical_decision
            if attempt:
                attempt.integrity_status = canonical_decision

        # 5. Handle Result Publication if requested (Never for DISQUALIFIED)
        if publish_result and attempt and canonical_decision != InvestigationStatus.DISQUALIFIED.value:
            attempt.publication_status = "PUBLISHED"
            attempt.published_at = now
            attempt.published_by_id = faculty_user.id

            await NotificationService.create_notification(
                db=db,
                user_id=attempt.student_id,
                notif_type="RESULT_PUBLISHED",
                title=f"Result Published: {exam.title}",
                message=f"Your examination result for {exam.title} has been authorized and published by faculty.",
                exam_id=exam.id,
                exam_attempt_id=attempt.id
            )

        # 6. Record FacultyReview audit trail (Immutable)
        review_audit = FacultyReview(
            id=str(uuid.uuid4()),
            investigation_id=investigation.id,
            exam_attempt_id=attempt_id,
            faculty_id=faculty_user.id,
            decision=canonical_decision,
            reason=reason,
            notes=notes,
            incident_adjustments_json=incident_reviews or {},
            previous_status=previous_status,
            new_status=canonical_decision,
            related_evidence_ids_json=related_evidence_ids,
            created_at=now
        )
        db.add(review_audit)

        # 7. Notify student of integrity review outcome
        if canonical_decision == InvestigationStatus.CLEARED.value:
            msg = "Your examination integrity review has been completed. Your result will be available once the faculty publishes it."
            await NotificationService.create_notification(
                db=db,
                user_id=investigation.student_id,
                notif_type="REVIEW_COMPLETED",
                title=f"Integrity Review Cleared: {exam.title}",
                message=msg,
                exam_id=exam.id,
                exam_attempt_id=attempt.id
            )
        elif canonical_decision in (InvestigationStatus.VIOLATION_CONFIRMED.value, InvestigationStatus.DISQUALIFIED.value):
            msg = "Your examination has been referred for an academic integrity review. Please check the examination status or contact your faculty for further information."
            await NotificationService.create_notification(
                db=db,
                user_id=investigation.student_id,
                notif_type="REVIEW_COMPLETED",
                title=f"Integrity Notice: {exam.title}",
                message=msg,
                exam_id=exam.id,
                exam_attempt_id=attempt.id
            )

        investigation.updated_at = now
        await db.commit()
        await db.refresh(investigation)

        # Re-aggregate to keep evidence timeline and counts consistent with faculty actions
        return await cls.generate_investigation_report(db, attempt_id)
