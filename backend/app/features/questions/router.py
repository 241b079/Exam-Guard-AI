from typing import List
from fastapi import APIRouter, Depends, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.questions.schemas import (
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
    QuestionImportRow,
    QuestionImportPreviewResponse
)
from app.features.questions.service import QuestionService

router = APIRouter(tags=["Questions"])


@router.post("/exams/{exam_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    exam_id: str,
    req: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await QuestionService.create_question(db, exam_id, req, faculty_id=current_user.id)


@router.get("/exams/{exam_id}/questions", response_model=List[QuestionResponse])
async def get_questions(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await QuestionService.get_questions_by_exam(db, exam_id)


@router.put("/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: str,
    req: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await QuestionService.update_question(db, question_id, req, faculty_id=current_user.id)


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    await QuestionService.delete_question(db, question_id, faculty_id=current_user.id)


@router.post("/exams/{exam_id}/questions/import/preview", response_model=QuestionImportPreviewResponse)
async def preview_import_questions(
    exam_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await QuestionService.parse_and_validate_import_file(file)


@router.post("/exams/{exam_id}/questions/import", response_model=List[QuestionResponse])
async def commit_import_questions(
    exam_id: str,
    rows: List[QuestionImportRow],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await QuestionService.commit_imported_questions(db, exam_id, rows, faculty_id=current_user.id)
