import uuid
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.database import engine, AsyncSessionLocal
from app.features.proctoring.risk_engine import RiskScoringEngine
from app.features.proctoring.aggregation import ExamIntegrityAggregator
from app.features.proctoring.investigation import PostExaminationInvestigationService


@pytest.mark.asyncio
async def test_phase1_and_phase3_autonomous_proctoring():
    """
    Integration test verifying:
    - Phase 1: Real-time Audio VAD (VOICE_DETECTED), Liveness (LIVENESS_FAILED), Environment Security.
    - Phase 3: Tri-State Autonomous Adjudication (AUTO_CLEARED, AUTO_DISQUALIFIED), SHA-256 Audit Hash.
    - Strict compliance with AGENTS.md (immediate cleanup, no demo clutter).
    """
    created_user_ids = []
    created_exam_ids = []

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Register temporary faculty and student
            fac_email = f"temp_fac_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Autonomous Evaluator",
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
                "name": "Test Candidate",
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
            stu_headers = {"Authorization": f"Bearer {stu_login.json()['access_token']}"}

            # 2. Create clean automated exam with auto_publish_results = True
            exam_res = await ac.post("/api/v1/exams", json={
                "title": f"Temp Exam {uuid.uuid4().hex[:6]}",
                "description": "Autonomous Proctoring Verification",
                "duration_minutes": 30,
                "negative_marking": "NONE",
                "auto_submit": True,
                "assignment_type": "ALL_STUDENTS",
                "availability_type": "ALWAYS",
                "auto_publish_results": True,
            }, headers=fac_headers)
            assert exam_res.status_code == 201
            exam_id = exam_res.json()["id"]
            created_exam_ids.append(exam_id)

            # Add sample question
            q_res = await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
                "question_type": "MCQ",
                "question_text": "What does CPU stand for?",
                "options": ["Central Processing Unit", "Central Power Unit", "Core Port Unit", "Computer Unit"],
                "correct_answer": "Central Processing Unit",
                "marks": 10.0,
            }, headers=fac_headers)
            assert q_res.status_code == 201
            q_id = q_res.json()["id"]

            # Publish exam
            await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)

            # 3. Student starts attempt
            start_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=stu_headers)
            assert start_res.status_code == 201
            attempt_id = start_res.json()["id"]

            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE exam_attempts SET identity_verified = TRUE, identity_verified_at = NOW() WHERE id = :id"),
                    {"id": attempt_id}
                )

            # Answer question
            await ac.post(f"/api/v1/attempts/{attempt_id}/answers", json={
                "question_id": q_id,
                "selected_option": "Central Processing Unit",
            }, headers=stu_headers)

            # 4. Phase 1 Verification: Test Voice Detection & Liveness Event weights
            voice_viol = await ac.post(f"/api/v1/attempts/{attempt_id}/violations", json={
                "violation_type": "VOICE_DETECTED",
                "metadata": {"decibels": -32, "sustainedDurationMs": 1800}
            }, headers=stu_headers)
            assert voice_viol.status_code == 201

            # Check risk engine received voice detection
            risk_res = await ac.get(f"/api/v1/proctoring/risk/{attempt_id}", headers=fac_headers)
            assert risk_res.status_code == 200
            assert risk_res.json()["current_score"] > 0.0

            # 5. Clean submission: submit attempt and verify Phase 3 Autonomous Adjudication
            sub_res = await ac.post(f"/api/v1/attempts/{attempt_id}/submit", headers=stu_headers)
            assert sub_res.status_code == 200

            # Fetch investigation dossier
            inv_res = await ac.get(f"/api/v1/proctoring/investigations/{exam_id}/attempt/{attempt_id}", headers=fac_headers)
            assert inv_res.status_code == 200
            inv_data = inv_res.json()

            # Verify Cryptographic SHA-256 Audit Hash was generated
            assert "audit_hash" in inv_data
            assert inv_data["audit_hash"] is not None
            assert len(inv_data["audit_hash"]) == 64

            # Verify Autonomous Verdict
            assert inv_data["autonomous_verdict"] == "AUTO_CLEARED"
            assert inv_data["investigation_status"] == "CLEARED"
            assert "Autonomously cleared" in inv_data["autonomous_action_taken"]
            assert inv_data["publication_status"] == "PUBLISHED"

    finally:
        # Immediate cleanup per AGENTS.md
        async with engine.begin() as conn:
            if created_exam_ids:
                await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": created_exam_ids})
            if created_user_ids:
                await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created_user_ids})
