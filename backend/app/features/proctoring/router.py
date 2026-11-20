import os
from typing import Optional, List
from fastapi import APIRouter, Depends, status, UploadFile, File, Form, Query, Header, Cookie, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.core.logging import logger
from app.core.security import decode_token
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.exams.models import Exam
from app.features.attempts.models import ExamAttempt, AttemptStatus
from app.features.proctoring.models import (
    ProctoringEvent,
    ProctoringEventType,
    EventReviewStatus,
    EventSeverity,
)
from app.features.proctoring.schemas import (
    ContinuousVerificationResponse,
    ProctoringEventResponse,
    ProctoringEventReviewPatch,
    ProctoringEventsListResponse,
    SFUTokenRequest,
    SFUTokenResponse,
    ExaminationInvestigationResponse,
    FacultyDecisionRequest,
    IncidentReviewRequest,
    NotificationResponse,
)
from app.features.proctoring.service import ProctoringService
from app.features.proctoring.sfu import LiveKitTokenService
from app.core.config import settings

router = APIRouter(prefix="/proctoring", tags=["Proctoring"])


def _map_event_to_response(ev: ProctoringEvent) -> ProctoringEventResponse:
    student_name = ev.expected_identity or (ev.student.name if ev.student else None)
    student_email = ev.student.email if ev.student else None
    student_roll = None
    if ev.student:
        if hasattr(ev.student, "student_profile") and ev.student.student_profile and hasattr(ev.student.student_profile, "roll_number"):
            student_roll = ev.student.student_profile.roll_number
        elif hasattr(ev.student, "roll_number") and ev.student.roll_number:
            student_roll = ev.student.roll_number

    reviewer_name = ev.reviewed_by.name if ev.reviewed_by else None
    evidence_url = f"/api/v1/proctoring/evidence/{ev.id}" if ev.evidence_path else None

    # Examination and Attempt metadata
    exam_title = ev.exam.title if ev.exam else None
    attempt_num = ev.attempt.attempt_number if ev.attempt else None
    attempt_started = ev.attempt.started_at if ev.attempt else None
    attempt_submitted = ev.attempt.submitted_at if ev.attempt else None
    attempt_status_val = None
    if ev.attempt and hasattr(ev.attempt, "status"):
        attempt_status_val = ev.attempt.status.value if hasattr(ev.attempt.status, "value") else str(ev.attempt.status)

    return ProctoringEventResponse(
        id=ev.id,
        exam_id=ev.exam_id,
        exam_title=exam_title,
        exam_attempt_id=ev.exam_attempt_id,
        attempt_number=attempt_num,
        attempt_started_at=attempt_started,
        attempt_submitted_at=attempt_submitted,
        attempt_status=attempt_status_val,
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
    attempt_id: Optional[str] = Form(None),
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
        live_image_bytes=image_bytes,
        attempt_id=attempt_id
    )


@router.get("/events/{exam_id}", response_model=ProctoringEventsListResponse)
async def list_exam_proctoring_events(
    exam_id: str,
    attempt_id: Optional[str] = Query(None),
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
        attempt_id=attempt_id,
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
    attempt_id: Optional[str] = Query(None),
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
        attempt_id=attempt_id,
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
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    auth_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Secure and resilient retrieval of proctoring evidence screenshot.
    Supports Authorization header, ?token=... query parameter, or auth_token cookie.
    Allows seamless rendering in HTML <img> tags via the unguessable event UUID while
    strictly preventing student cross-tenant access when credentials are provided.
    """
    ev = await ProctoringService.get_proctoring_event(db, event_id)
    if not ev or not ev.evidence_path:
        # Resilient fallback: event_id may be an incident_id
        ev_by_inc = await db.execute(
            select(ProctoringEvent)
            .where(ProctoringEvent.incident_id == event_id)
            .where(ProctoringEvent.evidence_path.isnot(None))
            .order_by(ProctoringEvent.detected_at.asc())
        )
        ev = ev_by_inc.scalars().first()

    if not ev or not ev.evidence_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")

    abs_path = ProctoringService.get_absolute_evidence_path(ev.evidence_path)
    if not abs_path or not os.path.exists(abs_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence file missing on server disk")

    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split(" ", 1)[1]
    elif token:
        raw_token = token
    elif auth_token:
        raw_token = auth_token

    # If a token is provided, verify identity and enforce student isolation
    if raw_token:
        try:
            import jwt
            from app.core.config import settings
            payload = jwt.decode(
                raw_token,
                settings.SECRET_KEY,
                algorithms=["HS256"],
                options={"verify_exp": False}  # tolerate minor session expiration for media assets
            )
            user_id = payload.get("sub")
            role = payload.get("role")
            if role == UserRole.STUDENT and user_id and ev.student_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access forbidden to another student's evidence"
                )
        except HTTPException:
            raise
        except Exception:
            # If token is malformed, still allow by UUID for faculty image rendering
            pass

    media_type = (
        "video/webm" if abs_path.endswith(".webm")
        else ("video/mp4" if abs_path.endswith(".mp4") else "image/jpeg")
    )
    return FileResponse(
        abs_path,
        media_type=media_type,
        content_disposition_type="inline",
        filename=os.path.basename(abs_path),
        headers={"Cache-Control": "private, max-age=86400"}
    )


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


@router.post("/sfu/token", response_model=SFUTokenResponse)
async def get_sfu_access_token(
    req: SFUTokenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Issues an authorized LiveKit SFU access token for Selective Forwarding Unit media exchange.
    Enables low-bandwidth simulcast / dynacast streaming for candidate cameras and screens.
    """
    exam = await db.get(Exam, req.exam_id)
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam not found"
        )

    attempt_id = req.attempt_id
    if current_user.role == UserRole.STUDENT:
        from app.features.attempts.models import ExamAttempt, AttemptStatus
        stmt = select(ExamAttempt).where(
            ExamAttempt.exam_id == req.exam_id,
            ExamAttempt.student_id == current_user.id,
            ExamAttempt.status == AttemptStatus.IN_PROGRESS
        )
        attempt_res = await db.execute(stmt)
        attempt = attempt_res.scalar_one_or_none()
        if not attempt:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Student does not have an active exam attempt in progress."
            )
        attempt_id = attempt.id
    elif current_user.role == UserRole.FACULTY:
        if exam.created_by_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Faculty not authorized to monitor this exam"
            )
    # ADMIN is authorized by default

    token = LiveKitTokenService.create_token(
        user_id=current_user.id,
        name=current_user.name,
        role=current_user.role.value,
        exam_id=req.exam_id,
        attempt_id=attempt_id,
    )

    identity = f"stu_{current_user.id}" if current_user.role == UserRole.STUDENT else f"fac_{current_user.id}"
    return SFUTokenResponse(
        sfu_enabled=settings.SFU_ENABLED,
        server_url=settings.LIVEKIT_URL,
        token=token,
        room_name=LiveKitTokenService.get_room_name(req.exam_id),
        identity=identity,
        role=current_user.role.value,
    )


# ── AI Risk Scoring & Post-Examination Investigation Endpoints ──

from app.features.proctoring.schemas import (
    StudentRiskScoreResponse,
    FacultyAlertResponse,
    ExaminationInvestigationResponse,
    FacultyDecisionRequest,
    IncidentReviewRequest,
)
from app.features.proctoring.models import (
    StudentRiskScore,
    FacultyAlert,
    ExaminationInvestigation,
    ProctoringIncident,
)
from app.features.proctoring.risk_engine import RiskScoringEngine
from app.features.proctoring.investigation import PostExaminationInvestigationService
from sqlalchemy.orm import selectinload


@router.get("/risk/{attempt_id}", response_model=StudentRiskScoreResponse)
async def get_attempt_risk_score(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns current dynamic cheating risk score for an examination attempt.
    """
    res = await db.execute(
        select(StudentRiskScore).where(StudentRiskScore.exam_attempt_id == attempt_id)
    )
    risk_score = res.scalar_one_or_none()
    if not risk_score:
        # Return initial default 0 score
        risk_score = await RiskScoringEngine._fetch_or_create_default(db, attempt_id)
    return risk_score


@router.get("/alerts/{exam_id}", response_model=List[FacultyAlertResponse])
async def list_faculty_alerts(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN])),
):
    """
    Retrieves real-time faculty alerts generated when students enter medium, high, or critical risk tiers.
    """
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if current_user.role == UserRole.FACULTY and exam.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this exam")

    stmt = (
        select(FacultyAlert)
        .where(FacultyAlert.exam_id == exam_id)
        .options(selectinload(FacultyAlert.student))
        .order_by(FacultyAlert.created_at.desc())
    )
    res = await db.execute(stmt)
    alerts = res.scalars().all()

    resp = []
    for a in alerts:
        resp.append(FacultyAlertResponse(
            id=a.id,
            exam_id=a.exam_id,
            exam_attempt_id=a.exam_attempt_id,
            student_id=a.student_id,
            student_name=a.student.name if a.student else None,
            student_email=a.student.email if a.student else None,
            severity=a.severity,
            title=a.title,
            description=a.description,
            current_risk_score=a.current_risk_score,
            risk_classification=a.risk_classification,
            evidence_url=a.evidence_url,
            ai_explanation=a.ai_explanation,
            incident_id=a.incident_id,
            is_read=a.is_read,
            created_at=a.created_at,
        ))
    return resp


@router.patch("/alerts/{alert_id}/read", response_model=FacultyAlertResponse)
async def mark_alert_read(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN])),
):
    alert = await db.get(FacultyAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    alert.is_read = True
    await db.commit()
    await db.refresh(alert)
    return alert


@router.get("/investigations/{exam_id}", response_model=List[ExaminationInvestigationResponse])
async def list_exam_investigations(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN])),
):
    """
    Lists post-examination investigations for all submitted or completed candidate attempts in an exam.
    """
    exam = await db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if current_user.role == UserRole.FACULTY and exam.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this exam")

    # Verify all submitted/expired attempts have an investigation dossier synthesized
    submitted_res = await db.execute(
        select(ExamAttempt.id).where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.EXPIRED])
        )
    )
    submitted_ids = {row[0] for row in submitted_res.fetchall()}
    existing_res = await db.execute(
        select(ExaminationInvestigation.exam_attempt_id).where(ExaminationInvestigation.exam_id == exam_id)
    )
    existing_ids = {row[0] for row in existing_res.fetchall()}
    missing_ids = submitted_ids - existing_ids
    for missing_id in missing_ids:
        try:
            await PostExaminationInvestigationService.generate_investigation_report(db, missing_id)
        except Exception as e:
            logger.warning(f"Error generating investigation report on list for {missing_id}: {e}")

    stmt = (
        select(ExaminationInvestigation)
        .where(ExaminationInvestigation.exam_id == exam_id)
        .options(
            selectinload(ExaminationInvestigation.student).selectinload(User.student_profile),
            selectinload(ExaminationInvestigation.exam),
        )
        .order_by(desc(ExaminationInvestigation.final_risk_score))
    )
    res = await db.execute(stmt)
    investigations = res.scalars().all()

    resp = []
    for inv in investigations:
        student = inv.student
        roll = student.student_profile.student_id if student and student.student_profile else None
        resp.append(ExaminationInvestigationResponse(
            id=inv.id,
            exam_id=inv.exam_id,
            exam_attempt_id=inv.exam_attempt_id,
            student_id=inv.student_id,
            student_name=student.name if student else None,
            student_email=student.email if student else None,
            student_roll_number=roll,
            exam_title=inv.exam.title if inv.exam else None,
            final_risk_score=inv.final_risk_score,
            risk_classification=inv.risk_classification,
            review_priority=inv.review_priority,
            total_incidents=inv.total_incidents,
            confirmed_count=inv.confirmed_count,
            suspicious_count=inv.suspicious_count,
            inconclusive_count=inv.inconclusive_count,
            monitoring_interruption_count=inv.monitoring_interruption_count,
            executive_summary=inv.executive_summary,
            incident_timeline_json=inv.incident_timeline_json or [],
            correlations_json=inv.correlations_json or [],
            score_breakdown_json=inv.score_breakdown_json or {},
            limitations_notes=inv.limitations_notes,
            investigation_status=inv.investigation_status,
            generated_at=inv.generated_at,
            updated_at=inv.updated_at,
        ))
    return resp


def _map_investigation_to_response(inv) -> ExaminationInvestigationResponse:
    student = inv.student
    roll = None
    if student:
        prof = student.__dict__.get("student_profile")
        if prof:
            roll = getattr(prof, "roll_number", None) or getattr(prof, "student_id", None)

    attempt = inv.attempt
    latest_review = None
    if inv.reviews:
        sorted_reviews = sorted(inv.reviews, key=lambda r: r.created_at, reverse=True)
        latest_review = sorted_reviews[0]

    return ExaminationInvestigationResponse(
        id=inv.id,
        exam_id=inv.exam_id,
        exam_attempt_id=inv.exam_attempt_id,
        student_id=inv.student_id,
        student_name=student.name if student else None,
        student_email=student.email if student else None,
        student_roll_number=roll,
        exam_title=inv.exam.title if inv.exam else None,
        final_risk_score=inv.final_risk_score or 0.0,
        peak_risk_score=getattr(inv, "peak_risk_score", None) or getattr(inv, "final_risk_score", 0.0) or 0.0,
        risk_classification=inv.risk_classification,
        review_priority=inv.review_priority,
        total_incidents=inv.total_incidents,
        confirmed_count=inv.confirmed_count,
        suspicious_count=inv.suspicious_count,
        inconclusive_count=inv.inconclusive_count,
        confirmed_incidents_count=inv.confirmed_count,
        suspicious_incidents_count=inv.suspicious_count,
        inconclusive_incidents_count=inv.inconclusive_count,
        monitoring_interruption_count=inv.monitoring_interruption_count,
        overall_risk_level=getattr(inv, "overall_risk_level", None) or "LOW_RISK",
        ai_assessment_status=getattr(inv, "ai_assessment_status", None) or "COMPLETED",
        total_evidence_count=getattr(inv, "total_evidence_count", 0) or 0,
        independent_incident_count=getattr(inv, "independent_incident_count", 0) or 0,
        high_confidence_count=getattr(inv, "high_confidence_count", 0) or 0,
        low_confidence_count=getattr(inv, "low_confidence_count", 0) or 0,
        resolved_count=getattr(inv, "resolved_count", 0) or 0,
        evidence_breakdown_json=getattr(inv, "evidence_breakdown_json", {}) or {},
        ai_recommendation=getattr(inv, "ai_recommendation", None) or inv.executive_summary,
        model_version=getattr(inv, "model_version", None) or "v2.1",
        recommended_verdict=getattr(inv, "recommended_verdict", "CLEARED") or "CLEARED",
        auto_disqualification_recommended=getattr(inv, "auto_disqualification_recommended", False) or False,
        auto_disqualification_reason=getattr(inv, "auto_disqualification_reason", None),
        executive_summary=inv.executive_summary,
        incident_timeline_json=inv.incident_timeline_json or [],
        correlations_json=inv.correlations_json or [],
        limitations_json=[inv.limitations_notes] if inv.limitations_notes else [],
        score_breakdown_json=inv.score_breakdown_json or {},
        limitations_notes=inv.limitations_notes,
        investigation_status=inv.investigation_status,
        faculty_decision=latest_review.decision if latest_review else None,
        decision_reason=latest_review.reason if latest_review else None,
        decision_notes=latest_review.notes if latest_review else None,
        decision_by_name=latest_review.faculty.name if latest_review and latest_review.faculty else None,
        decision_at=latest_review.created_at if latest_review else None,
        publication_status="DISQUALIFIED" if (inv.investigation_status == "DISQUALIFIED" or (attempt and (getattr(attempt, "integrity_status", "") == "DISQUALIFIED" or getattr(attempt, "publication_status", "") == "DISQUALIFIED"))) else (getattr(attempt, "publication_status", "UNPUBLISHED") if attempt else "UNPUBLISHED"),
        evaluated_score=0.0 if (inv.investigation_status == "DISQUALIFIED" or (attempt and (getattr(attempt, "integrity_status", "") == "DISQUALIFIED" or getattr(attempt, "publication_status", "") == "DISQUALIFIED"))) else (getattr(attempt, "total_score", None) if attempt else None),
        max_possible_score=getattr(attempt, "max_possible_score", None) if attempt else None,
        generated_at=inv.generated_at,
        updated_at=inv.updated_at,
    )


@router.get("/investigations/{exam_id}/attempt/{attempt_id}", response_model=ExaminationInvestigationResponse)
async def get_attempt_investigation(
    exam_id: str,
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN])),
):
    """
    Returns full post-examination investigation report with incident timeline,
    AI explanations, evidence links, and score breakdown.
    """
    inv = await PostExaminationInvestigationService.generate_investigation_report(db, attempt_id)
    return _map_investigation_to_response(inv)


@router.get("/investigations/{attempt_id}", response_model=ExaminationInvestigationResponse)
async def get_investigation_report(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN, UserRole.STUDENT])),
):
    """
    Returns full post-examination investigation report with incident timeline,
    AI explanations, evidence links, and score breakdown.
    """
    inv = await PostExaminationInvestigationService.generate_investigation_report(db, attempt_id)
    return _map_investigation_to_response(inv)


@router.post("/investigations/{attempt_id}/incident/{incident_id}/review")
async def review_investigation_incident(
    attempt_id: str,
    incident_id: str,
    req: IncidentReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN])),
):
    """
    Faculty marks an individual incident as CONFIRM_VIOLATION, FALSE_POSITIVE, DISMISS,
    REQUEST_INVESTIGATION, or ESCALATE.
    If FALSE_POSITIVE, the risk score is automatically recalculated with the incident deducted.
    """
    incident = await db.get(ProctoringIncident, incident_id)
    if incident and incident.exam_attempt_id == attempt_id:
        incident.review_status = req.status
        if req.comment:
            incident.review_comment = req.comment
    else:
        ev = await db.get(ProctoringEvent, incident_id)
        if ev and ev.exam_attempt_id == attempt_id:
            ev.review_status = req.status
            if req.comment:
                ev.review_comment = req.comment

    if req.status == "FALSE_POSITIVE":
        await RiskScoringEngine.recalculate_attempt_score(
            db=db,
            attempt_id=attempt_id,
            trigger_event_type="FALSE_POSITIVE_REJECTION",
            trigger_incident_id=incident_id,
            reason=f"Faculty marked incident as false positive: {req.comment or 'No comment'}"
        )

    await db.commit()
    return {"message": "Incident review updated", "incident_id": incident_id, "review_status": req.status}


@router.post("/investigations/{attempt_id}/decision", response_model=ExaminationInvestigationResponse)
async def submit_faculty_investigation_decision(
    attempt_id: str,
    req: FacultyDecisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN])),
):
    """
    Faculty formal post-examination decision:
    - CLEARED: Clears candidate, confirms normal gradebook evaluation.
    - VIOLATION_CONFIRMED: Flags policy violation with justification.
    - DISQUALIFIED: Formal disqualification requiring mandatory justification reason. Zeros attempt score.
    - UNDER_INVESTIGATION: Marks for further inquiry.
    - Optionally publishes evaluated result immediately if publish_result=True.
    """
    inv = await PostExaminationInvestigationService.submit_faculty_decision(
        db=db,
        attempt_id=attempt_id,
        faculty_user=current_user,
        decision=req.decision,
        reason=req.reason,
        notes=req.notes,
        incident_reviews=req.incident_reviews,
        publish_result=req.publish_result or False,
    )
    return _map_investigation_to_response(inv)


@router.post("/attempts/{attempt_id}/publish-result")
async def publish_attempt_result(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN])),
):
    """
    Authorizes and publishes the calculated result to the student.
    Marks and evaluation breakdown will only become accessible to student after this action.
    """
    from datetime import datetime, timezone
    from app.features.proctoring.notification_service import NotificationService

    attempt = await db.get(ExamAttempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    exam = await db.get(Exam, attempt.exam_id)
    if current_user.role == UserRole.FACULTY and exam.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to publish results for this exam")

    if attempt.integrity_status == "DISQUALIFIED" or attempt.publication_status == "DISQUALIFIED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish marks for a disqualified attempt. Disqualified attempts remain disqualified with grade 0."
        )

    now = datetime.now(timezone.utc)
    attempt.publication_status = "PUBLISHED"
    attempt.published_at = now
    attempt.published_by_id = current_user.id
    await db.commit()

    await NotificationService.create_notification(
        db=db,
        user_id=attempt.student_id,
        notif_type="RESULT_PUBLISHED",
        title=f"Result Published: {exam.title}",
        message=f"Your examination result for {exam.title} has been authorized and published by faculty.",
        exam_id=exam.id,
        exam_attempt_id=attempt.id
    )

    return {
        "message": "Result successfully published",
        "attempt_id": attempt.id,
        "publication_status": "PUBLISHED",
        "published_at": now.isoformat()
    }


@router.post("/attempts/{attempt_id}/hold-result")
async def hold_attempt_result(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN])),
):
    """
    Holds the result from student visibility pending further inquiry.
    """
    attempt = await db.get(ExamAttempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    exam = await db.get(Exam, attempt.exam_id)
    if current_user.role == UserRole.FACULTY and exam.created_by_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    attempt.publication_status = "HELD"
    await db.commit()
    return {"message": "Result held from student visibility", "attempt_id": attempt.id, "publication_status": "HELD"}


@router.get("/notifications", response_model=List[NotificationResponse])
async def get_my_notifications(
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves in-app notifications for current authenticated user.
    """
    from app.features.proctoring.notification_service import NotificationService
    return await NotificationService.get_user_notifications(
        db=db, user_id=current_user.id, limit=limit, unread_only=unread_only
    )


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Marks a notification as read.
    """
    from app.features.proctoring.notification_service import NotificationService
    success = await NotificationService.mark_as_read(db, notification_id, current_user.id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return {"message": "Notification marked as read"}


@router.post("/evidence-upload")
async def upload_proctoring_evidence(
    exam_id: str = Form(...),
    attempt_id: str = Form(...),
    event_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    """
    Continuous Proctoring Evidence Ingestion:
    Accepts snapshot images or short recorded video clips during active exams
    and archives them into the candidate's evidence collection in the background.
    """
    import uuid
    from datetime import datetime, timezone
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty evidence file")

    filename_lower = (file.filename or "").lower()
    ext = "webm" if filename_lower.endswith(".webm") else ("mp4" if filename_lower.endswith(".mp4") else "jpg")

    rel_path = ProctoringService.save_evidence_clip(
        exam_id=exam_id,
        student_id=current_user.id,
        event_type=event_type,
        clip_bytes=content,
        ext=ext
    )

    # Automatically create a ProctoringEvent and link to attempt
    now = datetime.now(timezone.utc)
    ev = ProctoringEvent(
        exam_id=exam_id,
        exam_attempt_id=attempt_id,
        student_id=current_user.id,
        event_type=event_type,
        severity=EventSeverity.MEDIUM.value,
        review_status=EventReviewStatus.PENDING.value,
        detected_at=now,
        started_at=now,
        ended_at=now,
        duration=0.0,
        confidence=0.90,
        face_count=1,
        expected_identity=current_user.name,
        detected_identity_status="EVIDENCE_RECORDED",
        evidence_path=rel_path,
        incident_id=str(uuid.uuid4()),
        metadata_json={"source": "candidate_evidence_capture", "filename": file.filename}
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)

    return {
        "event_id": ev.id,
        "evidence_path": rel_path,
        "evidence_url": f"/api/v1/proctoring/evidence/{ev.id}"
    }

