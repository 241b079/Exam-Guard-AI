from typing import List
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.exams.schemas import ExamCreate, ExamUpdate, ExamResponse
from app.features.exams.service import ExamService

router = APIRouter(prefix="/exams", tags=["Exams"])


@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
async def create_exam(
    req: ExamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await ExamService.create_exam(db, req, creator_id=current_user.id)


@router.get("", response_model=List[ExamResponse])
async def get_exams(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role in [UserRole.FACULTY, UserRole.ADMIN]:
        return await ExamService.get_faculty_exams(db, current_user.id)
    else:
        return await ExamService.get_student_exams(db, current_user.id)


@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    exam = await ExamService.get_by_id(db, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    
    # Permission check for students
    if current_user.role == UserRole.STUDENT:
        if exam.status != "PUBLISHED":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Exam is not published yet")
        if exam.assignment_type == "SELECTED_STUDENTS" and current_user.id not in (exam.assigned_student_ids or []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not assigned to this exam")
            
    return ExamService._to_response(exam)


@router.put("/{exam_id}", response_model=ExamResponse)
async def update_exam(
    exam_id: str,
    req: ExamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await ExamService.update_exam(db, exam_id, req, faculty_id=current_user.id)


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    await ExamService.delete_exam(db, exam_id, faculty_id=current_user.id)


@router.post("/{exam_id}/publish", response_model=ExamResponse)
async def publish_exam(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.FACULTY, UserRole.ADMIN]))
):
    return await ExamService.publish_exam(db, exam_id, faculty_id=current_user.id)
