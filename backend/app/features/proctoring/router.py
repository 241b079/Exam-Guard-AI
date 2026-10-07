import os
from typing import Optional, List
from fastapi import APIRouter, Depends, status, UploadFile, File, Form, Query, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.exams.models import Exam
from app.features.proctoring.models import (
    ProctoringEvent,
    ProctoringEventType,
    EventReviewStatus,
)
from app.features.proctoring.schemas import (
    ContinuousVerificationResponse,
    ProctoringEventResponse,
    ProctoringEventReviewPatch,
    ProctoringEventsListResponse,
)
from app.features.proctoring.service import ProctoringService

router = APIRouter(prefix="/proctoring", tags=["Proctoring"])


def _map_event_to_response(ev: ProctoringEvent) -> ProctoringEventResponse:
    student_name = ev.expected_identity or (ev.student.name if ev.student else None)
    student_email = ev.student.email if ev.student else None
    student_roll = None
    reviewer_name = ev.reviewed_by.name if ev.reviewed_by else None
    evidence_url = f"/api/v1/proctoring/evidence/{ev.id}" if ev.evidence_path else None

    return ProctoringEventResponse(
        id=ev.id,
        exam_id=ev.exam_id,
        exam_attempt_id=ev.exam_attempt_id,
        student_id=ev.student_id,
        student_name=student_name,
        student_email=student_email,
        student_roll_number=student_roll,
        event_type=ev.event_type,
        severity=ev.severity,
        review_status=ev.review_status,
        review_comment=ev.review_comment,
        reviewed_by_id=ev.reviewed_by_id,
        reviewed_by_name=reviewer_name,
        reviewed_at=ev.reviewed_at,
        detected_at=ev.detected_at,
        started_at=ev.started_at,
        ended_at=ev.ended_at,
        duration=ev.duration,
        confidence=ev.confidence,
        face_count=ev.face_count,
        expected_identity=ev.expected_identity,
        detected_identity_status=ev.detected_identity_status,
        evidence_url=evidence_url,
        incident_id=ev.incident_id,
        metadata_json=ev.metadata_json,
        created_at=ev.created_at,
    )


@router.post("/continuous-verify", response_model=ContinuousVerificationResponse)
async def continuous_verify_frame(
    exam_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    """
    Continuous identity monitoring endpoint:
    Processes sampled webcam frames during active exams.
    Detects faces, verifies identity, runs state machine, captures evidence upon confirmed suspicious event.
    """
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Frame image data is empty"
        )

    return await ProctoringService.analyze_continuous_frame(
        db=db,
        student_user=current_user,
        exam_id=exam_id,
        live_image_bytes=image_bytes
    )


@router.get("/events/{exam_id}", response_model=ProctoringEventsListResponse)
async def list_exam_proctoring_events(
    exam_id: str,
    student_id: Optional[str] = Query(None),
    review_status: Optional[EventReviewStatus] = Query(None),
    event_type: Optional[ProctoringEventType] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lists recorded proctoring events and suspicious evidence for an exam.
    Faculty can view all students; students can only view their own events.
    """
    # Authorization checks
    if current_user.role == UserRole.STUDENT:
        student_id = current_user.id
    elif current_user.role == UserRole.FACULTY:
        exam_res = await db.execute(select(Exam).where(Exam.id == exam_id))
        exam = exam_res.scalar_one_or_none()
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if exam.created_by_id != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this exam's proctoring data")

    total, events = await ProctoringService.list_proctoring_events(
        db=db,
        exam_id=exam_id,
        student_id=student_id,
        review_status=review_status.value if review_status else None,
        event_type=event_type.value if event_type else None,
        skip=skip,
        limit=limit
    )

    return ProctoringEventsListResponse(
        total=total,
        events=[_map_event_to_response(ev) for ev in events]
    )


@router.get("/events/{exam_id}/{student_id}", response_model=ProctoringEventsListResponse)
async def list_student_proctoring_events(
    exam_id: str,
    student_id: str,
    review_status: Optional[EventReviewStatus] = Query(None),
    event_type: Optional[ProctoringEventType] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Convenience endpoint to retrieve proctoring events for a specific student."""
    return await list_exam_proctoring_events(
        exam_id=exam_id,
        student_id=student_id,
        review_status=review_status,
        event_type=event_type,
        skip=skip,
        limit=limit,
        db=db,
        current_user=current_user
    )


@router.get("/evidence/{event_id}")
async def get_proctoring_evidence_file(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Secure retrieval of proctoring evidence screenshot.
    Requires authentication; only authorized faculty or the student can access.
    """
    ev = await ProctoringService.get_proctoring_event(db, event_id)
    if not ev or not ev.evidence_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")

    # Access control
    if current_user.role == UserRole.STUDENT and ev.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access forbidden to another student's evidence")

    abs_path = ProctoringService.get_absolute_evidence_path(ev.evidence_path)
    if not abs_path or not os.path.exists(abs_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence file missing on server disk")

    return FileResponse(abs_path, media_type="image/jpeg", filename=os.path.basename(abs_path))


@router.patch("/events/{event_id}/review", response_model=ProctoringEventResponse)
async def review_proctoring_event(
    event_id: str,
    patch: ProctoringEventReviewPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    """
    Faculty reviews a suspicious proctoring event:
    Marks CONFIRMED, DISMISSED, or FALSE_POSITIVE with optional reviewer comments.
    """
    ev = await ProctoringService.review_proctoring_event(
        db=db,
        event_id=event_id,
        reviewer_user=current_user,
        patch=patch
    )
    return _map_event_to_response(ev)
