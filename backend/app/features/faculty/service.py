from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.users.models import User, UserRole
from app.features.faculty.models import FacultyProfile
from app.features.faculty.schemas import (
    FacultyProfileResponse,
    FacultyProfileUpdate,
    BatchSummaryResponse,
    ProctoringIncidentSummary,
    StudentSummaryItem,
    FacultyDashboardStatsResponse
)
from app.features.students.models import StudentProfile
from app.features.students.permission_models import ProfileEditPermission, PermissionStatus
from app.features.students.schemas import ALLOWED_BATCHES, StudentResponse
from app.features.students.service import StudentService
from app.features.questions.models import Question
from app.features.exams.models import Exam, ExamStatus

from app.features.attempts.models import ExamAttempt
from app.features.proctoring.models import ProctoringEvent, EventReviewStatus, EventSeverity



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

    @staticmethod
    async def get_dashboard_stats(db: AsyncSession, faculty_user_id: str) -> FacultyDashboardStatsResponse:
        # Exams created by this faculty
        exam_res = await db.execute(select(Exam).where(Exam.created_by_id == faculty_user_id))
        faculty_exams = exam_res.scalars().all()
        total_exams = len(faculty_exams)
        published_exams = sum(1 for e in faculty_exams if e.status == ExamStatus.PUBLISHED)
        faculty_exam_ids = [e.id for e in faculty_exams]
        exam_title_map = {e.id: e.title for e in faculty_exams}

        # Students count and list
        st_count_res = await db.execute(select(func.count(StudentProfile.id)))
        total_students = st_count_res.scalar() or 0

        recent_students_res = await db.execute(
            select(StudentProfile)
            .options(selectinload(StudentProfile.user))
            .order_by(desc(StudentProfile.created_at))
            .limit(5)
        )
        recent_students = []
        for sp in recent_students_res.scalars().all():
            if sp.user:
                recent_students.append(
                    StudentSummaryItem(
                        id=sp.id,
                        user_id=sp.user.id,
                        student_id=sp.student_id,
                        name=sp.user.name,
                        email=sp.user.email,
                        batch=sp.batch,
                        department=sp.department,
                        is_active=sp.user.is_active,
                        profile_completed=sp.profile_completed
                    )
                )

        # Submissions for faculty exams
        if faculty_exam_ids:
            subm_res = await db.execute(
                select(func.count(ExamAttempt.id)).where(ExamAttempt.exam_id.in_(faculty_exam_ids))
            )
            total_submissions = subm_res.scalar() or 0
        else:
            total_submissions = 0

        # Proctoring events for faculty exams
        total_proctoring_events = 0
        pending_reviews = 0
        critical_high_count = 0
        recent_incidents = []

        if faculty_exam_ids:
            total_events_res = await db.execute(
                select(func.count(ProctoringEvent.id)).where(ProctoringEvent.exam_id.in_(faculty_exam_ids))
            )
            total_proctoring_events = total_events_res.scalar() or 0

            pending_res = await db.execute(
                select(func.count(ProctoringEvent.id)).where(
                    ProctoringEvent.exam_id.in_(faculty_exam_ids),
                    ProctoringEvent.review_status == EventReviewStatus.PENDING
                )
            )
            pending_reviews = pending_res.scalar() or 0

            crit_res = await db.execute(
                select(func.count(ProctoringEvent.id)).where(
                    ProctoringEvent.exam_id.in_(faculty_exam_ids),
                    ProctoringEvent.severity.in_([EventSeverity.CRITICAL, EventSeverity.HIGH])
                )
            )
            critical_high_count = crit_res.scalar() or 0

            # 5 most recent events
            recent_events_res = await db.execute(
                select(ProctoringEvent)
                .where(ProctoringEvent.exam_id.in_(faculty_exam_ids))
                .options(selectinload(ProctoringEvent.student))
                .order_by(desc(ProctoringEvent.detected_at))
                .limit(5)
            )
            events = recent_events_res.scalars().all()
            for ev in events:
                student_name = ev.expected_identity or (ev.student.name if ev.student else "Student")
                student_email = ev.student.email if ev.student else None
                evidence_url = f"/api/v1/proctoring/evidence/{ev.id}" if ev.evidence_path else None
                recent_incidents.append(
                    ProctoringIncidentSummary(
                        id=ev.id,
                        exam_id=ev.exam_id,
                        exam_title=exam_title_map.get(ev.exam_id, "Exam"),
                        student_name=student_name,
                        student_email=student_email,
                        event_type=ev.event_type.value if hasattr(ev.event_type, "value") else str(ev.event_type),
                        severity=ev.severity.value if hasattr(ev.severity, "value") else str(ev.severity),
                        review_status=ev.review_status.value if hasattr(ev.review_status, "value") else str(ev.review_status),
                        detected_at=ev.detected_at,
                        evidence_url=evidence_url
                    )
                )

        batches = await FacultyService.get_batches_summary(db)

        return FacultyDashboardStatsResponse(
            total_exams=total_exams,
            published_exams=published_exams,
            total_students=total_students,
            active_students=total_students,
            total_submissions=total_submissions,
            proctoring_total_events=total_proctoring_events,
            proctoring_pending_reviews=pending_reviews,
            proctoring_critical_high=critical_high_count,
            recent_incidents=recent_incidents,
            recent_students=recent_students,
            batches=batches
        )

