import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status, UploadFile, File, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import require_roles, get_current_user
from app.features.users.models import User, UserRole
from app.core.config import settings
from app.features.students.schemas import (
    StudentCreate,
    StudentUpdate,
    StudentSelfUpdate,
    StudentStatusPatch,
    StudentResponse,
    StudentImportRow,
    StudentImportPreviewResponse,
    PermissionGrantRequest,
    PermissionResponse
)
from app.features.students.service import StudentService

router = APIRouter(prefix="/students", tags=["Students"])


@router.get("/me", response_model=StudentResponse)
async def get_my_student_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await StudentService.get_student_by_user_id(db, current_user.id)


@router.put("/me/profile", response_model=StudentResponse)
async def update_my_student_profile(
    req: StudentSelfUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await StudentService.update_self_profile(db, current_user.id, req)


@router.post("/me/photo", response_model=StudentResponse)
async def upload_my_profile_photo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    allowed = {".jpg", ".jpeg", ".png", ".webp"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image format '{ext}'. Allowed: {', '.join(allowed)}"
        )

    upload_dir = os.path.join(settings.UPLOAD_DIR, "profiles")
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(upload_dir, filename)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File exceeds 10MB limit")

    # Validate face existence for exam identity verification
    try:
        from app.features.identity.service import FaceVerificationService
        img = FaceVerificationService.decode_and_validate_image(content, "Profile Photo")
        face_count, _ = FaceVerificationService.detect_and_embed_face(img, "Profile Photo")
        if face_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No face detected in the photo. Please upload a clear photo of your face for identity verification."
            )
        if face_count > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Multiple faces detected ({face_count}). Please upload a photo with only yourself."
            )
    except HTTPException:
        raise
    except Exception:
        pass

    with open(filepath, "wb") as f:
        f.write(content)

    photo_url = f"/uploads/profiles/{filename}"
    return await StudentService.update_profile_picture(db, current_user.id, photo_url)


@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    req: StudentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.create_student(db, req)


@router.get("", response_model=List[StudentResponse])
async def get_students(
    search: Optional[str] = Query(None, description="Search by name, email, roll no, department"),
    department: Optional[str] = Query(None, description="Filter by department"),
    batch: Optional[str] = Query(None, description="Filter by batch: B1, B2, B3, B4, B5"),
    status: Optional[str] = Query(None, description="Filter by status: active, inactive, all"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.get_students(
        db, search=search, department=department, batch=batch, status_filter=status
    )


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.get_student_by_id(db, student_id)


@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: str,
    req: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.update_student(db, student_id, req)


@router.patch("/{student_id}/status", response_model=StudentResponse)
async def patch_student_status(
    student_id: str,
    req: StudentStatusPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.patch_status(db, student_id, is_active=req.is_active)


@router.get("/{student_id}/permissions", response_model=List[PermissionResponse])
async def get_student_permissions(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.get_student_permissions(db, student_id)


@router.post("/{student_id}/permissions", response_model=PermissionResponse, status_code=status.HTTP_201_CREATED)
async def grant_student_permission(
    student_id: str,
    req: PermissionGrantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.grant_permission(db, student_id, current_user, req)


@router.delete("/permissions/{permission_id}", response_model=PermissionResponse)
async def revoke_permission(
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.revoke_permission(db, permission_id, current_user)


@router.post("/import/preview", response_model=StudentImportPreviewResponse)
async def preview_import_students(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.parse_and_validate_import_file(db, file)


@router.post("/import", response_model=List[StudentResponse])
async def commit_import_students(
    rows: List[StudentImportRow],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.commit_imported_students(db, rows)
