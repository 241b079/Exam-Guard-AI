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
from app.features.attempts.models import ExamAttempt, AttemptStatus, ExamViolation, ViolationType
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
from app.features.proctoring.vision import estimate_head_pose, NanoDetDetector


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

        # Priority 2: 3D Gaze & Head Pose Tracking
        self.looking_away_started_at: Optional[datetime] = None
        self.active_looking_away_incident_id: Optional[str] = None
        self.active_looking_away_event_id: Optional[str] = None

        # Priority 2: Prohibited Object Detection tracking
        self.last_object_violation_at: Optional[datetime] = None

        # Phase 1: Liveness & Landmark Micro-Variance Tracking (Anti-Spoofing / Photo Freeze)
        self.landmark_history: List[np.ndarray] = []
        self.last_liveness_violation_at: Optional[datetime] = None
        self.active_liveness_incident_id: Optional[str] = None


class ProctoringService:
    # Memory cache for student profiles: user_id -> 128-d face embedding
    _profile_feature_cache: Dict[str, np.ndarray] = {}
    # Memory cache for active session state machines: (exam_id, student_id, attempt_id) -> SessionMonitoringTracker
    _session_trackers: Dict[Tuple, SessionMonitoringTracker] = {}

    @classmethod
    def get_tracker(cls, exam_id: str, student_id: str, attempt_id: Optional[str] = None) -> SessionMonitoringTracker:
        if attempt_id:
            key = (exam_id, student_id, attempt_id)
            if key not in cls._session_trackers:
                cls._session_trackers[key] = SessionMonitoringTracker()
            return cls._session_trackers[key]

        # Backward compatibility: if attempt_id is omitted, find any active tracker for this exam & student
        for k, tracker in cls._session_trackers.items():
            if len(k) == 3 and k[0] == exam_id and k[1] == student_id:
                return tracker

        key = (exam_id, student_id)
        if key not in cls._session_trackers:
            cls._session_trackers[key] = SessionMonitoringTracker()
        return cls._session_trackers[key]

    @classmethod
    def reset_tracker(cls, exam_id: str, student_id: str, attempt_id: Optional[str] = None):
        if attempt_id:
            cls._session_trackers.pop((exam_id, student_id, attempt_id), None)
        cls._session_trackers.pop((exam_id, student_id), None)

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
    def save_evidence_clip(
        cls,
        exam_id: str,
        student_id: str,
        event_type: str,
        clip_bytes: bytes,
        ext: str = "webm",
        timestamp: Optional[datetime] = None
    ) -> str:
        """
        Organizes video clip evidence storage in structure:
        proctoring-evidence/exam_{examId}/student_{studentId}/{date}/{timestamp}_{eventType}_{uuid_short}.{ext}
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

        filename = f"{time_prefix}_{safe_event}_{suffix}.{ext}"
        full_path = os.path.join(rel_dir, filename)

        with open(full_path, "wb") as f:
            f.write(clip_bytes)

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

        valid_faces = []
        for face in faces:
            conf = float(face[14])
            box_w, box_h = float(face[2]), float(face[3])
            # Filter out tiny artifacts smaller than 20x20 pixels or below 0.6 confidence
            if conf >= 0.6 and box_w >= 20 and box_h >= 20:
                valid_faces.append(face)

        if not valid_faces:
            return 0, []

        face_count = len(valid_faces)
        results = []
        for face in valid_faces:
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
        attempt_id: Optional[str] = None,
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
        if attempt_id:
            att_res = await db.execute(
                select(ExamAttempt).where(
                    ExamAttempt.id == attempt_id,
                    ExamAttempt.exam_id == exam_id,
                    ExamAttempt.student_id == student_user.id,
                    ExamAttempt.status == AttemptStatus.IN_PROGRESS
                )
            )
            attempt = att_res.scalar_one_or_none()
        else:
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

        tracker = cls.get_tracker(exam_id, student_user.id, attempt.id)
        threshold = settings.FACE_VERIFICATION_THRESHOLD

        primary_sim: Optional[float] = None
        primary_conf: Optional[float] = None
        raw_detection: str = "UNKNOWN"

        if face_count == 0:
            raw_detection = "NO_FACE"
        elif face_count == 1:
            if faces_info:
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
                raw_detection = "MISMATCH"
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
                else:
                    unknown_present = True
            
            if sim_scores:
                primary_sim = max(sim_scores)
            
            if student_matched and unknown_present:
                raw_detection = "MULTIPLE_PERSON_IDENTITY_MISMATCH"
            else:
                raw_detection = "MULTIPLE_PERSON"

        # 5. Prohibited Object Detection (Cell Phone, Book, Laptop)
        prohibited_objects = []
        try:
            detector = NanoDetDetector.get_instance()
            prohibited_objects = detector.detect_prohibited(live_img)
        except Exception as o_err:
            logger.debug(f"Object detection skipped: {o_err}")

        if prohibited_objects:
            if tracker.last_object_violation_at is None or (now - tracker.last_object_violation_at).total_seconds() >= 10.0:
                OBJECT_FRIENDLY_NAMES = {
                    "CELL_PHONE": "Cell Phone (Mobile)",
                    "BOOK": "Book / Notes",
                    "LAPTOP": "Secondary Laptop / Device",
                }
                labels = [obj[0] for obj in prohibited_objects]
                first_label, first_conf, first_box = prohibited_objects[0]
                pretty_object_name = OBJECT_FRIENDLY_NAMES.get(first_label, first_label.replace("_", " ").title())
                pretty_labels = [OBJECT_FRIENDLY_NAMES.get(l, l.replace("_", " ").title()) for l in labels]
                calibrated_conf = detector.calibrate_confidence(first_conf)
                tracker.last_object_violation_at = now

                rel_obj_evidence = cls.save_evidence_image(
                    exam_id=exam_id,
                    student_id=student_user.id,
                    event_type="UNAUTHORIZED_OBJECT",
                    image_bytes=live_image_bytes,
                    timestamp=now
                )

                obj_ev_id = str(uuid.uuid4())
                obj_incident_id = str(uuid.uuid4())
                obj_ev = ProctoringEvent(
                    id=obj_ev_id,
                    exam_id=exam_id,
                    exam_attempt_id=attempt.id,
                    student_id=student_user.id,
                    event_type=ProctoringEventType.UNAUTHORIZED_OBJECT.value,
                    severity=EventSeverity.HIGH.value,
                    review_status=EventReviewStatus.PENDING.value,
                    detected_at=now,
                    started_at=now,
                    ended_at=now,
                    duration=0.0,
                    confidence=calibrated_conf,
                    face_count=face_count,
                    expected_identity=student_user.name,
                    detected_identity_status=f"DETECTED: {pretty_object_name}",
                    evidence_path=rel_obj_evidence,
                    incident_id=obj_incident_id,
                    metadata_json={
                        "detected_objects": labels,
                        "detected_object_names": pretty_labels,
                        "primary_object": first_label,
                        "detected_object_name": pretty_object_name,
                        "confidence": round(calibrated_conf, 3),
                        "raw_confidence": round(first_conf, 3),
                        "bounding_box": list(first_box),
                        "description": f"Prohibited exam material detected: {pretty_object_name} ({int(calibrated_conf * 100)}% confidence)",
                    }
                )
                db.add(obj_ev)
                await db.flush()

                obj_viol = ExamViolation(
                    exam_attempt_id=attempt.id,
                    student_id=student_user.id,
                    violation_type=ViolationType.UNAUTHORIZED_OBJECT,
                    timestamp=now,
                    metadata_json={
                        "detected_objects": labels,
                        "detected_object_name": pretty_object_name,
                        "primary_object": first_label,
                        "evidence_path": rel_obj_evidence,
                        "bounding_box": list(first_box),
                        "confidence": round(calibrated_conf, 3),
                    }
                )
                db.add(obj_viol)

                try:
                    from app.features.proctoring.risk_engine import RiskScoringEngine
                    from app.features.proctoring.models import AIClassification

                    await RiskScoringEngine.record_incident_and_update_risk(
                        db=db,
                        exam_id=exam_id,
                        attempt_id=attempt.id,
                        student_id=student_user.id,
                        incident_type="UNAUTHORIZED_OBJECT",
                        category="PROHIBITED_ITEMS",
                        severity="HIGH",
                        confidence=calibrated_conf,
                        evidence_url=f"/api/v1/proctoring/evidence/{obj_ev.id}",
                        explanation=f"Prohibited exam material detected in workspace: {pretty_object_name} (AI certainty: {int(calibrated_conf * 100)}%).",
                        duration_seconds=0.0,
                        metadata={
                            "primary_object": first_label,
                            "detected_object_name": pretty_object_name,
                            "raw_confidence": round(first_conf, 3),
                            "bounding_box": list(first_box),
                        },
                        existing_incident_id=obj_ev.incident_id,
                        ai_classification=AIClassification.CONFIRMED.value if calibrated_conf >= 0.70 else AIClassification.SUSPICIOUS.value,
                    )
                except Exception as r_err:
                    logger.warning(f"Failed to record object incident into risk engine: {r_err}")

                await db.commit()

                await signaling_manager.broadcast_violation(exam_id, {
                    "id": obj_ev.id,
                    "student_id": student_user.id,
                    "exam_attempt_id": attempt.id,
                    "violation_type": "UNAUTHORIZED_OBJECT",
                    "incident_id": obj_ev.incident_id,
                    "timestamp": now.isoformat(),
                    "evidence_url": f"/api/v1/proctoring/evidence/{obj_ev.id}",
                    "student_name": student_user.name,
                    "primary_object": pretty_object_name,
                    "detected_object_name": pretty_object_name,
                    "confidence": calibrated_conf,
                    "metadata": obj_ev.metadata_json,
                })

        # 6. State Machine & Temporal Confirmation
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

                # 2. Update the ProctoringIncident row in DB with final duration and final dynamic risk contribution
                inc_record = await db.get(ProctoringIncident, incident_id)
                if inc_record:
                    from app.features.proctoring.risk_engine import RiskScoringEngine
                    inc_record.ended_at = now
                    inc_record.duration_seconds = duration
                    inc_record.status = "RESOLVED"
                    if incident_type in ("TEMPORARY_ABSENCE", "NO_FACE", "TEMPORARILY_ABSENT"):
                        inc_record.ai_explanation = f"Candidate absent from camera view (Off screen for {int(duration)}s). Focus recovered."
                    elif incident_type in ("MULTIPLE_PERSON", "MULTIPLE_PERSON_IDENTITY_MISMATCH"):
                        inc_record.ai_explanation = f"Multiple persons condition resolved after {int(duration)}s sustained. Candidate verified solo."
                    inc_record.risk_contribution = RiskScoringEngine.calculate_incident_contribution(
                        incident_type=inc_record.incident_type,
                        confidence=inc_record.peak_confidence,
                        duration_seconds=duration,
                        severity=inc_record.severity,
                        ai_classification=inc_record.ai_classification
                    )
                    # Recalculate attempt score with final duration
                    await RiskScoringEngine.recalculate_attempt_score(
                        db=db,
                        attempt_id=attempt.id,
                        trigger_event_type="RECOVERED",
                        trigger_incident_id=inc_record.id,
                        trigger_confidence=1.0
                    )

                # 3. Record RECOVERED event
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

            # 3D Head Pose & Gaze Estimation
            pitch, yaw, roll, is_looking_away = 0.0, 0.0, 0.0, False
            if faces_info:
                pitch, yaw, roll, is_looking_away = estimate_head_pose(
                    live_img.shape[:2], faces_info[0][0]
                )

                # Phase 1: Liveness Anti-Spoofing (Static Photo / Frozen Camera Loop Detection)
                try:
                    img_h, img_w = live_img.shape[:2]
                    raw_lms = np.array([float(faces_info[0][0][i]) for i in range(4, 14)], dtype=np.float64)
                    norm_lms = raw_lms / np.array([img_w, img_h] * 5, dtype=np.float64)
                    tracker.landmark_history.append(norm_lms)
                    if len(tracker.landmark_history) > 15:
                        tracker.landmark_history = tracker.landmark_history[-15:]

                    if len(tracker.landmark_history) >= 12:
                        var_sum = float(np.var(tracker.landmark_history, axis=0).sum())
                        # Zero variance across 12 consecutive frames indicates a static photo presentation or frozen frame
                        if var_sum < 0.000004:
                            if tracker.last_liveness_violation_at is None or (now - tracker.last_liveness_violation_at).total_seconds() >= 15.0:
                                tracker.last_liveness_violation_at = now
                                live_inc_id = str(uuid.uuid4())
                                rel_live_evidence = cls.save_evidence_image(
                                    exam_id=exam_id,
                                    student_id=student_user.id,
                                    event_type="LIVENESS_FAILED",
                                    image_bytes=live_image_bytes,
                                    timestamp=now
                                )
                                live_event = ProctoringEvent(
                                    exam_id=exam_id,
                                    exam_attempt_id=attempt.id,
                                    student_id=student_user.id,
                                    event_type="LIVENESS_FAILED",
                                    severity=EventSeverity.HIGH.value,
                                    review_status=EventReviewStatus.PENDING.value,
                                    detected_at=now,
                                    started_at=now,
                                    confidence=0.92,
                                    face_count=1,
                                    expected_identity=student_user.name,
                                    detected_identity_status="LIVENESS_FAILED",
                                    evidence_path=rel_live_evidence,
                                    incident_id=live_inc_id,
                                    ai_explanation="Anti-spoofing alert: Zero facial landmark micro-variance detected across consecutive samples (synthetic photo or frozen camera loop).",
                                    metadata_json={
                                        "landmark_variance": round(var_sum, 8),
                                        "samples_analyzed": len(tracker.landmark_history),
                                        "reason": "Static photo / frozen frame presentation attack suspected"
                                    }
                                )
                                db.add(live_event)

                                live_viol = ExamViolation(
                                    exam_attempt_id=attempt.id,
                                    student_id=student_user.id,
                                    violation_type=ViolationType.LIVENESS_FAILED,
                                    timestamp=now,
                                    metadata_json={
                                        "landmark_variance": round(var_sum, 8),
                                        "evidence_path": rel_live_evidence
                                    }
                                )
                                db.add(live_viol)

                                from app.features.proctoring.risk_engine import RiskScoringEngine
                                from app.features.proctoring.models import AIClassification
                                await RiskScoringEngine.record_incident_and_update_risk(
                                    db=db,
                                    exam_id=exam_id,
                                    attempt_id=attempt.id,
                                    student_id=student_user.id,
                                    incident_type="LIVENESS_FAILED",
                                    category="LIVENESS_ANOMALY",
                                    severity="HIGH",
                                    confidence=0.92,
                                    evidence_url=f"/api/v1/proctoring/evidence/{live_event.id}",
                                    explanation="Anti-spoofing alert: Zero facial landmark micro-variance detected across consecutive samples (synthetic photo or frozen camera loop).",
                                    duration_seconds=0.0,
                                    ai_classification=AIClassification.CONFIRMED.value
                                )
                                await db.commit()

                                await signaling_manager.broadcast_violation(exam_id, {
                                    "id": live_event.id,
                                    "student_id": student_user.id,
                                    "exam_attempt_id": attempt.id,
                                    "violation_type": "LIVENESS_FAILED",
                                    "incident_id": live_inc_id,
                                    "timestamp": now.isoformat(),
                                    "evidence_url": f"/api/v1/proctoring/evidence/{live_event.id}",
                                    "student_name": student_user.name,
                                    "metadata": live_event.metadata_json,
                                })
                except Exception as live_err:
                    logger.debug(f"Liveness verification check error: {live_err}")

            if is_looking_away:
                if tracker.looking_away_started_at is None:
                    tracker.looking_away_started_at = now
                elif (now - tracker.looking_away_started_at).total_seconds() >= 3.0:
                    if tracker.active_looking_away_incident_id is None:
                        tracker.active_looking_away_incident_id = str(uuid.uuid4())
                        rel_la_evidence = cls.save_evidence_image(
                            exam_id=exam_id,
                            student_id=student_user.id,
                            event_type="LOOKING_AWAY",
                            image_bytes=live_image_bytes,
                            timestamp=now
                        )
                        la_event = ProctoringEvent(
                            exam_id=exam_id,
                            exam_attempt_id=attempt.id,
                            student_id=student_user.id,
                            event_type=ProctoringEventType.LOOKING_AWAY.value,
                            severity=EventSeverity.MEDIUM.value,
                            review_status=EventReviewStatus.PENDING.value,
                            detected_at=now,
                            started_at=tracker.looking_away_started_at,
                            confidence=primary_sim,
                            face_count=1,
                            expected_identity=student_user.name,
                            detected_identity_status="LOOKING_AWAY",
                            evidence_path=rel_la_evidence,
                            incident_id=tracker.active_looking_away_incident_id,
                            metadata_json={
                                "pitch": round(pitch, 2),
                                "yaw": round(yaw, 2),
                                "roll": round(roll, 2),
                            }
                        )
                        db.add(la_event)

                        la_violation = ExamViolation(
                            exam_attempt_id=attempt.id,
                            student_id=student_user.id,
                            violation_type=ViolationType.LOOKING_AWAY,
                            timestamp=now,
                            metadata_json={
                                "pitch": round(pitch, 2),
                                "yaw": round(yaw, 2),
                                "evidence_path": rel_la_evidence,
                            }
                        )
                        db.add(la_violation)
                        await db.commit()
                        tracker.active_looking_away_event_id = la_event.id

                        await signaling_manager.broadcast_violation(exam_id, {
                            "id": la_event.id,
                            "student_id": student_user.id,
                            "exam_attempt_id": attempt.id,
                            "violation_type": "LOOKING_AWAY",
                            "incident_id": tracker.active_looking_away_incident_id,
                            "timestamp": now.isoformat(),
                            "evidence_url": f"/api/v1/proctoring/evidence/{la_event.id}",
                            "student_name": student_user.name,
                            "metadata": la_event.metadata_json,
                        })
            else:
                if tracker.active_looking_away_incident_id is not None:
                    if tracker.active_looking_away_event_id:
                        la_ev = await db.get(ProctoringEvent, tracker.active_looking_away_event_id)
                        if la_ev:
                            la_ev.ended_at = now
                            if la_ev.started_at:
                                la_ev.duration = round((now - la_ev.started_at).total_seconds(), 2)
                            await db.commit()
                    tracker.active_looking_away_incident_id = None
                    tracker.active_looking_away_event_id = None
                tracker.looking_away_started_at = None

            # Always broadcast real-time candidate presence (person present & verified, plus gaze & object info)
            try:
                await signaling_manager.broadcast_student_state(exam_id, student_user.id, {
                    "type": "candidate_presence",
                    "student_id": student_user.id,
                    "attempt_id": attempt.id,
                    "face_count": face_count,
                    "state": "NORMAL_VERIFIED",
                    "looking_away": is_looking_away,
                    "yaw": round(yaw, 1),
                    "pitch": round(pitch, 1),
                    "detected_objects": [obj[0] for obj in prohibited_objects],
                    "message": "Candidate looking away" if is_looking_away else "1 person present (verified candidate)",
                    "timestamp": now.isoformat(),
                })
            except Exception as b_err:
                logger.debug(f"Broadcast presence error: {b_err}")

            is_confirmed_suspicious = tracker.active_looking_away_incident_id is not None
            return ContinuousVerificationResponse(
                state="NORMAL_VERIFIED",
                is_suspicious=is_confirmed_suspicious,
                face_count=face_count,
                similarity=primary_sim,
                confidence=primary_conf,
                message="Candidate looking away" if is_confirmed_suspicious else "Student verified and present.",
                event_created=event_created,
                evidence_captured=evidence_captured
            )

        # Raw detection is suspicious: NO_FACE, MISMATCH, MULTIPLE_PERSON, or MULTIPLE_PERSON_IDENTITY_MISMATCH
        target_state: str = "TEMPORARY_ABSENCE"
        confirm_duration: float = min(2.5, settings.ABSENCE_GRACE_SECONDS)
        event_type = ProctoringEventType.TEMPORARY_ABSENCE
        severity = EventSeverity.MEDIUM

        if raw_detection == "NO_FACE":
            target_state = "TEMPORARY_ABSENCE"
            confirm_duration = min(2.5, settings.ABSENCE_GRACE_SECONDS)
            event_type = ProctoringEventType.TEMPORARY_ABSENCE
            severity = EventSeverity.MEDIUM
        elif raw_detection == "MISMATCH":
            target_state = "IDENTITY_MISMATCH"
            confirm_duration = settings.IDENTITY_MISMATCH_CONFIRM_SECONDS
            event_type = ProctoringEventType.IDENTITY_MISMATCH
            severity = EventSeverity.HIGH
        elif raw_detection == "MULTIPLE_PERSON":
            target_state = "MULTIPLE_PERSON"
            confirm_duration = min(2.5, settings.MULTIPLE_PERSON_CONFIRM_SECONDS)
            event_type = ProctoringEventType.MULTIPLE_PERSON
            severity = EventSeverity.HIGH
        elif raw_detection == "MULTIPLE_PERSON_IDENTITY_MISMATCH":
            target_state = "MULTIPLE_PERSON_IDENTITY_MISMATCH"
            confirm_duration = min(2.5, settings.MULTIPLE_PERSON_CONFIRM_SECONDS)
            event_type = ProctoringEventType.MULTIPLE_PERSON_IDENTITY_MISMATCH
            severity = EventSeverity.CRITICAL

        # Broadcast live candidate presence (person count in exam area)
        try:
            await signaling_manager.broadcast_student_state(exam_id, student_user.id, {
                "type": "candidate_presence",
                "student_id": student_user.id,
                "attempt_id": attempt.id,
                "face_count": face_count,
                "state": target_state,
                "detected_objects": [obj[0] for obj in prohibited_objects],
                "message": f"{face_count} {'person' if face_count == 1 else 'people'} detected in exam area",
                "timestamp": now.isoformat(),
            })
        except Exception as b_err:
            logger.debug(f"Broadcast presence error: {b_err}")

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

        # Calculate effective detection confidence
        if target_state in ("TEMPORARY_ABSENCE", "NO_FACE", "TEMPORARILY_ABSENT"):
            eff_detection_conf = 0.95
        elif target_state in ("MULTIPLE_PERSON", "MULTIPLE_PERSON_IDENTITY_MISMATCH"):
            eff_detection_conf = 0.92
        else:
            eff_detection_conf = primary_conf or 0.85

        # CONFIRMED SUSPICIOUS EVENT!
        tracker.current_state = target_state
        is_new_incident = (tracker.active_incident_id is None) or (tracker.active_incident_type != target_state)

        if is_new_incident:
            # Create a new incident
            new_incident_id = str(uuid.uuid4())
            new_event_id = str(uuid.uuid4())
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
                id=new_event_id,
                exam_id=exam_id,
                exam_attempt_id=attempt.id,
                student_id=student_user.id,
                event_type=event_type.value if hasattr(event_type, "value") else str(event_type),
                severity=severity.value if hasattr(severity, "value") else str(severity),
                review_status=EventReviewStatus.PENDING.value,
                detected_at=now,
                started_at=started_at,
                duration=round((now - started_at).total_seconds(), 2),
                confidence=eff_detection_conf,
                face_count=face_count,
                expected_identity=student_user.name,
                detected_identity_status=raw_detection,
                evidence_path=rel_evidence_path,
                incident_id=new_incident_id,
                metadata_json={
                    "detection_confidence": primary_conf or eff_detection_conf,
                    "similarity": primary_sim,
                    "face_count": face_count,
                    "confirmation_delay_seconds": round(elapsed_sec, 2),
                    "evidence_url": f"/api/v1/proctoring/evidence/{new_event_id}",
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

        # Wire incident recording & dynamic risk scoring
        current_risk_score = 0.0
        current_risk_level = "LOW"
        try:
            from app.features.proctoring.risk_engine import RiskScoringEngine
            from app.features.proctoring.models import AIClassification

            ai_class = AIClassification.CONFIRMED.value
            dur_sec = round((now - (tracker.incident_started_at or now)).total_seconds(), 1)

            if target_state in ("TEMPORARY_ABSENCE", "NO_FACE", "TEMPORARILY_ABSENT"):
                expl = f"Candidate absent from camera view (Off screen for {int(dur_sec)}s). Dynamic absence risk applied."
            elif target_state in ("MULTIPLE_PERSON", "MULTIPLE_PERSON_IDENTITY_MISMATCH"):
                expl = f"Multiple persons detected in exam area ({face_count} faces, {int(dur_sec)}s sustained)."
            else:
                expl = f"Confirmed proctoring condition: {target_state}. Face count: {face_count}."

            ev_id_url = created_event_id or tracker.active_event_id
            inc_obj, risk_score_obj, _ = await RiskScoringEngine.record_incident_and_update_risk(
                db=db,
                exam_id=exam_id,
                attempt_id=attempt.id,
                student_id=student_user.id,
                incident_type=target_state,
                category="IDENTITY_AND_PRESENCE",
                severity=severity.value if hasattr(severity, "value") else str(severity),
                confidence=eff_detection_conf,
                evidence_url=f"/api/v1/proctoring/evidence/{ev_id_url}" if ev_id_url else None,
                explanation=expl,
                duration_seconds=dur_sec,
                metadata={
                    "face_count": face_count,
                    "similarity": primary_sim,
                    "off_screen_seconds": dur_sec if target_state in ("TEMPORARY_ABSENCE", "NO_FACE", "TEMPORARILY_ABSENT") else None,
                },
                existing_incident_id=tracker.active_incident_id,
                ai_classification=ai_class
            )
            await db.commit()
            if risk_score_obj:
                current_risk_score = risk_score_obj.current_score
                current_risk_level = risk_score_obj.risk_level
        except Exception as r_err:
            logger.warning(f"Error updating risk score in continuous proctoring: {r_err}")
            if risk_score_obj:
                current_risk_score = risk_score_obj.current_score
                current_risk_level = risk_score_obj.risk_level
        except Exception as r_err:
            logger.warning(f"Error updating risk score in continuous proctoring: {r_err}")

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
            evidence_captured=evidence_captured,
            risk_score=current_risk_score,
            risk_level=current_risk_level,
        )

    @staticmethod
    async def list_proctoring_events(
        db: AsyncSession,
        exam_id: str,
        student_id: Optional[str] = None,
        attempt_id: Optional[str] = None,
        review_status: Optional[str] = None,
        event_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[int, List[ProctoringEvent]]:
        query = select(ProctoringEvent).where(ProctoringEvent.exam_id == exam_id)
        if student_id:
            query = query.where(ProctoringEvent.student_id == student_id)
        if attempt_id:
            query = query.where(ProctoringEvent.exam_attempt_id == attempt_id)
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
                selectinload(ProctoringEvent.student).selectinload(User.student_profile),
                selectinload(ProctoringEvent.reviewed_by),
                selectinload(ProctoringEvent.attempt),
                selectinload(ProctoringEvent.exam),
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
                selectinload(ProctoringEvent.student).selectinload(User.student_profile),
                selectinload(ProctoringEvent.reviewed_by),
                selectinload(ProctoringEvent.attempt),
                selectinload(ProctoringEvent.exam),
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
        res = await db.execute(
            select(ProctoringEvent)
            .where(ProctoringEvent.id == event_id)
            .options(
                selectinload(ProctoringEvent.student).selectinload(User.student_profile),
                selectinload(ProctoringEvent.reviewed_by),
                selectinload(ProctoringEvent.attempt),
                selectinload(ProctoringEvent.exam),
            )
        )
        ev = res.scalar_one_or_none()
        if not ev:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proctoring event not found")

        status_val = patch.review_status.value if hasattr(patch.review_status, "value") else str(patch.review_status)
        ev.review_status = status_val
        if patch.review_comment is not None:
            ev.review_comment = patch.review_comment
        ev.reviewed_by_id = reviewer_user.id
        ev.reviewed_at = datetime.now(timezone.utc)
        ev.updated_at = datetime.now(timezone.utc)

        # Synchronize corresponding ProctoringIncident and recalculate attempt dynamic risk score
        if ev.incident_id:
            from app.features.proctoring.models import ProctoringIncident
            inc = await db.get(ProctoringIncident, ev.incident_id)
            if inc:
                inc.review_status = status_val
                if ev.review_comment:
                    inc.review_comment = ev.review_comment
                inc.updated_at = datetime.now(timezone.utc)
                if ev.exam_attempt_id:
                    try:
                        from app.features.proctoring.risk_engine import RiskScoringEngine
                        await RiskScoringEngine.recalculate_attempt_score(
                            db=db,
                            attempt_id=ev.exam_attempt_id,
                            trigger_event_type=ev.event_type,
                            trigger_incident_id=inc.id,
                            reason=f"Event {ev.id} reviewed as {status_val}"
                        )
                    except Exception as r_err:
                        logger.warning(f"Error recalculating risk on event review: {r_err}")

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
