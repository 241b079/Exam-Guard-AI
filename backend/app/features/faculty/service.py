from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.users.models import User, UserRole
from app.features.faculty.models import FacultyProfile
from app.features.faculty.schemas import (
    FacultyProfileResponse,
    FacultyProfileUpdate,
    BatchSummaryResponse
)
from app.features.students.models import StudentProfile
from app.features.students.permission_models import ProfileEditPermission, PermissionStatus
from app.features.students.schemas import ALLOWED_BATCHES, StudentResponse
from app.features.students.service import StudentService


class FacultyService:
    @staticmethod
    def _to_response(profile: FacultyProfile, user: User) -> FacultyProfileResponse:
        return FacultyProfileResponse(
            id=profile.id,
            user_id=user.id,
            faculty_id=profile.faculty_id,
            name=user.name,
            email=user.email,
            phone=profile.phone,
            department=profile.department,
            designation=profile.designation,
            assigned_batches=profile.assigned_batches or [],
            profile_picture_url=profile.profile_picture_url,
            created_at=profile.created_at,
            updated_at=profile.updated_at
        )

    @staticmethod
    async def ensure_faculty_profile(db: AsyncSession, user: User) -> FacultyProfile:
        result = await db.execute(
            select(FacultyProfile).where(FacultyProfile.user_id == user.id)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            fac_id = f"FAC-{user.id[:8].upper()}"
            profile = FacultyProfile(
                user_id=user.id,
                faculty_id=fac_id,
                assigned_batches=["B1", "B2", "B3", "B4", "B5"]
            )
            db.add(profile)
            await db.commit()
            await db.refresh(profile)
        return profile

    @staticmethod
    async def get_faculty_profile(db: AsyncSession, user_id: str) -> FacultyProfileResponse:
        user_res = await db.execute(select(User).where(User.id == user_id).options(selectinload(User.faculty_profile)))
        user = user_res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        profile = user.faculty_profile
        if not profile:
            profile = await FacultyService.ensure_faculty_profile(db, user)

        return FacultyService._to_response(profile, user)

    @staticmethod
    async def update_faculty_profile(db: AsyncSession, user_id: str, req: FacultyProfileUpdate) -> FacultyProfileResponse:
        user_res = await db.execute(select(User).where(User.id == user_id).options(selectinload(User.faculty_profile)))
        user = user_res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        profile = user.faculty_profile
        if not profile:
            profile = await FacultyService.ensure_faculty_profile(db, user)

        if req.name is not None:
            user.name = req.name

        if req.phone is not None:
            profile.phone = req.phone
        if req.department is not None:
            profile.department = req.department
        if req.designation is not None:
            profile.designation = req.designation
        if req.assigned_batches is not None:
            profile.assigned_batches = req.assigned_batches
        if req.profile_picture_url is not None:
            profile.profile_picture_url = req.profile_picture_url

        await db.commit()
        await db.refresh(profile)
        await db.refresh(user)

        return FacultyService._to_response(profile, user)

    @staticmethod
    async def get_batches_summary(db: AsyncSession) -> List[BatchSummaryResponse]:
        summaries = []
        for batch in ALLOWED_BATCHES:
            # Student count
            st_count_res = await db.execute(
                select(func.count(StudentProfile.id)).where(StudentProfile.batch == batch)
            )
            student_count = st_count_res.scalar() or 0

            # Completed count
            comp_count_res = await db.execute(
                select(func.count(StudentProfile.id)).where(
                    StudentProfile.batch == batch,
                    StudentProfile.profile_completed == True
                )
            )
            completed_count = comp_count_res.scalar() or 0

            # Active permissions count
            perm_count_res = await db.execute(
                select(func.count(ProfileEditPermission.id))
                .join(StudentProfile, ProfileEditPermission.student_profile_id == StudentProfile.id)
                .where(
                    StudentProfile.batch == batch,
                    ProfileEditPermission.status == PermissionStatus.ACTIVE
                )
            )
            active_perm_count = perm_count_res.scalar() or 0

            summaries.append(
                BatchSummaryResponse(
                    batch=batch,
                    student_count=student_count,
                    completed_count=completed_count,
                    locked_count=completed_count,
                    active_permission_count=active_perm_count
                )
            )
        return summaries

    @staticmethod
    async def get_students_by_batch(
        db: AsyncSession,
        batch: str,
        search: Optional[str] = None
    ) -> List[StudentResponse]:
        clean_batch = batch.strip().upper()
        if clean_batch not in ALLOWED_BATCHES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid batch '{batch}'. Allowed: {', '.join(ALLOWED_BATCHES)}"
            )

        return await StudentService.get_students(db, search=search, batch=clean_batch)
