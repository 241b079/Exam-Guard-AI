import csv
import io
from typing import List, Optional
from fastapi import HTTPException, status, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.questions.models import Question, QuestionType
from app.features.questions.schemas import (
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
    QuestionImportRow,
    QuestionImportPreviewResponse
)
from app.features.exams.service import ExamService


class QuestionService:
    @staticmethod
    async def create_question(db: AsyncSession, exam_id: str, req: QuestionCreate, faculty_id: str) -> QuestionResponse:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if exam.created_by_id != faculty_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to edit this exam")

        QuestionService._validate_question_data(req.question_type, req.question_text, req.options, req.correct_answer, req.marks)

        question = Question(
            exam_id=exam_id,
            question_type=req.question_type,
            question_text=req.question_text,
            options=req.options or [],
            correct_answer=req.correct_answer,
            marks=req.marks,
            negative_marks=req.negative_marks,
            explanation=req.explanation,
            order_index=req.order_index
        )
        db.add(question)
        await db.commit()
        await db.refresh(question)

        # Update exam total marks
        await db.refresh(exam)
        exam.total_marks = ExamService.recalculate_total_marks(exam)
        await db.commit()

        return QuestionResponse.model_validate(question)

    @staticmethod
    async def get_questions_by_exam(db: AsyncSession, exam_id: str) -> List[QuestionResponse]:
        result = await db.execute(
            select(Question)
            .where(Question.exam_id == exam_id)
            .order_by(Question.order_index.asc(), Question.created_at.asc())
        )
        questions = result.scalars().all()
        return [QuestionResponse.model_validate(q) for q in questions]

    @staticmethod
    async def update_question(db: AsyncSession, question_id: str, req: QuestionUpdate, faculty_id: str) -> QuestionResponse:
        result = await db.execute(select(Question).where(Question.id == question_id))
        question = result.scalar_one_or_none()
        if not question:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        exam = await ExamService.get_by_id(db, question.exam_id)
        if not exam or exam.created_by_id != faculty_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to edit this question")

        q_type = req.question_type or question.question_type
        q_text = req.question_text or question.question_text
        q_opts = req.options if req.options is not None else question.options
        q_ans = req.correct_answer or question.correct_answer
        q_marks = req.marks if req.marks is not None else question.marks

        QuestionService._validate_question_data(q_type, q_text, q_opts, q_ans, q_marks)

        for key, value in req.model_dump(exclude_unset=True).items():
            setattr(question, key, value)

        await db.commit()
        await db.refresh(question)

        # Recalculate total marks
        await db.refresh(exam)
        exam.total_marks = ExamService.recalculate_total_marks(exam)
        await db.commit()

        return QuestionResponse.model_validate(question)

    @staticmethod
    async def delete_question(db: AsyncSession, question_id: str, faculty_id: str) -> None:
        result = await db.execute(select(Question).where(Question.id == question_id))
        question = result.scalar_one_or_none()
        if not question:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        exam = await ExamService.get_by_id(db, question.exam_id)
        if not exam or exam.created_by_id != faculty_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this question")

        await db.delete(question)
        await db.commit()

        # Recalculate total marks
        await db.refresh(exam)
        exam.total_marks = ExamService.recalculate_total_marks(exam)
        await db.commit()

    @staticmethod
    async def parse_and_validate_import_file(file: UploadFile) -> QuestionImportPreviewResponse:
        content = await file.read()
        filename = file.filename.lower()

        parsed_rows = []

        if filename.endswith(".csv"):
            text_stream = io.StringIO(content.decode("utf-8-sig", errors="ignore"))
            reader = csv.DictReader(text_stream)
            row_num = 1
            for row in reader:
                row_num += 1
                parsed_rows.append(QuestionService._parse_row_dict(row, row_num))
        else:
            # Fallback simple CSV parsing if extension not explicitly .csv
            text_stream = io.StringIO(content.decode("utf-8", errors="ignore"))
            reader = csv.DictReader(text_stream)
            row_num = 1
            for row in reader:
                row_num += 1
                parsed_rows.append(QuestionService._parse_row_dict(row, row_num))

        valid_count = sum(1 for r in parsed_rows if r.is_valid)
        invalid_count = sum(1 for r in parsed_rows if not r.is_valid)

        return QuestionImportPreviewResponse(
            total_rows=len(parsed_rows),
            valid_count=valid_count,
            invalid_count=invalid_count,
            rows=parsed_rows
        )

    @staticmethod
    async def commit_imported_questions(db: AsyncSession, exam_id: str, rows: List[QuestionImportRow], faculty_id: str) -> List[QuestionResponse]:
        exam = await ExamService.get_by_id(db, exam_id)
        if not exam or exam.created_by_id != faculty_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to import to this exam")

        created_questions = []
        for index, row in enumerate(rows):
            if not row.is_valid:
                continue

            q_type = QuestionType.MCQ if row.question_type.upper() == "MCQ" else QuestionType.SHORT_ANSWER
            question = Question(
                exam_id=exam_id,
                question_type=q_type,
                question_text=row.question_text,
                options=row.options or [],
                correct_answer=row.correct_answer,
                marks=row.marks,
                negative_marks=row.negative_marks,
                explanation=row.explanation,
                order_index=index
            )
            db.add(question)
            created_questions.append(question)

        await db.commit()
        await db.refresh(exam)
        exam.total_marks = ExamService.recalculate_total_marks(exam)
        await db.commit()

        return [QuestionResponse.model_validate(q) for q in created_questions]

    @staticmethod
    def _parse_row_dict(row: dict, row_num: int) -> QuestionImportRow:
        # Standardize keys
        lowered = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items() if k}
        
        q_type_str = lowered.get("type") or lowered.get("question_type") or "MCQ"
        q_text = lowered.get("question") or lowered.get("question_text") or ""
        marks_str = lowered.get("marks") or "1.0"
        neg_marks_str = lowered.get("negative_marks") or "0.0"
        ans_str = lowered.get("correct") or lowered.get("correct_answer") or lowered.get("expected_answer") or ""
        explanation = lowered.get("explanation") or ""

        errors = []

        if not q_text:
            errors.append("Question text is required.")

        try:
            marks = float(marks_str)
            if marks <= 0:
                errors.append("Marks must be greater than 0.")
        except ValueError:
            marks = 1.0
            errors.append("Invalid marks value.")

        try:
            neg_marks = float(neg_marks_str)
            if neg_marks < 0:
                errors.append("Negative marks cannot be negative.")
        except ValueError:
            neg_marks = 0.0

        options = []
        if q_type_str.upper() == "MCQ":
            for opt_key in ["option a", "option b", "option c", "option d", "option e", "option f"]:
                if opt_key in lowered and lowered[opt_key]:
                    options.append(lowered[opt_key])
            
            # If comma separated options provided
            if not options and "options" in lowered and lowered["options"]:
                options = [o.strip() for o in lowered["options"].split(",") if o.strip()]

            if len(options) < 2:
                errors.append("MCQ requires at least 2 options (Option A, Option B).")

            if not ans_str:
                errors.append("Correct answer is missing.")

        elif q_type_str.upper() in ["SHORT_ANSWER", "SHORT ANSWER", "SA"]:
            q_type_str = "SHORT_ANSWER"
            if not ans_str:
                errors.append("Expected answer is missing.")
        else:
            errors.append("Invalid question type. Must be 'MCQ' or 'SHORT_ANSWER'.")

        return QuestionImportRow(
            row_number=row_num,
            question_type=q_type_str.upper(),
            question_text=q_text,
            options=options,
            correct_answer=ans_str,
            marks=marks,
            negative_marks=neg_marks,
            explanation=explanation,
            is_valid=len(errors) == 0,
            errors=errors
        )

    @staticmethod
    def _validate_question_data(q_type: QuestionType, text: str, options: Optional[List[str]], correct_ans: str, marks: float):
        if not text.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Question text cannot be empty")
        if marks <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Marks must be greater than 0")

        if q_type == QuestionType.MCQ:
            if not options or len(options) < 2:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MCQ question requires at least 2 options")
            if len(options) > 6:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MCQ question allows maximum 6 options")
            if not correct_ans.strip():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Correct answer must be specified for MCQ")
        elif q_type == QuestionType.SHORT_ANSWER:
            if not correct_ans.strip():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expected answer must be specified for Short Answer")
