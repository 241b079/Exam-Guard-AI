from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid
from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
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
    StudentAppealResponse,
    FacultyAppealDecisionResponse,
)

from app.features.users.models import User, UserRole
from app.features.exams.models import (
    Exam,
    ExamStatus,
    NegativeMarkingType,
    AssignmentType,
    AvailabilityType,
    AttemptPolicyType,
)
from app.features.exams.service import ExamService
from app.features.proctoring.signaling import signaling_manager
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
            total_attempts=total_attempts,
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

        # Acquire PostgreSQL advisory transaction lock on (student_id, exam_id)
        # Automatically released on transaction commit/rollback; serializes concurrent attempt creation across workers
        try:
            await db.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:k)::bigint)"),
                {"k": f"attempt_{student_id}_{exam_id}"}
            )
        except Exception:
            pass

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
                await ExamService.consume_reexam_permission(db, perm, student_id)
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
        try:
            await db.commit()
            await db.refresh(new_attempt)
        except IntegrityError:
            await db.rollback()
            # Concurrency race caught by database constraint:
            # Re-fetch attempt to return the active attempt without a 500 error
            res_race = await db.execute(
                select(ExamAttempt)
                .where(ExamAttempt.exam_id == exam_id, ExamAttempt.student_id == student_id)
                .options(selectinload(ExamAttempt.answers), selectinload(ExamAttempt.violations), selectinload(ExamAttempt.exam))
                .order_by(ExamAttempt.started_at.desc())
            )
            all_race = res_race.scalars().all()
            active_race = next((a for a in all_race if a.status == AttemptStatus.IN_PROGRESS), None)
            if active_race:
                remaining_seconds = max(0, int((active_race.deadline - now).total_seconds())) if active_race.deadline else 0
                return AttemptService._to_response(active_race, remaining_seconds, exam.max_rejoins)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A concurrent attempt was already started or attempt limit reached."
            )

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

        # Phase 2C: Verify question belongs to the attempt's exam
        q_res = await db.execute(
            select(Question).where(
                Question.id == req.question_id,
                Question.exam_id == attempt.exam_id
            )
        )
        if not q_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Question does not belong to this exam or does not exist."
            )

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
        student_id: str,
        background_tasks: Optional[Any] = None
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

        # Set evaluation and publication status
        attempt.evaluation_status = "EVALUATED" if attempted_count == len(questions) and not any(q.question_type == QuestionType.SHORT_ANSWER for q in questions) else "NEEDS_GRADING"
        attempt.integrity_status = "PENDING_REVIEW"
        if getattr(exam, "auto_publish_results", False):
            attempt.publication_status = "PUBLISHED"
            attempt.published_at = now
        else:
            attempt.publication_status = "UNPUBLISHED"

        # Close media session upon submission so live stream is torn down and not reported as active
        media_res = await db.execute(
            select(ExamMediaSession).where(ExamMediaSession.exam_attempt_id == attempt_id)
        )
        media_sess = media_res.scalar_one_or_none()
        if media_sess:
            media_sess.status = MediaSessionStatus.ENDED
            media_sess.camera_active = False
            media_sess.mic_active = False
            media_sess.screen_active = False
            media_sess.updated_at = now

        await db.commit()
        await db.refresh(attempt)

        # Dispatch submission notifications to student and faculty
        try:
            from app.features.proctoring.notification_service import NotificationService
            await NotificationService.create_notification(
                db=db,
                user_id=student_id,
                notif_type="EXAM_SUBMITTED",
                title=f"Exam Submitted: {exam.title}",
                message="Your examination has been submitted successfully. Your examination integrity assessment is being processed.",
                exam_id=exam.id,
                exam_attempt_id=attempt.id
            )
            await NotificationService.create_notification(
                db=db,
                user_id=exam.created_by_id,
                notif_type="NEW_SUBMISSION",
                title=f"New Submission: {exam.title}",
                message=f"Candidate submitted attempt #{attempt.attempt_number} for {exam.title}.",
                exam_id=exam.id,
                exam_attempt_id=attempt.id
            )
        except Exception:
            pass

        # Broadcast real-time student_submitted event to evict candidate from live faculty monitoring grid
        try:
            await signaling_manager.broadcast_student_state(
                exam_id=attempt.exam_id,
                student_id=student_id,
                state_payload={
                    "type": "student_submitted",
                    "attempt_id": attempt.id,
                    "student_id": student_id,
                    "status": "SUBMITTED",
                }
            )
        except Exception:
            pass

        # Reset in-memory session tracker for this attempt so subsequent attempts start fresh
        try:
            from app.features.proctoring.service import ProctoringService
            ProctoringService.reset_tracker(attempt.exam_id, attempt.student_id, attempt.id)
        except Exception:
            pass

        # Immediately guarantee StudentRiskScore exists with verified baseline score
        try:
            from app.features.proctoring.risk_engine import RiskScoringEngine
            await RiskScoringEngine.get_or_create_risk_score(db, exam.id, attempt.id, student_id)
        except Exception as rs_err:
            logger.warning(f"Error ensuring risk score on submit: {rs_err}")

        # Offload Post-Examination AI Investigation report synthesis to background task
        # so student submission returns in milliseconds without blocking on heavy AI dossier generation
        try:
            from app.features.proctoring.investigation import PostExaminationInvestigationService
            if background_tasks is not None:
                background_tasks.add_task(
                    PostExaminationInvestigationService.generate_investigation_report_background,
                    attempt.id
                )
            else:
                import asyncio
                asyncio.create_task(
                    PostExaminationInvestigationService.generate_investigation_report_background(attempt.id)
                )
        except Exception as inv_err:
            logger.warning(f"Error scheduling post-examination investigation report: {inv_err}")

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

        is_published = (getattr(attempt, "publication_status", "UNPUBLISHED") == "PUBLISHED")
        msg = AttemptService._get_student_integrity_message(attempt, None)

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
            total_score=(attempt.total_score or 0.0) if is_published else None,
            max_possible_score=(attempt.max_possible_score or sum(q.marks for q in questions)) if is_published else None,
            publication_status=getattr(attempt, "publication_status", "UNPUBLISHED"),
            integrity_status=getattr(attempt, "integrity_status", "PENDING_REVIEW"),
            student_status_message=msg,
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

        # Wire incident recording & dynamic risk scoring
        try:
            from app.features.proctoring.risk_engine import RiskScoringEngine
            from app.features.proctoring.models import AIClassification, EventSeverity

            v_type_str = violation.violation_type.value if hasattr(violation.violation_type, "value") else str(violation.violation_type)

            # Map violation type to category, classification, severity, and explanation
            if v_type_str in ("PAGE_HIDDEN", "WINDOW_BLUR"):
                cat = "BROWSER_ANOMALY"
                sev = EventSeverity.MEDIUM.value
                ai_class = AIClassification.CONFIRMED.value
                conf = 0.95
                expl = "Browser tab lost visibility or candidate switched active application window."
            elif v_type_str == "FULLSCREEN_EXIT":
                cat = "BROWSER_ANOMALY"
                sev = EventSeverity.MEDIUM.value
                ai_class = AIClassification.CONFIRMED.value
                conf = 0.95
                expl = "Exam lockdown fullscreen mode was exited."
            elif v_type_str == "CAMERA_STOPPED":
                cat = "HARDWARE_ANOMALY"
                sev = EventSeverity.HIGH.value
                ai_class = AIClassification.CONFIRMED.value
                conf = 0.90
                expl = "Candidate camera feed stopped during exam attempt."
            elif v_type_str in ("MEDIA_CONNECTION_LOST", "MEDIA_CONNECTION_FAILED"):
                cat = "NETWORK_ANOMALY"
                sev = EventSeverity.LOW.value
                ai_class = AIClassification.INCONCLUSIVE.value
                conf = 0.50
                v_type_str = "MONITORING_INTERRUPTED"
                expl = "WebRTC media or signaling connection was interrupted. Classified as technical interruption without risk score penalty."
            elif v_type_str == "LOOKING_AWAY":
                cat = "BEHAVIORAL_ANOMALY"
                sev = EventSeverity.MEDIUM.value
                ai_class = AIClassification.SUSPICIOUS.value
                conf = 0.85
                expl = "Candidate sustained 3D gaze away from exam monitor."
            elif v_type_str in ("MULTIPLE_PERSON_IDENTITY_MISMATCH", "IDENTITY_MISMATCH"):
                cat = "IDENTITY_ANOMALY"
                sev = EventSeverity.CRITICAL.value
                ai_class = AIClassification.CONFIRMED.value
                conf = float(req.metadata.get("confidence", 0.95)) if req.metadata else 0.95
                expl = "Multiple persons or identity mismatch detected in examination area."
            elif v_type_str == "MULTIPLE_PERSON":
                cat = "ENVIRONMENTAL_ANOMALY"
                sev = EventSeverity.HIGH.value
                ai_class = AIClassification.CONFIRMED.value
                conf = float(req.metadata.get("confidence", 0.90)) if req.metadata else 0.90
                expl = "Multiple individuals detected in candidate proctoring feed."
            elif v_type_str in ("NO_FACE", "TEMPORARY_ABSENCE"):
                cat = "BEHAVIORAL_ANOMALY"
                sev = EventSeverity.MEDIUM.value
                ai_class = AIClassification.CONFIRMED.value
                conf = float(req.metadata.get("confidence", 0.90)) if req.metadata else 0.90
                expl = "No candidate face visible in camera frame."
            elif v_type_str == "UNAUTHORIZED_OBJECT":
                cat = "ENVIRONMENTAL_ANOMALY"
                sev = EventSeverity.HIGH.value
                ai_class = AIClassification.CONFIRMED.value
                conf = 0.90
                expl = "Prohibited object detected in exam area."
            elif v_type_str == "AUDIO_ANOMALY":
                cat = "AUDIO_ANOMALY"
                sev = EventSeverity.MEDIUM.value
                ai_class = AIClassification.SUSPICIOUS.value
                conf = 0.80
                expl = "Acoustic or speech anomaly detected."
            else:
                cat = "INTEGRITY_NOTICE"
                sev = EventSeverity.LOW.value
                ai_class = AIClassification.SUSPICIOUS.value
                conf = 0.70
                expl = f"Violation of type {v_type_str} recorded."

            await RiskScoringEngine.record_incident_and_update_risk(
                db=db,
                exam_id=attempt.exam_id,
                attempt_id=attempt_id,
                student_id=student_id,
                incident_type=v_type_str,
                category=cat,
                severity=sev,
                confidence=conf,
                explanation=expl,
                metadata=req.metadata or {},
                ai_classification=ai_class
            )
            await db.commit()
        except Exception as r_err:
            logger.warning(f"Error updating risk score on violation: {r_err}")

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
        current_user: User,
        active_only: bool = True
    ) -> List[AttemptMonitoringResponse]:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if current_user.role == UserRole.FACULTY and exam.created_by_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to monitor this exam")

        now = datetime.now(timezone.utc)

        # When active_only is requested for live proctoring, verify the examination is actively open
        if active_only:
            if exam.status != ExamStatus.PUBLISHED:
                return []
            if exam.availability_type == AvailabilityType.SCHEDULED:
                if exam.start_time and now < exam.start_time:
                    return []
                if exam.end_time and now > exam.end_time:
                    return []

        query = select(ExamAttempt).where(ExamAttempt.exam_id == exam_id)
        if active_only:
            query = query.where(
                ExamAttempt.status == AttemptStatus.IN_PROGRESS,
                ExamAttempt.submitted_at.is_(None)
            )

        query = query.options(
            selectinload(ExamAttempt.student).selectinload(User.student_profile),
            selectinload(ExamAttempt.violations),
            selectinload(ExamAttempt.media_session)
        ).order_by(ExamAttempt.started_at.desc())

        attempts_result = await db.execute(query)
        attempts = attempts_result.scalars().all()

        # Query latest proctoring events and risk scores to obtain current face_count, identity_state, and risk levels
        attempt_ids = [att.id for att in attempts]
        latest_events_map = {}
        risk_scores_map = {}
        inv_map = {}
        if attempt_ids:
            from app.features.proctoring.models import ProctoringEvent, StudentRiskScore, ExaminationInvestigation
            pe_res = await db.execute(
                select(ProctoringEvent)
                .where(ProctoringEvent.exam_attempt_id.in_(attempt_ids))
                .order_by(ProctoringEvent.detected_at.desc())
            )
            for pe in pe_res.scalars().all():
                if pe.exam_attempt_id not in latest_events_map:
                    latest_events_map[pe.exam_attempt_id] = pe

            rs_res = await db.execute(
                select(StudentRiskScore).where(StudentRiskScore.exam_attempt_id.in_(attempt_ids))
            )
            for rs in rs_res.scalars().all():
                risk_scores_map[rs.exam_attempt_id] = rs

            inv_res = await db.execute(
                select(ExaminationInvestigation).where(ExaminationInvestigation.exam_attempt_id.in_(attempt_ids))
            )
            for inv in inv_res.scalars().all():
                inv_map[inv.exam_attempt_id] = inv

        monitoring_data = []
        seen_student_ids = set()

        for att in attempts:
            if active_only:
                # 1. Deduplicate by student: each candidate only appears once in the live monitor grid
                if att.student_id in seen_student_ids:
                    continue
                seen_student_ids.add(att.student_id)

                # 2. Check if candidate's allotted exam duration has lapsed
                duration_mins = exam.duration_minutes or 60
                attempt_cutoff = att.started_at + timedelta(minutes=duration_mins + 2)
                if now > attempt_cutoff:
                    # Attempt duration has lapsed; candidate is not actively taking the test
                    continue

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

            latest_pe = latest_events_map.get(att.id)
            current_face_count = latest_pe.face_count if latest_pe else (1 if att.identity_verified else 0)
            current_identity_state = latest_pe.event_type if latest_pe else ("NORMAL_VERIFIED" if att.identity_verified else "UNKNOWN")

            rs_obj = risk_scores_map.get(att.id)
            inv_obj = inv_map.get(att.id)
            r_score = rs_obj.current_score if rs_obj else (inv_obj.final_risk_score if inv_obj else 0.0)
            r_level = rs_obj.risk_level if rs_obj else (inv_obj.risk_classification if inv_obj else "LOW")
            i_count = rs_obj.incident_count if rs_obj else (inv_obj.total_incidents if inv_obj else 0)
            inv_status = inv_obj.investigation_status if inv_obj else ("CLEARED" if r_score == 0.0 else "PENDING_REVIEW")

            # New AI Assessment & Publication fields
            if inv_obj and inv_obj.overall_risk_level and inv_obj.overall_risk_level != "INSUFFICIENT_EVIDENCE":
                overall_risk = inv_obj.overall_risk_level
            elif inv_obj and inv_obj.overall_risk_level == "INSUFFICIENT_EVIDENCE" and (r_score == 0.0 and len(att.violations or []) == 0):
                overall_risk = "LOW_RISK"
            else:
                overall_risk = (
                    "HIGH_RISK" if r_level in ["HIGH", "CRITICAL"] else ("MODERATE_RISK" if r_level == "MEDIUM" else "LOW_RISK")
                )
            high_conf = inv_obj.high_confidence_count if inv_obj else 0
            suspicious_c = inv_obj.low_confidence_count if inv_obj else 0

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
                    max_rejoins=exam.max_rejoins if exam else 2,
                    face_count=current_face_count,
                    identity_state=current_identity_state,
                    risk_score=r_score,
                    risk_level=r_level,
                    incident_count=i_count,
                    investigation_status=inv_status,
                    overall_risk_level=overall_risk,
                    high_confidence_count=high_conf,
                    suspicious_count=suspicious_c,
                    publication_status=att.publication_status or "UNPUBLISHED",
                    integrity_status=att.integrity_status or "CLEARED",
                    evaluated_score=att.total_score,
                    max_possible_score=att.max_possible_score,
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
    def _get_student_integrity_message(attempt: ExamAttempt, investigation: Optional[Any] = None) -> str:
        pub_status = getattr(attempt, "publication_status", "UNPUBLISHED")
        integ_status = getattr(attempt, "integrity_status", "PENDING_REVIEW")

        # Case 0: Disqualified Attempt (Highest Priority)
        if integ_status == "DISQUALIFIED" or pub_status == "DISQUALIFIED":
            return (
                "This examination attempt has been formally disqualified by course faculty due to confirmed academic integrity policy infractions. "
                "A grade of zero (0) has been permanently recorded and detailed responses have been voided."
            )

        # Case 2: Review completed, cleared, results published
        if pub_status == "PUBLISHED":
            return "Your examination assessment is complete. Your verified results are now available."

        # Case 4: Disciplinary inquiry
        if integ_status in ("VIOLATION_CONFIRMED",):
            return (
                "Your examination record has been referred for formal academic integrity review. "
                "Results for this examination are withheld pending the outcome of the inquiry. "
                "You will be contacted via your registered university email."
            )

        # Case 3: Under detailed review / high risk
        if integ_status == "UNDER_INVESTIGATION" or (
            investigation and (
                getattr(investigation, "overall_risk_level", "") in ("HIGH_RISK", "CRITICAL_RISK")
                or getattr(investigation, "final_risk_score", 0.0) >= 50.0
            )
        ):
            return (
                "Your examination attempt is currently undergoing detailed academic review. "
                "Please allow additional time for processing. "
                "Your department will notify you if any clarification is required."
            )

        # Case 5: Results withheld pending batch release / initial review cleared
        if integ_status in ("CLEARED", "CLEAR"):
            return (
                "Your submission was received successfully and initial review is complete. "
                "Examination results will be published once all candidate assessments for this course are finalized."
            )

        # Case 1: Submitted, awaiting review
        return (
            "Your examination submission has been received. "
            "Your responses have been recorded and your examination is queued for routine integrity and academic assessment. "
            "Results will be published after verification."
        )

    @staticmethod
    async def get_student_results(
        db: AsyncSession,
        student_id: str,
        exam_id: Optional[str] = None
    ) -> List[StudentCompletedResultItem]:
        filters = [
            ExamAttempt.student_id == student_id,
            ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EXPIRED])
        ]
        if exam_id:
            filters.append(ExamAttempt.exam_id == exam_id)

        result = await db.execute(
            select(ExamAttempt)
            .where(*filters)
            .options(
                selectinload(ExamAttempt.exam).selectinload(Exam.questions),
                selectinload(ExamAttempt.answers)
            )
            .order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.started_at.desc())
        )
        attempts = result.scalars().all()

        from app.features.proctoring.models import DisqualificationRecord
        disq_map = {}
        if attempts:
            att_ids = [a.id for a in attempts]
            disq_res = await db.execute(
                select(DisqualificationRecord).where(DisqualificationRecord.exam_attempt_id.in_(att_ids))
            )
            for d in disq_res.scalars().all():
                disq_map[d.exam_attempt_id] = d

        items: List[StudentCompletedResultItem] = []
        for att in attempts:
            disq = disq_map.get(att.id)
            is_disq = (
                getattr(att, "publication_status", "") == "DISQUALIFIED"
                or getattr(att, "integrity_status", "") == "DISQUALIFIED"
                or disq is not None
            )
            eval_status, _, _ = AttemptService._calc_evaluation(att)
            max_marks = att.max_possible_score or (att.exam.total_marks if att.exam else 0.0)
            is_pub = (getattr(att, "publication_status", "UNPUBLISHED") == "PUBLISHED" and not is_disq)

            total_score = 0.0 if is_disq else (att.total_score if is_pub else None)
            pct = 0.0 if is_disq else (AttemptService._calc_percentage(att.total_score, max_marks) if is_pub else None)
            max_possible = max_marks if (is_pub or is_disq) else None

            pub_status = "DISQUALIFIED" if is_disq else getattr(att, "publication_status", "UNPUBLISHED")
            integ_status = "DISQUALIFIED" if is_disq else getattr(att, "integrity_status", "PENDING_REVIEW")

            items.append(
                StudentCompletedResultItem(
                    attempt_id=att.id,
                    exam_id=att.exam_id,
                    exam_title=att.exam.title if att.exam else "Exam",
                    attempt_number=att.attempt_number or 1,
                    started_at=att.started_at,
                    submitted_at=att.submitted_at,
                    total_score=total_score,
                    max_possible_score=max_possible,
                    percentage=pct,
                    status=att.status,
                    evaluation_status=eval_status,
                    publication_status=pub_status,
                    integrity_status=integ_status,
                    student_status_message=AttemptService._get_student_integrity_message(att, None) if not is_pub else None,
                    is_disqualified=is_disq,
                    disqualification_reason=disq.reason if disq else ("Academic integrity policy violation" if is_disq else None),
                    disqualification_evidence=disq.evidence_summary if disq else None,
                    disqualified_at=disq.disqualified_at if disq else (att.submitted_at if is_disq else None),
                    is_appealable=disq.is_appealable if disq else is_disq,
                    appeal_status=disq.appeal_status if disq else ("NONE" if is_disq else "NONE"),
                    appeal_reason=getattr(disq, "appeal_reason", None) if disq else None,
                    appeal_submitted_at=getattr(disq, "appeal_submitted_at", None) if disq else None,
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

        is_faculty_or_admin = (current_user.role in (UserRole.FACULTY, UserRole.ADMIN))
        from app.features.proctoring.models import DisqualificationRecord
        disq_rec_res = await db.execute(
            select(DisqualificationRecord).where(DisqualificationRecord.exam_attempt_id == attempt.id)
        )
        disq_rec = disq_rec_res.scalar_one_or_none()

        is_disqualified = (
            (getattr(attempt, "integrity_status", "") == "DISQUALIFIED")
            or (getattr(attempt, "publication_status", "") == "DISQUALIFIED")
            or disq_rec is not None
        )
        is_published = ((getattr(attempt, "publication_status", "UNPUBLISHED") == "PUBLISHED" and not is_disqualified) or is_faculty_or_admin)

        # Fetch investigation to determine status message for student
        from app.features.proctoring.models import ExaminationInvestigation
        inv_res = await db.execute(
            select(ExaminationInvestigation).where(ExaminationInvestigation.exam_attempt_id == attempt.id)
        )
        inv = inv_res.scalar_one_or_none()
        student_status_msg = AttemptService._get_student_integrity_message(attempt, inv)

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
                    correct_answer=q.correct_answer if is_published else None,
                    max_marks=q.marks if is_published else 0.0,
                    negative_marks=(q.negative_marks or 0.0) if is_published else 0.0,
                    explanation=q.explanation if is_published else None,
                    order_index=q.order_index or 0,
                    answer_id=ans.id if ans else None,
                    selected_option=ans.selected_option if ans else None,
                    answer_text=ans.answer_text if ans else None,
                    is_correct=ans.is_correct if (ans and is_published) else None,
                    marks_awarded=ans.marks_awarded if (ans and is_published) else None
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

        final_pub_status = "DISQUALIFIED" if is_disqualified else getattr(attempt, "publication_status", "UNPUBLISHED")
        final_integ_status = "DISQUALIFIED" if is_disqualified else getattr(attempt, "integrity_status", "PENDING_REVIEW")
        final_total_score = 0.0 if is_disqualified else (attempt.total_score if is_published else None)
        final_percentage = 0.0 if is_disqualified else (AttemptService._calc_percentage(attempt.total_score, max_marks) if is_published else None)

        return AttemptReviewResponse(
            attempt_id=attempt.id,
            exam_id=attempt.exam_id,
            exam_title=exam.title,
            student=student_info,
            attempt_number=attempt.attempt_number or 1,
            status=attempt.status,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            total_score=final_total_score,
            max_possible_score=max_marks if (is_published or is_disqualified) else None,
            percentage=final_percentage,
            evaluation_status=eval_status,
            total_questions=len(questions),
            attempted_questions=attempted_count,
            correct_mcq_count=correct_mcq_count if is_published else None,
            publication_status=final_pub_status,
            integrity_status=final_integ_status,
            student_status_message=student_status_msg,
            is_disqualified=is_disqualified,
            disqualification_reason=disq_rec.reason if disq_rec else ("Academic integrity policy violation" if is_disqualified else None),
            disqualification_evidence=disq_rec.evidence_summary if disq_rec else None,
            is_appealable=disq_rec.is_appealable if disq_rec else is_disqualified,
            appeal_status=disq_rec.appeal_status if disq_rec else ("NONE" if is_disqualified else "NONE"),
            appeal_reason=getattr(disq_rec, "appeal_reason", None) if disq_rec else None,
            appeal_submitted_at=getattr(disq_rec, "appeal_submitted_at", None) if disq_rec else None,
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

    @staticmethod
    async def submit_appeal(
        db: AsyncSession,
        attempt_id: str,
        student_id: str,
        reason: str
    ) -> StudentAppealResponse:
        from app.features.proctoring.models import DisqualificationRecord, Notification
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(selectinload(ExamAttempt.exam))
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to appeal this attempt")

        disq_res = await db.execute(
            select(DisqualificationRecord).where(DisqualificationRecord.exam_attempt_id == attempt_id)
        )
        disq = disq_res.scalar_one_or_none()
        if not disq:
            if attempt.publication_status == "DISQUALIFIED" or attempt.integrity_status == "DISQUALIFIED":
                disq = DisqualificationRecord(
                    exam_attempt_id=attempt.id,
                    exam_id=attempt.exam_id,
                    student_id=student_id,
                    faculty_id=attempt.exam.created_by_id if attempt.exam else student_id,
                    reason="Academic integrity policy violation",
                    evidence_summary="Disqualified based on proctoring evidence review",
                    final_risk_score=0.0,
                    is_appealable=True,
                    appeal_status="NONE"
                )
                db.add(disq)
                await db.flush()
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only disqualified attempts are eligible for academic appeal")

        if not disq.is_appealable:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This disqualification decision is final and non-appealable")

        if disq.appeal_status == "PENDING_REVIEW":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An appeal is already under review for this attempt")

        now = datetime.now(timezone.utc)
        disq.appeal_status = "PENDING_REVIEW"
        disq.appeal_reason = reason.strip()
        disq.appeal_submitted_at = now

        # Create notification for faculty
        st_res = await db.execute(select(User).where(User.id == student_id))
        student = st_res.scalar_one_or_none()
        st_name = student.name if student else "Candidate"
        exam_title = attempt.exam.title if attempt.exam else "Examination"

        notif = Notification(
            user_id=disq.faculty_id,
            exam_id=attempt.exam_id,
            exam_attempt_id=attempt.id,
            type="INVESTIGATION_ALERT",
            title=f"Academic Appeal Submitted — {st_name}",
            message=f"Student {st_name} has requested an appeal for disqualified Attempt #{attempt.attempt_number} in '{exam_title}'. Reason: {reason.strip()[:200]}"
        )
        db.add(notif)
        await db.commit()

        return StudentAppealResponse(
            message="Appeal request submitted successfully. The review committee and course faculty have been notified.",
            attempt_id=attempt_id,
            appeal_status="PENDING_REVIEW",
            appeal_submitted_at=now
        )

    @staticmethod
    async def decide_appeal(
        db: AsyncSession,
        attempt_id: str,
        faculty_id: str,
        decision: str,
        notes: Optional[str] = None
    ) -> FacultyAppealDecisionResponse:
        from app.features.proctoring.models import DisqualificationRecord, Notification
        disq_res = await db.execute(
            select(DisqualificationRecord).where(DisqualificationRecord.exam_attempt_id == attempt_id)
        )
        disq = disq_res.scalar_one_or_none()
        if not disq:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No disqualification record found")

        att_res = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(selectinload(ExamAttempt.answers))
        )
        attempt = att_res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        now = datetime.now(timezone.utc)
        disq.appeal_resolution_notes = notes

        if decision.upper() == "APPROVED":
            disq.appeal_status = "APPROVED"
            attempt.publication_status = "UNPUBLISHED"
            attempt.integrity_status = "CLEARED"
            total = sum((a.marks_awarded or 0.0) for a in (attempt.answers or []))
            attempt.total_score = total
            notif_msg = f"Your appeal for Attempt #{attempt.attempt_number} has been APPROVED by faculty. Disqualification has been cleared."
        else:
            disq.appeal_status = "REJECTED"
            notif_msg = f"Your appeal for Attempt #{attempt.attempt_number} has been reviewed and REJECTED. The disqualification decision stands."

        notif = Notification(
            user_id=attempt.student_id,
            exam_id=attempt.exam_id,
            exam_attempt_id=attempt.id,
            type="STATUS_UPDATE",
            title=f"Appeal Verdict: {disq.appeal_status}",
            message=notif_msg
        )
        db.add(notif)
        await db.commit()

        return FacultyAppealDecisionResponse(
            message=f"Appeal {decision.lower()} successfully",
            attempt_id=attempt_id,
            appeal_status=disq.appeal_status,
            publication_status=attempt.publication_status,
            integrity_status=attempt.integrity_status
        )

