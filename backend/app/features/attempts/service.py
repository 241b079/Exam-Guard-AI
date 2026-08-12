from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.attempts.models import ExamAttempt, Answer, AttemptStatus
from app.features.attempts.schemas import (
    SaveAnswerRequest,
    AnswerResponse,
    AttemptResponse,
    SubmitAttemptResponse
)
from app.features.exams.models import Exam, NegativeMarkingType
from app.features.exams.service import ExamService
from app.features.questions.models import Question, QuestionType


class AttemptService:
    @staticmethod
    async def start_or_get_attempt(db: AsyncSession, exam_id: str, student_id: str) -> AttemptResponse:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        if exam.status != "PUBLISHED":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Exam is not published")

        # Check existing attempt
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.exam_id == exam_id, ExamAttempt.student_id == student_id)
            .options(selectinload(ExamAttempt.answers))
        )
        attempt = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)

        if not attempt:
            attempt = ExamAttempt(
                exam_id=exam_id,
                student_id=student_id,
                started_at=now,
                status=AttemptStatus.IN_PROGRESS
            )
            db.add(attempt)
            await db.commit()
            await db.refresh(attempt)

        # Calculate time remaining
        elapsed_seconds = int((now - attempt.started_at).total_seconds())
        total_allowed_seconds = exam.duration_minutes * 60
        remaining_seconds = max(0, total_allowed_seconds - elapsed_seconds)

        # Auto-expire if time exceeded
        if remaining_seconds <= 0 and attempt.status == AttemptStatus.IN_PROGRESS:
            if exam.auto_submit:
                return await AttemptService.submit_attempt(db, attempt.id, student_id)
            else:
                attempt.status = AttemptStatus.EXPIRED
                await db.commit()

        return AttemptService._to_response(attempt, remaining_seconds)

    @staticmethod
    async def get_attempt_by_id(db: AsyncSession, attempt_id: str, student_id: str) -> AttemptResponse:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(selectinload(ExamAttempt.answers), selectinload(ExamAttempt.exam))
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this attempt")

        now = datetime.now(timezone.utc)
        elapsed_seconds = int((now - attempt.started_at).total_seconds())
        total_allowed_seconds = attempt.exam.duration_minutes * 60
        remaining_seconds = max(0, total_allowed_seconds - elapsed_seconds)

        return AttemptService._to_response(attempt, remaining_seconds)

    @staticmethod
    async def save_answer(db: AsyncSession, attempt_id: str, req: SaveAnswerRequest, student_id: str) -> AnswerResponse:
        result = await db.execute(
            select(ExamAttempt)
            .where(ExamAttempt.id == attempt_id)
            .options(selectinload(ExamAttempt.answers))
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        if attempt.student_id != student_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt is already submitted or expired")

        # Find existing answer or create new
        ans_res = await db.execute(
            select(Answer).where(Answer.attempt_id == attempt_id, Answer.question_id == req.question_id)
        )
        answer = ans_res.scalar_one_or_none()

        if not answer:
            answer = Answer(
                attempt_id=attempt_id,
                question_id=req.question_id,
                selected_option=req.selected_option,
                answer_text=req.answer_text,
                is_marked_for_review=req.is_marked_for_review
            )
            db.add(answer)
        else:
            answer.selected_option = req.selected_option
            answer.answer_text = req.answer_text
            answer.is_marked_for_review = req.is_marked_for_review

        await db.commit()
        await db.refresh(answer)
        return AnswerResponse.model_validate(answer)

    @staticmethod
    async def submit_attempt(db: AsyncSession, attempt_id: str, student_id: str) -> SubmitAttemptResponse:
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

        if attempt.status == AttemptStatus.SUBMITTED:
            # Already submitted, return results
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

            # Question attempted check
            has_answered = False
            if q.question_type == QuestionType.MCQ and ans.selected_option and ans.selected_option.strip():
                has_answered = True
            elif q.question_type == QuestionType.SHORT_ANSWER and ans.answer_text and ans.answer_text.strip():
                has_answered = True

            if has_answered:
                attempted_count += 1

            # Auto-grade MCQ
            if q.question_type == QuestionType.MCQ:
                if ans.selected_option and ans.selected_option.strip() == q.correct_answer.strip():
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
    def _to_response(attempt: ExamAttempt, remaining_seconds: int) -> AttemptResponse:
        answers_resp = [AnswerResponse.model_validate(a) for a in (attempt.answers or [])]
        return AttemptResponse(
            id=attempt.id,
            exam_id=attempt.exam_id,
            student_id=attempt.student_id,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            status=attempt.status,
            total_score=attempt.total_score,
            max_possible_score=attempt.max_possible_score,
            answers=answers_resp,
            time_remaining_seconds=remaining_seconds
        )

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
