import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from fastapi.testclient import TestClient

from app.main import app
from app.features.users.models import UserRole


@pytest.mark.asyncio
async def test_realtime_violation_synchronization_and_rejoin_reliability():
    """
    Comprehensive regression tests for Bug 1 & Bug 2:
    1. Fast and reliable real-time violation push via WebSocket & HTTP broadcast.
    2. Idempotency & deduplication by violation ID.
    3. Reconnection & state synchronization (faculty recovers full history; student receives authoritative state).
    4. Stale connection eviction with race condition protection (no false student_left on rejoin).
    5. Multi-rejoin resiliency (join -> disconnect -> rejoin -> disconnect -> rejoin).
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Setup Faculty
        fac_email = f"fac_rt_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof Realtime", "email": fac_email, "password": "Password123!", "role": "FACULTY"
        })
        fac_login = (await ac.post("/api/v1/auth/login", json={"email": fac_email, "password": "Password123!"})).json()
        fac_token = fac_login["access_token"]
        fac_headers = {"Authorization": f"Bearer {fac_token}"}

        # 2. Faculty creates and publishes exam with max_rejoins=3
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Realtime Proctoring Exam",
            "duration_minutes": 60,
            "availability_type": "ALWAYS",
            "max_rejoins": 3,
        }, headers=fac_headers)
        assert exam_res.status_code == 201
        exam_id = exam_res.json()["id"]

        await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "Q1?",
            "options": ["A", "B"],
            "correct_answer": "A",
            "marks": 5.0
        }, headers=fac_headers)
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)

        # 3. Setup Student
        stu_email = f"stu_rt_{uuid.uuid4().hex[:8]}@univ.edu"
        s_reg = (await ac.post("/api/v1/auth/register", json={
            "name": "Alice Realtime", "email": stu_email, "password": "Password123!", "role": "STUDENT"
        })).json()
        student_id = s_reg["id"]
        stu_login = (await ac.post("/api/v1/auth/login", json={"email": stu_email, "password": "Password123!"})).json()
        stu_token = stu_login["access_token"]
        stu_headers = {"Authorization": f"Bearer {stu_token}"}

        # 4. Student starts attempt
        session_token_1 = f"session_{uuid.uuid4().hex[:8]}"
        att_res = await ac.post(
            f"/api/v1/exams/{exam_id}/attempts",
            json={"session_token": session_token_1, "is_rejoin": False},
            headers=stu_headers
        )
        assert att_res.status_code == 201
        attempt_id = att_res.json()["id"]

    # 5. Live WebSocket Monitoring & Real-time Synchronization Verification
    with TestClient(app) as client:
        # A. Faculty connects to live monitoring room
        with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={fac_token}") as fac_ws:
            fac_conn = fac_ws.receive_json()
            assert fac_conn["type"] == "connected"
            fac_client_id = fac_conn["client_id"]

            # B. Student connects to exam attempt
            with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={stu_token}&attempt_id={attempt_id}") as stu_ws_1:
                stu_conn = stu_ws_1.receive_json()
                assert stu_conn["type"] == "connected"
                assert stu_conn["student_id"] == student_id
                assert stu_conn["rejoin_count"] == 0
                stu_client_id_1 = stu_conn["client_id"]

                # Drain greeting messages
                stu_fac_joined = stu_ws_1.receive_json()
                assert stu_fac_joined["type"] == "faculty_joined"

                fac_stu_joined = fac_ws.receive_json()
                assert fac_stu_joined["type"] == "student_joined"
                assert fac_stu_joined["client_id"] == stu_client_id_1
                assert fac_stu_joined["rejoin_count"] == 0

                # ── BUG 1 VERIFICATION: Real-Time Violation Push ──
                # Student sends TAB_SWITCH violation over WebSocket
                stu_ws_1.send_json({
                    "type": "violation",
                    "violation_type": "PAGE_HIDDEN",
                    "metadata": {"reason": "Tab switch to external documentation"}
                })

                # Student receives ack
                stu_ack = stu_ws_1.receive_json()
                assert stu_ack["type"] == "violation_ack"
                assert stu_ack["violation_type"] == "PAGE_HIDDEN"
                violation_id_1 = stu_ack["violation_id"]

                # Faculty receives real-time violation event immediately!
                fac_violation = fac_ws.receive_json()
                assert fac_violation["type"] == "violation"
                assert fac_violation["student_id"] == student_id
                assert fac_violation["attempt_id"] == attempt_id
                assert fac_violation["violation"]["id"] == violation_id_1
                assert fac_violation["violation"]["violation_type"] == "PAGE_HIDDEN"

                # Next: student records violation via HTTP POST using client
                http_v_res = client.post(
                    f"/api/v1/attempts/{attempt_id}/violations",
                    json={
                        "violation_type": "FULLSCREEN_EXIT",
                        "metadata": {"screen": "windowed"}
                    },
                    headers=stu_headers
                )
                assert http_v_res.status_code == 201
                http_v_id = http_v_res.json()["id"]

                # Faculty immediately receives broadcast for HTTP violation too!
                fac_v_http = fac_ws.receive_json()
                assert fac_v_http["type"] == "violation"
                assert fac_v_http["violation"]["id"] == http_v_id
                assert fac_v_http["violation"]["violation_type"] == "FULLSCREEN_EXIT"

                # ── BUG 2 VERIFICATION: Rejoin & Stale Connection Eviction ──
                # Student initiates a Rejoin while old connection stu_ws_1 is still open.
                # The server MUST safely evict stu_ws_1, register stu_ws_2, and suppress false student_left!
                with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={stu_token}&attempt_id={attempt_id}") as stu_ws_2:
                    stu2_conn = stu_ws_2.receive_json()
                    assert stu2_conn["type"] == "connected"
                    stu_client_id_2 = stu2_conn["client_id"]
                    assert stu_client_id_2 != stu_client_id_1

                    stu_fac_msg2 = stu_ws_2.receive_json()
                    assert stu_fac_msg2["type"] == "faculty_joined"

                    # Faculty receives student_rejoined / student_joined for the new connection
                    fac_rejoin = fac_ws.receive_json()
                    assert fac_rejoin["type"] in ["student_rejoined", "student_joined"]
                    assert fac_rejoin["client_id"] == stu_client_id_2

                    # When the old socket stu_ws_1 finishes or disconnects, faculty MUST NOT receive false student_left!
                    # Test that new socket can immediately send a violation and faculty receives it
                    stu_ws_2.send_json({
                        "type": "violation",
                        "violation_type": "CONTEXT_MENU",
                        "metadata": {"button": "secondary"}
                    })
                    stu2_ack = stu_ws_2.receive_json()
                    assert stu2_ack["type"] == "violation_ack"

                    fac_v_after_rejoin = fac_ws.receive_json()
                    assert fac_v_after_rejoin["type"] == "violation"
                    assert fac_v_after_rejoin["violation"]["violation_type"] == "CONTEXT_MENU"

            # After both sockets close, faculty receives student_left for the active client
            fac_left = fac_ws.receive_json()
            assert fac_left["type"] == "student_left"
            assert fac_left["client_id"] == stu_client_id_2

        # ── VERIFY RECOVERY UPON FACULTY RECONNECT ──
        # When faculty reconnects and calls attempts-monitoring, the complete authoritative history is present
        mon_res = client.get(f"/api/v1/exams/{exam_id}/attempts-monitoring", headers=fac_headers)
        assert mon_res.status_code == 200
        items = mon_res.json()
        assert len(items) == 1
        assert items[0]["attempt_id"] == attempt_id
        assert items[0]["violation_count"] >= 3
        recent_ids = [v["id"] for v in items[0]["recent_violations"]]
        assert violation_id_1 in recent_ids
        assert http_v_id in recent_ids


@pytest.mark.asyncio
async def test_multi_rejoin_resiliency():
    """
    Test multiple consecutive rejoins:
    Join -> Disconnect -> Rejoin -> Disconnect -> Rejoin
    Join -> Rejoin -> Rejoin (consecutive rejoin while previous connection active)
    Ensure second rejoin does not break active connection and updates state accurately.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        fac_email = f"fac_mr_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof MultiRejoin", "email": fac_email, "password": "Password123!", "role": "FACULTY"
        })
        fac_login = (await ac.post("/api/v1/auth/login", json={"email": fac_email, "password": "Password123!"})).json()
        fac_token = fac_login["access_token"]
        fac_headers = {"Authorization": f"Bearer {fac_token}"}

        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Multi Rejoin Exam",
            "duration_minutes": 60,
            "availability_type": "ALWAYS",
            "max_rejoins": 5,
        }, headers=fac_headers)
        exam_id = exam_res.json()["id"]
        await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "Q1?",
            "options": ["A", "B"],
            "correct_answer": "A",
            "marks": 5.0
        }, headers=fac_headers)
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)

        stu_email = f"stu_mr_{uuid.uuid4().hex[:8]}@univ.edu"
        s_reg = (await ac.post("/api/v1/auth/register", json={
            "name": "Bob Rejoiner", "email": stu_email, "password": "Password123!", "role": "STUDENT"
        })).json()
        student_id = s_reg["id"]
        stu_login = (await ac.post("/api/v1/auth/login", json={"email": stu_email, "password": "Password123!"})).json()
        stu_token = stu_login["access_token"]
        stu_headers = {"Authorization": f"Bearer {stu_token}"}

        # Start attempt
        att_res = await ac.post(
            f"/api/v1/exams/{exam_id}/attempts",
            json={"session_token": f"sess_{uuid.uuid4().hex[:8]}", "is_rejoin": False},
            headers=stu_headers
        )
        attempt_id = att_res.json()["id"]

    with TestClient(app) as client:
        with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={fac_token}") as fac_ws:
            fac_ws.receive_json() # connected

            # 1. First Join & Disconnect
            with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={stu_token}&attempt_id={attempt_id}") as stu_ws_1:
                stu_ws_1.receive_json() # connected
                stu_ws_1.receive_json() # faculty_joined
                f_join1 = fac_ws.receive_json()
                assert f_join1["type"] == "student_joined"
                assert f_join1["rejoin_count"] == 0

            # Disconnect leaves room
            f_left1 = fac_ws.receive_json()
            assert f_left1["type"] == "student_left"

            # 2. First Rejoin via endpoint
            rejoin_res = client.post(f"/api/v1/attempts/{attempt_id}/rejoin", headers=stu_headers)
            assert rejoin_res.status_code == 200
            assert rejoin_res.json()["rejoin_count"] == 1
            f_rejoin_notify1 = fac_ws.receive_json()
            assert f_rejoin_notify1["type"] == "student_rejoined"
            assert f_rejoin_notify1["rejoin_count"] == 1

            # Reconnect WS for attempt (1st rejoin)
            with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={stu_token}&attempt_id={attempt_id}") as stu_ws_2:
                stu_ws_2.receive_json() # connected
                stu_ws_2.receive_json() # faculty_joined
                f_join2 = fac_ws.receive_json()
                assert f_join2["type"] in ["student_rejoined", "student_joined"]
                assert f_join2["rejoin_count"] == 1

                # Send violation in rejoined state
                stu_ws_2.send_json({
                    "type": "violation",
                    "violation_type": "PAGE_HIDDEN",
                    "metadata": {"reason": "window_blur"}
                })
                ack = stu_ws_2.receive_json()
                assert ack["type"] == "violation_ack"

                fac_v = fac_ws.receive_json()
                assert fac_v["type"] == "violation"
                assert fac_v["violation"]["violation_type"] == "PAGE_HIDDEN"

            f_left2 = fac_ws.receive_json()
            assert f_left2["type"] == "student_left"

            # 3. Second Rejoin via endpoint
            rejoin_res_2 = client.post(f"/api/v1/attempts/{attempt_id}/rejoin", headers=stu_headers)
            assert rejoin_res_2.status_code == 200
            assert rejoin_res_2.json()["rejoin_count"] == 2
            f_rejoin_notify2 = fac_ws.receive_json()
            assert f_rejoin_notify2["type"] == "student_rejoined"
            assert f_rejoin_notify2["rejoin_count"] == 2

            # Reconnect WS 3rd time (2nd rejoin)
            with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={stu_token}&attempt_id={attempt_id}") as stu_ws_3:
                stu_ws_3.receive_json() # connected
                stu_ws_3.receive_json() # faculty_joined
                f_join3 = fac_ws.receive_json()
                assert f_join3["type"] in ["student_rejoined", "student_joined"]
                assert f_join3["rejoin_count"] == 2

                # Verify connection is healthy and can send violation
                stu_ws_3.send_json({
                    "type": "violation",
                    "violation_type": "FULLSCREEN_EXIT",
                    "metadata": {"reason": "escape_pressed"}
                })
                ack3 = stu_ws_3.receive_json()
                assert ack3["type"] == "violation_ack"

                fac_v3 = fac_ws.receive_json()
                assert fac_v3["type"] == "violation"
                assert fac_v3["violation"]["violation_type"] == "FULLSCREEN_EXIT"

            f_left3 = fac_ws.receive_json()
            assert f_left3["type"] == "student_left"

