import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from app.main import app
from app.core.database import engine, AsyncSessionLocal
from app.features.users.models import User, UserRole
from app.core.security import hash_password, create_access_token
from app.features.exams.models import Exam, ExamStatus
from app.features.attempts.models import ExamAttempt, AttemptStatus
from app.features.proctoring.models import DisqualificationRecord

@pytest.mark.asyncio
async def test_student_history_and_appeal_workflow():
    transport = ASGITransport(app=app)
    created_user_ids = []
    created_exam_ids = []
    created_attempt_ids = []

    try:
        async with AsyncSessionLocal() as session:
            # Create student and faculty
            faculty = User(
                email="test_fac_history@univ.edu",
                password_hash=hash_password("FacultyPass123!"),
                name="Test Faculty History",
                role=UserRole.FACULTY,
                is_active=True
            )
            student = User(
                email="test_stu_history@univ.edu",
                password_hash=hash_password("StudentPass123!"),
                name="Test Student History",
                role=UserRole.STUDENT,
                is_active=True
            )
            session.add_all([faculty, student])
            await session.commit()
            await session.refresh(faculty)
            await session.refresh(student)
            created_user_ids.extend([faculty.id, student.id])

            # Create an exam
            exam = Exam(
                title="Integrity & History Test Exam",
                description="Testing student attempt history and appeals",
                duration_minutes=30,
                total_marks=20.0,
                created_by_id=faculty.id,
                status=ExamStatus.PUBLISHED,
                auto_publish_results=False
            )
            session.add(exam)
            await session.commit()
            await session.refresh(exam)
            created_exam_ids.append(exam.id)

            # Create attempt 1: submitted, unpublished
            att1 = ExamAttempt(
                exam_id=exam.id,
                student_id=student.id,
                attempt_number=1,
                status=AttemptStatus.SUBMITTED,
                total_score=15.0,
                max_possible_score=20.0,
                publication_status="UNPUBLISHED",
                integrity_status="PENDING_REVIEW"
            )
            # Create attempt 2: submitted, disqualified
            att2 = ExamAttempt(
                exam_id=exam.id,
                student_id=student.id,
                attempt_number=2,
                status=AttemptStatus.SUBMITTED,
                total_score=0.0,
                max_possible_score=20.0,
                publication_status="DISQUALIFIED",
                integrity_status="DISQUALIFIED"
            )
            session.add_all([att1, att2])
            await session.commit()
            await session.refresh(att1)
            await session.refresh(att2)
            created_attempt_ids.extend([att1.id, att2.id])

            # Create disqualification record for attempt 2
            disq = DisqualificationRecord(
                exam_attempt_id=att2.id,
                exam_id=exam.id,
                student_id=student.id,
                faculty_id=faculty.id,
                reason="Observed unauthorized phone usage and repeated tab switching.",
                evidence_summary="Risk score 78.5, 2 high-confidence phone detections.",
                final_risk_score=78.5,
                is_appealable=True,
                appeal_status="NONE"
            )
            session.add(disq)
            await session.commit()

        student_token = create_access_token(user_id=student.id, role=UserRole.STUDENT.value)
        faculty_token = create_access_token(user_id=faculty.id, role=UserRole.FACULTY.value)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Fetch student results
            res = await client.get(
                "/api/v1/student/results",
                headers={"Authorization": f"Bearer {student_token}"}
            )
            assert res.status_code == 200, res.text
            items = res.json()
            assert len(items) >= 2

            # Find att1 and att2
            att1_data = next((i for i in items if i["attempt_id"] == att1.id), None)
            att2_data = next((i for i in items if i["attempt_id"] == att2.id), None)
            assert att1_data is not None
            assert att2_data is not None

            # Att 1: unpublished -> marks withheld
            assert att1_data["publication_status"] == "UNPUBLISHED"
            assert att1_data["total_score"] is None
            assert att1_data["is_disqualified"] is False

            # Att 2: disqualified -> grade 0, reason populated, appealable
            assert att2_data["is_disqualified"] is True
            assert att2_data["publication_status"] == "DISQUALIFIED"
            assert att2_data["total_score"] == 0.0
            assert "unauthorized phone" in att2_data["disqualification_reason"]
            assert att2_data["is_appealable"] is True
            assert att2_data["appeal_status"] == "NONE"

            # 2. Attempt appeal on non-disqualified att1 -> should fail
            bad_appeal = await client.post(
                f"/api/v1/student/attempts/{att1.id}/appeal",
                headers={"Authorization": f"Bearer {student_token}"},
                json={"reason": "I want a regrade please because I got a question right"}
            )
            assert bad_appeal.status_code == 400

            # 3. Submit appeal on disqualified att2
            appeal_res = await client.post(
                f"/api/v1/student/attempts/{att2.id}/appeal",
                headers={"Authorization": f"Bearer {student_token}"},
                json={"reason": "My network dropped during the test and my phone received an emergency alert. I never used it for cheating."}
            )
            assert appeal_res.status_code == 200, appeal_res.text
            assert appeal_res.json()["appeal_status"] == "PENDING_REVIEW"

            # 4. Check results again -> appeal_status is now PENDING_REVIEW
            res2 = await client.get(
                f"/api/v1/student/results?exam_id={exam.id}",
                headers={"Authorization": f"Bearer {student_token}"}
            )
            assert res2.status_code == 200
            items2 = res2.json()
            att2_updated = next(i for i in items2 if i["attempt_id"] == att2.id)
            assert att2_updated["appeal_status"] == "PENDING_REVIEW"
            assert "emergency alert" in att2_updated["appeal_reason"]

            # 5. Faculty reviews and approves appeal
            decision_res = await client.post(
                f"/api/v1/faculty/attempts/{att2.id}/appeal/decision",
                headers={"Authorization": f"Bearer {faculty_token}"},
                json={"decision": "APPROVED", "notes": "Verified emergency alert timestamp. Sanction cleared."}
            )
            assert decision_res.status_code == 200, decision_res.text
            assert decision_res.json()["appeal_status"] == "APPROVED"
            assert decision_res.json()["integrity_status"] == "CLEARED"

    finally:
        # Strict teardown: delete all test artifacts
        async with engine.begin() as conn:
            if created_attempt_ids:
                await conn.execute(text("DELETE FROM disqualification_records WHERE exam_attempt_id = ANY(:ids)"), {"ids": created_attempt_ids})
                await conn.execute(text("DELETE FROM notifications WHERE exam_attempt_id = ANY(:ids)"), {"ids": created_attempt_ids})
                await conn.execute(text("DELETE FROM exam_attempts WHERE id = ANY(:ids)"), {"ids": created_attempt_ids})
            if created_exam_ids:
                await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": created_exam_ids})
            if created_user_ids:
                await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created_user_ids})
