import csv
import io
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import HTTPException, status, UploadFile
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.users.models import User, UserRole
from app.features.users.service import UserService
from app.features.students.models import StudentProfile
from app.features.students.permission_models import ProfileEditPermission, PermissionStatus
from app.features.students.schemas import (
    ALLOWED_BATCHES,
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
from app.core.security import hash_password

EMAIL_REGEX = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")


class StudentService:
    @staticmethod
    def _permission_to_response(perm: ProfileEditPermission) -> PermissionResponse:
        return PermissionResponse(
            id=perm.id,
            student_profile_id=perm.student_profile_id,
            granted_by_id=perm.granted_by_id,
            granted_by_name=perm.granted_by.name if perm.granted_by else "Faculty",
            allowed_fields=perm.allowed_fields or [],
            status=perm.status,
            granted_at=perm.granted_at,
            expires_at=perm.expires_at,
            used_at=perm.used_at,
            notes=perm.notes
        )

    @staticmethod
    def _to_response(
        profile: StudentProfile,
        user: User,
        active_perm: Optional[ProfileEditPermission] = None
    ) -> StudentResponse:
        return StudentResponse(
            id=profile.id,
            user_id=user.id,
            name=user.name,
            email=user.email,
            is_active=user.is_active,
            student_id=profile.student_id,
            batch=profile.batch,
            phone=profile.phone,
            department=profile.department,
            course=profile.course,
            semester=profile.semester,
            section=profile.section,
            date_of_birth=profile.date_of_birth,
            gender=profile.gender,
            address=profile.address,
            profile_picture_url=profile.profile_picture_url,
            profile_completed=profile.profile_completed,
            active_permission=StudentService._permission_to_response(active_perm) if active_perm else None,
            created_at=profile.created_at,
            updated_at=profile.updated_at
        )

    @staticmethod
    async def ensure_student_profile(db: AsyncSession, user: User) -> StudentProfile:
        """Ensure every student user has a corresponding StudentProfile."""
        result = await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == user.id)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            st_id = f"ST-{user.id[:8].upper()}"
            profile = StudentProfile(
                user_id=user.id,
                student_id=st_id,
                profile_completed=False
            )
            db.add(profile)
            await db.commit()
            await db.refresh(profile)
        return profile

    @staticmethod
    async def get_active_permission(
        db: AsyncSession,
        student_profile_id: str
    ) -> Optional[ProfileEditPermission]:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(ProfileEditPermission)
            .where(
                ProfileEditPermission.student_profile_id == student_profile_id,
                ProfileEditPermission.status == PermissionStatus.ACTIVE
            )
            .options(selectinload(ProfileEditPermission.granted_by))
            .order_by(ProfileEditPermission.granted_at.desc())
        )
        perm = result.scalars().first()
        if not perm:
            return None

        # Check expiry
        if perm.expires_at and perm.expires_at < now:
            perm.status = PermissionStatus.EXPIRED
            await db.commit()
            return None

        return perm

    @staticmethod
    async def create_student(db: AsyncSession, req: StudentCreate) -> StudentResponse:
        # Check duplicate email
        existing_email = await UserService.get_by_email(db, req.email)
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{req.email}' is already registered."
            )

        # Check duplicate student_id
        st_res = await db.execute(select(StudentProfile).where(StudentProfile.student_id == req.student_id.strip()))
        if st_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Student ID / Roll Number '{req.student_id}' is already registered."
            )

        # Generate default password if not provided
        raw_password = req.password if req.password else f"Student@{secrets.token_hex(4)}"

        user = User(
            name=req.name,
            email=req.email.lower(),
            password_hash=hash_password(raw_password),
            role=UserRole.STUDENT,
            is_active=True
        )
        db.add(user)
        await db.flush()  # Generate user.id

        profile = StudentProfile(
            user_id=user.id,
            student_id=req.student_id.strip(),
            batch=req.batch,
            phone=req.phone,
            department=req.department,
            course=req.course,
            semester=req.semester,
            section=req.section,
            date_of_birth=req.date_of_birth,
            gender=req.gender,
            address=req.address,
            profile_completed=False
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

        return StudentService._to_response(profile, user)

    @staticmethod
    async def get_students(
        db: AsyncSession,
        search: Optional[str] = None,
        department: Optional[str] = None,
        batch: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> List[StudentResponse]:
        # Query all users with role STUDENT
        student_users_res = await db.execute(
            select(User).where(User.role == UserRole.STUDENT).options(selectinload(User.student_profile))
        )
        student_users = student_users_res.scalars().all()

        # Ensure all student users have a StudentProfile
        for user in student_users:
            if not user.student_profile:
                await StudentService.ensure_student_profile(db, user)

        query = select(StudentProfile).join(StudentProfile.user).options(selectinload(StudentProfile.user))

        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                or_(
                    User.name.ilike(term),
                    User.email.ilike(term),
                    StudentProfile.student_id.ilike(term),
                    StudentProfile.department.ilike(term)
                )
            )

        if department and department.strip() and department.lower() != "all":
            query = query.where(StudentProfile.department.ilike(department.strip()))

        if batch and batch.strip() and batch.lower() != "all":
            query = query.where(StudentProfile.batch == batch.strip().upper())

        if status_filter and status_filter.lower() != "all":
            if status_filter.lower() == "active":
                query = query.where(User.is_active == True)
            elif status_filter.lower() in ["inactive", "disabled"]:
                query = query.where(User.is_active == False)

        query = query.order_by(StudentProfile.created_at.desc())
        result = await db.execute(query)
        profiles = result.scalars().all()

        responses = []
        for p in profiles:
            active_perm = await StudentService.get_active_permission(db, p.id)
            responses.append(StudentService._to_response(p, p.user, active_perm))

        return responses

    @staticmethod
    async def get_student_by_id(db: AsyncSession, student_profile_id: str) -> StudentResponse:
        result = await db.execute(
            select(StudentProfile)
            .where(or_(StudentProfile.id == student_profile_id, StudentProfile.student_id == student_profile_id))
            .options(selectinload(StudentProfile.user))
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        active_perm = await StudentService.get_active_permission(db, profile.id)
        return StudentService._to_response(profile, profile.user, active_perm)

    @staticmethod
    async def update_student(db: AsyncSession, student_profile_id: str, req: StudentUpdate) -> StudentResponse:
        result = await db.execute(
            select(StudentProfile)
            .where(StudentProfile.id == student_profile_id)
            .options(selectinload(StudentProfile.user))
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        user = profile.user

        # Email update check
        if req.email and req.email.lower() != user.email.lower():
            existing = await UserService.get_by_email(db, req.email)
            if existing and existing.id != user.id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Email '{req.email}' is in use.")
            user.email = req.email.lower()

        if req.name:
            user.name = req.name

        for field in ["batch", "phone", "department", "course", "semester", "section", "date_of_birth", "gender", "address", "profile_picture_url"]:
            val = getattr(req, field, None)
            if val is not None:
                setattr(profile, field, val)

        await db.commit()
        await db.refresh(profile)
        await db.refresh(user)

        active_perm = await StudentService.get_active_permission(db, profile.id)
        return StudentService._to_response(profile, user, active_perm)

    @staticmethod
    async def update_self_profile(db: AsyncSession, user_id: str, req: StudentSelfUpdate) -> StudentResponse:
        user_res = await db.execute(select(User).where(User.id == user_id).options(selectinload(User.student_profile)))
        user = user_res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        profile = user.student_profile
        if not profile:
            profile = await StudentService.ensure_student_profile(db, user)

        updates = req.model_dump(exclude_unset=True)

        if not profile.profile_completed:
            # First-time profile completion: unrestricted for initial setup
            if "name" in updates and updates["name"]:
                user.name = updates["name"]

            for field in ["batch", "phone", "course", "semester", "section", "date_of_birth", "gender", "address", "profile_picture_url"]:
                if field in updates:
                    setattr(profile, field, updates[field])

            # Lock profile after completion
            profile.profile_completed = True
            await db.commit()
            await db.refresh(profile)
            await db.refresh(user)
            return StudentService._to_response(profile, user)

        # Profile is already completed -> Profile is strictly LOCKED unless active permission exists
        active_perm = await StudentService.get_active_permission(db, profile.id)
        if not active_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Profile is locked. Please request an edit permission from your faculty."
            )

        # Granular field-level permission check: verify only permitted fields are being modified
        allowed_set = set(active_perm.allowed_fields or [])
        changed_fields = []

        for field, new_val in updates.items():
            if field == "name":
                curr_val = user.name
            else:
                curr_val = getattr(profile, field, None)

            # Check if this field is actually being changed
            if new_val is not None and new_val != curr_val:
                if field not in allowed_set:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Field '{field}' is locked and not in your faculty-approved edit permission."
                    )
                changed_fields.append(field)
                if field == "name":
                    user.name = new_val
                else:
                    setattr(profile, field, new_val)

        if changed_fields:
            # Consume the active permission immediately upon successful edit
            active_perm.status = PermissionStatus.USED
            active_perm.used_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(profile)
        await db.refresh(user)

        return StudentService._to_response(profile, user, None)

    @staticmethod
    async def grant_permission(
        db: AsyncSession,
        student_profile_id: str,
        granted_by: User,
        req: PermissionGrantRequest
    ) -> PermissionResponse:
        if granted_by.role not in [UserRole.FACULTY, UserRole.ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only faculty or administrators can grant profile edit permissions."
            )

        # Get student profile
        result = await db.execute(
            select(StudentProfile)
            .where(or_(StudentProfile.id == student_profile_id, StudentProfile.student_id == student_profile_id))
            .options(selectinload(StudentProfile.user))
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        # Security check: User cannot grant permission to themselves
        if profile.user_id == granted_by.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot grant profile edit permissions to yourself."
            )

        # Revoke existing active permissions
        existing_active_res = await db.execute(
            select(ProfileEditPermission).where(
                ProfileEditPermission.student_profile_id == profile.id,
                ProfileEditPermission.status == PermissionStatus.ACTIVE
            )
        )
        for old_perm in existing_active_res.scalars().all():
            old_perm.status = PermissionStatus.REVOKED

        # Calculate expiration
        hours = req.expires_hours if req.expires_hours else 24
        expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)

        new_perm = ProfileEditPermission(
            student_profile_id=profile.id,
            granted_by_id=granted_by.id,
            allowed_fields=req.allowed_fields,
            status=PermissionStatus.ACTIVE,
            expires_at=expires_at,
            notes=req.notes
        )
        db.add(new_perm)
        await db.commit()
        await db.refresh(new_perm)
        new_perm.granted_by = granted_by

        return StudentService._permission_to_response(new_perm)

    @staticmethod
    async def revoke_permission(
        db: AsyncSession,
        permission_id: str,
        current_user: User
    ) -> PermissionResponse:
        if current_user.role not in [UserRole.FACULTY, UserRole.ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only faculty or administrators can revoke permissions."
            )

        result = await db.execute(
            select(ProfileEditPermission)
            .where(ProfileEditPermission.id == permission_id)
            .options(selectinload(ProfileEditPermission.granted_by))
        )
        perm = result.scalar_one_or_none()
        if not perm:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission record not found")

        perm.status = PermissionStatus.REVOKED
        await db.commit()
        await db.refresh(perm)

        return StudentService._permission_to_response(perm)

    @staticmethod
    async def get_student_permissions(
        db: AsyncSession,
        student_profile_id: str
    ) -> List[PermissionResponse]:
        # Resolve profile id if student_id is passed
        result = await db.execute(
            select(StudentProfile)
            .where(or_(StudentProfile.id == student_profile_id, StudentProfile.student_id == student_profile_id))
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        perms_res = await db.execute(
            select(ProfileEditPermission)
            .where(ProfileEditPermission.student_profile_id == profile.id)
            .options(selectinload(ProfileEditPermission.granted_by))
            .order_by(ProfileEditPermission.created_at.desc())
        )
        perms = perms_res.scalars().all()
        return [StudentService._permission_to_response(p) for p in perms]

    @staticmethod
    async def patch_status(db: AsyncSession, student_profile_id: str, is_active: bool) -> StudentResponse:
        result = await db.execute(
            select(StudentProfile)
            .where(StudentProfile.id == student_profile_id)
            .options(selectinload(StudentProfile.user))
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

        profile.user.is_active = is_active
        await db.commit()
        await db.refresh(profile.user)
        active_perm = await StudentService.get_active_permission(db, profile.id)
        return StudentService._to_response(profile, profile.user, active_perm)

    @staticmethod
    async def parse_and_validate_import_file(db: AsyncSession, file: UploadFile) -> StudentImportPreviewResponse:
        content = await file.read()
        text_stream = io.StringIO(content.decode("utf-8-sig", errors="ignore"))
        reader = csv.DictReader(text_stream)

        # Existing DB Emails and Student IDs
        existing_users = await db.execute(select(User.email))
        existing_emails = set(e.lower() for e in existing_users.scalars().all())

        existing_st = await db.execute(select(StudentProfile.student_id))
        existing_st_ids = set(s.lower() for s in existing_st.scalars().all())

        seen_emails_in_file = set()
        seen_st_ids_in_file = set()

        rows = []
        row_num = 1
        for row in reader:
            row_num += 1
            lowered = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items() if k}

            name = lowered.get("name") or lowered.get("full_name") or lowered.get("full name") or ""
            email = lowered.get("email") or ""
            st_id = lowered.get("student_id") or lowered.get("student id") or lowered.get("roll_number") or lowered.get("roll no") or ""
            batch = lowered.get("batch") or ""
            phone = lowered.get("phone") or lowered.get("phone_number") or ""
            dept = lowered.get("department") or lowered.get("dept") or ""
            course = lowered.get("course") or lowered.get("program") or ""
            sem_str = lowered.get("semester") or lowered.get("sem") or ""
            sec = lowered.get("section") or ""
            dob = lowered.get("date_of_birth") or lowered.get("dob") or ""
            gender = lowered.get("gender") or ""
            address = lowered.get("address") or ""

            errors = []

            if not name:
                errors.append("Name is required.")
            if not email:
                errors.append("Email is required.")
            elif not EMAIL_REGEX.match(email):
                errors.append("Invalid email format.")
            elif email.lower() in existing_emails:
                errors.append("Email already exists in database.")
            elif email.lower() in seen_emails_in_file:
                errors.append("Duplicate email found in import file.")

            if not st_id:
                errors.append("Student ID / Roll Number is required.")
            elif st_id.lower() in existing_st_ids:
                errors.append("Student ID already exists in database.")
            elif st_id.lower() in seen_st_ids_in_file:
                errors.append("Duplicate Student ID found in import file.")

            clean_batch = None
            if batch:
                clean_batch = batch.strip().upper()
                if clean_batch not in ALLOWED_BATCHES:
                    errors.append(f"Invalid batch '{batch}'. Allowed options: {', '.join(ALLOWED_BATCHES)}")

            semester_int = None
            if sem_str:
                try:
                    semester_int = int(sem_str)
                    if semester_int < 1 or semester_int > 12:
                        errors.append("Semester must be between 1 and 12.")
                except ValueError:
                    errors.append("Invalid semester number.")

            if email:
                seen_emails_in_file.add(email.lower())
            if st_id:
                seen_st_ids_in_file.add(st_id.lower())

            rows.append(
                StudentImportRow(
                    row_number=row_num,
                    name=name,
                    email=email,
                    student_id=st_id,
                    batch=clean_batch,
                    phone=phone or None,
                    department=dept or None,
                    course=course or None,
                    semester=semester_int,
                    section=sec or None,
                    date_of_birth=dob or None,
                    gender=gender or None,
                    address=address or None,
                    is_valid=len(errors) == 0,
                    errors=errors
                )
            )

        valid_cnt = sum(1 for r in rows if r.is_valid)
        invalid_cnt = sum(1 for r in rows if not r.is_valid)

        return StudentImportPreviewResponse(
            total_rows=len(rows),
            valid_count=valid_cnt,
            invalid_count=invalid_cnt,
            rows=rows
        )

    @staticmethod
    async def commit_imported_students(db: AsyncSession, rows: List[StudentImportRow]) -> List[StudentResponse]:
        created = []
        for row in rows:
            if not row.is_valid:
                continue

            raw_password = f"Student@{secrets.token_hex(4)}"
            user = User(
                name=row.name,
                email=row.email.lower(),
                password_hash=hash_password(raw_password),
                role=UserRole.STUDENT,
                is_active=True
            )
            db.add(user)
            await db.flush()

            profile = StudentProfile(
                user_id=user.id,
                student_id=row.student_id.strip(),
                batch=row.batch.upper() if row.batch else None,
                phone=row.phone,
                department=row.department,
                course=row.course,
                semester=row.semester,
                section=row.section,
                date_of_birth=row.date_of_birth,
                gender=row.gender,
                address=row.address,
                profile_completed=False
            )
            db.add(profile)
            created.append((profile, user))

        await db.commit()

        for p, u in created:
            await db.refresh(p)

        return [StudentService._to_response(p, u) for p, u in created]

    @staticmethod
    async def get_student_by_user_id(db: AsyncSession, user_id: str) -> StudentResponse:
        user_res = await db.execute(select(User).where(User.id == user_id))
        user = user_res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
        prof_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user_id))
        profile = prof_res.scalar_one_or_none()
        if not profile:
            profile = await StudentService.ensure_student_profile(db, user)

        active_perm = await StudentService.get_active_permission(db, profile.id)
        return StudentService._to_response(profile, user, active_perm)

    @staticmethod
    async def update_profile_picture(db: AsyncSession, user_id: str, photo_url: str) -> StudentResponse:
        result = await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == user_id).options(selectinload(StudentProfile.user))
        )
        profile = result.scalar_one_or_none()
        if not profile:
            user_res = await db.execute(select(User).where(User.id == user_id))
            user = user_res.scalar_one_or_none()
            if not user:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
            profile = await StudentService.ensure_student_profile(db, user)
            profile.user = user

        # If profile completed, check active permission allows profile_picture_url
        if profile.profile_completed:
            active_perm = await StudentService.get_active_permission(db, profile.id)
            if not active_perm:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Profile photo is locked. Please request edit permission from faculty."
                )
            if "profile_picture_url" not in (active_perm.allowed_fields or []):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Updating profile picture is not permitted in your active permission."
                )
            active_perm.status = PermissionStatus.USED
            active_perm.used_at = datetime.now(timezone.utc)

        profile.profile_picture_url = photo_url
        await db.commit()
        await db.refresh(profile)
        return StudentService._to_response(profile, profile.user)
