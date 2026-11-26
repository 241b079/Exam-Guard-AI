import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.database import engine


@pytest.mark.asyncio
async def test_auto_publish_and_manual_publish_all_results():
    """
    Integration test verifying:
    - auto_publish_results = False: Results stay UNPUBLISHED after student submission.
    - Faculty bulk release endpoint (/api/v1/exams/{exam_id}/publish-results):
      Publishes all submitted non-disqualified student attempts in one go.
    - auto_publish_results = True: Results are published immediately on submission.
    - Disqualified attempts are NEVER published by publish-results.
    - Strict compliance with AGENTS.md: immediate teardown in try...finally.
    """
    created_user_ids = []
    created_exam_ids = []

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Register temporary faculty and 2 temporary students
            fac_email = f"temp_fac_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Publication Lead",
                "email": fac_email,
                "password": "Password123!",
                "role": "FACULTY",
            })
            assert fac_reg.status_code == 201
            faculty_id = fac_reg.json()["id"]
            created_user_ids.append(faculty_id)

            fac_login = await ac.post("/api/v1/auth/login", json={
                "email": fac_email,
                "password": "Password123!",
            })
            fac_headers = {"Authorization": f"Bearer {fac_login.json()['access_token']}"}

            stu1_email = f"temp_stu1_{uuid.uuid4().hex[:8]}@student.edu"
            stu1_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Candidate Alpha",
                "email": stu1_email,
                "password": "Password123!",
                "role": "STUDENT",
            })
            assert stu1_reg.status_code == 201
            stu1_id = stu1_reg.json()["id"]
            created_user_ids.append(stu1_id)

            stu1_login = await ac.post("/api/v1/auth/login", json={
                "email": stu1_email,
                "password": "Password123!",
            })
            stu1_headers = {"Authorization": f"Bearer {stu1_login.json()['access_token']}"}

            stu2_email = f"temp_stu2_{uuid.uuid4().hex[:8]}@student.edu"
            stu2_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Candidate Beta Disqualified",
                "email": stu2_email,
                "password": "Password123!",
                "role": "STUDENT",
            })
            assert stu2_reg.status_code == 201
            stu2_id = stu2_reg.json()["id"]
            created_user_ids.append(stu2_id)

            stu2_login = await ac.post("/api/v1/auth/login", json={
                "email": stu2_email,
                "password": "Password123!",
            })
            stu2_headers = {"Authorization": f"Bearer {stu2_login.json()['access_token']}"}

            # 2. Test Exam 1: Manual Release (auto_publish_results = False)
            exam1_res = await ac.post("/api/v1/exams", json={
                "title": f"Manual Publish Exam {uuid.uuid4().hex[:6]}",
                "duration_minutes": 15,
                "negative_marking": "NONE",
                "assignment_type": "ALL_STUDENTS",
                "availability_type": "ALWAYS",
                "auto_publish_results": False,
            }, headers=fac_headers)
            assert exam1_res.status_code == 201
            exam1_id = exam1_res.json()["id"]
            assert exam1_res.json()["auto_publish_results"] is False
            created_exam_ids.append(exam1_id)

            q_res = await ac.post(f"/api/v1/exams/{exam1_id}/questions", json={
                "question_type": "MCQ",
                "question_text": "What is 2 + 2?",
                "options": ["3", "4", "5", "6"],
                "correct_answer": "4",
                "marks": 10.0,
            }, headers=fac_headers)
            assert q_res.status_code == 201
            question_id = q_res.json()["id"]

            await ac.post(f"/api/v1/exams/{exam1_id}/publish", headers=fac_headers)

            # Student 1 attempts and submits Exam 1
            att1_res = await ac.post(f"/api/v1/exams/{exam1_id}/attempts", headers=stu1_headers)
            assert att1_res.status_code == 201
            attempt1_id = att1_res.json()["id"]

            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE exam_attempts SET identity_verified = TRUE, identity_verified_at = NOW() WHERE id = :id"),
                    {"id": attempt1_id}
                )

            # Submit answer
            await ac.post(f"/api/v1/attempts/{attempt1_id}/answers", json={
                "question_id": question_id,
                "selected_option": "4",
            }, headers=stu1_headers)

            # Submit attempt
            sub1_res = await ac.post(f"/api/v1/attempts/{attempt1_id}/submit", headers=stu1_headers)
            assert sub1_res.status_code == 200

            # Student 2 attempts Exam 1, but is DISQUALIFIED
            att2_res = await ac.post(f"/api/v1/exams/{exam1_id}/attempts", headers=stu2_headers)
            assert att2_res.status_code == 201
            attempt2_id = att2_res.json()["id"]

            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE exam_attempts SET identity_verified = TRUE, identity_verified_at = NOW(), status = 'SUBMITTED', publication_status = 'DISQUALIFIED' WHERE id = :id"),
                    {"id": attempt2_id}
                )

            # Check Student 1 results: should be UNPUBLISHED because auto_publish_results is False
            res1 = await ac.get(f"/api/v1/exams/{exam1_id}/my-result", headers=stu1_headers)
            assert res1.status_code == 200
            assert res1.json()["publication_status"] == "UNPUBLISHED"

            # 3. Faculty calls publish-results on Exam 1
            bulk_pub_res = await ac.post(f"/api/v1/exams/{exam1_id}/publish-results", headers=fac_headers)
            assert bulk_pub_res.status_code == 200, bulk_pub_res.text
            bulk_pub_data = bulk_pub_res.json()
            assert bulk_pub_data["success"] is True
            assert bulk_pub_data["published_count"] == 1  # Only student 1, student 2 is disqualified

            # Student 1 results now PUBLISHED
            res1_after = await ac.get(f"/api/v1/exams/{exam1_id}/my-result", headers=stu1_headers)
            assert res1_after.status_code == 200
            assert res1_after.json()["publication_status"] == "PUBLISHED"
            assert res1_after.json()["total_score"] == 10.0

            # Student 2 attempt remains DISQUALIFIED
            async with engine.begin() as conn:
                res2_db = await conn.execute(
                    text("SELECT publication_status FROM exam_attempts WHERE id = :id"),
                    {"id": attempt2_id}
                )
                assert res2_db.scalar() == "DISQUALIFIED"

            # 4. Test Exam 2: Immediate Publication (auto_publish_results = True)
            exam2_res = await ac.post("/api/v1/exams", json={
                "title": f"Auto Publish Exam {uuid.uuid4().hex[:6]}",
                "duration_minutes": 15,
                "negative_marking": "NONE",
                "assignment_type": "ALL_STUDENTS",
                "availability_type": "ALWAYS",
                "auto_publish_results": True,
            }, headers=fac_headers)
            assert exam2_res.status_code == 201
            exam2_id = exam2_res.json()["id"]
            assert exam2_res.json()["auto_publish_results"] is True
            created_exam_ids.append(exam2_id)

            await ac.post(f"/api/v1/exams/{exam2_id}/questions", json={
                "question_type": "MCQ",
                "question_text": "What is 3 + 3?",
                "options": ["5", "6", "7", "8"],
                "correct_answer": "6",
                "marks": 5.0,
            }, headers=fac_headers)

            await ac.post(f"/api/v1/exams/{exam2_id}/publish", headers=fac_headers)

            att3_res = await ac.post(f"/api/v1/exams/{exam2_id}/attempts", headers=stu1_headers)
            assert att3_res.status_code == 201
            attempt3_id = att3_res.json()["id"]

            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE exam_attempts SET identity_verified = TRUE, identity_verified_at = NOW() WHERE id = :id"),
                    {"id": attempt3_id}
                )

            # Submit attempt on auto_publish_results = True exam
            sub3_res = await ac.post(f"/api/v1/attempts/{attempt3_id}/submit", headers=stu1_headers)
            assert sub3_res.status_code == 200

            # Should immediately be PUBLISHED!
            res3 = await ac.get(f"/api/v1/exams/{exam2_id}/my-result", headers=stu1_headers)
            assert res3.status_code == 200
            assert res3.json()["publication_status"] == "PUBLISHED"

    finally:
        # Strict teardown per AGENTS.md
        async with engine.begin() as conn:
            if created_exam_ids:
                await conn.execute(text("DELETE FROM notifications WHERE user_id = ANY(:ids)"), {"ids": created_user_ids})
                await conn.execute(text("DELETE FROM proctoring_events WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM student_risk_scores WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM examination_investigations WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM exam_violations WHERE exam_attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = ANY(:ids))"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM answers WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = ANY(:ids))"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM exam_attempts WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM questions WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": created_exam_ids})
            if created_user_ids:
                await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created_user_ids})
