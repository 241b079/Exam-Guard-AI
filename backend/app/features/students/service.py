import csv
import io
import re
import secrets
from typing import List, Optional
from fastapi import HTTPException, status, UploadFile
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.users.models import User, UserRole
from app.features.users.service import UserService
from app.features.students.models import StudentProfile
from app.features.students.schemas import (
    StudentCreate,
    StudentUpdate,
    StudentStatusPatch,
    StudentResponse,
    StudentImportRow,
    StudentImportPreviewResponse
)
from app.core.security import hash_password

EMAIL_REGEX = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")


class StudentService:
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
            )
            db.add(profile)
            await db.commit()
            await db.refresh(profile)
        return profile

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
            phone=req.phone,
            department=req.department,
            course=req.course,
            semester=req.semester,
            section=req.section,
            date_of_birth=req.date_of_birth,
            gender=req.gender,
            address=req.address
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
                # Auto-create profile if missing for self-registered students
                await StudentService.ensure_student_profile(db, user)

        # Now query StudentProfile list
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

        if status_filter and status_filter.lower() != "all":
            if status_filter.lower() == "active":
                query = query.where(User.is_active == True)
            elif status_filter.lower() in ["inactive", "disabled"]:
                query = query.where(User.is_active == False)

        query = query.order_by(StudentProfile.created_at.desc())
        result = await db.execute(query)
        profiles = result.scalars().all()

        return [StudentService._to_response(p, p.user) for p in profiles]

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
        return StudentService._to_response(profile, profile.user)

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

        for field in ["phone", "department", "course", "semester", "section", "date_of_birth", "gender", "address"]:
            val = getattr(req, field, None)
            if val is not None:
                setattr(profile, field, val)

        await db.commit()
        await db.refresh(profile)
        await db.refresh(user)

        return StudentService._to_response(profile, user)

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
        return StudentService._to_response(profile, profile.user)

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
            phone = lowered.get("phone") or lowered.get("phone_number font") or ""
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
                phone=row.phone,
                department=row.department,
                course=row.course,
                semester=row.semester,
                section=row.section,
                date_of_birth=row.date_of_birth,
                gender=row.gender,
                address=row.address
            )
            db.add(profile)
            created.append((profile, user))

        await db.commit()

        for p, u in created:
            await db.refresh(p)

        return [StudentService._to_response(p, u) for p, u in created]

    @staticmethod
    def _to_response(profile: StudentProfile, user: User) -> StudentResponse:
        return StudentResponse(
            id=profile.id,
            user_id=user.id,
            name=user.name,
            email=user.email,
            is_active=user.is_active,
            student_id=profile.student_id,
            phone=profile.phone,
            department=profile.department,
            course=profile.course,
            semester=profile.semester,
            section=profile.section,
            date_of_birth=profile.date_of_birth,
            gender=profile.gender,
            address=profile.address,
            created_at=profile.created_at,
            updated_at=profile.updated_at
        )
