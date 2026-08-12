from typing import List, Optional
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.exams.models import Exam, ExamStatus
from app.features.exams.schemas import ExamCreate, ExamUpdate, ExamResponse
from app.features.questions.models import Question, QuestionType
from app.features.users.models import User, UserRole


class ExamService:
    @staticmethod
    async def get_by_id(db: AsyncSession, exam_id: str) -> Optional[Exam]:
        result = await db.execute(
            select(Exam).where(Exam.id == exam_id).options(selectinload(Exam.questions))
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create_exam(db: AsyncSession, req: ExamCreate, creator_id: str) -> ExamResponse:
        exam = Exam(
            title=req.title,
            description=req.description,
            duration_minutes=req.duration_minutes,
            negative_marking=req.negative_marking,
            auto_submit=req.auto_submit,
            display_countdown=req.display_countdown,
            assignment_type=req.assignment_type,
            assigned_student_ids=req.assigned_student_ids or [],
            availability_type=req.availability_type,
            start_time=req.start_time,
            end_time=req.end_time,
            status=ExamStatus.DRAFT,
            created_by_id=creator_id,
            total_marks=0.0
        )
        db.add(exam)
        await db.commit()
        await db.refresh(exam)
        return ExamService._to_response(exam)

    @staticmethod
    async def get_faculty_exams(db: AsyncSession, faculty_id: str) -> List[ExamResponse]:
        result = await db.execute(
            select(Exam)
            .where(Exam.created_by_id == faculty_id)
            .options(selectinload(Exam.questions))
            .order_by(Exam.created_at.desc())
        )
        exams = result.scalars().all()
        return [ExamService._to_response(e) for e in exams]

    @staticmethod
    async def get_student_exams(db: AsyncSession, student_id: str) -> List[ExamResponse]:
        """Returns published exams available to the logged-in student."""
        result = await db.execute(
            select(Exam)
            .where(Exam.status == ExamStatus.PUBLISHED)
            .options(selectinload(Exam.questions))
            .order_by(Exam.created_at.desc())
        )
        all_published = result.scalars().all()
        
        available = []
        for e in all_published:
            if e.assignment_type == "SELECTED_STUDENTS":
                if student_id not in (e.assigned_student_ids or []):
                    continue
            available.append(ExamService._to_response(e))
        return available

    @staticmethod
    async def update_exam(db: AsyncSession, exam_id: str, req: ExamUpdate, faculty_id: str) -> ExamResponse:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if exam.created_by_id != faculty_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to edit this exam")

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(exam, key, value)

        await db.commit()
        await db.refresh(exam)
        return ExamService._to_response(exam)

    @staticmethod
    async def delete_exam(db: AsyncSession, exam_id: str, faculty_id: str) -> None:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if exam.created_by_id != faculty_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this exam")

        await db.delete(exam)
        await db.commit()

    @staticmethod
    async def publish_exam(db: AsyncSession, exam_id: str, faculty_id: str) -> ExamResponse:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if exam.created_by_id != faculty_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to publish this exam")

        # Validation rules before publishing
        if not exam.title or not exam.duration_minutes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam title and duration are required")

        if not exam.questions or len(exam.questions) == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot publish an exam without questions. Please add at least one question.")

        for q in exam.questions:
            if not q.question_text:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Question '{q.id}' missing question text")
            if q.question_type == QuestionType.MCQ:
                if not q.options or len(q.options) < 2:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"MCQ Question '{q.question_text[:30]}' requires at least 2 options")
                if not q.correct_answer:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"MCQ Question '{q.question_text[:30]}' requires a correct answer selected")

        exam.status = ExamStatus.PUBLISHED
        await db.commit()
        await db.refresh(exam)
        return ExamService._to_response(exam)

    @staticmethod
    def recalculate_total_marks(exam: Exam) -> float:
        if not exam.questions:
            return 0.0
        return sum(q.marks for q in exam.questions)

    @staticmethod
    def _to_response(exam: Exam) -> ExamResponse:
        q_count = len(exam.questions) if exam.questions else 0
        tot_marks = sum(q.marks for q in exam.questions) if exam.questions else exam.total_marks
        return ExamResponse(
            id=exam.id,
            title=exam.title,
            description=exam.description,
            duration_minutes=exam.duration_minutes,
            total_marks=tot_marks,
            status=exam.status,
            negative_marking=exam.negative_marking,
            auto_submit=exam.auto_submit,
            display_countdown=exam.display_countdown,
            assignment_type=exam.assignment_type,
            assigned_student_ids=exam.assigned_student_ids or [],
            availability_type=exam.availability_type,
            start_time=exam.start_time,
            end_time=exam.end_time,
            created_by_id=exam.created_by_id,
            question_count=q_count,
            created_at=exam.created_at,
            updated_at=exam.updated_at
        )
