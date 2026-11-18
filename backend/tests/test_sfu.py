import uuid
import pytest
import jwt
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.config import settings
from app.core.database import engine
from app.features.proctoring.sfu import LiveKitTokenService


@pytest.mark.asyncio
async def test_livekit_token_service_direct():
    """Unit test for LiveKitTokenService JWT generation and payload verification."""
    service = LiveKitTokenService()
    exam_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    # 1. Faculty Token (Subscriber only, dynacast enabled)
    faculty_token = service.create_token(
        user_id=user_id,
        name="Prof Proctor",
        role="FACULTY",
        exam_id=exam_id,
    )
    assert isinstance(faculty_token, str)

    # Decode and verify
    payload_fac = jwt.decode(
        faculty_token,
        settings.LIVEKIT_API_SECRET,
        algorithms=["HS256"],
        issuer=settings.LIVEKIT_API_KEY,
    )
    assert payload_fac["sub"] == f"fac_{user_id}"
    assert payload_fac["name"] == "Prof Proctor"
    assert payload_fac["video"]["room"] == f"exam_{exam_id}"
    assert payload_fac["video"]["roomJoin"] is True
    assert payload_fac["video"]["canSubscribe"] is True
    assert payload_fac["video"]["canPublish"] is False

    # 2. Student Token (Publisher with simulcast)
    student_token = service.create_token(
        user_id=user_id,
        name="Student Candidate",
        role="STUDENT",
        exam_id=exam_id,
    )
    assert isinstance(student_token, str)

    payload_stu = jwt.decode(
        student_token,
        settings.LIVEKIT_API_SECRET,
        algorithms=["HS256"],
        issuer=settings.LIVEKIT_API_KEY,
    )
    assert payload_stu["sub"] == f"stu_{user_id}"
    assert payload_stu["name"] == "Student Candidate"
    assert payload_stu["video"]["room"] == f"exam_{exam_id}"
    assert payload_stu["video"]["roomJoin"] is True
    assert payload_stu["video"]["canPublish"] is True


@pytest.mark.asyncio
async def test_sfu_token_api_endpoint():
    """Integration test for POST /api/v1/proctoring/sfu/token."""
    user_ids = []
    exam_ids = []

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        try:
            # 1. Register Faculty User
            faculty_email = f"prof_sfu_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof SFU Proctor",
                "email": faculty_email,
                "password": "Password123!",
                "role": "FACULTY",
            })
            assert fac_reg.status_code == 201
            faculty_id = fac_reg.json()["id"]
            user_ids.append(faculty_id)

            fac_login = await ac.post("/api/v1/auth/login", json={
                "email": faculty_email,
                "password": "Password123!",
            })
            fac_headers = {"Authorization": f"Bearer {fac_login.json()['access_token']}"}

            # 2. Register Student User
            student_email = f"stu_sfu_{uuid.uuid4().hex[:8]}@student.edu"
            stu_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Student SFU Candidate",
                "email": student_email,
                "password": "Password123!",
                "role": "STUDENT",
            })
            assert stu_reg.status_code == 201
            student_id = stu_reg.json()["id"]
            user_ids.append(student_id)

            stu_login = await ac.post("/api/v1/auth/login", json={
                "email": student_email,
                "password": "Password123!",
            })
            stu_headers = {"Authorization": f"Bearer {stu_login.json()['access_token']}"}

            # 3. Create Exam
            exam_res = await ac.post("/api/v1/exams", json={
                "title": "SFU High Scalability Exam",
                "description": "Adaptive live monitoring test",
                "duration_minutes": 60,
                "negative_marking": "NONE",
                "auto_submit": True,
                "display_countdown": True,
                "assignment_type": "ALL_STUDENTS",
                "availability_type": "ALWAYS",
            }, headers=fac_headers)
            assert exam_res.status_code == 201
            exam_id = exam_res.json()["id"]
            exam_ids.append(exam_id)

            # Add question
            await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
                "question_type": "MCQ",
                "question_text": "What does an SFU do?",
                "options": ["Forward media selectively", "Encode all video", "Store recordings", "Act as TURN"],
                "correct_answer": "Forward media selectively",
                "marks": 5.0
            }, headers=fac_headers)

            # Publish Exam
            pub_res = await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)
            assert pub_res.status_code == 200

            # 4. Faculty requests SFU Token
            fac_token_res = await ac.post("/api/v1/proctoring/sfu/token", json={
                "exam_id": exam_id,
            }, headers=fac_headers)
            assert fac_token_res.status_code == 200
            fac_sfu_data = fac_token_res.json()
            assert fac_sfu_data["sfu_enabled"] is True
            assert fac_sfu_data["room_name"] == f"exam_{exam_id}"
            assert fac_sfu_data["identity"] == f"fac_{faculty_id}"
            assert fac_sfu_data["role"] == "FACULTY"
            assert len(fac_sfu_data["token"]) > 20

            # 5. Student requests SFU Token before starting attempt -> should be 403 (no active attempt)
            stu_early_token_res = await ac.post("/api/v1/proctoring/sfu/token", json={
                "exam_id": exam_id,
            }, headers=stu_headers)
            assert stu_early_token_res.status_code == 403

            # 6. Student starts attempt
            start_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=stu_headers)
            assert start_res.status_code == 201
            attempt_id = start_res.json()["id"]

            # 7. Student requests SFU Token with attempt_id -> Success
            stu_token_res = await ac.post("/api/v1/proctoring/sfu/token", json={
                "exam_id": exam_id,
                "attempt_id": attempt_id,
            }, headers=stu_headers)
            assert stu_token_res.status_code == 200
            stu_sfu_data = stu_token_res.json()
            assert stu_sfu_data["sfu_enabled"] is True
            assert stu_sfu_data["room_name"] == f"exam_{exam_id}"
            assert stu_sfu_data["identity"] == f"stu_{student_id}"
            assert stu_sfu_data["role"] == "STUDENT"
            assert len(stu_sfu_data["token"]) > 20

        finally:
            # Immediate Cleanup per AGENTS.md
            async with engine.begin() as conn:
                if exam_ids:
                    await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": exam_ids})
                if user_ids:
                    await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": user_ids})
