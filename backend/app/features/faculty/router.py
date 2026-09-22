import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, status, UploadFile, File, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import require_roles, get_current_user
from app.features.users.models import User, UserRole
from app.core.config import settings
from app.features.faculty.schemas import (
    FacultyProfileResponse,
    FacultyProfileUpdate,
    BatchSummaryResponse
)
from app.features.faculty.service import FacultyService
from app.features.students.schemas import StudentResponse

router = APIRouter(prefix="/faculty", tags=["Faculty"])


@router.get("/me", response_model=FacultyProfileResponse)
async def get_my_faculty_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await FacultyService.get_faculty_profile(db, current_user.id)


@router.put("/me", response_model=FacultyProfileResponse)
async def update_my_faculty_profile(
    req: FacultyProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await FacultyService.update_faculty_profile(db, current_user.id, req)


@router.post("/me/photo", response_model=FacultyProfileResponse)
async def upload_my_faculty_photo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    allowed = {".jpg", ".jpeg", ".png", ".webp"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image format '{ext}'. Allowed: {', '.join(allowed)}"
        )

    upload_dir = os.path.join(settings.UPLOAD_DIR, "faculty_profiles")
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(upload_dir, filename)

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File exceeds 5MB limit")

    with open(filepath, "wb") as f:
        f.write(content)

    photo_url = f"/uploads/faculty_profiles/{filename}"
    return await FacultyService.update_faculty_profile(
        db, current_user.id, FacultyProfileUpdate(profile_picture_url=photo_url)
    )


@router.get("/batches", response_model=List[BatchSummaryResponse])
async def get_batches_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await FacultyService.get_batches_summary(db)


@router.get("/batches/{batch}/students", response_model=List[StudentResponse])
async def get_students_by_batch(
    batch: str,
    search: Optional[str] = Query(None, description="Search by name, email, roll no"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await FacultyService.get_students_by_batch(db, batch=batch, search=search)
