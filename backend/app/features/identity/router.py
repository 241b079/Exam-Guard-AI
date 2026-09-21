import base64
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import require_roles
from app.features.users.models import User, UserRole
from app.features.identity.schemas import VerificationResponse, VerificationStatusResponse
from app.features.identity.service import FaceVerificationService


router = APIRouter(prefix="/identity", tags=["Identity Verification"])


@router.post("/verify", response_model=VerificationResponse)
async def verify_identity(
    exam_id: str = Form(...),
    file: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    """
    Verifies student identity against registered profile photo before exam entrance.
    Accepts image file via multipart/form-data or base64 data string.
    """
    image_bytes = None
    if file and file.filename:
        image_bytes = await file.read()
    elif image_base64:
        # Strip data URL prefix if present
        b64_clean = image_base64
        if "base64," in b64_clean:
            b64_clean = b64_clean.split("base64,")[1]
        try:
            image_bytes = base64.b64decode(b64_clean)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid base64 image data"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A live photo is required for identity verification (file upload or image_base64)."
        )

    return await FaceVerificationService.verify_student_identity(
        db=db,
        student_user=current_user,
        exam_id=exam_id,
        live_image_bytes=image_bytes
    )


@router.get("/status/{exam_id}", response_model=VerificationStatusResponse)
async def get_verification_status(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDENT]))
):
    """
    Returns the student's identity verification state for the specified exam,
    including student name, roll number, and registered photo URL.
    """
    return await FaceVerificationService.get_verification_status(
        db=db,
        student_user=current_user,
        exam_id=exam_id
    )
