import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.database import engine


@pytest.mark.asyncio
async def test_audio_evidence_capture_and_retrieval():
    """
    Integration test verifying:
    - Candidate audio evidence upload endpoint (/api/v1/proctoring/audio-evidence)
    - Archival into proctoring events with event_type == 'VOICE_DETECTED'
    - Retrieval of audio evidence via authenticated endpoint with audio/webm media type
    - Strict adherence to AGENTS.md: immediate cleanup in try...finally.
    """
    created_user_ids = []
    created_exam_ids = []

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Register temporary faculty & student
            fac_email = f"temp_fac_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Voice Evaluator",
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

            stu_email = f"temp_stu_{uuid.uuid4().hex[:8]}@student.edu"
            stu_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Candidate With Voice Activity",
                "email": stu_email,
                "password": "Password123!",
                "role": "STUDENT",
            })
            assert stu_reg.status_code == 201
            student_id = stu_reg.json()["id"]
            created_user_ids.append(student_id)

            stu_login = await ac.post("/api/v1/auth/login", json={
                "email": stu_email,
                "password": "Password123!",
            })
            stu_token = stu_login.json()["access_token"]
            stu_headers = {"Authorization": f"Bearer {stu_token}"}

            # 2. Create clean temporary exam, question & publish
            exam_res = await ac.post("/api/v1/exams", json={
                "title": f"Temp Voice Exam {uuid.uuid4().hex[:6]}",
                "duration_minutes": 20,
                "negative_marking": "NONE",
                "assignment_type": "ALL_STUDENTS",
                "availability_type": "ALWAYS",
            }, headers=fac_headers)
            assert exam_res.status_code == 201
            exam_id = exam_res.json()["id"]
            created_exam_ids.append(exam_id)

            await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
                "question_type": "MCQ",
                "question_text": "Sample Audio Proctoring Question?",
                "options": ["A", "B", "C", "D"],
                "correct_answer": "A",
                "marks": 5.0,
            }, headers=fac_headers)

            await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)

            # 3. Candidate starts attempt
            att_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=stu_headers)
            assert att_res.status_code == 201
            attempt_id = att_res.json()["id"]

            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE exam_attempts SET identity_verified = TRUE, identity_verified_at = NOW() WHERE id = :id"),
                    {"id": attempt_id}
                )

            # 4. Upload Audio Evidence Snippet
            dummy_audio_bytes = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04" # EBML / WebM header bytes
            files = {"file": ("voice_evidence.webm", dummy_audio_bytes, "audio/webm")}
            data = {
                "exam_id": exam_id,
                "attempt_id": attempt_id,
                "trigger_event": "VOICE_DETECTED",
                "metadata_json": '{"decibels": -28, "sustainedDurationMs": 2400, "speechEnergyRatio": 0.72}',
            }

            audio_res = await ac.post("/api/v1/proctoring/audio-evidence", data=data, files=files, headers=stu_headers)
            assert audio_res.status_code == 200, audio_res.text
            audio_json = audio_res.json()
            assert "event_id" in audio_json
            assert audio_json["trigger_event"] == "VOICE_DETECTED"
            assert audio_json["status"] == "ARCHIVED"
            event_id = audio_json["event_id"]

            # 5. Retrieve the audio file as faculty
            audio_get_res = await ac.get(f"/api/v1/proctoring/evidence/{event_id}", headers=fac_headers)
            assert audio_get_res.status_code == 200
            assert audio_get_res.headers.get("content-type") == "audio/webm"
            assert audio_get_res.headers.get("accept-ranges") == "bytes"
            assert audio_get_res.content == dummy_audio_bytes

            # 6. Verify event appears in faculty proctoring events list
            events_res = await ac.get(f"/api/v1/proctoring/events/{exam_id}", headers=fac_headers)
            assert events_res.status_code == 200
            events = events_res.json()["events"]
            voice_events = [e for e in events if e["event_type"] == "VOICE_DETECTED"]
            assert len(voice_events) >= 1
            assert voice_events[0]["id"] == event_id
            assert voice_events[0]["metadata_json"]["media_type"] == "audio"
            assert voice_events[0]["metadata_json"]["decibels"] == -28
    finally:
        # Immediate cleanup per AGENTS.md
        async with engine.begin() as conn:
            if created_exam_ids:
                await conn.execute(text("DELETE FROM proctoring_events WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM student_risk_scores WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM examination_investigations WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM exam_violations WHERE exam_attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = ANY(:ids))"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM answers WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = ANY(:ids))"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM exam_attempts WHERE exam_id = ANY(:ids)"), {"ids": created_exam_ids})
                await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": created_exam_ids})
            if created_user_ids:
                await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created_user_ids})
