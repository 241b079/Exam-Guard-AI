from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.features.proctoring.models import ProctoringEvent, ProctoringEventType, ProctoringSeverity
from app.features.proctoring.schemas import (
    LogProctoringEventRequest,
    ProctoringEventResponse,
    LiveCandidateResponse,
    LiveExamProctoringResponse,
    ProctoringOverviewItem
)
from app.features.attempts.models import ExamAttempt, AttemptStatus
from app.features.exams.models import Exam
from app.features.students.models import StudentProfile
from app.features.users.models import User



class ProctoringService:

    @staticmethod
    async def log_event(
        db: AsyncSession,
        student_id: str,
        req: LogProctoringEventRequest
    ) -> ProctoringEventResponse:
        # Verify attempt exists and belongs to student
        stmt = select(ExamAttempt).where(
            ExamAttempt.id == req.attempt_id,
            ExamAttempt.student_id == student_id
        )
        result = await db.execute(stmt)
        attempt = result.scalar_one_or_none()

        if not attempt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Exam attempt not found or unauthorized"
            )

        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot log proctoring event for non-active attempt"
            )

        event = ProctoringEvent(
            attempt_id=attempt.id,
            exam_id=attempt.exam_id,
            student_id=student_id,
            event_type=req.event_type,
            severity=req.severity,
            details=req.details or {},
            snapshot_url=req.snapshot_url,
            timestamp=datetime.now(timezone.utc)
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)

        return ProctoringEventResponse.model_validate(event)

    @staticmethod
    async def get_attempt_events(
        db: AsyncSession,
        attempt_id: str
    ) -> List[ProctoringEventResponse]:
        stmt = (
            select(ProctoringEvent)
            .where(ProctoringEvent.attempt_id == attempt_id)
            .order_by(ProctoringEvent.timestamp.asc())
        )
        result = await db.execute(stmt)
        events = result.scalars().all()
        return [ProctoringEventResponse.model_validate(e) for e in events]

    @staticmethod
    async def get_exam_live_feed(
        db: AsyncSession,
        exam_id: str
    ) -> LiveExamProctoringResponse:
        # Fetch exam
        exam_stmt = select(Exam).where(Exam.id == exam_id)
        exam_res = await db.execute(exam_stmt)
        exam = exam_res.scalar_one_or_none()

        if not exam:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Exam not found"
            )

        # Fetch all attempts for this exam
        att_stmt = (
            select(ExamAttempt)
            .where(ExamAttempt.exam_id == exam_id)
            .order_by(desc(ExamAttempt.started_at))
        )
        att_res = await db.execute(att_stmt)
        attempts = att_res.scalars().all()

        candidates: List[LiveCandidateResponse] = []
        active_count = 0
        flagged_count = 0

        for att in attempts:
            user = att.student

            # Fetch student profile for roll number / student_id if available
            roll_no = None
            if user:
                st_stmt = select(StudentProfile).where(StudentProfile.user_id == user.id)
                st_res = await db.execute(st_stmt)
                student_record = st_res.scalar_one_or_none()
                if student_record:
                    roll_no = student_record.student_id


            # Fetch proctoring events for this attempt
            ev_stmt = (
                select(ProctoringEvent)
                .where(ProctoringEvent.attempt_id == att.id)
                .order_by(desc(ProctoringEvent.timestamp))
            )
            ev_res = await db.execute(ev_stmt)
            events = ev_res.scalars().all()

            tab_switches = sum(1 for e in events if e.event_type == ProctoringEventType.TAB_SWITCH)
            fullscreen_exits = sum(1 for e in events if e.event_type == ProctoringEventType.FULLSCREEN_EXIT)
            camera_offs = sum(1 for e in events if e.event_type == ProctoringEventType.CAMERA_OFF)
            total_violations = len(events)

            # Compute Trust Score: Starts at 100
            score = 100
            for e in events:
                if e.severity == ProctoringSeverity.HIGH:
                    score -= 20
                elif e.severity == ProctoringSeverity.MEDIUM:
                    score -= 10
                else:
                    score -= 5
            trust_score = max(0, min(100, score))

            if trust_score >= 80:
                risk_level = "LOW"
            elif trust_score >= 50:
                risk_level = "MEDIUM"
            else:
                risk_level = "HIGH"

            if risk_level in ["MEDIUM", "HIGH"]:
                flagged_count += 1

            is_active = att.status == AttemptStatus.IN_PROGRESS
            if is_active:
                active_count += 1

            latest_event = (
                ProctoringEventResponse.model_validate(events[0]) if events else None
            )

            candidates.append(
                LiveCandidateResponse(
                    attempt_id=att.id,
                    student_id=att.student_id,
                    student_name=user.name if user else "Unknown Student",
                    student_email=user.email if user else "",
                    student_roll_no=roll_no,
                    status=att.status.value,
                    started_at=att.started_at,
                    submitted_at=att.submitted_at,
                    trust_score=trust_score,
                    risk_level=risk_level,
                    tab_switch_count=tab_switches,
                    fullscreen_exit_count=fullscreen_exits,
                    camera_off_count=camera_offs,
                    total_violations=total_violations,
                    latest_event=latest_event,
                    is_live=is_active,
                    last_seen=att.updated_at
                )
            )

        return LiveExamProctoringResponse(
            exam_id=exam.id,
            exam_title=exam.title,
            duration_minutes=exam.duration_minutes,
            enable_proctoring=getattr(exam, "enable_proctoring", False),
            total_candidates=len(candidates),
            active_candidates_count=active_count,
            flagged_candidates_count=flagged_count,
            candidates=candidates
        )

    @staticmethod
    async def get_proctoring_overview(db: AsyncSession) -> List[ProctoringOverviewItem]:
        # Get all exams
        exams_stmt = select(Exam).order_by(desc(Exam.created_at))
        exams_res = await db.execute(exams_stmt)
        exams = exams_res.scalars().all()

        overview: List[ProctoringOverviewItem] = []

        for ex in exams:
            att_stmt = select(ExamAttempt).where(ExamAttempt.exam_id == ex.id)
            att_res = await db.execute(att_stmt)
            attempts = att_res.scalars().all()

            active_cnt = sum(1 for a in attempts if a.status == AttemptStatus.IN_PROGRESS)

            # Check flagged count
            flagged_cnt = 0
            for a in attempts:
                ev_stmt = (
                    select(func.count(ProctoringEvent.id))
                    .where(ProctoringEvent.attempt_id == a.id)
                )
                ev_res = await db.execute(ev_stmt)
                count = ev_res.scalar() or 0
                if count >= 3:
                    flagged_cnt += 1

            overview.append(
                ProctoringOverviewItem(
                    exam_id=ex.id,
                    exam_title=ex.title,
                    status=ex.status.value,
                    enable_proctoring=getattr(ex, "enable_proctoring", False),
                    total_attempts=len(attempts),
                    active_attempts=active_cnt,
                    flagged_attempts=flagged_cnt
                )
            )

        return overview

    @staticmethod
    async def terminate_attempt(
        db: AsyncSession,
        attempt_id: str,
        reason: str = "Terminated by proctor for security violation"
    ) -> bool:
        stmt = select(ExamAttempt).where(ExamAttempt.id == attempt_id)
        result = await db.execute(stmt)
        attempt = result.scalar_one_or_none()

        if not attempt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attempt not found"
            )

        attempt.status = AttemptStatus.SUBMITTED
        attempt.submitted_at = datetime.now(timezone.utc)

        # Log a high severity termination event
        term_event = ProctoringEvent(
            attempt_id=attempt.id,
            exam_id=attempt.exam_id,
            student_id=attempt.student_id,
            event_type=ProctoringEventType.DISCONNECTED,
            severity=ProctoringSeverity.HIGH,
            details={"action": "TERMINATED_BY_PROCTOR", "reason": reason},
            timestamp=datetime.now(timezone.utc)
        )
        db.add(term_event)
        await db.commit()
        return True
