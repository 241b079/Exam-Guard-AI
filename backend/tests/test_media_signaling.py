import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_media_session_lifecycle_and_security():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register Faculty User
        faculty_email = f"prof_{uuid.uuid4().hex[:8]}@university.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof Media Monitor",
            "email": faculty_email,
            "password": "Password123!",
            "role": "FACULTY"
        })
        fac_login = await ac.post("/api/v1/auth/login", json={
            "email": faculty_email,
            "password": "Password123!"
        })
        fac_headers = {"Authorization": f"Bearer {fac_login.json()['access_token']}"}

        # 2. Register Student 1 and Student 2
        student1_email = f"stu1_{uuid.uuid4().hex[:8]}@student.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Student Streamer",
            "email": student1_email,
            "password": "Password123!",
            "role": "STUDENT"
        })
        stu1_login = await ac.post("/api/v1/auth/login", json={
            "email": student1_email,
            "password": "Password123!"
        })
        stu1_headers = {"Authorization": f"Bearer {stu1_login.json()['access_token']}"}

        student2_email = f"stu2_{uuid.uuid4().hex[:8]}@student.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Student Intruder",
            "email": student2_email,
            "password": "Password123!",
            "role": "STUDENT"
        })
        stu2_login = await ac.post("/api/v1/auth/login", json={
            "email": student2_email,
            "password": "Password123!"
        })
        stu2_headers = {"Authorization": f"Bearer {stu2_login.json()['access_token']}"}

        # 3. Faculty Creates & Publishes Exam
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Proctored WebRTC Exam",
            "description": "Requires Live Video, Audio, and Screen Sharing",
            "duration_minutes": 30,
            "negative_marking": "NONE",
            "auto_submit": True,
            "display_countdown": True,
            "assignment_type": "ALL_STUDENTS",
            "availability_type": "ALWAYS"
        }, headers=fac_headers)
        exam_id = exam_res.json()["id"]

        await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "WebRTC relies on which protocol for media transport?",
            "options": ["SRTP / UDP", "HTTP / TCP", "FTP", "SMTP"],
            "correct_answer": "SRTP / UDP",
            "marks": 10.0
        }, headers=fac_headers)

        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)

        # 4. Student 1 starts attempt
        att_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=stu1_headers)
        attempt1_id = att_res.json()["id"]

        # 5. Student 1 creates/initializes media session
        med_res = await ac.post(f"/api/v1/attempts/{attempt1_id}/media-session", headers=stu1_headers)
        assert med_res.status_code == 200
        med_data = med_res.json()
        assert med_data["exam_attempt_id"] == attempt1_id
        assert med_data["status"] == "WAITING"
        assert med_data["camera_active"] is False

        # 6. Security: Student 2 cannot update Student 1's media session -> 403
        tamper_res = await ac.patch(f"/api/v1/attempts/{attempt1_id}/media-session", json={
            "camera_active": True
        }, headers=stu2_headers)
        assert tamper_res.status_code == 403

        # 7. Student 1 updates media stream status
        update_res = await ac.patch(f"/api/v1/attempts/{attempt1_id}/media-session", json={
            "status": "MEDIA_READY",
            "camera_active": True,
            "mic_active": True,
            "screen_active": True
        }, headers=stu1_headers)
        assert update_res.status_code == 200
        assert update_res.json()["status"] == "MEDIA_READY"
        assert update_res.json()["camera_active"] is True
        assert update_res.json()["mic_active"] is True
        assert update_res.json()["screen_active"] is True

        # 8. Test logging media-specific proctoring violations
        v_screen_stop = await ac.post(f"/api/v1/attempts/{attempt1_id}/violations", json={
            "violation_type": "SCREEN_SHARE_STOPPED",
            "metadata": {"reason": "Candidate ended screen sharing"}
        }, headers=stu1_headers)
        assert v_screen_stop.status_code == 201
        assert v_screen_stop.json()["violation_type"] == "SCREEN_SHARE_STOPPED"

        v_cam_stop = await ac.post(f"/api/v1/attempts/{attempt1_id}/violations", json={
            "violation_type": "CAMERA_STOPPED"
        }, headers=stu1_headers)
        assert v_cam_stop.status_code == 201

        v_mic_stop = await ac.post(f"/api/v1/attempts/{attempt1_id}/violations", json={
            "violation_type": "MICROPHONE_STOPPED"
        }, headers=stu1_headers)
        assert v_mic_stop.status_code == 201

        # 9. Faculty monitoring includes live media session info and new violations
        fac_mon = await ac.get(f"/api/v1/exams/{exam_id}/attempts-monitoring", headers=fac_headers)
        assert fac_mon.status_code == 200
        mon_attempts = fac_mon.json()
        assert len(mon_attempts) == 1
        att_item = mon_attempts[0]
        assert att_item["attempt_id"] == attempt1_id
        assert att_item["media_session"] is not None
        assert att_item["media_session"]["status"] == "MEDIA_READY"
        assert att_item["violation_count"] >= 3
