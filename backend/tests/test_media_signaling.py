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


@pytest.mark.asyncio
async def test_websocket_signaling_authorization_and_exchange():
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register Faculty A (owner) and Faculty B (intruder)
        facA_email = f"fac_a_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof A", "email": facA_email, "password": "Password123!", "role": "FACULTY"
        })
        facA_login = (await ac.post("/api/v1/auth/login", json={"email": facA_email, "password": "Password123!"})).json()
        facA_token = facA_login["access_token"]
        facA_headers = {"Authorization": f"Bearer {facA_token}"}

        facB_email = f"fac_b_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof B", "email": facB_email, "password": "Password123!", "role": "FACULTY"
        })
        facB_login = (await ac.post("/api/v1/auth/login", json={"email": facB_email, "password": "Password123!"})).json()
        facB_token = facB_login["access_token"]

        # 2. Register Student 1 (legitimate) and Student 2 (intruder)
        stu1_email = f"stu_a_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Student A", "email": stu1_email, "password": "Password123!", "role": "STUDENT"
        })
        stu1_login = (await ac.post("/api/v1/auth/login", json={"email": stu1_email, "password": "Password123!"})).json()
        stu1_token = stu1_login["access_token"]
        stu1_headers = {"Authorization": f"Bearer {stu1_token}"}

        stu2_email = f"stu_b_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Student B", "email": stu2_email, "password": "Password123!", "role": "STUDENT"
        })
        stu2_login = (await ac.post("/api/v1/auth/login", json={"email": stu2_email, "password": "Password123!"})).json()
        stu2_token = stu2_login["access_token"]

        # 3. Faculty A creates & publishes exam
        exam_res = await ac.post("/api/v1/exams", json={
            "title": "WebRTC Live Exam",
            "description": "Cross-device signaling test",
            "duration_minutes": 45,
            "negative_marking": "NONE",
            "auto_submit": True,
            "display_countdown": True,
            "assignment_type": "ALL_STUDENTS",
            "availability_type": "ALWAYS"
        }, headers=facA_headers)
        exam_id = exam_res.json()["id"]

        await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "What protocol secures WebRTC media?",
            "options": ["SRTP", "HTTP", "Telnet", "FTP"],
            "correct_answer": "SRTP",
            "marks": 5.0
        }, headers=facA_headers)

        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=facA_headers)

        # 4. Student 1 starts attempt
        att_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=stu1_headers)
        attempt_id = att_res.json()["id"]

    # 5. Use TestClient to verify WebSocket Authentication & Authorization
    with TestClient(app) as client:
        # A. Invalid token -> rejects connection
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token=invalid_token"):
                pass
        assert exc_info.value.code == 4403

        # B. Faculty B attempts to monitor Faculty A's exam -> 4403 Unauthorized
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={facB_token}"):
                pass
        assert exc_info.value.code == 4403

        # C. Student 2 attempts to hijack Student 1's attempt -> 4403 Unauthorized
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={stu2_token}&attempt_id={attempt_id}"):
                pass
        assert exc_info.value.code == 4403

        # D. Authorized Faculty A connects to monitor exam room
        with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={facA_token}") as fac_ws:
            fac_conn_msg = fac_ws.receive_json()
            assert fac_conn_msg["type"] == "connected"
            fac_client_id = fac_conn_msg["client_id"]
            assert fac_client_id.startswith("fac_")

            # E. Authorized Student 1 connects to exam attempt
            with client.websocket_connect(f"/api/v1/exams/{exam_id}/ws?token={stu1_token}&attempt_id={attempt_id}") as stu_ws:
                stu_conn_msg = stu_ws.receive_json()
                assert stu_conn_msg["type"] == "connected"
                stu_client_id = stu_conn_msg["client_id"]
                assert stu_client_id.startswith("stu_")

                # Student receives notice of connected faculty
                stu_fac_joined = stu_ws.receive_json()
                assert stu_fac_joined["type"] == "faculty_joined"
                assert stu_fac_joined["faculty_client_id"] == fac_client_id

                # Faculty receives notice of new student joining
                fac_stu_joined = fac_ws.receive_json()
                assert fac_stu_joined["type"] == "student_joined"
                assert fac_stu_joined["client_id"] == stu_client_id
                assert fac_stu_joined["attempt_id"] == attempt_id

                # F. Student sends SDP offer targeted to Faculty
                stu_ws.send_json({
                    "type": "offer",
                    "target_client_id": fac_client_id,
                    "sdp": "v=0\r\no=mock_student_sdp",
                    "stream_map": {"cameraTrackId": "cam-1", "micTrackId": "mic-1", "screenTrackId": None}
                })

                fac_offer = fac_ws.receive_json()
                assert fac_offer["type"] == "offer"
                assert fac_offer["sdp"] == "v=0\r\no=mock_student_sdp"
                assert fac_offer["sender_client_id"] == stu_client_id
                assert fac_offer["stream_map"]["cameraTrackId"] == "cam-1"

                # G. Faculty sends SDP answer back to Student
                fac_ws.send_json({
                    "type": "answer",
                    "target_client_id": stu_client_id,
                    "sdp": "v=0\r\no=mock_faculty_answer_sdp"
                })

                stu_answer = stu_ws.receive_json()
                assert stu_answer["type"] == "answer"
                assert stu_answer["sdp"] == "v=0\r\no=mock_faculty_answer_sdp"
                assert stu_answer["sender_client_id"] == fac_client_id

                # H. Student sends ICE candidate
                stu_ws.send_json({
                    "type": "ice_candidate",
                    "target_client_id": fac_client_id,
                    "candidate": {"candidate": "candidate:mock 1 UDP ...", "sdpMid": "0"}
                })

                fac_ice = fac_ws.receive_json()
                assert fac_ice["type"] == "ice_candidate"
                assert fac_ice["candidate"]["candidate"] == "candidate:mock 1 UDP ..."
                assert fac_ice["sender_client_id"] == stu_client_id

            # I. When Student disconnects, Faculty receives student_left notification
            fac_stu_left = fac_ws.receive_json()
            assert fac_stu_left["type"] == "student_left"
            assert fac_stu_left["client_id"] == stu_client_id
            assert fac_stu_left["attempt_id"] == attempt_id

