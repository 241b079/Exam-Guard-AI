import asyncio
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text, select

from app.main import app
from app.core.database import engine
from app.features.attempts.models import ExamAttempt, Answer, AttemptStatus


@pytest.mark.asyncio
async def test_phase2_atomic_attempt_creation_and_concurrency():
    """
    Phase 2A & 2D:
    1. Normal first attempt creation.
    2. Reusing existing active attempt (idempotent recovery).
    3. Concurrent start requests race: Verify database state has exactly 1 attempt, no duplicates.
    4. Attempt limits enforced when policy prohibits reuse.
    """
    created_user_ids = []
    created_exam_ids = []

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        try:
            # 1. Setup Faculty & Exam
            fac_email = f"fac_conc_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Concurrency", "email": fac_email, "password": "Password123!", "role": "FACULTY"
            })
            fac_id = fac_reg.json()["id"]
            created_user_ids.append(fac_id)

            f_login = await ac.post("/api/v1/auth/login", json={"email": fac_email, "password": "Password123!"})
            f_token = f_login.json()["access_token"]
            f_headers = {"Authorization": f"Bearer {f_token}"}

            exam_res = await ac.post("/api/v1/exams", json={
                "title": f"Concurrency Test Exam {uuid.uuid4().hex[:6]}",
                "duration_minutes": 60,
                "availability_type": "ALWAYS",
                "attempt_policy": "ONE_ATTEMPT",
                "max_attempts": 1
            }, headers=f_headers)
            assert exam_res.status_code == 201
            exam_id = exam_res.json()["id"]
            created_exam_ids.append(exam_id)

            # Add question before publishing
            await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
                "question_type": "MCQ", "question_text": "Sample Q?", "options": ["A", "B"], "correct_answer": "A", "marks": 5.0
            }, headers=f_headers)

            await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=f_headers)

            # 2. Setup Student
            stu_email = f"stu_conc_{uuid.uuid4().hex[:8]}@univ.edu"
            stu_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Student Concurrency", "email": stu_email, "password": "Password123!", "role": "STUDENT"
            })
            stu_id = stu_reg.json()["id"]
            created_user_ids.append(stu_id)

            s_login = await ac.post("/api/v1/auth/login", json={"email": stu_email, "password": "Password123!"})
            s_token = s_login.json()["access_token"]
            s_headers = {"Authorization": f"Bearer {s_token}"}

            # 3. Normal first attempt
            att_res1 = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s_headers)
            assert att_res1.status_code == 201
            att1 = att_res1.json()
            assert att1["attempt_number"] == 1
            assert att1["status"] == "IN_PROGRESS"
            first_attempt_id = att1["id"]

            # 4. Reusing existing active attempt: second request returns identical attempt
            att_res2 = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s_headers)
            assert att_res2.status_code == 201
            att2 = att_res2.json()
            assert att2["id"] == first_attempt_id

            # Verify POST /api/v1/attempts/start also returns identical attempt
            att_res3 = await ac.post("/api/v1/attempts/start", json={"exam_id": exam_id}, headers=s_headers)
            assert att_res3.status_code == 201
            assert att_res3.json()["id"] == first_attempt_id

            # Verify DB state has exactly 1 attempt row
            async with engine.connect() as conn:
                count = (await conn.execute(
                    text("SELECT count(*) FROM exam_attempts WHERE exam_id = :e AND student_id = :s"),
                    {"e": exam_id, "s": stu_id}
                )).scalar()
                assert count == 1

            # 5. Submit attempt #1
            sub_res = await ac.post(f"/api/v1/attempts/{first_attempt_id}/submit", headers=s_headers)
            assert sub_res.status_code == 200

            # 6. Attempt limits enforced: starting again fails with 400
            limit_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s_headers)
            assert limit_res.status_code == 400
            assert "exhausted all attempts" in limit_res.json()["detail"]

            # 7. Concurrent start requests race condition test:
            # Create a second student to test concurrent initial creation
            stu2_email = f"stu_race_{uuid.uuid4().hex[:8]}@univ.edu"
            stu2_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Race Student", "email": stu2_email, "password": "Password123!", "role": "STUDENT"
            })
            stu2_id = stu2_reg.json()["id"]
            created_user_ids.append(stu2_id)

            s2_login = await ac.post("/api/v1/auth/login", json={"email": stu2_email, "password": "Password123!"})
            s2_headers = {"Authorization": f"Bearer {s2_login.json()['access_token']}"}

            # Launch 8 concurrent requests simultaneously (e.g. double-click / multi-worker race)
            async def launch_start(idx):
                return await ac.post(
                    f"/api/v1/exams/{exam_id}/attempts",
                    json={"session_token": "token_race_session", "is_rejoin": False},
                    headers=s2_headers
                )

            responses = await asyncio.gather(*[launch_start(i) for i in range(8)])
            for r in responses:
                assert r.status_code == 201

            # All responses must reference the SAME attempt ID
            attempt_ids = {r.json()["id"] for r in responses}
            assert len(attempt_ids) == 1, f"Expected 1 unique attempt ID, got: {attempt_ids}"

            # Verify database state directly: exactly 1 attempt record exists for student 2!
            async with engine.connect() as conn:
                stu2_attempt_rows = (await conn.execute(
                    text("SELECT id, status, attempt_number FROM exam_attempts WHERE exam_id = :e AND student_id = :s"),
                    {"e": exam_id, "s": stu2_id}
                )).all()
                assert len(stu2_attempt_rows) == 1
                assert stu2_attempt_rows[0][1] == "IN_PROGRESS"
                assert stu2_attempt_rows[0][2] == 1

        finally:
            # Immediate cleanup per AGENTS.md
            async with engine.begin() as conn:
                if created_exam_ids:
                    await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": created_exam_ids})
                if created_user_ids:
                    await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created_user_ids})


@pytest.mark.asyncio
async def test_phase2_global_and_student_specific_reexam_permissions():
    """
    Phase 2B & 2D:
    1. Student-specific re-examination permission works and increments counter.
    2. Global permission: Multiple students can consume the SAME global permission independently.
    3. Student A consuming a global permission does not block Student B.
    4. Repeated requests during active attempt do not consume the permission twice.
    5. Attempt limits enforced after extra attempt is exhausted.
    """
    created_user_ids = []
    created_exam_ids = []

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        try:
            # 1. Setup Faculty & Exam
            fac_email = f"fac_perm_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Permissions", "email": fac_email, "password": "Password123!", "role": "FACULTY"
            })
            fac_id = fac_reg.json()["id"]
            created_user_ids.append(fac_id)

            f_login = await ac.post("/api/v1/auth/login", json={"email": fac_email, "password": "Password123!"})
            f_headers = {"Authorization": f"Bearer {f_login.json()['access_token']}"}

            exam_res = await ac.post("/api/v1/exams", json={
                "title": f"Permissions Test Exam {uuid.uuid4().hex[:6]}",
                "duration_minutes": 45,
                "availability_type": "ALWAYS",
                "attempt_policy": "ONE_ATTEMPT",
                "max_attempts": 1
            }, headers=f_headers)
            exam_id = exam_res.json()["id"]
            created_exam_ids.append(exam_id)

            # Add question before publishing
            await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
                "question_type": "MCQ", "question_text": "Sample Q?", "options": ["A", "B"], "correct_answer": "A", "marks": 5.0
            }, headers=f_headers)

            await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=f_headers)

            # 2. Setup Student 1 and Student 2
            stu1_email = f"stu1_{uuid.uuid4().hex[:8]}@univ.edu"
            stu1_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Alice Perm", "email": stu1_email, "password": "Password123!", "role": "STUDENT"
            })
            stu1_id = stu1_reg.json()["id"]
            created_user_ids.append(stu1_id)
            s1_headers = {"Authorization": f"Bearer {(await ac.post('/api/v1/auth/login', json={'email': stu1_email, 'password': 'Password123!'})).json()['access_token']}"}

            stu2_email = f"stu2_{uuid.uuid4().hex[:8]}@univ.edu"
            stu2_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Bob Perm", "email": stu2_email, "password": "Password123!", "role": "STUDENT"
            })
            stu2_id = stu2_reg.json()["id"]
            created_user_ids.append(stu2_id)
            s2_headers = {"Authorization": f"Bearer {(await ac.post('/api/v1/auth/login', json={'email': stu2_email, 'password': 'Password123!'})).json()['access_token']}"}

            # 3. Both students take Attempt #1 and submit
            att1_s1 = (await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s1_headers)).json()
            await ac.post(f"/api/v1/attempts/{att1_s1['id']}/submit", headers=s1_headers)

            att1_s2 = (await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s2_headers)).json()
            await ac.post(f"/api/v1/attempts/{att1_s2['id']}/submit", headers=s2_headers)

            # Both students are now blocked from starting new attempts
            assert (await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s1_headers)).status_code == 400
            assert (await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s2_headers)).status_code == 400

            # 4. Faculty grants GLOBAL re-examination permission (scope="ALL", extra_attempts=1)
            grant_res = await ac.post(
                f"/api/v1/exams/{exam_id}/reexam-permissions",
                json={"scope": "ALL", "extra_attempts": 1},
                headers=f_headers
            )
            assert grant_res.status_code in [200, 201]

            # 5. Student 1 consumes the global permission to start Attempt #2
            att2_s1_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s1_headers)
            assert att2_s1_res.status_code == 201
            att2_s1 = att2_s1_res.json()
            assert att2_s1["attempt_number"] == 2
            assert att2_s1["status"] == "IN_PROGRESS"

            # 6. Reusing active attempt: Student 1 repeated request returns Attempt #2 WITHOUT consuming permission again
            att2_s1_repeat = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s1_headers)
            assert att2_s1_repeat.status_code == 201
            assert att2_s1_repeat.json()["id"] == att2_s1["id"]

            # 7. CRITICAL TEST (Phase 1 Bug 3): Student 2 starts Attempt #2 using the SAME global permission
            # Previously, Student 1's usage locked out Student 2. With the fix, Student 2 MUST succeed!
            att2_s2_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s2_headers)
            assert att2_s2_res.status_code == 201
            att2_s2 = att2_s2_res.json()
            assert att2_s2["attempt_number"] == 2
            assert att2_s2["status"] == "IN_PROGRESS"

            # Verify in database: exam_reexam_consumptions has separate rows for stu1 and stu2
            async with engine.connect() as conn:
                consumptions = (await conn.execute(
                    text("SELECT student_id, attempts_consumed FROM exam_reexam_consumptions")
                )).all()
                c_dict = {row[0]: row[1] for row in consumptions}
                assert stu1_id in c_dict and c_dict[stu1_id] == 1
                assert stu2_id in c_dict and c_dict[stu2_id] == 1

            # 8. Submit Attempt #2 for both students
            await ac.post(f"/api/v1/attempts/{att2_s1['id']}/submit", headers=s1_headers)
            await ac.post(f"/api/v1/attempts/{att2_s2['id']}/submit", headers=s2_headers)

            # 9. Extra attempts exhausted: Both students must now be blocked from Attempt #3
            assert (await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s1_headers)).status_code == 400
            assert (await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s2_headers)).status_code == 400

            # 10. Student-specific permission: Faculty grants Student 1 an extra attempt individually
            s_grant = await ac.post(
                f"/api/v1/exams/{exam_id}/reexam-permissions",
                json={"scope": "SELECTED", "student_ids": [stu1_id], "extra_attempts": 1},
                headers=f_headers
            )
            assert s_grant.status_code in [200, 201]

            # Student 1 can start Attempt #3
            att3_s1 = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s1_headers)
            assert att3_s1.status_code == 201
            assert att3_s1.json()["attempt_number"] == 3

            # Student 2 is STILL blocked from Attempt #3
            assert (await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s2_headers)).status_code == 400

        finally:
            async with engine.begin() as conn:
                if created_exam_ids:
                    await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": created_exam_ids})
                if created_user_ids:
                    await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created_user_ids})


@pytest.mark.asyncio
async def test_phase2_answer_ownership_and_validation():
    """
    Phase 2C & 2D:
    1. Answer submission for a valid question on the attempt's exam.
    2. Answer submission for a question belonging to ANOTHER exam is rejected with HTTP 400.
    3. Unauthorized attempt access (student submitting to another student's attempt) is rejected with HTTP 403.
    4. Preservation of historical submissions in database.
    """
    created_user_ids = []
    created_exam_ids = []

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        try:
            # 1. Setup Faculty
            fac_email = f"fac_ans_{uuid.uuid4().hex[:8]}@univ.edu"
            fac_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Answers", "email": fac_email, "password": "Password123!", "role": "FACULTY"
            })
            fac_id = fac_reg.json()["id"]
            created_user_ids.append(fac_id)
            f_headers = {"Authorization": f"Bearer {(await ac.post('/api/v1/auth/login', json={'email': fac_email, 'password': 'Password123!'})).json()['access_token']}"}

            # 2. Exam A with Question QA
            exam_a_res = await ac.post("/api/v1/exams", json={
                "title": "Exam A Valid Questions", "duration_minutes": 60, "availability_type": "ALWAYS"
            }, headers=f_headers)
            exam_a_id = exam_a_res.json()["id"]
            created_exam_ids.append(exam_a_id)

            qa_res = await ac.post(f"/api/v1/exams/{exam_a_id}/questions", json={
                "question_type": "MCQ", "question_text": "What is 2+2?", "options": ["3", "4", "5"], "correct_answer": "4", "marks": 5.0
            }, headers=f_headers)
            qa_id = qa_res.json()["id"]
            await ac.post(f"/api/v1/exams/{exam_a_id}/publish", headers=f_headers)

            # 3. Exam B with Question QB
            exam_b_res = await ac.post("/api/v1/exams", json={
                "title": "Exam B Foreign Questions", "duration_minutes": 60, "availability_type": "ALWAYS"
            }, headers=f_headers)
            exam_b_id = exam_b_res.json()["id"]
            created_exam_ids.append(exam_b_id)

            qb_res = await ac.post(f"/api/v1/exams/{exam_b_id}/questions", json={
                "question_type": "MCQ", "question_text": "What is capital of France?", "options": ["Paris", "Rome"], "correct_answer": "Paris", "marks": 5.0
            }, headers=f_headers)
            qb_id = qb_res.json()["id"]
            await ac.post(f"/api/v1/exams/{exam_b_id}/publish", headers=f_headers)

            # 4. Setup Students Alice and Eve
            alice_email = f"alice_{uuid.uuid4().hex[:8]}@univ.edu"
            alice_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Alice Candidate", "email": alice_email, "password": "Password123!", "role": "STUDENT"
            })
            alice_id = alice_reg.json()["id"]
            created_user_ids.append(alice_id)
            alice_headers = {"Authorization": f"Bearer {(await ac.post('/api/v1/auth/login', json={'email': alice_email, 'password': 'Password123!'})).json()['access_token']}"}

            eve_email = f"eve_{uuid.uuid4().hex[:8]}@univ.edu"
            eve_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Eve Unauthorized", "email": eve_email, "password": "Password123!", "role": "STUDENT"
            })
            eve_id = eve_reg.json()["id"]
            created_user_ids.append(eve_id)
            eve_headers = {"Authorization": f"Bearer {(await ac.post('/api/v1/auth/login', json={'email': eve_email, 'password': 'Password123!'})).json()['access_token']}"}

            # 5. Alice starts Exam A
            att_res = await ac.post(f"/api/v1/exams/{exam_a_id}/attempts", headers=alice_headers)
            attempt_id = att_res.json()["id"]

            # Verify identity for Alice's attempt
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE exam_attempts SET identity_verified = TRUE WHERE id = :id"),
                    {"id": attempt_id}
                )

            # 6. Valid answer submission
            save_valid = await ac.post(
                f"/api/v1/attempts/{attempt_id}/answers",
                json={"question_id": qa_id, "selected_option": "4"},
                headers=alice_headers
            )
            assert save_valid.status_code == 200
            assert save_valid.json()["question_id"] == qa_id
            assert save_valid.json()["selected_option"] == "4"

            # 7. Foreign question submission (QB belongs to Exam B, but attempt is on Exam A)
            save_foreign = await ac.post(
                f"/api/v1/attempts/{attempt_id}/answers",
                json={"question_id": qb_id, "selected_option": "Paris"},
                headers=alice_headers
            )
            assert save_foreign.status_code == 400
            assert "Question does not belong to this exam" in save_foreign.json()["detail"]

            # 8. Non-existent question ID
            save_nonexistent = await ac.post(
                f"/api/v1/attempts/{attempt_id}/answers",
                json={"question_id": str(uuid.uuid4()), "selected_option": "Unknown"},
                headers=alice_headers
            )
            assert save_nonexistent.status_code == 400

            # 9. Unauthorized attempt access: Eve tries to submit an answer to Alice's attempt
            save_unauth = await ac.post(
                f"/api/v1/attempts/{attempt_id}/answers",
                json={"question_id": qa_id, "selected_option": "4"},
                headers=eve_headers
            )
            assert save_unauth.status_code == 403
            assert "Not authorized" in save_unauth.json()["detail"]

            # 10. Preservation of historical submissions: Verify database state
            async with engine.connect() as conn:
                db_answers = (await conn.execute(
                    text("SELECT question_id, selected_option FROM answers WHERE attempt_id = :id"),
                    {"id": attempt_id}
                )).all()
                assert len(db_answers) == 1
                assert db_answers[0][0] == qa_id
                assert db_answers[0][1] == "4"

        finally:
            async with engine.begin() as conn:
                if created_exam_ids:
                    await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": created_exam_ids})
                if created_user_ids:
                    await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created_user_ids})
