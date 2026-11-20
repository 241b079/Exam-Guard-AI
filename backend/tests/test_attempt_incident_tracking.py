import uuid
import pytest
from sqlalchemy import text
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_attempt_incident_tracking_and_isolation():
    """
    Comprehensive test suite verifying examination attempt tracking, proctoring incident isolation,
    and review scoping as required by ExamGuard AI proctoring specifications.

    Scenarios covered:
    1. A student takes Math 1 for the first time -> one attempt record.
    2. The same student takes Math 1 again -> a second independent attempt record.
    3. The same student takes Physics -> another independent attempt record.
    4. First attempt's incidents remain unchanged after the second attempt.
    5. Refreshing an active examination does not create another attempt.
    6. Reconnecting after network interruption resumes the correct attempt.
    7. Duplicate API requests do not create duplicate incidents.
    8. Reviewing an incident in Attempt 2 does not modify Attempt 1.
    9. Group by Student correctly displays all examination attempts.
    10. Group by Exam Attempt correctly displays independent records.
    11. Filters and search return the correct attempt-specific results.
    12. Historical records remain accessible after database migration.
    """
    created_user_ids = []
    created_exam_ids = []

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Setup Faculty
            faculty_email = f"prof_{uuid.uuid4().hex[:8]}@univ.edu"
            f_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Prof Math & Physics",
                "email": faculty_email,
                "password": "Password123!",
                "role": "FACULTY"
            })
            assert f_reg.status_code == 201
            faculty_id = f_reg.json()["id"]
            created_user_ids.append(faculty_id)

            f_login = await ac.post("/api/v1/auth/login", json={"email": faculty_email, "password": "Password123!"})
            f_token = f_login.json()["access_token"]
            f_headers = {"Authorization": f"Bearer {f_token}"}

            # Setup Student
            student_email = f"deepak_{uuid.uuid4().hex[:8]}@student.edu"
            s_reg = await ac.post("/api/v1/auth/register", json={
                "name": "Deepak Kumar",
                "email": student_email,
                "password": "Password123!",
                "role": "STUDENT"
            })
            assert s_reg.status_code == 201
            student_id = s_reg.json()["id"]
            created_user_ids.append(student_id)

            s_login = await ac.post("/api/v1/auth/login", json={"email": student_email, "password": "Password123!"})
            s_token = s_login.json()["access_token"]
            s_headers = {"Authorization": f"Bearer {s_token}"}

            # Create Exam 1: "Math 1" (UNLIMITED_ATTEMPTS for test flexibility)
            m1_res = await ac.post("/api/v1/exams", json={
                "title": "Math 1",
                "duration_minutes": 60,
                "availability_type": "ALWAYS",
                "attempt_policy": "UNLIMITED_ATTEMPTS",
                "max_rejoins": 5
            }, headers=f_headers)
            assert m1_res.status_code == 201
            math1_id = m1_res.json()["id"]
            created_exam_ids.append(math1_id)

            await ac.post(f"/api/v1/exams/{math1_id}/questions", json={
                "question_type": "MCQ",
                "question_text": "What is 2 + 2?",
                "options": ["3", "4", "5"],
                "correct_answer": "4",
                "marks": 5.0
            }, headers=f_headers)
            await ac.post(f"/api/v1/exams/{math1_id}/publish", headers=f_headers)

            # Create Exam 2: "Physics"
            phy_res = await ac.post("/api/v1/exams", json={
                "title": "Physics",
                "duration_minutes": 60,
                "availability_type": "ALWAYS",
                "attempt_policy": "UNLIMITED_ATTEMPTS",
                "max_rejoins": 5
            }, headers=f_headers)
            assert phy_res.status_code == 201
            physics_id = phy_res.json()["id"]
            created_exam_ids.append(physics_id)

            await ac.post(f"/api/v1/exams/{physics_id}/questions", json={
                "question_type": "MCQ",
                "question_text": "What is velocity?",
                "options": ["Speed with direction", "Acceleration", "Mass"],
                "correct_answer": "Speed with direction",
                "marks": 5.0
            }, headers=f_headers)
            await ac.post(f"/api/v1/exams/{physics_id}/publish", headers=f_headers)

            # -------------------------------------------------------------
            # SCENARIO 1: Student takes Math 1 for the first time -> Attempt 1
            # -------------------------------------------------------------
            att1_res = await ac.post(
                f"/api/v1/exams/{math1_id}/attempts",
                json={"session_token": "token_session_1", "is_rejoin": False},
                headers=s_headers
            )
            assert att1_res.status_code == 201
            att1_data = att1_res.json()
            att1_id = att1_data["id"]
            assert att1_data["attempt_number"] == 1
            assert att1_data["status"] == "IN_PROGRESS"

            # -------------------------------------------------------------
            # SCENARIO 5: Refreshing active examination does NOT create another attempt
            # -------------------------------------------------------------
            refresh_res = await ac.post(
                f"/api/v1/exams/{math1_id}/attempts",
                json={"session_token": "token_session_1", "is_rejoin": False},
                headers=s_headers
            )
            assert refresh_res.status_code == 201
            assert refresh_res.json()["id"] == att1_id
            assert refresh_res.json()["attempt_number"] == 1

            # -------------------------------------------------------------
            # SCENARIO 6: Reconnecting after network drop resumes the same attempt
            # -------------------------------------------------------------
            rejoin_res = await ac.post(
                f"/api/v1/attempts/{att1_id}/rejoin",
                json={"session_token": "token_session_1_recovered"},
                headers=s_headers
            )
            assert rejoin_res.status_code == 200
            assert rejoin_res.json()["id"] == att1_id
            assert rejoin_res.json()["status"] == "IN_PROGRESS"

            # Record proctoring incidents for Math 1 Attempt 1
            # Incident 1A: FULLSCREEN_EXIT
            v1_res = await ac.post(
                f"/api/v1/attempts/{att1_id}/violations",
                json={"violation_type": "FULLSCREEN_EXIT", "metadata": {"reason": "User pressed Esc"}},
                headers=s_headers
            )
            assert v1_res.status_code == 201

            # -------------------------------------------------------------
            # SCENARIO 7: Duplicate API requests do not create duplicate incidents
            # -------------------------------------------------------------
            v1_duplicate = await ac.post(
                f"/api/v1/attempts/{att1_id}/violations",
                json={"violation_type": "FULLSCREEN_EXIT", "metadata": {"reason": "User pressed Esc"}},
                headers=s_headers
            )
            assert v1_duplicate.status_code in (200, 201)
            # Idempotent return of the existing violation ID
            assert v1_duplicate.json()["id"] == v1_res.json()["id"]

            # Record a camera stopped violation in Attempt 1
            await ac.post(
                f"/api/v1/attempts/{att1_id}/violations",
                json={"violation_type": "CAMERA_STOPPED", "metadata": {"reason": "Hardware disconnect"}},
                headers=s_headers
            )

            # Upload evidence snapshot for Attempt 1
            up1_res = await ac.post(
                "/api/v1/proctoring/evidence-upload",
                data={"exam_id": math1_id, "attempt_id": att1_id, "event_type": "SUSPICIOUS_GAZE"},
                files={"file": ("evidence1.jpg", b"\xff\xd8\xff\xe0fakejpeg", "image/jpeg")},
                headers=s_headers
            )
            assert up1_res.status_code == 200

            # Submit Math 1 Attempt 1
            sub1_res = await ac.post(f"/api/v1/attempts/{att1_id}/submit", headers=s_headers)
            assert sub1_res.status_code == 200
            assert sub1_res.json()["status"] == "SUBMITTED"

            # Check Attempt 1 incidents before starting Attempt 2
            att1_events_res = await ac.get(f"/api/v1/proctoring/events/{math1_id}?attempt_id={att1_id}", headers=f_headers)
            assert att1_events_res.status_code == 200
            att1_events_count = att1_events_res.json()["total"]
            assert att1_events_count >= 1

            # -------------------------------------------------------------
            # SCENARIO 2: The same student takes Math 1 again -> Attempt 2
            # -------------------------------------------------------------
            att2_res = await ac.post(
                f"/api/v1/exams/{math1_id}/attempts",
                json={"session_token": "token_session_2", "is_rejoin": False},
                headers=s_headers
            )
            assert att2_res.status_code == 201
            att2_data = att2_res.json()
            att2_id = att2_data["id"]
            assert att2_id != att1_id
            assert att2_data["attempt_number"] == 2
            assert att2_data["status"] == "IN_PROGRESS"

            # Record incidents specifically for Attempt 2
            v2_res = await ac.post(
                f"/api/v1/attempts/{att2_id}/violations",
                json={"violation_type": "LOOKING_AWAY", "metadata": {"gaze_yaw": 35.5}},
                headers=s_headers
            )
            assert v2_res.status_code == 201

            # Upload evidence snapshot for Attempt 2
            up2_res = await ac.post(
                "/api/v1/proctoring/evidence-upload",
                data={"exam_id": math1_id, "attempt_id": att2_id, "event_type": "MULTIPLE_FACES"},
                files={"file": ("evidence2.jpg", b"\xff\xd8\xff\xe0fakejpeg2", "image/jpeg")},
                headers=s_headers
            )
            assert up2_res.status_code == 200

            # Submit Attempt 2
            sub2_res = await ac.post(f"/api/v1/attempts/{att2_id}/submit", headers=s_headers)
            assert sub2_res.status_code == 200

            # -------------------------------------------------------------
            # SCENARIO 4: First attempt's incidents remain unchanged after Attempt 2
            # -------------------------------------------------------------
            att1_events_after = await ac.get(f"/api/v1/proctoring/events/{math1_id}?attempt_id={att1_id}", headers=f_headers)
            assert att1_events_after.status_code == 200
            assert att1_events_after.json()["total"] == att1_events_count
            for ev in att1_events_after.json()["events"]:
                assert ev["exam_attempt_id"] == att1_id
                assert ev["attempt_number"] == 1

            # -------------------------------------------------------------
            # SCENARIO 3: The same student takes Physics -> Independent attempt
            # -------------------------------------------------------------
            att3_res = await ac.post(
                f"/api/v1/exams/{physics_id}/attempts",
                json={"session_token": "token_session_3", "is_rejoin": False},
                headers=s_headers
            )
            assert att3_res.status_code == 201
            att3_data = att3_res.json()
            att3_id = att3_data["id"]
            assert att3_id not in (att1_id, att2_id)
            assert att3_data["attempt_number"] == 1
            assert att3_data["exam_id"] == physics_id

            # Physics incident & evidence
            v3_res = await ac.post(
                f"/api/v1/attempts/{att3_id}/violations",
                json={"violation_type": "WINDOW_BLUR", "metadata": {"tab_switch": True}},
                headers=s_headers
            )
            assert v3_res.status_code == 201

            up3_res = await ac.post(
                "/api/v1/proctoring/evidence-upload",
                data={"exam_id": physics_id, "attempt_id": att3_id, "event_type": "VOICE_DETECTED"},
                files={"file": ("evidence3.jpg", b"\xff\xd8\xff\xe0fakejpeg3", "image/jpeg")},
                headers=s_headers
            )
            assert up3_res.status_code == 200

            # Submit Physics Attempt
            await ac.post(f"/api/v1/attempts/{att3_id}/submit", headers=s_headers)

            # Physics events belong solely to physics
            phy_events_res = await ac.get(f"/api/v1/proctoring/events/{physics_id}", headers=f_headers)
            assert phy_events_res.status_code == 200
            for pev in phy_events_res.json()["events"]:
                assert pev["exam_id"] == physics_id
                assert pev["exam_attempt_id"] == att3_id

            # -------------------------------------------------------------
            # SCENARIO 8: Reviewing an incident in Attempt 2 does not modify Attempt 1
            # -------------------------------------------------------------
            # Fetch events for Attempt 2
            att2_events_res = await ac.get(f"/api/v1/proctoring/events/{math1_id}?attempt_id={att2_id}", headers=f_headers)
            assert att2_events_res.status_code == 200
            att2_events = att2_events_res.json()["events"]
            assert len(att2_events) > 0
            event_to_review_id = att2_events[0]["id"]

            # Faculty confirms incident in Attempt 2
            rev_res = await ac.patch(
                f"/api/v1/proctoring/events/{event_to_review_id}/review",
                json={"review_status": "CONFIRMED", "review_comment": "Misconduct verified in Attempt 2"},
                headers=f_headers
            )
            assert rev_res.status_code == 200
            assert rev_res.json()["review_status"] == "CONFIRMED"

            # Check that Attempt 1 events were NOT modified
            att1_check = await ac.get(f"/api/v1/proctoring/events/{math1_id}?attempt_id={att1_id}", headers=f_headers)
            for ev1 in att1_check.json()["events"]:
                assert ev1["id"] != event_to_review_id
                assert ev1["exam_attempt_id"] == att1_id
                assert ev1["review_comment"] != "Misconduct verified in Attempt 2"

            # -------------------------------------------------------------
            # SCENARIO 9 & 10: Group by Student vs Group by Exam Attempt
            # -------------------------------------------------------------
            all_m1_events_res = await ac.get(f"/api/v1/proctoring/events/{math1_id}", headers=f_headers)
            assert all_m1_events_res.status_code == 200
            all_m1_events = all_m1_events_res.json()["events"]

            # Group by Exam Attempt (should find distinct attempt IDs)
            attempt_ids_found = {ev["exam_attempt_id"] for ev in all_m1_events}
            assert att1_id in attempt_ids_found
            assert att2_id in attempt_ids_found
            assert len(attempt_ids_found) >= 2

            # All events have proper metadata populated
            for ev in all_m1_events:
                assert ev["exam_title"] == "Math 1"
                assert ev["student_name"] == "Deepak Kumar"
                assert ev["attempt_number"] in (1, 2)
                assert ev["attempt_started_at"] is not None

            # -------------------------------------------------------------
            # SCENARIO 11: Filters & Search return attempt-specific results
            # -------------------------------------------------------------
            att1_filtered = await ac.get(f"/api/v1/proctoring/events/{math1_id}?attempt_id={att1_id}", headers=f_headers)
            assert all(ev["exam_attempt_id"] == att1_id for ev in att1_filtered.json()["events"])

            att2_filtered = await ac.get(f"/api/v1/proctoring/events/{math1_id}?attempt_id={att2_id}", headers=f_headers)
            assert all(ev["exam_attempt_id"] == att2_id for ev in att2_filtered.json()["events"])

            # -------------------------------------------------------------
            # SCENARIO 12: Historical records remain accessible after database migration
            # -------------------------------------------------------------
            async with AsyncSessionLocal() as session:
                # Insert a test historical event with null attempt to test backfill migration
                test_event_id = str(uuid.uuid4())
                await session.execute(
                    text("""
                        INSERT INTO proctoring_events (
                            id, exam_id, exam_attempt_id, student_id, event_type,
                            severity, review_status, duration, face_count, detected_at, started_at, created_at, updated_at
                        ) VALUES (
                            :id, :exam_id, NULL, :student_id, 'NO_FACE',
                            'MEDIUM', 'PENDING', 0.0, 1, NOW(), NOW(), NOW(), NOW()
                        )
                    """),
                    {"id": test_event_id, "exam_id": math1_id, "student_id": student_id}
                )
                await session.commit()

                # Run idempotent backfill
                await session.execute(text("""
                    UPDATE proctoring_events pe
                    SET exam_attempt_id = ea.id
                    FROM exam_attempts ea
                    WHERE pe.id = :id
                      AND pe.exam_attempt_id IS NULL
                      AND pe.student_id = ea.student_id
                      AND pe.exam_id = ea.exam_id;
                """), {"id": test_event_id})
                await session.commit()

                # Verify backfill attached it to an attempt
                backfilled = (await session.execute(
                    text("SELECT exam_attempt_id FROM proctoring_events WHERE id = :id"),
                    {"id": test_event_id}
                )).scalar()
                assert backfilled is not None
                assert backfilled in (att1_id, att2_id)

                # Clean up test historical event
                await session.execute(text("DELETE FROM proctoring_events WHERE id = :id"), {"id": test_event_id})
                await session.commit()

            # Candidate monitoring reflects both active and submitted attempts
            monitoring_res = await ac.get(f"/api/v1/exams/{math1_id}/attempts-monitoring?active_only=false", headers=f_headers)
            assert monitoring_res.status_code == 200
            mon_attempts = monitoring_res.json()
            mon_ids = [m["attempt_id"] for m in mon_attempts]
            assert att1_id in mon_ids
            assert att2_id in mon_ids

    finally:
        # STRICT RULE: IMMEDIATE TEARDOWN & CLEANUP OF ALL TEST ENTITIES
        async with AsyncSessionLocal() as cleanup_session:
            if created_exam_ids or created_user_ids:
                if created_exam_ids:
                    await cleanup_session.execute(
                        text("DELETE FROM proctoring_events WHERE exam_id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM proctoring_incidents WHERE exam_id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM student_risk_scores WHERE exam_id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM faculty_alerts WHERE exam_id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM examination_investigations WHERE exam_id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM disqualification_records WHERE exam_id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM questions WHERE exam_id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                if created_user_ids:
                    await cleanup_session.execute(
                        text("DELETE FROM exam_violations WHERE student_id = ANY(:ids)"),
                        {"ids": created_user_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM student_profiles WHERE user_id = ANY(:ids)"),
                        {"ids": created_user_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM faculty_profiles WHERE user_id = ANY(:ids)"),
                        {"ids": created_user_ids}
                    )
                if created_exam_ids:
                    await cleanup_session.execute(
                        text("DELETE FROM exam_attempts WHERE exam_id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                    await cleanup_session.execute(
                        text("DELETE FROM exams WHERE id = ANY(:ids)"),
                        {"ids": created_exam_ids}
                    )
                if created_user_ids:
                    await cleanup_session.execute(
                        text("DELETE FROM users WHERE id = ANY(:ids)"),
                        {"ids": created_user_ids}
                    )
                await cleanup_session.commit()
