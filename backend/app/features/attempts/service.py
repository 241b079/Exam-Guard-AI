from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.attempts.models import (
    ExamAttempt,
    Answer,
    AttemptStatus,
    ExamViolation,
    ViolationType,
    ExamMediaSession,
    MediaSessionStatus,
)
from app.features.attempts.schemas import (
    SaveAnswerRequest,
    AnswerResponse,
    AttemptResponse,
    SubmitAttemptResponse,
    CreateViolationRequest,
    ViolationResponse,
    AttemptMonitoringResponse,
    AttemptMonitoringStudentInfo,
    MediaSessionResponse,
    UpdateMediaStatusRequest,
    StartOrResumeAttemptRequest,
    StudentActiveExamSummary,
    StudentExamStatusResponse,
    GradebookStudentInfo,
    GradebookEntry,
    ExamGradebookResponse,
    StudentCompletedResultItem,
    AttemptReviewQuestionItem,
    AttemptReviewResponse,
    ManualGradeRequest,
    ManualGradeResponse,
)

from app.features.users.models import User, UserRole
from app.features.exams.models import Exam, NegativeMarkingType, AssignmentType, AvailabilityType, AttemptPolicyType
from app.features.exams.service import ExamService
from app.features.questions.models import Question, QuestionType


class AttemptService:
    @staticmethod
    def _to_response(attempt: ExamAttempt, remaining_seconds: int = 0, max_rejoins: int = 2) -> AttemptResponse:
        answers = []
        if hasattr(attempt, "answers") and attempt.answers:
            answers = [AnswerResponse.model_validate(a) for a in attempt.answers]
        
        violations_count = 0
        if hasattr(attempt, "violations") and attempt.violations:
            violations_count = len(attempt.violations)

        return AttemptResponse(
            id=attempt.id,
            exam_id=attempt.exam_id,
            student_id=attempt.student_id,
            attempt_number=getattr(attempt, "attempt_number", 1) or 1,
            started_at=attempt.started_at,
            deadline=attempt.deadline,
            submitted_at=attempt.submitted_at,
            status=attempt.status,
            total_score=attempt.total_score,
            max_possible_score=attempt.max_possible_score,
            identity_verified=bool(attempt.identity_verified),
            identity_verified_at=attempt.identity_verified_at,
            identity_verification_score=attempt.identity_verification_score,
            answers=answers,
            time_remaining_seconds=remaining_seconds,
            violation_count=violations_count,
            rejoin_count=getattr(attempt, "rejoin_count", 0) or 0,
            max_rejoins=max_rejoins,
            session_token=getattr(attempt, "session_token", None)
        )

    @staticmethod
    async def get_student_active_attempt(db: AsyncSession, student_id: str) -> Optional[StudentActiveExamSummary]:
        """Finds any current IN_PROGRESS attempt for the student, checking expiration."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(ExamAttempt)
            .where(
                ExamAttempt.student_id == student_id,
                ExamAttempt.status == AttemptStatus.IN_PROGRESS
            )
            .options(selectinload(ExamAttempt.exam))
            .order_by(ExamAttempt.started_at.desc())
        )
        active_attempts = result.scalars().all()
        for att in active_attempts:
            exam = att.exam
            if not exam:
                continue
            if not att.deadline:
                att.deadline = att.started_at + timedelta(minutes=exam.duration_minutes)
                if exam.availability_type == AvailabilityType.SCHEDULED and exam.end_time:
                    att.deadline = min(att.deadline, exam.end_time)

            remaining_seconds = max(0, int((att.deadline - now).total_seconds()))
            if remaining_seconds <= 0:
                if exam.auto_submit:
                    await AttemptService.submit_attempt(db, att.id, student_id)
                else:
                    att.status = AttemptStatus.EXPIRED
                    await db.commit()
                continue

            return StudentActiveExamSummary(
                exam_id=exam.id,
                exam_title=exam.title,
                attempt_id=att.id,
                attempt_number=att.attempt_number or 1,
                status=att.status,
                time_remaining_seconds=remaining_seconds,
                deadline=att.deadline,
                rejoin_count=att.rejoin_count or 0,
                max_rejoins=exam.max_rejoins,
                identity_verified=att.identity_verified or False
            )
        return None

    @staticmethod
    async def get_student_exam_status(db: AsyncSession, exam_id: str, student_id: str) -> StudentExamStatusResponse:
        """Determines attempt state, active timer, and re-exam availability for student exam cards."""
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.exam_id == exam_id, ExamAttempt.student_id == student_id)
            .order_by(ExamAttempt.attempt_number.desc(), ExamAttempt.started_at.desc())
        )
        attempts = result.scalars().all()

        active_att = next((a for a in attempts if a.status == AttemptStatus.IN_PROGRESS), None)
        latest_att = attempts[0] if attempts else None

        remaining_seconds = 0
        if active_att:
            if not active_att.deadline:
                active_att.deadline = active_att.started_at + timedelta(minutes=exam.duration_minutes)
                if exam.availability_type == AvailabilityType.SCHEDULED and exam.end_time:
                    active_att.deadline = min(active_att.deadline, exam.end_time)
            remaining_seconds = max(0, int((active_att.deadline - now).total_seconds()))
            if remaining_seconds <= 0:
                if exam.auto_submit:
                    await AttemptService.submit_attempt(db, active_att.id, student_id)
                else:
                    active_att.status = AttemptStatus.EXPIRED
                    await db.commit()
                active_att = None

        has_active = active_att is not None
        total_attempts = len(attempts)
        reexam_available = False
        can_start = True

        if has_active:
            can_start = True
        else:
            if total_attempts == 0:
                can_start = True
            elif exam.attempt_policy == AttemptPolicyType.UNLIMITED_ATTEMPTS:
                can_start = True
                reexam_available = True
            elif exam.attempt_policy == AttemptPolicyType.LIMITED_ATTEMPTS and total_attempts < exam.max_attempts:
                can_start = True
                reexam_available = True
            else:
                perm = await ExamService.get_usable_reexam_permission(db, exam_id, student_id)
                if perm:
                    can_start = True
                    reexam_available = True
                else:
                    can_start = False
                    reexam_available = False

        return StudentExamStatusResponse(
            exam_id=exam_id,
            has_active_attempt=has_active,
            active_attempt_id=active_att.id if active_att else None,
            latest_attempt_status=active_att.status if active_att else (latest_att.status if latest_att else "NOT_STARTED"),
            latest_attempt_number=active_att.attempt_number if active_att else (latest_att.attempt_number if latest_att else 0),
            reexam_available=reexam_available,
            can_start_or_resume=can_start,
            time_remaining_seconds=remaining_seconds,
            rejoin_count=active_att.rejoin_count if active_att else 0,
            max_rejoins=exam.max_rejoins
        )

    @staticmethod
    async def start_or_get_attempt(
        db: AsyncSession,
        exam_id: str,
        student_id: str,
        session_token: Optional[str] = None,
        is_rejoin: bool = False
    ) -> AttemptResponse:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        if exam.status != "PUBLISHED":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Exam is not published")

        now = datetime.now(timezone.utc)

        # Check target assignment
        if exam.assignment_type == AssignmentType.SELECTED_STUDENTS and student_id not in (exam.assigned_student_ids or []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not assigned to this exam")

        # Check availability window
        if exam.availability_type == AvailabilityType.SCHEDULED and exam.start_time and now < exam.start_time:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Exam has not started yet. Starts at {exam.start_time.strftime('%Y-%m-%d %H:%M UTC')}.")

        # Check single active exam constraint across all exams (Loop 10)
        other_active_res = await db.execute(
            select(ExamAttempt)
            .where(
                ExamAttempt.student_id == student_id,
                ExamAttempt.status == AttemptStatus.IN_PROGRESS,
                ExamAttempt.exam_id != exam_id
            )
            .options(selectinload(ExamAttempt.exam))
        )
        other_active = other_active_res.scalars().all()
        for o_att in other_active:
            o_exam = o_att.exam
            if not o_att.deadline and o_exam:
                o_att.deadline = o_att.started_at + timedelta(minutes=o_exam.duration_minutes)
            if o_att.deadline and now >= o_att.deadline:
                if o_exam and o_exam.auto_submit:
                    await AttemptService.submit_attempt(db, o_att.id, student_id)
                else:
                    o_att.status = AttemptStatus.EXPIRED
                    await db.commit()
            else:
                o_title = o_exam.title if o_exam else "another test"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"You already have an active exam in progress ('{o_title}'). Only one active exam session is permitted at a time."
                )

        # Query existing attempts for this exam
        res = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.exam_id == exam_id, ExamAttempt.student_id == student_id)
            .options(selectinload(ExamAttempt.answers), selectinload(ExamAttempt.violations), selectinload(ExamAttempt.exam))
            .order_by(ExamAttempt.started_at.asc())
        )
        all_attempts = res.scalars().all()

        active_attempt = next((a for a in all_attempts if a.status == AttemptStatus.IN_PROGRESS), None)

        if active_attempt:
            # Server-controlled deadline
            if not active_attempt.deadline:
                active_attempt.deadline = active_attempt.started_at + timedelta(minutes=exam.duration_minutes)
                if exam.availability_type == AvailabilityType.SCHEDULED and exam.end_time:
                    active_attempt.deadline = min(active_attempt.deadline, exam.end_time)

            remaining_seconds = max(0, int((active_attempt.deadline - now).total_seconds()))
            if remaining_seconds <= 0:
                if exam.auto_submit:
                    await AttemptService.submit_attempt(db, active_attempt.id, student_id)
                    return AttemptService._to_response(active_attempt, 0, exam.max_rejoins)
                else:
                    active_attempt.status = AttemptStatus.EXPIRED
                    await db.commit()
                    return AttemptService._to_response(active_attempt, 0, exam.max_rejoins)

            # Rejoin vs Recovery check (Loops 10, 11, 12)
            if active_attempt.session_token and session_token:
                if active_attempt.session_token == session_token and not is_rejoin:
                    # Normal session recovery: preserve session without consuming rejoin
                    pass
                else:
                    # Rejoin event: session token changed or explicit rejoin requested
                    if active_attempt.rejoin_count >= exam.max_rejoins:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Maximum rejoin limit ({exam.max_rejoins}) reached for this exam attempt. Please contact your instructor."
                        )
                    active_attempt.rejoin_count += 1
                    active_attempt.session_token = session_token
                    v = ExamViolation(
                        id=str(uuid.uuid4()),
                        exam_attempt_id=active_attempt.id,
                        student_id=student_id,
                        violation_type=ViolationType.STUDENT_REJOINED,
                        timestamp=now,
                        metadata_json={
                            "rejoin_number": active_attempt.rejoin_count,
                            "max_rejoins": exam.max_rejoins,
                            "action": "STUDENT_REJOIN"
                        },
                        created_at=now
                    )
                    db.add(v)
            else:
                if not active_attempt.session_token:
                    active_attempt.session_token = session_token or str(uuid.uuid4())

            active_attempt.last_active_at = now
            await db.commit()
            await db.refresh(active_attempt)
            return AttemptService._to_response(active_attempt, remaining_seconds, exam.max_rejoins)

        # ── Start a New Attempt (First attempt OR Re-examination) ──
        if exam.availability_type == AvailabilityType.SCHEDULED and exam.end_time and now > exam.end_time:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam availability window has closed. Cannot create new attempt.")

        total_prev = len(all_attempts)
        if total_prev == 0:
            next_attempt_number = 1
        else:
            if exam.attempt_policy == AttemptPolicyType.UNLIMITED_ATTEMPTS:
                next_attempt_number = total_prev + 1
            elif exam.attempt_policy == AttemptPolicyType.LIMITED_ATTEMPTS and total_prev < exam.max_attempts:
                next_attempt_number = total_prev + 1
            else:
                perm = await ExamService.get_usable_reexam_permission(db, exam_id, student_id)
                if not perm:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="You have already exhausted all attempts for this exam and no re-examination permission has been granted."
                    )
                perm.attempts_consumed += 1
                next_attempt_number = total_prev + 1

        deadline = now + timedelta(minutes=exam.duration_minutes)
        if exam.availability_type == AvailabilityType.SCHEDULED and exam.end_time:
            deadline = min(deadline, exam.end_time)

        new_session_token = session_token or str(uuid.uuid4())
        new_attempt = ExamAttempt(
            id=str(uuid.uuid4()),
            exam_id=exam_id,
            student_id=student_id,
            attempt_number=next_attempt_number,
            started_at=now,
            deadline=deadline,
            status=AttemptStatus.IN_PROGRESS,
            rejoin_count=0,
            session_token=new_session_token,
            last_active_at=now,
            identity_verified=False
        )
        db.add(new_attempt)
        await db.commit()
        await db.refresh(new_attempt)

        remaining_seconds = max(0, int((deadline - now).total_seconds()))
        return AttemptService._to_response(new_attempt, remaining_seconds, exam.max_rejoins)

    @staticmethod
    async def rejoin_attempt(
        db: AsyncSession,
        attempt_id: str,
        student_id: str,
        session_token: Optional[str] = None
    ) -> AttemptResponse:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(
                selectinload(ExamAttempt.answers),
                selectinload(ExamAttempt.exam),
                selectinload(ExamAttempt.violations)
            )
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt is already submitted or expired")

        exam = attempt.exam
        now = datetime.now(timezone.utc)
        if not attempt.deadline and exam:
            attempt.deadline = attempt.started_at + timedelta(minutes=exam.duration_minutes)
            if exam.availability_type == AvailabilityType.SCHEDULED and exam.end_time:
                attempt.deadline = min(attempt.deadline, exam.end_time)

        remaining_seconds = max(0, int((attempt.deadline - now).total_seconds())) if attempt.deadline else 0
        if remaining_seconds <= 0:
            if exam and exam.auto_submit:
                await AttemptService.submit_attempt(db, attempt.id, student_id)
            else:
                attempt.status = AttemptStatus.EXPIRED
                await db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam deadline has passed")

        max_rej = exam.max_rejoins if exam else 2
        if attempt.rejoin_count >= max_rej:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Maximum rejoin limit ({attempt.rejoin_count}/{max_rej}) reached. Please contact your instructor."
            )

        attempt.rejoin_count += 1
        attempt.session_token = session_token or str(uuid.uuid4())
        attempt.last_active_at = now

        violation = ExamViolation(
            id=str(uuid.uuid4()),
            exam_attempt_id=attempt.id,
            student_id=student_id,
            violation_type=ViolationType.STUDENT_REJOINED,
            timestamp=now,
            metadata_json={"rejoin_number": attempt.rejoin_count, "max_rejoins": max_rej, "action": "EXPLICIT_REJOIN"},
            created_at=now
        )
        db.add(violation)
        await db.commit()
        await db.refresh(attempt)
        return AttemptService._to_response(attempt, remaining_seconds, max_rej)

    @staticmethod
    async def get_attempt_by_id(db: AsyncSession, attempt_id: str, student_id: str) -> AttemptResponse:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(
                selectinload(ExamAttempt.answers),
                selectinload(ExamAttempt.violations),
                selectinload(ExamAttempt.exam)
            )
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this attempt")

        exam = attempt.exam
        now = datetime.now(timezone.utc)
        if not attempt.deadline and exam:
            attempt.deadline = attempt.started_at + timedelta(minutes=exam.duration_minutes)
            if exam.availability_type == AvailabilityType.SCHEDULED and exam.end_time:
                attempt.deadline = min(attempt.deadline, exam.end_time)

        remaining_seconds = max(0, int((attempt.deadline - now).total_seconds())) if attempt.deadline else 0
        if attempt.status == AttemptStatus.IN_PROGRESS and attempt.deadline and now >= attempt.deadline:
            if exam and exam.auto_submit:
                await AttemptService.submit_attempt(db, attempt.id, student_id)
                remaining_seconds = 0
            else:
                attempt.status = AttemptStatus.EXPIRED
                await db.commit()
                await db.refresh(attempt)
                remaining_seconds = 0

        max_rej = exam.max_rejoins if exam else 2
        return AttemptService._to_response(attempt, remaining_seconds, max_rej)

    @staticmethod
    async def save_answer(
        db: AsyncSession,
        attempt_id: str,
        req: SaveAnswerRequest,
        student_id: str
    ) -> AnswerResponse:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(
                selectinload(ExamAttempt.answers),
                selectinload(ExamAttempt.exam)
            )
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this attempt")
        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt is already submitted or expired")
        if not attempt.identity_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Identity verification required before answering questions."
            )

        now = datetime.now(timezone.utc)
        exam = attempt.exam
        if not attempt.deadline and exam:
            attempt.deadline = attempt.started_at + timedelta(minutes=exam.duration_minutes)
            if exam.availability_type == AvailabilityType.SCHEDULED and exam.end_time:
                attempt.deadline = min(attempt.deadline, exam.end_time)

        if attempt.deadline and now >= attempt.deadline:
            if exam and exam.auto_submit:
                await AttemptService.submit_attempt(db, attempt.id, student_id)
            else:
                attempt.status = AttemptStatus.EXPIRED
                await db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam deadline has passed")

        attempt.last_active_at = now

        # Find existing answer or create new
        existing_answer = next((a for a in (attempt.answers or []) if a.question_id == req.question_id), None)
        if existing_answer:
            existing_answer.selected_option = req.selected_option
            existing_answer.answer_text = req.answer_text
            existing_answer.is_marked_for_review = req.is_marked_for_review
            existing_answer.updated_at = now
            ans_to_return = existing_answer
        else:
            new_ans = Answer(
                id=str(uuid.uuid4()),
                attempt_id=attempt_id,
                question_id=req.question_id,
                selected_option=req.selected_option,
                answer_text=req.answer_text,
                is_marked_for_review=req.is_marked_for_review,
                created_at=now,
                updated_at=now
            )
            db.add(new_ans)
            ans_to_return = new_ans

        await db.commit()
        await db.refresh(ans_to_return)
        return AnswerResponse.model_validate(ans_to_return)

    @staticmethod
    async def submit_attempt(
        db: AsyncSession,
        attempt_id: str,
        student_id: str
    ) -> SubmitAttemptResponse:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(
                selectinload(ExamAttempt.answers),
                selectinload(ExamAttempt.exam).selectinload(Exam.questions)
            )
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

        # Idempotent submission: return existing result if already submitted (Loop 9)
        if attempt.status == AttemptStatus.SUBMITTED:
            return AttemptService._to_submit_response(attempt)

        exam = attempt.exam
        questions = exam.questions or []
        answers_by_q = {a.question_id: a for a in (attempt.answers or [])}

        total_score = 0.0
        max_possible_score = sum(q.marks for q in questions)
        attempted_count = 0
        correct_mcq_count = 0

        for q in questions:
            ans = answers_by_q.get(q.id)
            if not ans:
                continue

            has_answered = False
            if q.question_type == QuestionType.MCQ and ans.selected_option and ans.selected_option.strip():
                has_answered = True
            elif q.question_type == QuestionType.SHORT_ANSWER and ans.answer_text and ans.answer_text.strip():
                has_answered = True

            if has_answered:
                attempted_count += 1

            if q.question_type == QuestionType.MCQ:
                if ans.selected_option and ans.selected_option.strip() == (q.correct_answer or "").strip():
                    ans.is_correct = True
                    ans.marks_awarded = q.marks
                    total_score += q.marks
                    correct_mcq_count += 1
                elif ans.selected_option and ans.selected_option.strip():
                    ans.is_correct = False
                    if exam.negative_marking == NegativeMarkingType.PER_QUESTION:
                        ans.marks_awarded = -abs(q.negative_marks)
                        total_score -= abs(q.negative_marks)
                    else:
                        ans.marks_awarded = 0.0
                else:
                    ans.is_correct = False
                    ans.marks_awarded = 0.0

        now = datetime.now(timezone.utc)
        attempt.status = AttemptStatus.SUBMITTED
        attempt.submitted_at = now
        attempt.total_score = max(0.0, total_score)
        attempt.max_possible_score = max_possible_score

        await db.commit()
        await db.refresh(attempt)
        return AttemptService._to_submit_response(attempt)

    @staticmethod
    def _to_submit_response(attempt: ExamAttempt) -> SubmitAttemptResponse:
        exam = attempt.exam
        questions = exam.questions or []
        answers_by_q = {a.question_id: a for a in (attempt.answers or [])}

        attempted_count = 0
        correct_mcq_count = 0

        for q in questions:
            ans = answers_by_q.get(q.id)
            if not ans:
                continue
            if q.question_type == QuestionType.MCQ:
                if ans.selected_option and ans.selected_option.strip():
                    attempted_count += 1
                if ans.is_correct:
                    correct_mcq_count += 1
            elif q.question_type == QuestionType.SHORT_ANSWER:
                if ans.answer_text and ans.answer_text.strip():
                    attempted_count += 1

        return SubmitAttemptResponse(
            attempt_id=attempt.id,
            exam_id=attempt.exam_id,
            exam_title=exam.title,
            status=attempt.status,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at or datetime.now(timezone.utc),
            total_questions=len(questions),
            attempted_questions=attempted_count,
            correct_mcq_count=correct_mcq_count,
            total_score=attempt.total_score or 0.0,
            max_possible_score=attempt.max_possible_score or sum(q.marks for q in questions),
            short_answer_status="Pending Review"
        )

    @staticmethod
    async def record_violation(
        db: AsyncSession,
        attempt_id: str,
        req: CreateViolationRequest,
        student_id: str
    ) -> ViolationResponse:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to log violation for this attempt")
        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt is already submitted or expired")

        # Rate limiting / deduplication: if identical violation recorded within the last 1.5 seconds, return latest
        now = datetime.now(timezone.utc)
        recent_cutoff = now.timestamp() - 1.5
        existing_result = await db.execute(
            select(ExamViolation)
            .where(
                ExamViolation.exam_attempt_id == attempt_id,
                ExamViolation.violation_type == req.violation_type
            )
            .order_by(ExamViolation.created_at.desc())
            .limit(1)
        )
        recent = existing_result.scalar_one_or_none()
        if recent and recent.created_at and recent.created_at.timestamp() >= recent_cutoff:
            return ViolationResponse.model_validate(recent)

        violation = ExamViolation(
            exam_attempt_id=attempt_id,
            student_id=student_id,
            violation_type=req.violation_type,
            timestamp=req.timestamp or now,
            metadata_json=req.metadata or {},
            created_at=now
        )
        db.add(violation)
        await db.commit()
        await db.refresh(violation)
        return ViolationResponse.model_validate(violation)

    @staticmethod
    async def get_violations(
        db: AsyncSession,
        attempt_id: str,
        current_user: User
    ) -> List[ViolationResponse]:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(selectinload(ExamAttempt.violations), selectinload(ExamAttempt.exam))
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        # Student can only view own violations; Faculty/Admin can view
        if current_user.role == UserRole.STUDENT and attempt.student_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view violations for this attempt")

        violations_result = await db.execute(
            select(ExamViolation)
            .where(ExamViolation.exam_attempt_id == attempt_id)
            .order_by(ExamViolation.created_at.desc())
        )
        violations = violations_result.scalars().all()
        return [ViolationResponse.model_validate(v) for v in violations]

    @staticmethod
    async def get_exam_monitoring(
        db: AsyncSession,
        exam_id: str,
        current_user: User
    ) -> List[AttemptMonitoringResponse]:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if current_user.role == UserRole.FACULTY and exam.created_by_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to monitor this exam")

        attempts_result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.exam_id == exam_id)
            .options(
                selectinload(ExamAttempt.student).selectinload(User.student_profile),
                selectinload(ExamAttempt.violations),
                selectinload(ExamAttempt.media_session)
            )
            .order_by(ExamAttempt.started_at.desc())
        )
        attempts = attempts_result.scalars().all()

        monitoring_data = []
        for att in attempts:
            student = att.student
            roll = student.student_profile.student_id if student and student.student_profile else None
            student_info = AttemptMonitoringStudentInfo(
                id=student.id if student else att.student_id,
                name=student.name if student else "Candidate",
                email=student.email if student else "",
                roll_number=roll
            )

            # Sort violations descending
            sorted_violations = sorted(att.violations or [], key=lambda v: v.created_at, reverse=True)
            recent_v_responses = [ViolationResponse.model_validate(v) for v in sorted_violations[:10]]
            media_resp = MediaSessionResponse.model_validate(att.media_session) if att.media_session else None

            monitoring_data.append(
                AttemptMonitoringResponse(
                    attempt_id=att.id,
                    exam_id=att.exam_id,
                    student=student_info,
                    attempt_number=att.attempt_number or 1,
                    status=att.status,
                    started_at=att.started_at,
                    submitted_at=att.submitted_at,
                    violation_count=len(att.violations or []),
                    recent_violations=recent_v_responses,
                    media_session=media_resp,
                    rejoin_count=att.rejoin_count or 0,
                    max_rejoins=exam.max_rejoins if exam else 2
                )
            )
        return monitoring_data

    @staticmethod
    async def get_or_create_media_session(
        db: AsyncSession,
        attempt_id: str,
        student_id: str
    ) -> MediaSessionResponse:
        att_res = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(selectinload(ExamAttempt.media_session))
        )
        attempt = att_res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this attempt")

        if attempt.media_session:
            return MediaSessionResponse.model_validate(attempt.media_session)

        now = datetime.now(timezone.utc)
        media_session = ExamMediaSession(
            exam_attempt_id=attempt_id,
            student_id=student_id,
            status=MediaSessionStatus.WAITING,
            camera_active=False,
            mic_active=False,
            screen_active=False,
            created_at=now,
            updated_at=now
        )
        db.add(media_session)
        await db.commit()
        await db.refresh(media_session)
        return MediaSessionResponse.model_validate(media_session)

    @staticmethod
    async def update_media_session(
        db: AsyncSession,
        attempt_id: str,
        req: UpdateMediaStatusRequest,
        student_id: str
    ) -> MediaSessionResponse:
        att_res = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(selectinload(ExamAttempt.media_session))
        )
        attempt = att_res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this attempt")

        now = datetime.now(timezone.utc)
        media_session = attempt.media_session
        if not media_session:
            media_session = ExamMediaSession(
                exam_attempt_id=attempt_id,
                student_id=student_id,
                status=req.status or MediaSessionStatus.WAITING,
                camera_active=req.camera_active if req.camera_active is not None else False,
                mic_active=req.mic_active if req.mic_active is not None else False,
                screen_active=req.screen_active if req.screen_active is not None else False,
                created_at=now,
                updated_at=now
            )
            db.add(media_session)
        else:
            if req.status is not None:
                media_session.status = req.status
            if req.camera_active is not None:
                media_session.camera_active = req.camera_active
            if req.mic_active is not None:
                media_session.mic_active = req.mic_active
            if req.screen_active is not None:
                media_session.screen_active = req.screen_active
            media_session.updated_at = now

        await db.commit()
        await db.refresh(media_session)
        return MediaSessionResponse.model_validate(media_session)

    @staticmethod
    def _calc_evaluation(attempt: ExamAttempt) -> tuple[str, int, int]:
        exam = attempt.exam
        questions = exam.questions if exam and hasattr(exam, "questions") else []
        sa_questions = [q for q in questions if q.question_type == QuestionType.SHORT_ANSWER]
        sa_q_ids = {q.id for q in sa_questions}
        sa_count = len(sa_questions)
        if sa_count == 0:
            return "EVALUATED", 0, 0
        evaluated_sa = 0
        for a in (attempt.answers or []):
            if a.question_id in sa_q_ids and a.marks_awarded is not None:
                evaluated_sa += 1
        eval_status = "EVALUATED" if evaluated_sa >= sa_count else "NEEDS_GRADING"
        return eval_status, sa_count, evaluated_sa

    @staticmethod
    def _calc_percentage(score: Optional[float], max_score: Optional[float]) -> float:
        if not max_score or max_score <= 0:
            return 0.0
        return round(((score or 0.0) / max_score) * 100, 2)

    @staticmethod
    async def get_exam_gradebook(
        db: AsyncSession,
        exam_id: str,
        current_user: User
    ) -> ExamGradebookResponse:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if current_user.role == UserRole.FACULTY and exam.created_by_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view results for this exam")

        result = await db.execute(
            select(ExamAttempt)
            .where(
                ExamAttempt.exam_id == exam_id,
                ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EXPIRED])
            )
            .options(
                selectinload(ExamAttempt.student).selectinload(User.student_profile),
                selectinload(ExamAttempt.exam).selectinload(Exam.questions),
                selectinload(ExamAttempt.answers)
            )
            .order_by(ExamAttempt.submitted_at.desc())
        )
        attempts = result.scalars().all()

        entries: List[GradebookEntry] = []
        for att in attempts:
            eval_status, sa_count, eval_sa = AttemptService._calc_evaluation(att)
            st = att.student
            roll = st.student_profile.student_id if st and st.student_profile else None
            student_info = GradebookStudentInfo(
                id=st.id if st else att.student_id,
                name=st.name if st else "Student",
                email=st.email if st else "",
                roll_number=roll
            )
            entries.append(
                GradebookEntry(
                    attempt_id=att.id,
                    exam_id=att.exam_id,
                    exam_title=exam.title,
                    student=student_info,
                    attempt_number=att.attempt_number or 1,
                    status=att.status,
                    started_at=att.started_at,
                    submitted_at=att.submitted_at,
                    total_score=att.total_score or 0.0,
                    max_possible_score=att.max_possible_score or exam.total_marks or 0.0,
                    percentage=AttemptService._calc_percentage(att.total_score, att.max_possible_score or exam.total_marks),
                    evaluation_status=eval_status,
                    short_answer_count=sa_count,
                    evaluated_short_answer_count=eval_sa
                )
            )

        return ExamGradebookResponse(
            exam_id=exam.id,
            exam_title=exam.title,
            total_marks=exam.total_marks or 0.0,
            total_submissions=len(entries),
            entries=entries
        )

    @staticmethod
    async def get_faculty_recent_results(
        db: AsyncSession,
        current_user: User,
        limit: int = 15
    ) -> List[GradebookEntry]:
        query = select(ExamAttempt).join(Exam, ExamAttempt.exam_id == Exam.id).where(
            ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EXPIRED])
        )
        if current_user.role == UserRole.FACULTY:
            query = query.where(Exam.created_by_id == current_user.id)

        query = query.options(
            selectinload(ExamAttempt.student).selectinload(User.student_profile),
            selectinload(ExamAttempt.exam).selectinload(Exam.questions),
            selectinload(ExamAttempt.answers)
        ).order_by(ExamAttempt.submitted_at.desc()).limit(limit)

        result = await db.execute(query)
        attempts = result.scalars().all()

        entries: List[GradebookEntry] = []
        for att in attempts:
            eval_status, sa_count, eval_sa = AttemptService._calc_evaluation(att)
            st = att.student
            roll = st.student_profile.student_id if st and st.student_profile else None
            student_info = GradebookStudentInfo(
                id=st.id if st else att.student_id,
                name=st.name if st else "Student",
                email=st.email if st else "",
                roll_number=roll
            )
            entries.append(
                GradebookEntry(
                    attempt_id=att.id,
                    exam_id=att.exam_id,
                    exam_title=att.exam.title if att.exam else "Exam",
                    student=student_info,
                    attempt_number=att.attempt_number or 1,
                    status=att.status,
                    started_at=att.started_at,
                    submitted_at=att.submitted_at,
                    total_score=att.total_score or 0.0,
                    max_possible_score=att.max_possible_score or (att.exam.total_marks if att.exam else 0.0),
                    percentage=AttemptService._calc_percentage(att.total_score, att.max_possible_score or (att.exam.total_marks if att.exam else 0.0)),
                    evaluation_status=eval_status,
                    short_answer_count=sa_count,
                    evaluated_short_answer_count=eval_sa
                )
            )
        return entries

    @staticmethod
    async def get_student_results(
        db: AsyncSession,
        student_id: str
    ) -> List[StudentCompletedResultItem]:
        result = await db.execute(
            select(ExamAttempt)
            .where(
                ExamAttempt.student_id == student_id,
                ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EXPIRED])
            )
            .options(
                selectinload(ExamAttempt.exam).selectinload(Exam.questions),
                selectinload(ExamAttempt.answers)
            )
            .order_by(ExamAttempt.submitted_at.desc())
        )
        attempts = result.scalars().all()

        items: List[StudentCompletedResultItem] = []
        for att in attempts:
            eval_status, _, _ = AttemptService._calc_evaluation(att)
            max_marks = att.max_possible_score or (att.exam.total_marks if att.exam else 0.0)
            items.append(
                StudentCompletedResultItem(
                    attempt_id=att.id,
                    exam_id=att.exam_id,
                    exam_title=att.exam.title if att.exam else "Exam",
                    attempt_number=att.attempt_number or 1,
                    started_at=att.started_at,
                    submitted_at=att.submitted_at,
                    total_score=att.total_score or 0.0,
                    max_possible_score=max_marks,
                    percentage=AttemptService._calc_percentage(att.total_score, max_marks),
                    status=att.status,
                    evaluation_status=eval_status
                )
            )
        return items

    @staticmethod
    async def get_attempt_review(
        db: AsyncSession,
        attempt_id: str,
        current_user: User
    ) -> AttemptReviewResponse:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(
                selectinload(ExamAttempt.student).selectinload(User.student_profile),
                selectinload(ExamAttempt.exam).selectinload(Exam.questions),
                selectinload(ExamAttempt.answers).selectinload(Answer.question)
            )
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        # Authorization: Student must own attempt; Faculty must own exam; Admin allowed
        if current_user.role == UserRole.STUDENT and attempt.student_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this student result")
        if current_user.role == UserRole.FACULTY and attempt.exam.created_by_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access results for this exam")

        exam = attempt.exam
        questions = sorted(exam.questions or [], key=lambda q: q.order_index)
        answers_by_q = {a.question_id: a for a in (attempt.answers or [])}

        eval_status, _, _ = AttemptService._calc_evaluation(attempt)
        max_marks = attempt.max_possible_score or exam.total_marks or sum(q.marks for q in questions)

        q_items: List[AttemptReviewQuestionItem] = []
        attempted_count = 0
        correct_mcq_count = 0

        for q in questions:
            ans = answers_by_q.get(q.id)
            has_answered = False
            if ans:
                if q.question_type == QuestionType.MCQ and ans.selected_option and ans.selected_option.strip():
                    has_answered = True
                elif q.question_type == QuestionType.SHORT_ANSWER and ans.answer_text and ans.answer_text.strip():
                    has_answered = True
                if ans.is_correct and q.question_type == QuestionType.MCQ:
                    correct_mcq_count += 1

            if has_answered:
                attempted_count += 1

            q_items.append(
                AttemptReviewQuestionItem(
                    question_id=q.id,
                    question_type=q.question_type.value if hasattr(q.question_type, "value") else str(q.question_type),
                    question_text=q.question_text,
                    options=q.options,
                    correct_answer=q.correct_answer,
                    max_marks=q.marks,
                    negative_marks=q.negative_marks or 0.0,
                    explanation=q.explanation,
                    order_index=q.order_index or 0,
                    answer_id=ans.id if ans else None,
                    selected_option=ans.selected_option if ans else None,
                    answer_text=ans.answer_text if ans else None,
                    is_correct=ans.is_correct if ans else None,
                    marks_awarded=ans.marks_awarded if ans else None
                )
            )

        st = attempt.student
        roll = st.student_profile.student_id if st and st.student_profile else None
        student_info = GradebookStudentInfo(
            id=st.id if st else attempt.student_id,
            name=st.name if st else "Student",
            email=st.email if st else "",
            roll_number=roll
        )

        return AttemptReviewResponse(
            attempt_id=attempt.id,
            exam_id=attempt.exam_id,
            exam_title=exam.title,
            student=student_info,
            attempt_number=attempt.attempt_number or 1,
            status=attempt.status,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            total_score=attempt.total_score or 0.0,
            max_possible_score=max_marks,
            percentage=AttemptService._calc_percentage(attempt.total_score, max_marks),
            evaluation_status=eval_status,
            total_questions=len(questions),
            attempted_questions=attempted_count,
            correct_mcq_count=correct_mcq_count,
            questions=q_items
        )

    @staticmethod
    async def get_my_exam_result(
        db: AsyncSession,
        exam_id: str,
        student_id: str,
        attempt_id: Optional[str] = None
    ) -> AttemptReviewResponse:
        query = select(ExamAttempt).where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_id == student_id
        )
        if attempt_id:
            query = query.where(ExamAttempt.id == attempt_id)
        else:
            query = query.where(ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EXPIRED])).order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.started_at.desc())

        result = await db.execute(query)
        attempt = result.scalars().first()
        if not attempt:
            # If no submitted attempt found, check if there is an in-progress attempt to report gracefully
            in_prog_res = await db.execute(
                select(ExamAttempt).where(
                    ExamAttempt.exam_id == exam_id,
                    ExamAttempt.student_id == student_id
                ).order_by(ExamAttempt.started_at.desc())
            )
            attempt = in_prog_res.scalars().first()
            if not attempt:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No exam attempt found for this exam")

        # Create a mock user object to pass authorization
        user_res = await db.execute(select(User).where(User.id == student_id))
        user = user_res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        return await AttemptService.get_attempt_review(db, attempt.id, current_user=user)

    @staticmethod
    async def grade_short_answer(
        db: AsyncSession,
        attempt_id: str,
        answer_id: str,
        req: ManualGradeRequest,
        current_user: User
    ) -> ManualGradeResponse:
        # Load attempt with exam and answers
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(
                selectinload(ExamAttempt.exam).selectinload(Exam.questions),
                selectinload(ExamAttempt.answers).selectinload(Answer.question)
            )
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        if current_user.role == UserRole.FACULTY and attempt.exam.created_by_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to grade this exam")

        # Find the target answer
        target_answer = next((a for a in (attempt.answers or []) if a.id == answer_id), None)
        if not target_answer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer record not found")

        question = target_answer.question
        if not question:
            q_res = await db.execute(select(Question).where(Question.id == target_answer.question_id))
            question = q_res.scalar_one_or_none()
            if not question:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        # Validation: cannot be negative, cannot exceed max marks
        if req.marks_awarded < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Marks awarded cannot be negative."
            )
        if req.marks_awarded > question.marks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Marks awarded ({req.marks_awarded}) cannot exceed maximum marks for this question ({question.marks})."
            )

        now = datetime.now(timezone.utc)
        target_answer.marks_awarded = req.marks_awarded
        target_answer.is_correct = (req.marks_awarded > 0)
        target_answer.updated_at = now

        # Recalculate total attempt score: sum of all marks_awarded across all answers
        new_total = sum(a.marks_awarded or 0.0 for a in attempt.answers)
        attempt.total_score = max(0.0, round(new_total, 2))
        attempt.updated_at = now

        eval_status, _, _ = AttemptService._calc_evaluation(attempt)

        await db.commit()
        await db.refresh(target_answer)
        await db.refresh(attempt)

        return ManualGradeResponse(
            attempt_id=attempt.id,
            answer_id=target_answer.id,
            question_id=question.id,
            marks_awarded=target_answer.marks_awarded,
            attempt_total_score=attempt.total_score,
            attempt_max_score=attempt.max_possible_score or attempt.exam.total_marks or 0.0,
            evaluation_status=eval_status,
            message="Grade updated successfully"
        )

