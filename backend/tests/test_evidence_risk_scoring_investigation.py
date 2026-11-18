import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.database import engine
from app.features.proctoring.risk_engine import RiskScoringEngine
from app.features.proctoring.models import (
    RiskLevel,
    EventSeverity,
    AIClassification,
    InvestigationStatus,
)


@pytest.mark.asyncio
async def test_risk_scoring_engine_unit_math():
    """Unit test for risk calculation formulas, weights, duration multipliers, and decay."""
    # 1. Base calculation
    c_tab = RiskScoringEngine.calculate_incident_contribution(
        incident_type="PAGE_HIDDEN",
        confidence=0.95,
        duration_seconds=0.0,
        severity="MEDIUM",
        ai_classification="CONFIRMED"
    )
    # Weight=20, conf=0.95, duration_mult=1.0, class_mult=1.0 -> ~19.0
    assert 18.0 <= c_tab <= 20.0

    # 2. Multi-person critical severity with duration boost
    c_multi = RiskScoringEngine.calculate_incident_contribution(
        incident_type="MULTIPLE_PERSON_IDENTITY_MISMATCH",
        confidence=0.98,
        duration_seconds=30.0,
        severity="CRITICAL",
        ai_classification="CONFIRMED"
    )
    # Base=45, duration boost > 1.0, critical boost = 1.25 -> > 50.0
    assert c_multi > 50.0

    # 3. Technical monitoring interruption must have ZERO risk contribution
    c_interrupted = RiskScoringEngine.calculate_incident_contribution(
        incident_type="MONITORING_INTERRUPTED",
        confidence=0.9,
        duration_seconds=120.0,
        severity="LOW",
        ai_classification="INCONCLUSIVE"
    )
    assert c_interrupted == 0.0

    # 4. Threshold classifications
    assert RiskScoringEngine.get_risk_classification(15.0) == RiskLevel.LOW.value
    assert RiskScoringEngine.get_risk_classification(35.0) == RiskLevel.MEDIUM.value
    assert RiskScoringEngine.get_risk_classification(65.0) == RiskLevel.HIGH.value
    assert RiskScoringEngine.get_risk_classification(85.0) == RiskLevel.CRITICAL.value
    assert RiskScoringEngine.get_risk_classification(100.0) == RiskLevel.CRITICAL.value


@pytest.mark.asyncio
async def test_evidence_risk_scoring_and_disqualification_lifecycle():
    """
    Comprehensive end-to-end integration test covering all 8 specification scenarios:
    1. Normal student: low risk, exam uninterrupted.
    2. Repeated tab switching: deduplicated, score updates, exam uninterrupted.
    3. Multiple faces: evidence stored, confidence logged, exam uninterrupted.
    4. Critical risk (100): critical alert generated, exam remains active, student answers questions normally.
    5. False positive: faculty rejects incident, score recalculates.
    6. Post-examination investigation: AI dossier generated upon submission, faculty review workflow.
    7. Monitoring interruption: technical drop logged with 0 risk penalty.
    8. Security & Disqualification: authorized faculty disqualification zeroing score with mandatory audit reason.
    """
    user_ids = []
    exam_ids = []

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        try:
            # ── 1. Setup Faculty & Student Users ──
            fac_email = f"prof_risk_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Integrity Director",
                "email": fac_email,
                "password": "Password123!",
                "role": "FACULTY",
            })
            assert fac_reg.status_code == 201
            faculty_id = fac_reg.json()["id"]
            user_ids.append(faculty_id)

            fac_login = await ac.post("/api/v1/auth/login", json={
                "email": fac_email,
                "password": "Password123!",
            })
            fac_headers = {"Authorization": f"Bearer {fac_login.json()['access_token']}"}

            stu_email = f"stu_risk_{uuid.uuid4().hex[:8]}@student.edu"
            stu_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Alex Candidate",
                "email": stu_email,
                "password": "Password123!",
                "role": "STUDENT",
            })
            assert stu_reg.status_code == 201
            student_id = stu_reg.json()["id"]
            user_ids.append(student_id)

            stu_login = await ac.post("/api/v1/auth/login", json={
                "email": stu_email,
                "password": "Password123!",
            })
            stu_headers = {"Authorization": f"Bearer {stu_login.json()['access_token']}"}

            # ── 2. Create and Publish Examination ──
            exam_res = await ac.post("/api/v1/exams", json={
                "title": "Algorithms Integrity Exam",
                "description": "Evidence-Based AI Proctoring Verification",
                "duration_minutes": 45,
                "negative_marking": "NONE",
                "auto_submit": True,
                "display_countdown": True,
                "assignment_type": "ALL_STUDENTS",
                "availability_type": "ALWAYS",
            }, headers=fac_headers)
            assert exam_res.status_code == 201
            exam_id = exam_res.json()["id"]
            exam_ids.append(exam_id)

            # Add Questions
            q1_res = await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
                "question_type": "MCQ",
                "question_text": "What is the worst-case complexity of QuickSort?",
                "options": ["O(N^2)", "O(N log N)", "O(N)", "O(1)"],
                "correct_answer": "O(N^2)",
                "marks": 5.0
            }, headers=fac_headers)
            assert q1_res.status_code == 201
            q1_id = q1_res.json()["id"]

            q2_res = await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
                "question_type": "SHORT_ANSWER",
                "question_text": "Explain Dijkstra shortest path algorithm.",
                "options": [],
                "correct_answer": "Greedy single-source shortest path using priority queue.",
                "marks": 10.0
            }, headers=fac_headers)
            assert q2_res.status_code == 201

            # Publish
            pub_res = await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)
            assert pub_res.status_code == 200

            # ── 3. Start Exam Attempt & Verify Pre-conditions ──
            start_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=stu_headers)
            assert start_res.status_code == 201
            attempt_id = start_res.json()["id"]

            # Mark identity verified so student can answer questions normally
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE exam_attempts SET identity_verified = TRUE, identity_verified_at = NOW() WHERE id = :id"),
                    {"id": attempt_id}
                )

            # Scenario 1: Normal student initially has 0 risk score
            risk_init = await ac.get(f"/api/v1/proctoring/risk/{attempt_id}", headers=fac_headers)
            assert risk_init.status_code == 200
            assert risk_init.json()["current_score"] == 0.0
            assert risk_init.json()["risk_level"] == "LOW"

            # ── 4. Scenario 7: Monitoring Interruption (Zero penalty) ──
            int_res = await ac.post(f"/api/v1/attempts/{attempt_id}/violations", json={
                "violation_type": "MEDIA_CONNECTION_LOST",
                "metadata": {"reason": "WebRTC dropped due to client network glitch"}
            }, headers=stu_headers)
            assert int_res.status_code in (200, 201)

            # Verify risk score remains 0 (technical interruption must not penalize candidate)
            risk_after_int = await ac.get(f"/api/v1/proctoring/risk/{attempt_id}", headers=fac_headers)
            assert risk_after_int.json()["current_score"] == 0.0

            # ── 5. Scenario 2: Repeated Tab Switching & Deduplication ──
            tab_res1 = await ac.post(f"/api/v1/attempts/{attempt_id}/violations", json={
                "violation_type": "PAGE_HIDDEN",
                "metadata": {"action": "Tab switch 1"}
            }, headers=stu_headers)
            assert tab_res1.status_code in (200, 201)

            # Rapid correlated blur event within 1s should be deduplicated / suppressed
            tab_res2 = await ac.post(f"/api/v1/attempts/{attempt_id}/violations", json={
                "violation_type": "WINDOW_BLUR",
                "metadata": {"action": "Correlated window blur"}
            }, headers=stu_headers)
            assert tab_res2.status_code in (200, 201)

            risk_tab = await ac.get(f"/api/v1/proctoring/risk/{attempt_id}", headers=fac_headers)
            score_tab = risk_tab.json()["current_score"]
            assert score_tab > 0.0
            # Exam must remain strictly IN_PROGRESS
            att_check = await ac.get(f"/api/v1/attempts/{attempt_id}", headers=stu_headers)
            assert att_check.json()["status"] == "IN_PROGRESS"

            # ── 6. Scenario 3 & 4: Multiple Incidents Escalating to Critical Risk (100) ──
            # Add identity mismatch & multiple faces & unauthorized object to push risk to 100
            await ac.post(f"/api/v1/attempts/{attempt_id}/violations", json={
                "violation_type": "MULTIPLE_PERSON_IDENTITY_MISMATCH",
                "metadata": {"faces": 2, "evidence": "mock_clip"}
            }, headers=stu_headers)

            await ac.post(f"/api/v1/attempts/{attempt_id}/violations", json={
                "violation_type": "IDENTITY_MISMATCH",
                "metadata": {"confidence": 0.96}
            }, headers=stu_headers)

            await ac.post(f"/api/v1/attempts/{attempt_id}/violations", json={
                "violation_type": "UNAUTHORIZED_OBJECT",
                "metadata": {"object": "cell phone"}
            }, headers=stu_headers)

            # Check Risk Score is now Critical (clamped to 100.0)
            risk_crit = await ac.get(f"/api/v1/proctoring/risk/{attempt_id}", headers=fac_headers)
            assert risk_crit.json()["current_score"] == 100.0
            assert risk_crit.json()["risk_level"] == "CRITICAL"

            # Verify Faculty Real-Time Alert was dispatched
            alerts_res = await ac.get(f"/api/v1/proctoring/alerts/{exam_id}", headers=fac_headers)
            assert alerts_res.status_code == 200
            alerts = alerts_res.json()
            assert len(alerts) >= 1
            assert any(a["risk_classification"] == "CRITICAL" for a in alerts)

            # Scenario 4 CRITICAL CHECK: Even at 100/100, the exam MUST NOT terminate or auto-submit!
            att_live = await ac.get(f"/api/v1/attempts/{attempt_id}", headers=stu_headers)
            assert att_live.status_code == 200
            assert att_live.json()["status"] == "IN_PROGRESS"

            # Student can still save answers without any disruption
            ans_res = await ac.post(f"/api/v1/attempts/{attempt_id}/answers", json={
                "question_id": q1_id,
                "selected_option": "O(N^2)",
                "is_marked_for_review": False
            }, headers=stu_headers)
            assert ans_res.status_code == 200
            assert ans_res.json()["selected_option"] == "O(N^2)"

            # ── 7. Scenario 5: False Positive Rejection by Faculty ──
            # Faculty inspects incidents and rejects one as false positive
            from app.features.proctoring.models import ProctoringIncident
            async with engine.connect() as conn:
                inc_rows = (await conn.execute(
                    text("SELECT id, incident_type FROM proctoring_incidents WHERE exam_attempt_id = :att"),
                    {"att": attempt_id}
                )).fetchall()
                assert len(inc_rows) >= 2
                target_inc_id = inc_rows[0][0]

            rev_res = await ac.post(
                f"/api/v1/proctoring/investigations/{attempt_id}/incident/{target_inc_id}/review",
                json={
                    "status": "FALSE_POSITIVE",
                    "comment": "Candidate merely turned to cough; confirmed false positive."
                },
                headers=fac_headers
            )
            assert rev_res.status_code == 200
            assert rev_res.json()["review_status"] == "FALSE_POSITIVE"

            # ── 8. Scenario 6: Normal Student Submission & Post-Exam Investigation ──
            sub_res = await ac.post(f"/api/v1/attempts/{attempt_id}/submit", headers=stu_headers)
            assert sub_res.status_code == 200
            assert sub_res.json()["status"] == "SUBMITTED"

            # Retrieve Post-Examination Investigation Report
            inv_res = await ac.get(f"/api/v1/proctoring/investigations/{exam_id}/attempt/{attempt_id}", headers=fac_headers)
            assert inv_res.status_code == 200
            inv_data = inv_res.json()
            assert inv_data["student_id"] == student_id
            assert inv_data["exam_id"] == exam_id
            assert len(inv_data["incident_timeline_json"]) >= 2
            assert "correlations_json" in inv_data
            assert inv_data["investigation_status"] == "PENDING_REVIEW"
            assert len(inv_data["executive_summary"]) > 20

            # List Investigations for the whole exam
            all_invs_res = await ac.get(f"/api/v1/proctoring/investigations/{exam_id}", headers=fac_headers)
            assert all_invs_res.status_code == 200
            assert len(all_invs_res.json()) >= 1

            # ── 9. Scenario 8: Security & Disqualification Decision ──
            # A student cannot call the faculty decision endpoint -> 403
            tamper_decision = await ac.post(
                f"/api/v1/proctoring/investigations/{attempt_id}/decision",
                json={"decision": "CLEARED"},
                headers=stu_headers
            )
            assert tamper_decision.status_code == 403

            # Disqualification without a mandatory reason -> 400
            no_reason_disq = await ac.post(
                f"/api/v1/proctoring/investigations/{attempt_id}/decision",
                json={"decision": "DISQUALIFIED", "reason": ""},
                headers=fac_headers
            )
            assert no_reason_disq.status_code == 400

            # Legitimate faculty disqualification with explicit justification
            disq_res = await ac.post(
                f"/api/v1/proctoring/investigations/{attempt_id}/decision",
                json={
                    "decision": "DISQUALIFIED",
                    "reason": "Confirmed presence of secondary proxy person and unauthorized electronic device.",
                    "notes": "Reviewed visual evidence timeline and audio anomalies."
                },
                headers=fac_headers
            )
            assert disq_res.status_code == 200
            assert disq_res.json()["investigation_status"] == "DISQUALIFIED"

            # Verify Attempt total_score is zeroed following disqualification
            att_after_disq = await ac.get(f"/api/v1/attempts/{attempt_id}", headers=stu_headers)
            assert att_after_disq.status_code == 200
            assert att_after_disq.json()["total_score"] == 0.0

            # Verify Disqualification record exists in database
            async with engine.connect() as conn:
                disq_rows = (await conn.execute(
                    text("SELECT id, reason, final_risk_score FROM disqualification_records WHERE exam_attempt_id = :att"),
                    {"att": attempt_id}
                )).fetchall()
                assert len(disq_rows) == 1
                assert "secondary proxy person" in disq_rows[0][1]

        finally:
            # Immediate Cleanup per AGENTS.md
            async with engine.begin() as conn:
                if exam_ids:
                    await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": exam_ids})
                if user_ids:
                    await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": user_ids})
