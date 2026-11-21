import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.database import engine


@pytest.mark.asyncio
async def test_screen_snapshot_capture_and_forensic_retrieval():
    """
    Integration test verifying:
    - Screen snapshot upload endpoint (/api/v1/proctoring/screen-snapshot)
    - Archival into proctoring events with event_type == 'SCREEN_SNAPSHOT'
    - Retrieval of evidence image via authenticated endpoint
    - Strict adherence to AGENTS.md: immediate cleanup in try...finally.
    """
    created_user_ids = []
    created_exam_ids = []

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Register temporary faculty & student
            fac_email = f"temp_fac_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Snapshot Evaluator",
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
                "name": "Candidate With Shared Screen",
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
                "title": f"Temp Screen Exam {uuid.uuid4().hex[:6]}",
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
                "question_text": "Sample Screen Proctoring Question?",
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

            # 4. Upload Screen Snapshot Evidence (simulate candidate's shared desktop frame)
            dummy_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\xff\xd9"
            files = {"file": ("screen.jpg", dummy_jpeg, "image/jpeg")}
            data = {
                "exam_id": exam_id,
                "attempt_id": attempt_id,
                "trigger_event": "FULLSCREEN_EXIT",
                "metadata_json": '{"source_resolution": "1920x1080", "active_tab": "Browser"}',
            }

            snap_res = await ac.post("/api/v1/proctoring/screen-snapshot", data=data, files=files, headers=stu_headers)
            assert snap_res.status_code == 200, snap_res.text
            snap_json = snap_res.json()
            assert "event_id" in snap_json
            assert snap_json["trigger_event"] == "FULLSCREEN_EXIT"
            assert snap_json["status"] == "ARCHIVED"
            event_id = snap_json["event_id"]

            # 5. Retrieve the evidence image as faculty
            ev_img_res = await ac.get(f"/api/v1/proctoring/evidence/{event_id}", headers=fac_headers)
            assert ev_img_res.status_code == 200
            assert ev_img_res.content == dummy_jpeg

            # 6. Verify event appears in faculty proctoring events list
            events_res = await ac.get(f"/api/v1/proctoring/events/{exam_id}", headers=fac_headers)
            assert events_res.status_code == 200
            events = events_res.json()["events"]
            screen_events = [e for e in events if e["event_type"] == "SCREEN_SNAPSHOT"]
            assert len(screen_events) >= 1
            assert screen_events[0]["id"] == event_id
            assert screen_events[0]["metadata_json"]["trigger_event"] == "FULLSCREEN_EXIT"
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
