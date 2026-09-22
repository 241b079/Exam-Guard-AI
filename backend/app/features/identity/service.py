import os
import io
import base64
from datetime import datetime, timezone
from typing import Optional, Tuple
import cv2
import numpy as np
from PIL import Image, ImageOps
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.logging import logger
from app.features.users.models import User
from app.features.students.models import StudentProfile
from app.features.attempts.models import ExamAttempt, AttemptStatus
from app.features.exams.models import Exam
from app.features.identity.schemas import VerificationResponse, VerificationStatusResponse


# Paths to model weights
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
YUNET_MODEL_PATH = os.path.join(MODELS_DIR, "face_detection_yunet.onnx")
SFACE_MODEL_PATH = os.path.join(MODELS_DIR, "face_recognition_sface.onnx")

YUNET_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"


class FaceVerificationService:
    _detector: Optional[cv2.FaceDetectorYN] = None
    _recognizer: Optional[cv2.FaceRecognizerSF] = None

    @classmethod
    def _ensure_models_exist(cls):
        """Ensures neural network model files are downloaded locally."""
        os.makedirs(MODELS_DIR, exist_ok=True)
        import urllib.request
        for path, url in [(YUNET_MODEL_PATH, YUNET_URL), (SFACE_MODEL_PATH, SFACE_URL)]:
            if not os.path.exists(path) or os.path.getsize(path) < 1000:
                logger.info(f"Downloading model weight from {url} to {path}...")
                urllib.request.urlretrieve(url, path)
                logger.info(f"Model saved: {path}")

    @classmethod
    def _get_models(cls) -> Tuple[cv2.FaceDetectorYN, cv2.FaceRecognizerSF]:
        """Lazy load and singleton cache the OpenCV YuNet & SFace models."""
        cls._ensure_models_exist()

        if cls._detector is None:
            cls._detector = cv2.FaceDetectorYN_create(
                model=YUNET_MODEL_PATH,
                config="",
                input_size=(320, 320),
                score_threshold=0.6,
                nms_threshold=0.3,
                top_k=5000
            )

        if cls._recognizer is None:
            cls._recognizer = cv2.FaceRecognizerSF_create(
                model=SFACE_MODEL_PATH,
                config=""
            )

        return cls._detector, cls._recognizer

    @staticmethod
    def decode_and_validate_image(image_bytes: bytes, field_label: str = "Image", max_dim: int = 1024) -> np.ndarray:
        """
        Validates payload size, handles EXIF orientation, normalizes high-resolution
        images to optimal YuNet receptive field (max 1024px), and converts to OpenCV BGR.
        """
        if not image_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_label} data is empty"
            )

        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_label} exceeds the maximum allowed size of 10MB"
            )

        try:
            # Open with PIL and automatically correct EXIF orientation (mobile phone rotation)
            pil_img = Image.open(io.BytesIO(image_bytes))
            pil_img = ImageOps.exif_transpose(pil_img)
            pil_img = pil_img.convert("RGB")

            # Scale high-resolution images so maximum dimension is <= max_dim (optimal for YuNet detection)
            w, h = pil_img.size
            if max(w, h) > max_dim:
                scale = max_dim / max(w, h)
                new_w, new_h = max(64, int(w * scale)), max(64, int(h * scale))
                pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception:
            # Fallback to direct OpenCV decoding
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid or corrupted {field_label.lower()} format. Please capture/upload a valid image."
                )

        h, w = img.shape[:2]
        if h < 64 or w < 64:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_label} resolution ({w}x{h}) is too low for reliable face verification"
            )

        return img

    @staticmethod
    def detect_and_embed_face(img: np.ndarray, source_name: str = "image") -> Tuple[int, Optional[np.ndarray]]:
        """
        Detects faces in img and extracts the 128-dimensional embedding for the primary face.
        Returns (face_count, embedding).
        """
        detector, recognizer = FaceVerificationService._get_models()

        h, w = img.shape[:2]
        detector.setInputSize((w, h))
        _, faces = detector.detect(img)

        if faces is None or len(faces) == 0:
            return 0, None

        face_count = len(faces)
        # Select the face with highest detection confidence (index 14)
        primary_face = max(faces, key=lambda f: f[14])

        aligned_face = recognizer.alignCrop(img, primary_face)
        feature = recognizer.feature(aligned_face)

        return face_count, feature

    @staticmethod
    def compute_similarity(feat1: np.ndarray, feat2: np.ndarray) -> float:
        """Computes cosine similarity between two face feature embeddings."""
        _, recognizer = FaceVerificationService._get_models()
        raw_sim = recognizer.match(feat1, feat2, cv2.FaceRecognizerSF_FR_COSINE)
        # Clamp to [0.0, 1.0] for clean reporting
        clamped = max(0.0, min(1.0, float(raw_sim)))
        return round(clamped, 4)

    @staticmethod
    def load_profile_image_bytes(profile_photo_url: str) -> bytes:
        """Resolves profile picture URL/path to raw bytes."""
        if not profile_photo_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No profile photo is available for identity verification. Please contact the administrator."
            )

        # 1. Base64 data URL
        if profile_photo_url.startswith("data:image/"):
            try:
                base64_data = profile_photo_url.split(",", 1)[1]
                return base64.b64decode(base64_data)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid base64 data for profile photo"
                )

        # 2. Local uploaded file relative to project root or upload dir
        clean_path = profile_photo_url.lstrip("/")
        candidate_paths = [
            clean_path,
            os.path.join(settings.UPLOAD_DIR, clean_path.replace("uploads/", "")),
            os.path.join(BASE_DIR, clean_path),
            os.path.join(BASE_DIR, "backend", clean_path),
        ]

        for p in candidate_paths:
            if os.path.exists(p) and os.path.isfile(p):
                with open(p, "rb") as f:
                    return f.read()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registered profile photo file could not be found on server. Please contact administrator."
        )

    @staticmethod
    async def verify_student_identity(
        db: AsyncSession,
        student_user: User,
        exam_id: str,
        live_image_bytes: bytes
    ) -> VerificationResponse:
        """
        Executes end-to-end face verification:
        1. Confirms exam exists and is PUBLISHED.
        2. Retrieves student profile and registered photo.
        3. Validates and decodes both live webcam frame and profile image.
        4. Validates face existence: exactly one face in live frame, usable face in profile.
        5. Computes embedding similarity against FACE_VERIFICATION_THRESHOLD.
        6. On verification success, binds audit record to the ExamAttempt.
        """
        # 1. Check Exam
        exam_res = await db.execute(select(Exam).where(Exam.id == exam_id))
        exam = exam_res.scalar_one_or_none()
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        if exam.status != "PUBLISHED":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Exam is not published")

        # 2. Get Student Profile
        prof_res = await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == student_user.id)
        )
        student_profile = prof_res.scalar_one_or_none()
        if not student_profile or not student_profile.profile_picture_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No profile photo is available for identity verification. Please contact the administrator."
            )

        # 3. Decode live image
        live_img = FaceVerificationService.decode_and_validate_image(live_image_bytes, "Live camera photo")

        # 4. Decode profile image
        profile_bytes = FaceVerificationService.load_profile_image_bytes(student_profile.profile_picture_url)
        profile_img = FaceVerificationService.decode_and_validate_image(profile_bytes, "Registered profile photo")

        # 5. Detect face in profile image
        profile_face_count, profile_feat = FaceVerificationService.detect_and_embed_face(profile_img, "Profile Photo")
        if profile_face_count == 0 or profile_feat is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No face could be detected in your registered profile photo. Please contact the administrator."
            )

        # 6. Detect face in live image
        live_face_count, live_feat = FaceVerificationService.detect_and_embed_face(live_img, "Live Camera Photo")
        if live_face_count == 0 or live_feat is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No face detected in live photo. Please look directly at the camera with clear lighting."
            )

        if live_face_count > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Multiple faces ({live_face_count}) detected. Ensure only you are in the camera frame."
            )

        # 7. Compute similarity
        similarity = FaceVerificationService.compute_similarity(live_feat, profile_feat)
        threshold = settings.FACE_VERIFICATION_THRESHOLD

        is_verified = similarity >= threshold

        now = datetime.now(timezone.utc)

        # 8. Record verification state on attempt
        att_res = await db.execute(
            select(ExamAttempt).where(
                ExamAttempt.exam_id == exam_id,
                ExamAttempt.student_id == student_user.id
            ).options(selectinload(ExamAttempt.answers))
        )
        attempt = att_res.scalar_one_or_none()

        if is_verified:
            if not attempt:
                attempt = ExamAttempt(
                    exam_id=exam_id,
                    student_id=student_user.id,
                    started_at=now,
                    status=AttemptStatus.IN_PROGRESS,
                    identity_verified=True,
                    identity_verified_at=now,
                    identity_verification_score=similarity
                )
                db.add(attempt)
            else:
                attempt.identity_verified = True
                attempt.identity_verified_at = now
                attempt.identity_verification_score = similarity

            await db.commit()
            await db.refresh(attempt)

            return VerificationResponse(
                verified=True,
                message="Identity verified successfully",
                similarity=similarity,
                attempt_id=attempt.id
            )
        else:
            return VerificationResponse(
                verified=False,
                message="Identity could not be verified. Face does not sufficiently match registered profile photo.",
                similarity=similarity,
                attempt_id=attempt.id if attempt else None
            )

    @staticmethod
    async def get_verification_status(
        db: AsyncSession,
        student_user: User,
        exam_id: str
    ) -> VerificationStatusResponse:
        """Returns the current verification status for the student for a given exam."""
        prof_res = await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == student_user.id)
        )
        profile = prof_res.scalar_one_or_none()
        student_id_str = profile.student_id if profile else f"ST-{student_user.id[:6]}"
        photo_url = profile.profile_picture_url if profile else None

        att_res = await db.execute(
            select(ExamAttempt).where(
                ExamAttempt.exam_id == exam_id,
                ExamAttempt.student_id == student_user.id
            )
        )
        attempt = att_res.scalar_one_or_none()

        is_verified = bool(attempt and attempt.identity_verified)
        verified_at = attempt.identity_verified_at if attempt else None
        similarity = attempt.identity_verification_score if attempt else None

        return VerificationStatusResponse(
            exam_id=exam_id,
            is_verified=is_verified,
            verified_at=verified_at,
            similarity=similarity,
            student_name=student_user.name,
            student_id=student_id_str,
            profile_picture_url=photo_url
        )
