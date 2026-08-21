from typing import List
from fastapi import APIRouter, Depends, status, Body
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.proctoring.schemas import (
    LogProctoringEventRequest,
    ProctoringEventResponse,
    LiveExamProctoringResponse,
    ProctoringOverviewItem
)
from app.features.proctoring.service import ProctoringService

router = APIRouter(prefix="/proctoring", tags=["Proctoring"])


@router.post("/events", response_model=ProctoringEventResponse, status_code=status.HTTP_201_CREATED)
async def log_proctoring_event(
    req: LogProctoringEventRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await ProctoringService.log_event(db, student_id=current_user.id, req=req)


@router.get("/exams/{exam_id}/live", response_model=LiveExamProctoringResponse)
async def get_exam_live_proctoring(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await ProctoringService.get_exam_live_feed(db, exam_id=exam_id)


@router.get("/attempts/{attempt_id}/events", response_model=List[ProctoringEventResponse])
async def get_attempt_proctoring_events(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await ProctoringService.get_attempt_events(db, attempt_id=attempt_id)


@router.get("/overview", response_model=List[ProctoringOverviewItem])
async def get_proctoring_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await ProctoringService.get_proctoring_overview(db)


@router.post("/attempts/{attempt_id}/terminate")
async def terminate_attempt_by_proctor(
    attempt_id: str,
    reason: str = Body(default="Security Violation", embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    await ProctoringService.terminate_attempt(db, attempt_id=attempt_id, reason=reason)
    return {"status": "success", "message": "Attempt terminated by proctor"}
