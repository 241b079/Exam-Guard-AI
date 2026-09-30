from typing import List, Optional
from fastapi import APIRouter, Depends, status, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, AsyncSessionLocal

from app.core.security import decode_token
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.exams.service import ExamService
from app.features.attempts.models import ExamAttempt, AttemptStatus
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
    StartOrResumeAttemptRequest,
    StudentActiveExamSummary,
    StudentExamStatusResponse,
    GradebookEntry,
    ExamGradebookResponse,
    StudentCompletedResultItem,
    AttemptReviewResponse,
    ManualGradeRequest,
    ManualGradeResponse,
)
from app.features.attempts.service import AttemptService
from app.features.proctoring.signaling import signaling_manager

router = APIRouter(tags=["Attempts"])


@router.get("/student/active-exam", response_model=Optional[StudentActiveExamSummary])
async def get_student_active_exam(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.get_student_active_attempt(db, current_user.id)


@router.get("/exams/{exam_id}/student-status", response_model=StudentExamStatusResponse)
async def get_student_exam_status(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.get_student_exam_status(db, exam_id, current_user.id)


@router.post("/exams/{exam_id}/attempts", response_model=AttemptResponse, status_code=status.HTTP_201_CREATED)
async def start_or_resume_attempt(
    exam_id: str,
    req: Optional[StartOrResumeAttemptRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    session_token = req.session_token if req else None
    is_rejoin = req.is_rejoin if req else False
    return await AttemptService.start_or_get_attempt(
        db, exam_id, student_id=current_user.id, session_token=session_token, is_rejoin=is_rejoin
    )


@router.post("/attempts/{attempt_id}/rejoin", response_model=AttemptResponse)
async def rejoin_attempt(
    attempt_id: str,
    req: Optional[StartOrResumeAttemptRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    session_token = req.session_token if req else None
    return await AttemptService.rejoin_attempt(
        db, attempt_id, student_id=current_user.id, session_token=session_token
    )


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


@router.get("/student/results", response_model=List[StudentCompletedResultItem])
async def get_student_results(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.get_student_results(db, student_id=current_user.id)


@router.get("/exams/{exam_id}/my-result", response_model=AttemptReviewResponse)
async def get_my_exam_result(
    exam_id: str,
    attempt_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    return await AttemptService.get_my_exam_result(
        db, exam_id=exam_id, student_id=current_user.id, attempt_id=attempt_id
    )


@router.get("/exams/{exam_id}/gradebook", response_model=ExamGradebookResponse)
async def get_exam_gradebook(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await AttemptService.get_exam_gradebook(db, exam_id=exam_id, current_user=current_user)


@router.get("/faculty/results/recent", response_model=List[GradebookEntry])
async def get_faculty_recent_results(
    limit: int = Query(15, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await AttemptService.get_faculty_recent_results(db, current_user=current_user, limit=limit)


@router.get("/attempts/{attempt_id}/review", response_model=AttemptReviewResponse)
async def get_attempt_review(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await AttemptService.get_attempt_review(db, attempt_id=attempt_id, current_user=current_user)


@router.patch("/attempts/{attempt_id}/answers/{answer_id}/grade", response_model=ManualGradeResponse)
async def grade_attempt_answer(
    attempt_id: str,
    answer_id: str,
    req: ManualGradeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await AttemptService.grade_short_answer(
        db, attempt_id=attempt_id, answer_id=answer_id, req=req, current_user=current_user
    )


@router.websocket("/exams/{exam_id}/ws")

async def exam_webrtc_signaling_ws(
    websocket: WebSocket,
    exam_id: str,
    token: str = Query(...),
    attempt_id: Optional[str] = Query(None),
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
            if attempt_id:
                result = await db.execute(
                    select(ExamAttempt).where(ExamAttempt.id == attempt_id)
                )
                attempt = result.scalar_one_or_none()
            else:
                result = await db.execute(
                    select(ExamAttempt).where(
                        ExamAttempt.exam_id == exam_id,
                        ExamAttempt.student_id == user_id,
                        ExamAttempt.status == AttemptStatus.IN_PROGRESS,
                    ).order_by(ExamAttempt.started_at.desc())
                )
                attempt = result.scalars().first()

            if not attempt or attempt.student_id != user_id or attempt.exam_id != exam_id:
                await websocket.close(code=4403, reason="Unauthorized student access")
                return

            client_id = await signaling_manager.connect_exam_student(
                exam_id, user_id, attempt.id, websocket
            )
            try:
                while True:
                    data = await websocket.receive_json()
                    await signaling_manager.route_message(client_id, data)
                    if data.get("type") == "media_status":
                        await AttemptService.update_media_session(
                            db,
                            attempt.id,
                            UpdateMediaStatusRequest(
                                camera_active=data.get("camera"),
                                mic_active=data.get("mic"),
                                screen_active=data.get("screen")
                            ),
                            student_id=user_id
                        )
            except WebSocketDisconnect:
                await signaling_manager.disconnect_client(client_id)
            except Exception:
                await signaling_manager.disconnect_client(client_id)

        elif user_role in [UserRole.FACULTY, UserRole.ADMIN]:
            # Faculty must be creator of the exam (or admin)
            exam = await ExamService.get_by_id(db, exam_id)
            if not exam:
                await websocket.close(code=4404, reason="Exam not found")
                return
            if user_role == UserRole.FACULTY and exam.created_by_id != user_id:
                await websocket.close(code=4403, reason="Unauthorized faculty access")
                return

            client_id = await signaling_manager.connect_exam_faculty(exam_id, websocket)
            try:
                while True:
                    data = await websocket.receive_json()
                    await signaling_manager.route_message(client_id, data)
            except WebSocketDisconnect:
                await signaling_manager.disconnect_client(client_id)
            except Exception:
                await signaling_manager.disconnect_client(client_id)
        else:
            await websocket.close(code=4403, reason="Unauthorized role")
