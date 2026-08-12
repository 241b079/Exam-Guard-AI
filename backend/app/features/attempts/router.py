from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.attempts.schemas import (
    SaveAnswerRequest,
    AnswerResponse,
    AttemptResponse,
    SubmitAttemptResponse
)
from app.features.attempts.service import AttemptService

router = APIRouter(tags=["Attempts"])


@router.post("/exams/{exam_id}/attempts", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
async def start_or_resume_attempt(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.start_or_get_attempt(db, exam_id, student_id=current_user.id)


@router.get("/attempts/{attempt_id}", response_model=AttemptResponse)
async def get_attempt(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await AttemptService.get_attempt_by_id(db, attempt_id, student_id=current_user.id)


@router.post("/attempts/{attempt_id}/answers", response_model=AnswerResponse)
async def save_answer(
    attempt_id: str,
    req: SaveAnswerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.save_answer(db, attempt_id, req, student_id=current_user.id)


@router.post("/attempts/{attempt_id}/submit", response_model=SubmitAttemptResponse)
async def submit_attempt(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.submit_attempt(db, attempt_id, student_id=current_user.id)
