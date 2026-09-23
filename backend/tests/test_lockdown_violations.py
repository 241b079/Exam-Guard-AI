import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_lockdown_violation_lifecycle_and_security():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register Faculty User
        faculty_email = f"prof_{uuid.uuid4().hex[:8]}@university.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof Proctor",
            "email": faculty_email,
            "password": "Password123!",
            "role": "FACULTY"
        })
        fac_login = await ac.post("/api/v1/auth/login", json={
            "email": faculty_email,
            "password": "Password123!"
        })
        fac_headers = {"Authorization": f"Bearer {fac_login.json()['access_token']}"}

        # 2. Register Student A and Student B
        student_a_email = f"student_a_{uuid.uuid4().hex[:8]}@student.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Student Alpha",
            "email": student_a_email,
            "password": "Password123!",
            "role": "STUDENT"
        })
        stu_a_login = await ac.post("/api/v1/auth/login", json={
            "email": student_a_email,
            "password": "Password123!"
        })
        stu_a_headers = {"Authorization": f"Bearer {stu_a_login.json()['access_token']}"}

        student_b_email = f"student_b_{uuid.uuid4().hex[:8]}@student.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Student Beta",
            "email": student_b_email,
            "password": "Password123!",
            "role": "STUDENT"
        })
        stu_b_login = await ac.post("/api/v1/auth/login", json={
            "email": student_b_email,
            "password": "Password123!"
        })
        stu_b_headers = {"Authorization": f"Bearer {stu_b_login.json()['access_token']}"}

        # 3. Faculty Creates & Publishes Exam
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Algorithms Lockdown Exam",
            "description": "Strict integrity assessment",
            "duration_minutes": 45,
            "negative_marking": "NONE",
            "auto_submit": True,
            "display_countdown": True,
            "assignment_type": "ALL_STUDENTS",
            "availability_type": "ALWAYS"
        }, headers=fac_headers)
        exam_id = exam_res.json()["id"]

        # Add a question
        await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "What is the time complexity of MergeSort?",
            "options": ["O(N log N)", "O(N^2)", "O(1)", "O(log N)"],
            "correct_answer": "O(N log N)",
            "marks": 5.0
        }, headers=fac_headers)

        # Publish
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)

        # 4. Student A Starts Attempt
        att_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=stu_a_headers)
        assert att_res.status_code == 201
        attempt_a_id = att_res.json()["id"]

        # 5. Security Test: Unauthenticated violation submission -> 401
        unauth_res = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "FULLSCREEN_EXIT"
        })
        assert unauth_res.status_code == 401

        # 6. Security Test: Student B attempts to log violation for Student A's attempt -> 403
        tamper_res = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "FULLSCREEN_EXIT"
        }, headers=stu_b_headers)
        assert tamper_res.status_code == 403

        # 7. Validation Test: Invalid violation type -> 422
        invalid_type_res = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "UNSUPPORTED_HACK_EVENT"
        }, headers=stu_a_headers)
        assert invalid_type_res.status_code == 422

        # 8. Validation Test: Non-existent attempt -> 404
        fake_uuid = str(uuid.uuid4())
        not_found_res = await ac.post(f"/api/v1/attempts/{fake_uuid}/violations", json={
            "violation_type": "FULLSCREEN_EXIT"
        }, headers=stu_a_headers)
        assert not_found_res.status_code == 404

        # 9. Legitimate Student A Logs Violations
        v1_res = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "FULLSCREEN_EXIT",
            "metadata": {"reason": "User exited fullscreen"}
        }, headers=stu_a_headers)
        assert v1_res.status_code == 201
        v1_data = v1_res.json()
        assert v1_data["violation_type"] == "FULLSCREEN_EXIT"
        assert v1_data["exam_attempt_id"] == attempt_a_id
        assert v1_data["metadata_json"]["reason"] == "User exited fullscreen"

        # Rate Limit / Deduplication: sending identical violation within 1.5s returns existing
        v1_dup = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "FULLSCREEN_EXIT"
        }, headers=stu_a_headers)
        assert v1_dup.status_code == 201
        assert v1_dup.json()["id"] == v1_data["id"]

        # Different violation types logged successfully
        v2_res = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "CONTEXT_MENU"
        }, headers=stu_a_headers)
        assert v2_res.status_code == 201
        assert v2_res.json()["violation_type"] == "CONTEXT_MENU"

        v3_res = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "COPY_ATTEMPT"
        }, headers=stu_a_headers)
        assert v3_res.status_code == 201

        v4_res = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "PAGE_HIDDEN"
        }, headers=stu_a_headers)
        assert v4_res.status_code == 201

        # 10. Check Attempt Response reflects violation_count
        get_att = await ac.get(f"/api/v1/attempts/{attempt_a_id}", headers=stu_a_headers)
        assert get_att.status_code == 200
        assert get_att.json()["violation_count"] >= 4

        # 11. Student can list own violations
        list_v_res = await ac.get(f"/api/v1/attempts/{attempt_a_id}/violations", headers=stu_a_headers)
        assert list_v_res.status_code == 200
        assert len(list_v_res.json()) >= 4

        # 12. Student B cannot view Student A's violations -> 403
        list_tamper = await ac.get(f"/api/v1/attempts/{attempt_a_id}/violations", headers=stu_b_headers)
        assert list_tamper.status_code == 403

        # 13. Faculty monitoring returns candidate attempt with violations
        fac_mon_res = await ac.get(f"/api/v1/exams/{exam_id}/attempts-monitoring", headers=fac_headers)
        assert fac_mon_res.status_code == 200
        mon_list = fac_mon_res.json()
        assert len(mon_list) == 1
        assert mon_list[0]["attempt_id"] == attempt_a_id
        assert mon_list[0]["violation_count"] >= 4
        assert len(mon_list[0]["recent_violations"]) >= 4

        # 14. After exam submission, violation recording is blocked
        sub_res = await ac.post(f"/api/v1/attempts/{attempt_a_id}/submit", headers=stu_a_headers)
        assert sub_res.status_code == 200

        post_sub_v = await ac.post(f"/api/v1/attempts/{attempt_a_id}/violations", json={
            "violation_type": "WINDOW_BLUR"
        }, headers=stu_a_headers)
        assert post_sub_v.status_code == 400
