from typing import List, Optional
from fastapi import APIRouter, Depends, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import require_roles
from app.features.users.models import User, UserRole
from app.features.students.schemas import (
    StudentCreate,
    StudentUpdate,
    StudentStatusPatch,
    StudentResponse,
    StudentImportRow,
    StudentImportPreviewResponse
)
from app.features.students.service import StudentService

router = APIRouter(prefix="/students", tags=["Students"])


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
    status: Optional[str] = Query(None, description="Filter by status: active, inactive, all"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await StudentService.get_students(db, search=search, department=department, status_filter=status)


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
