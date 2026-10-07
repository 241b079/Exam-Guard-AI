import os
import uuid
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
import cv2
import numpy as np
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.logging import logger
from app.features.users.models import User, UserRole
from app.features.students.models import StudentProfile
from app.features.exams.models import Exam
from app.features.attempts.models import ExamAttempt, AttemptStatus
from app.features.identity.service import FaceVerificationService
from app.features.proctoring.models import (
    ProctoringEvent,
    ProctoringEventType,
    EventSeverity,
    EventReviewStatus,
    IdentityDetectionStatus,
)
from app.features.proctoring.schemas import (
    ContinuousVerificationResponse,
    ProctoringEventResponse,
    ProctoringEventReviewPatch,
)
from app.features.proctoring.signaling import signaling_manager


class SessionMonitoringTracker:
    """Tracks temporal confirmation, active incident, and state for an active attempt."""
    def __init__(self):
        self.current_state: str = "NORMAL_VERIFIED"
        self.pending_state: Optional[str] = None
        self.pending_state_start: Optional[datetime] = None
        
        self.active_incident_id: Optional[str] = None
        self.active_event_id: Optional[str] = None
        self.active_incident_type: Optional[str] = None
        self.incident_started_at: Optional[datetime] = None
        self.last_evidence_saved_at: Optional[datetime] = None
        self.incident_ended_at: Optional[datetime] = None


class ProctoringService:
    # Memory cache for student profiles: user_id -> 128-d face embedding
    _profile_feature_cache: Dict[str, np.ndarray] = {}
    # Memory cache for active session state machines: (exam_id, student_id) -> SessionMonitoringTracker
    _session_trackers: Dict[Tuple[str, str], SessionMonitoringTracker] = {}

    @classmethod
    def get_tracker(cls, exam_id: str, student_id: str) -> SessionMonitoringTracker:
        key = (exam_id, student_id)
        if key not in cls._session_trackers:
            cls._session_trackers[key] = SessionMonitoringTracker()
        return cls._session_trackers[key]

    @classmethod
    def reset_tracker(cls, exam_id: str, student_id: str):
        key = (exam_id, student_id)
        cls._session_trackers.pop(key, None)

    @classmethod
    def get_or_load_profile_feature(cls, student_user_id: str, profile_url: str) -> Optional[np.ndarray]:
        if student_user_id in cls._profile_feature_cache:
            return cls._profile_feature_cache[student_user_id]

        if not profile_url:
            return None

        try:
            profile_bytes = FaceVerificationService.load_profile_image_bytes(profile_url)
            profile_img = FaceVerificationService.decode_and_validate_image(profile_bytes, "Profile Photo")
            count, feat = FaceVerificationService.detect_and_embed_face(profile_img, "Profile Photo")
            if count > 0 and feat is not None:
                cls._profile_feature_cache[student_user_id] = feat
                return feat
        except Exception as e:
            logger.warning(f"Could not extract profile feature for student {student_user_id}: {e}")
        return None

    @staticmethod
    def sanitize_filename_part(text: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_\-]", "_", text)

    @classmethod
    def save_evidence_image(
        cls,
        exam_id: str,
        student_id: str,
        event_type: str,
        image_bytes: bytes,
        timestamp: Optional[datetime] = None
    ) -> str:
        """
        Organizes evidence storage in structure:
        proctoring-evidence/exam_{examId}/student_{studentId}/{date}/{timestamp}_{eventType}_{uuid_short}.jpg
        """
        now = timestamp or datetime.now(timezone.utc)
        date_folder = now.strftime("%Y-%m-%d")
        time_prefix = now.strftime("%H-%M-%S")
        safe_event = cls.sanitize_filename_part(event_type)
        safe_exam = cls.sanitize_filename_part(exam_id)
        safe_student = cls.sanitize_filename_part(student_id)
        suffix = uuid.uuid4().hex[:6]

        rel_dir = os.path.join(
            settings.EVIDENCE_DIR,
            f"exam_{safe_exam}",
            f"student_{safe_student}",
            date_folder
        )
        os.makedirs(rel_dir, exist_ok=True)

        filename = f"{time_prefix}_{safe_event}_{suffix}.jpg"
        full_path = os.path.join(rel_dir, filename)

        with open(full_path, "wb") as f:
            f.write(image_bytes)

        # Store relative path
        return os.path.join(
            f"exam_{safe_exam}",
            f"student_{safe_student}",
            date_folder,
            filename
        )

    @classmethod
    def detect_all_faces_and_features(
        cls, img: np.ndarray
    ) -> Tuple[int, List[Tuple[np.ndarray, float, np.ndarray]]]:
        """
        Runs YuNet detector and extracts features for each face.
        Returns:
            face_count: total faces detected
            faces_info: list of (face_box_landmarks, confidence, 128d_feature_embedding)
        """
        detector, recognizer = FaceVerificationService._get_models()
        h, w = img.shape[:2]
        detector.setInputSize((w, h))
        _, faces = detector.detect(img)

        if faces is None or len(faces) == 0:
            return 0, []

        face_count = len(faces)
        results = []
        for face in faces:
            conf = float(face[14])
            try:
                aligned = recognizer.alignCrop(img, face)
                feature = recognizer.feature(aligned)
                results.append((face, conf, feature))
            except Exception as e:
                logger.warning(f"Error cropping/embedding face: {e}")

        return face_count, results

    @classmethod
    async def analyze_continuous_frame(
        cls,
        db: AsyncSession,
        student_user: User,
        exam_id: str,
        live_image_bytes: bytes,
        client_timestamp: Optional[datetime] = None
    ) -> ContinuousVerificationResponse:
        """
        Processes a sampled camera frame from an active exam attempt:
        1. Confirms exam and active IN_PROGRESS attempt.
        2. Detects faces via YuNet and computes embeddings via SFace.
        3. Compares against student registered profile.
        4. Applies Identity Monitoring State Machine with temporal confirmation.
        5. When confirmed, creates ProctoringEvent, captures evidence, broadcasts real-time alert.
        6. Closes incidents and registers RECOVERED when verified student returns.
        """
        now = datetime.now(timezone.utc)

        # 1. Exam and Attempt Lifecycle Verification
        att_res = await db.execute(
            select(ExamAttempt).where(
                ExamAttempt.exam_id == exam_id,
                ExamAttempt.student_id == student_user.id,
                ExamAttempt.status == AttemptStatus.IN_PROGRESS
            ).order_by(ExamAttempt.started_at.desc())
        )
        attempt = att_res.scalars().first()
        if not attempt:
            # Active monitoring only while exam is IN_PROGRESS
            return ContinuousVerificationResponse(
                state="NORMAL_VERIFIED",
                is_suspicious=False,
                face_count=0,
                message="No active exam attempt in progress. Monitoring inactive.",
                event_created=False,
                evidence_captured=False
            )

        # 2. Get registered profile photo feature
        prof_res = await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == student_user.id)
        )
        student_profile = prof_res.scalar_one_or_none()
        profile_photo_url = student_profile.profile_picture_url if student_profile else None
        profile_feat = cls.get_or_load_profile_feature(student_user.id, profile_photo_url or "")

        # 3. Decode frame
        live_img = FaceVerificationService.decode_and_validate_image(live_image_bytes, "Live frame")

        # 4. Detect faces
        face_count, faces_info = cls.detect_all_faces_and_features(live_img)

        tracker = cls.get_tracker(exam_id, student_user.id)
        threshold = settings.FACE_VERIFICATION_THRESHOLD

        primary_sim: Optional[float] = None
        primary_conf: Optional[float] = None
        raw_detection: str = "UNKNOWN"

        if face_count == 0:
            raw_detection = "NO_FACE"
        elif face_count == 1:
            _, conf, feat = faces_info[0]
            primary_conf = conf
            if profile_feat is not None:
                sim = FaceVerificationService.compute_similarity(feat, profile_feat)
                primary_sim = sim
                if sim >= threshold:
                    raw_detection = "MATCH"
                else:
                    raw_detection = "MISMATCH"
            else:
                raw_detection = "MATCH"  # Fallback if no profile photo on file
        else:
            # face_count >= 2: Multi-person detection
            student_matched = False
            unknown_present = False
            sim_scores = []
            for _, conf, feat in faces_info:
                if profile_feat is not None:
                    sim = FaceVerificationService.compute_similarity(feat, profile_feat)
                    sim_scores.append(sim)
                    if sim >= threshold:
                        student_matched = True
                    else:
                        unknown_present = True
            
            if sim_scores:
                primary_sim = max(sim_scores)
            
            if student_matched and unknown_present:
                raw_detection = "MULTIPLE_PERSON_IDENTITY_MISMATCH"
            else:
                raw_detection = "MULTIPLE_PERSON"

        # 5. State Machine & Temporal Confirmation
        event_created = False
        evidence_captured = False
        created_event_id: Optional[str] = None

        if raw_detection == "MATCH":
            # Student is visible and verified!
            # Did we have an active ongoing incident?
            if tracker.active_incident_id:
                incident_id = tracker.active_incident_id
                incident_type = tracker.active_incident_type
                started_at = tracker.incident_started_at or now
                duration = round((now - started_at).total_seconds(), 2)

                # 1. Update ended_at on the existing active incident event
                if tracker.active_event_id:
                    active_ev = await db.get(ProctoringEvent, tracker.active_event_id)
                    if active_ev:
                        active_ev.ended_at = now
                        active_ev.duration = duration
                        active_ev.updated_at = now

                # 2. Record RECOVERED event
                rec_event = ProctoringEvent(
                    exam_id=exam_id,
                    exam_attempt_id=attempt.id,
                    student_id=student_user.id,
                    event_type=ProctoringEventType.RECOVERED.value,
                    severity=EventSeverity.LOW.value,
                    review_status=EventReviewStatus.PENDING.value,
                    detected_at=now,
                    started_at=started_at,
                    ended_at=now,
                    duration=duration,
                    confidence=primary_sim,
                    face_count=1,
                    expected_identity=student_user.name,
                    detected_identity_status="RECOVERED",
                    incident_id=incident_id,
                    metadata_json={
                        "previous_incident_type": incident_type,
                        "recovered_similarity": primary_sim,
                    }
                )
                db.add(rec_event)
                await db.commit()

                # Broadcast recovery to faculty
                await signaling_manager.broadcast_violation(exam_id, {
                    "id": rec_event.id,
                    "student_id": student_user.id,
                    "exam_attempt_id": attempt.id,
                    "violation_type": "STUDENT_RECOVERED",
                    "incident_id": incident_id,
                    "timestamp": now.isoformat(),
                    "metadata": {"state": "NORMAL_VERIFIED", "recovered": True}
                })

                # Clear incident state
                tracker.active_incident_id = None
                tracker.active_event_id = None
                tracker.active_incident_type = None
                tracker.incident_started_at = None

            # Reset pending counters
            tracker.pending_state = None
            tracker.pending_state_start = None
            tracker.current_state = "NORMAL_VERIFIED"

            return ContinuousVerificationResponse(
                state="NORMAL_VERIFIED",
                is_suspicious=False,
                face_count=face_count,
                similarity=primary_sim,
                confidence=primary_conf,
                message="Student verified and present.",
                event_created=False,
                evidence_captured=False
            )

        # Raw detection is suspicious: NO_FACE, MISMATCH, MULTIPLE_PERSON, or MULTIPLE_PERSON_IDENTITY_MISMATCH
        target_state: str = "TEMPORARILY_ABSENT"
        confirm_duration: float = settings.ABSENCE_GRACE_SECONDS
        event_type = ProctoringEventType.TEMPORARY_ABSENCE
        severity = EventSeverity.LOW

        if raw_detection == "NO_FACE":
            target_state = "TEMPORARILY_ABSENT"
            confirm_duration = settings.ABSENCE_GRACE_SECONDS
            event_type = ProctoringEventType.TEMPORARY_ABSENCE
            severity = EventSeverity.LOW
        elif raw_detection == "MISMATCH":
            target_state = "IDENTITY_MISMATCH"
            confirm_duration = settings.IDENTITY_MISMATCH_CONFIRM_SECONDS
            event_type = ProctoringEventType.IDENTITY_MISMATCH
            severity = EventSeverity.HIGH
        elif raw_detection == "MULTIPLE_PERSON":
            target_state = "MULTIPLE_PERSON"
            confirm_duration = settings.MULTIPLE_PERSON_CONFIRM_SECONDS
            event_type = ProctoringEventType.MULTIPLE_PERSON
            severity = EventSeverity.HIGH
        elif raw_detection == "MULTIPLE_PERSON_IDENTITY_MISMATCH":
            target_state = "MULTIPLE_PERSON_IDENTITY_MISMATCH"
            confirm_duration = settings.MULTIPLE_PERSON_CONFIRM_SECONDS
            event_type = ProctoringEventType.MULTIPLE_PERSON_IDENTITY_MISMATCH
            severity = EventSeverity.CRITICAL

        # Temporal Confirmation Logic
        if tracker.pending_state != target_state:
            tracker.pending_state = target_state
            tracker.pending_state_start = now
            # Do NOT flag single bad frame immediately!
            return ContinuousVerificationResponse(
                state=target_state,
                is_suspicious=False,
                face_count=face_count,
                similarity=primary_sim,
                confidence=primary_conf,
                message=f"Detection {target_state} observing confirmation window...",
                event_created=False,
                evidence_captured=False
            )

        # Check elapsed time in pending state
        elapsed_sec = (now - tracker.pending_state_start).total_seconds()
        if elapsed_sec < confirm_duration:
            # Below confirmation threshold
            return ContinuousVerificationResponse(
                state=target_state,
                is_suspicious=False,
                face_count=face_count,
                similarity=primary_sim,
                confidence=primary_conf,
                message=f"Observing condition ({elapsed_sec:.1f}s / {confirm_duration:.1f}s)...",
                event_created=False,
                evidence_captured=False
            )

        # CONFIRMED SUSPICIOUS EVENT!
        tracker.current_state = target_state
        is_new_incident = (tracker.active_incident_id is None) or (tracker.active_incident_type != target_state)

        if is_new_incident:
            # Create a new incident
            new_incident_id = str(uuid.uuid4())
            tracker.active_incident_id = new_incident_id
            tracker.active_incident_type = target_state
            tracker.incident_started_at = tracker.pending_state_start or now
            started_at = tracker.incident_started_at

            # Capture visual evidence
            rel_evidence_path = cls.save_evidence_image(
                exam_id=exam_id,
                student_id=student_user.id,
                event_type=target_state,
                image_bytes=live_image_bytes,
                timestamp=now
            )
            tracker.last_evidence_saved_at = now
            evidence_captured = True

            ev = ProctoringEvent(
                exam_id=exam_id,
                exam_attempt_id=attempt.id,
                student_id=student_user.id,
                event_type=event_type.value if hasattr(event_type, "value") else str(event_type),
                severity=severity.value if hasattr(severity, "value") else str(severity),
                review_status=EventReviewStatus.PENDING.value,
                detected_at=now,
                started_at=started_at,
                duration=round((now - started_at).total_seconds(), 2),
                confidence=primary_sim,
                face_count=face_count,
                expected_identity=student_user.name,
                detected_identity_status=raw_detection,
                evidence_path=rel_evidence_path,
                incident_id=new_incident_id,
                metadata_json={
                    "detection_confidence": primary_conf,
                    "similarity": primary_sim,
                    "face_count": face_count,
                    "confirmation_delay_seconds": round(elapsed_sec, 2),
                }
            )
            db.add(ev)
            await db.commit()
            await db.refresh(ev)

            tracker.active_event_id = ev.id
            event_created = True
            created_event_id = ev.id

            # Broadcast real-time alert to faculty
            await signaling_manager.broadcast_violation(exam_id, {
                "id": ev.id,
                "student_id": student_user.id,
                "exam_attempt_id": attempt.id,
                "violation_type": target_state,
                "incident_id": new_incident_id,
                "face_count": face_count,
                "similarity": primary_sim,
                "timestamp": now.isoformat(),
                "evidence_url": f"/api/v1/proctoring/evidence/{ev.id}",
                "student_name": student_user.name,
                "metadata": ev.metadata_json,
            })
        else:
            # Same ongoing incident! Update duration and handle cooldown
            incident_id = tracker.active_incident_id
            started_at = tracker.incident_started_at or now
            duration = round((now - started_at).total_seconds(), 2)

            if tracker.active_event_id:
                active_ev = await db.get(ProctoringEvent, tracker.active_event_id)
                if active_ev:
                    active_ev.duration = duration
                    active_ev.updated_at = now
                    await db.commit()

            # Check cooldown for additional evidence snapshots
            cooldown = settings.INCIDENT_COOLDOWN_SECONDS
            if tracker.last_evidence_saved_at:
                since_last = (now - tracker.last_evidence_saved_at).total_seconds()
                if since_last >= cooldown:
                    # Capture updated snapshot
                    rel_evidence_path = cls.save_evidence_image(
                        exam_id=exam_id,
                        student_id=student_user.id,
                        event_type=target_state,
                        image_bytes=live_image_bytes,
                        timestamp=now
                    )
                    tracker.last_evidence_saved_at = now
                    evidence_captured = True

        return ContinuousVerificationResponse(
            state=target_state,
            is_suspicious=True,
            face_count=face_count,
            similarity=primary_sim,
            confidence=primary_conf,
            message=f"Confirmed suspicious event: {target_state}",
            incident_id=tracker.active_incident_id,
            event_created=event_created,
            event_id=created_event_id or tracker.active_event_id,
            evidence_captured=evidence_captured
        )

    @staticmethod
    async def list_proctoring_events(
        db: AsyncSession,
        exam_id: str,
        student_id: Optional[str] = None,
        review_status: Optional[str] = None,
        event_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[int, List[ProctoringEvent]]:
        query = select(ProctoringEvent).where(ProctoringEvent.exam_id == exam_id)
        if student_id:
            query = query.where(ProctoringEvent.student_id == student_id)
        if review_status:
            query = query.where(ProctoringEvent.review_status == review_status)
        if event_type:
            query = query.where(ProctoringEvent.event_type == event_type)

        # Count total
        from sqlalchemy import func
        count_q = select(func.count()).select_from(query.subquery())
        count_res = await db.execute(count_q)
        total = count_res.scalar() or 0

        # Order by detected_at descending
        query = (
            query.options(
                selectinload(ProctoringEvent.student),
                selectinload(ProctoringEvent.reviewed_by)
            )
            .order_by(desc(ProctoringEvent.detected_at))
            .offset(skip)
            .limit(limit)
        )
        res = await db.execute(query)
        events = list(res.scalars().all())

        return total, events

    @staticmethod
    async def get_proctoring_event(db: AsyncSession, event_id: str) -> Optional[ProctoringEvent]:
        res = await db.execute(
            select(ProctoringEvent)
            .where(ProctoringEvent.id == event_id)
            .options(
                selectinload(ProctoringEvent.student),
                selectinload(ProctoringEvent.reviewed_by)
            )
        )
        return res.scalar_one_or_none()

    @staticmethod
    async def review_proctoring_event(
        db: AsyncSession,
        event_id: str,
        reviewer_user: User,
        patch: ProctoringEventReviewPatch
    ) -> ProctoringEvent:
        ev = await db.get(ProctoringEvent, event_id)
        if not ev:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proctoring event not found")

        ev.review_status = patch.review_status.value if hasattr(patch.review_status, "value") else str(patch.review_status)
        if patch.review_comment is not None:
            ev.review_comment = patch.review_comment
        ev.reviewed_by_id = reviewer_user.id
        ev.reviewed_at = datetime.now(timezone.utc)
        ev.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(ev)
        return ev

    @staticmethod
    def get_absolute_evidence_path(evidence_rel_path: str) -> Optional[str]:
        if not evidence_rel_path:
            return None
        candidate = os.path.join(settings.EVIDENCE_DIR, evidence_rel_path.lstrip("/"))
        if os.path.exists(candidate) and os.path.isfile(candidate):
            return candidate
        # Also check relative to workspace
        if os.path.exists(evidence_rel_path) and os.path.isfile(evidence_rel_path):
            return evidence_rel_path
        return None
