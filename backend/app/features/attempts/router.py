from typing import List
from fastapi import APIRouter, Depends, status, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, AsyncSessionLocal

from app.core.security import decode_token
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.exams.service import ExamService
from app.features.attempts.models import ExamAttempt
from app.features.attempts.schemas import (
    SaveAnswerRequest,
    AnswerResponse,
    AttemptResponse,
    SubmitAttemptResponse,
    CreateViolationRequest,
    ViolationResponse,
    AttemptMonitoringResponse,
    MediaSessionResponse,
    UpdateMediaStatusRequest,
)
from app.features.attempts.service import AttemptService
from app.features.proctoring.signaling import signaling_manager

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


@router.post("/attempts/{attempt_id}/violations", response_model=ViolationResponse, status_code=status.HTTP_201_CREATED)
async def record_violation(
    attempt_id: str,
    req: CreateViolationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.record_violation(db, attempt_id, req, student_id=current_user.id)


@router.get("/attempts/{attempt_id}/violations", response_model=List[ViolationResponse])
async def get_violations(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await AttemptService.get_violations(db, attempt_id, current_user=current_user)


@router.get("/exams/{exam_id}/attempts-monitoring", response_model=List[AttemptMonitoringResponse])
async def get_exam_monitoring(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await AttemptService.get_exam_monitoring(db, exam_id, current_user=current_user)


@router.post("/attempts/{attempt_id}/media-session", response_model=MediaSessionResponse)
async def get_or_create_media_session(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.get_or_create_media_session(db, attempt_id, student_id=current_user.id)


@router.patch("/attempts/{attempt_id}/media-session", response_model=MediaSessionResponse)
async def update_media_session(
    attempt_id: str,
    req: UpdateMediaStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.update_media_session(db, attempt_id, req, student_id=current_user.id)


@router.websocket("/exams/{exam_id}/ws")
async def exam_webrtc_signaling_ws(
    websocket: WebSocket,
    exam_id: str,
    attempt_id: str,
    token: str,
):
    # Verify token
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        user_role = payload.get("role")
    except Exception:
        await websocket.close(code=4403, reason="Invalid authentication token")
        return

    async with AsyncSessionLocal() as db:

        if user_role == UserRole.STUDENT:
            # Student must own the attempt and exam_id must match
            result = await db.execute(
                select(ExamAttempt).where(ExamAttempt.id == attempt_id)
            )
            attempt = result.scalar_one_or_none()
            if not attempt or attempt.student_id != user_id or attempt.exam_id != exam_id:
                await websocket.close(code=4403, reason="Unauthorized student access")
                return

            await signaling_manager.connect_student(attempt_id, websocket)
            try:
                while True:
                    data = await websocket.receive_json()
                    await signaling_manager.forward_to_faculty(attempt_id, data)
                    if data.get("type") == "media_status":
                        await AttemptService.update_media_session(
                            db,
                            attempt_id,
                            UpdateMediaStatusRequest(
                                camera_active=data.get("camera"),
                                mic_active=data.get("mic"),
                                screen_active=data.get("screen")
                            ),
                            student_id=user_id
                        )
            except WebSocketDisconnect:
                await signaling_manager.disconnect(attempt_id, websocket)
            except Exception:
                await signaling_manager.disconnect(attempt_id, websocket)

        elif user_role in [UserRole.FACULTY, UserRole.ADMIN]:
            # Faculty must be creator of the exam (or admin)
            exam = await ExamService.get_by_id(db, exam_id)
            if not exam:
                await websocket.close(code=4404, reason="Exam not found")
                return
            if user_role == UserRole.FACULTY and exam.created_by_id != user_id:
                await websocket.close(code=4403, reason="Unauthorized faculty access")
                return

            await signaling_manager.connect_faculty(attempt_id, websocket)
            try:
                while True:
                    data = await websocket.receive_json()
                    await signaling_manager.forward_to_student(attempt_id, data)
            except WebSocketDisconnect:
                await signaling_manager.disconnect(attempt_id, websocket)
            except Exception:
                await signaling_manager.disconnect(attempt_id, websocket)
        else:
            await websocket.close(code=4403, reason="Unauthorized role")
