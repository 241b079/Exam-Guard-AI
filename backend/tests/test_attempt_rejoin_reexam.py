import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_attempt_policy_rejoin_and_reexam_flow():
    """
    Tests:
    1. Single active exam across exams (Loop 10)
    2. ONE_ATTEMPT policy prevents second attempt without permission (Loop 13)
    3. Faculty grants re-examination permission (Loop 14, 16)
    4. Student consumes re-examination permission to start Attempt #2 (Loop 15, 16)
    5. Rejoin limit enforcement (Loops 11, 12)
    6. Normal session recovery does not consume rejoin (Loop 11)
    7. Idempotent submission (Loop 9)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Setup Faculty
        faculty_email = f"fac_att_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof Attempts", "email": faculty_email, "password": "Password123!", "role": "FACULTY"
        })
        f_login = await ac.post("/api/v1/auth/login", json={"email": faculty_email, "password": "Password123!"})
        f_token = f_login.json()["access_token"]
        f_headers = {"Authorization": f"Bearer {f_token}"}

        # 2. Faculty creates Exam A (ONE_ATTEMPT, max_rejoins=2)
        exam_a_res = await ac.post("/api/v1/exams", json={
            "title": "Exam A - Final",
            "duration_minutes": 60,
            "availability_type": "ALWAYS",
            "attempt_policy": "ONE_ATTEMPT",
            "max_attempts": 1,
            "max_rejoins": 2
        }, headers=f_headers)
        assert exam_a_res.status_code == 201
        exam_a_id = exam_a_res.json()["id"]
        assert exam_a_res.json()["max_rejoins"] == 2
        assert exam_a_res.json()["attempt_policy"] == "ONE_ATTEMPT"

        # Add question and publish Exam A
        await ac.post(f"/api/v1/exams/{exam_a_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "Q1?",
            "options": ["A", "B"],
            "correct_answer": "A",
            "marks": 5.0
        }, headers=f_headers)
        await ac.post(f"/api/v1/exams/{exam_a_id}/publish", headers=f_headers)

        # Faculty creates Exam B
        exam_b_res = await ac.post("/api/v1/exams", json={
            "title": "Exam B - Midterm",
            "duration_minutes": 30,
            "availability_type": "ALWAYS"
        }, headers=f_headers)
        exam_b_id = exam_b_res.json()["id"]
        await ac.post(f"/api/v1/exams/{exam_b_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "Q1?",
            "options": ["X", "Y"],
            "correct_answer": "X",
            "marks": 5.0
        }, headers=f_headers)
        await ac.post(f"/api/v1/exams/{exam_b_id}/publish", headers=f_headers)

        # 3. Setup Student
        student_email = f"stu_att_{uuid.uuid4().hex[:8]}@univ.edu"
        s_reg = await ac.post("/api/v1/auth/register", json={
            "name": "Bob Student", "email": student_email, "password": "Password123!", "role": "STUDENT"
        })
        student_id = s_reg.json()["id"]
        s_login = await ac.post("/api/v1/auth/login", json={"email": student_email, "password": "Password123!"})
        s_token = s_login.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}

        # 4. Student checks active exam (none yet)
        active_res = await ac.get("/api/v1/student/active-exam", headers=s_headers)
        assert active_res.status_code == 200
        assert active_res.json() is None

        # 5. Student starts Exam A with a session token
        session_token_1 = "session_token_laptop_001"
        start_res = await ac.post(
            f"/api/v1/exams/{exam_a_id}/attempts",
            json={"session_token": session_token_1, "is_rejoin": False},
            headers=s_headers
        )
        assert start_res.status_code == 201
        att_a = start_res.json()
        assert att_a["attempt_number"] == 1
        assert att_a["rejoin_count"] == 0
        assert att_a["session_token"] == session_token_1
        attempt_id = att_a["id"]

        # Check active exam summary endpoint (Loop 6)
        active_res2 = await ac.get("/api/v1/student/active-exam", headers=s_headers)
        assert active_res2.status_code == 200
        active_summary = active_res2.json()
        assert active_summary is not None
        assert active_summary["exam_id"] == exam_a_id
        assert active_summary["attempt_id"] == attempt_id

        # 6. Single Active Exam rule (Loop 10): Attempting to start Exam B while Exam A is active must fail
        start_b_res = await ac.post(f"/api/v1/exams/{exam_b_id}/attempts", headers=s_headers)
        assert start_b_res.status_code == 400
        assert "already have an active exam in progress" in start_b_res.json()["detail"]

        # 7. Normal Session Recovery (Loop 11): refresh with same session_token does NOT consume rejoin
        refresh_res = await ac.post(
            f"/api/v1/exams/{exam_a_id}/attempts",
            json={"session_token": session_token_1, "is_rejoin": False},
            headers=s_headers
        )
        assert refresh_res.status_code == 201
        assert refresh_res.json()["id"] == attempt_id
        assert refresh_res.json()["rejoin_count"] == 0  # Still 0, no rejoin consumed!

        # 8. Rejoin Event (Loop 11, 12): student logs in from second session or explicit rejoin
        session_token_2 = "session_token_laptop_002"
        rejoin1_res = await ac.post(
            f"/api/v1/exams/{exam_a_id}/attempts",
            json={"session_token": session_token_2, "is_rejoin": True},
            headers=s_headers
        )
        assert rejoin1_res.status_code == 201
        assert rejoin1_res.json()["id"] == attempt_id
        assert rejoin1_res.json()["rejoin_count"] == 1

        # Second rejoin
        session_token_3 = "session_token_laptop_003"
        rejoin2_res = await ac.post(
            f"/api/v1/exams/{exam_a_id}/attempts",
            json={"session_token": session_token_3, "is_rejoin": True},
            headers=s_headers
        )
        assert rejoin2_res.status_code == 201
        assert rejoin2_res.json()["rejoin_count"] == 2

        # Third rejoin must exceed max_rejoins=2 and be rejected (Loop 12)
        session_token_4 = "session_token_laptop_004"
        rejoin3_res = await ac.post(
            f"/api/v1/exams/{exam_a_id}/attempts",
            json={"session_token": session_token_4, "is_rejoin": True},
            headers=s_headers
        )
        assert rejoin3_res.status_code == 403
        assert "Maximum rejoin limit" in rejoin3_res.json()["detail"]

        # 9. Idempotent submission (Loop 9)
        sub1_res = await ac.post(f"/api/v1/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub1_res.status_code == 200
        sub1_data = sub1_res.json()
        assert sub1_data["status"] == "SUBMITTED"

        # Submit again (double click or reconnect) must return the same result cleanly without error
        sub2_res = await ac.post(f"/api/v1/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub2_res.status_code == 200
        assert sub2_res.json()["attempt_id"] == attempt_id
        assert sub2_res.json()["status"] == "SUBMITTED"

        # 10. Attempting to start Exam A again blocked by ONE_ATTEMPT policy (Loop 13)
        start_again = await ac.post(f"/api/v1/exams/{exam_a_id}/attempts", headers=s_headers)
        assert start_again.status_code == 400
        assert "exhausted all attempts" in start_again.json()["detail"]

        # Check student exam status endpoint (Loop 30)
        status_res = await ac.get(f"/api/v1/exams/{exam_a_id}/student-status", headers=s_headers)
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["has_active_attempt"] is False
        assert status_data["reexam_available"] is False
        assert status_data["can_start_or_resume"] is False

        # 11. Faculty Grants Re-examination (Loops 14, 16)
        grant_res = await ac.post(
            f"/api/v1/exams/{exam_a_id}/reexam-permissions",
            json={
                "scope": "SELECTED",
                "student_ids": [student_id],
                "extra_attempts": 1
            },
            headers=f_headers
        )
        assert grant_res.status_code in [200, 201]
        perms = grant_res.json()
        assert len(perms) == 1
        assert perms[0]["student_id"] == student_id
        assert perms[0]["extra_attempts_allowed"] == 1
        assert perms[0]["attempts_consumed"] == 0
        assert perms[0]["remaining_attempts"] == 1

        # Now student status reflects reexam_available = True
        status_res2 = await ac.get(f"/api/v1/exams/{exam_a_id}/student-status", headers=s_headers)
        assert status_res2.status_code == 200
        assert status_res2.json()["reexam_available"] is True
        assert status_res2.json()["can_start_or_resume"] is True

        # 12. Student starts Attempt #2 (Loop 15, 16)
        att2_res = await ac.post(f"/api/v1/exams/{exam_a_id}/attempts", headers=s_headers)
        assert att2_res.status_code == 201
        att2_data = att2_res.json()
        assert att2_data["id"] != attempt_id
        assert att2_data["attempt_number"] == 2
        assert att2_data["status"] == "IN_PROGRESS"

        # Verify permission is now consumed
        perm_list_res = await ac.get(f"/api/v1/exams/{exam_a_id}/reexam-permissions", headers=f_headers)
        assert perm_list_res.status_code == 200
        perm_records = perm_list_res.json()
        p = next(x for x in perm_records if x["student_id"] == student_id)
        assert p["attempts_consumed"] == 1
        assert p["remaining_attempts"] == 0
