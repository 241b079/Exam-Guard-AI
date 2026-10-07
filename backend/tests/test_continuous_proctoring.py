import os
import uuid
import pytest
import numpy as np
import cv2
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import settings
from app.features.proctoring.service import ProctoringService


FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
FACE1_PATH = os.path.join(FIXTURES_DIR, "face1.jpg")
FACE2_PATH = os.path.join(FIXTURES_DIR, "face2.jpg")


@pytest.fixture
def face1_bytes():
    with open(FACE1_PATH, "rb") as f:
        return f.read()


@pytest.fixture
def face2_bytes():
    with open(FACE2_PATH, "rb") as f:
        return f.read()


@pytest.fixture
def no_face_bytes():
    # Plain solid gray image
    img = np.full((320, 320, 3), 128, dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


@pytest.fixture
def two_faces_registered_and_unknown_bytes():
    """Combines face1 and face2 side-by-side."""
    f1 = cv2.imread(FACE1_PATH)
    f2 = cv2.imread(FACE2_PATH)
    # Resize to identical height
    h = 320
    w1 = int(f1.shape[1] * (h / f1.shape[0]))
    w2 = int(f2.shape[1] * (h / f2.shape[0]))
    f1_res = cv2.resize(f1, (w1, h))
    f2_res = cv2.resize(f2, (w2, h))
    combined = np.hstack([f1_res, f2_res])
    _, buf = cv2.imencode(".jpg", combined)
    return buf.tobytes()


@pytest.fixture
def two_faces_both_unknown_bytes():
    """Combines face2 twice side-by-side."""
    f2 = cv2.imread(FACE2_PATH)
    h = 320
    w2 = int(f2.shape[1] * (h / f2.shape[0]))
    f2_res = cv2.resize(f2, (w2, h))
    combined = np.hstack([f2_res, f2_res])
    _, buf = cv2.imencode(".jpg", combined)
    return buf.tobytes()


@pytest.mark.asyncio
async def test_continuous_proctoring_full_suite(
    face1_bytes,
    face2_bytes,
    no_face_bytes,
    two_faces_registered_and_unknown_bytes,
    two_faces_both_unknown_bytes
):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Setup Faculty and Exam
        faculty_email = f"prof_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof Proctor", "email": faculty_email, "password": "Password123!", "role": "FACULTY"
        })
        f_login = await ac.post("/api/v1/auth/login", json={"email": faculty_email, "password": "Password123!"})
        f_token = f_login.json()["access_token"]
        f_headers = {"Authorization": f"Bearer {f_token}"}

        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Continuous Proctoring Midterm",
            "duration_minutes": 60,
            "availability_type": "ALWAYS"
        }, headers=f_headers)
        exam_id = exam_res.json()["id"]

        await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "Sample Question",
            "options": ["A", "B"],
            "correct_answer": "A",
            "marks": 5.0
        }, headers=f_headers)
        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=f_headers)

        # 2. Setup Student (Registered with face1.jpg)
        student_email = f"alice_{uuid.uuid4().hex[:8]}@univ.edu"
        s_reg = await ac.post("/api/v1/auth/register", json={
            "name": "Alice Verified", "email": student_email, "password": "Password123!", "role": "STUDENT"
        })
        student_id = s_reg.json()["id"]
        s_login = await ac.post("/api/v1/auth/login", json={"email": student_email, "password": "Password123!"})
        s_token = s_login.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}

        # Upload Alice's official registered photo
        await ac.post(
            "/api/v1/students/me/photo",
            files={"file": ("profile.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )

        # Pre-exam verification
        init_verify = await ac.post(
            "/api/v1/identity/verify",
            data={"exam_id": exam_id},
            files={"file": ("live.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert init_verify.status_code == 200
        assert init_verify.json()["verified"] is True
        attempt_id = init_verify.json()["attempt_id"]

        # ----------------------------------------------------
        # TEST 1: One verified student continuously visible
        # Expected: NORMAL_VERIFIED, No suspicious event.
        # ----------------------------------------------------
        t1_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t1_res.status_code == 200
        t1_data = t1_res.json()
        assert t1_data["state"] == "NORMAL_VERIFIED"
        assert t1_data["is_suspicious"] is False
        assert t1_data["face_count"] == 1
        assert t1_data["similarity"] >= 0.90
        assert t1_data["event_created"] is False

        # ----------------------------------------------------
        # TEST 2: Student briefly moves out of frame
        # Expected: TEMPORARILY_ABSENT pending, No immediate event (below grace period)
        # ----------------------------------------------------
        t2_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", no_face_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t2_res.status_code == 200
        t2_data = t2_res.json()
        assert t2_data["state"] == "TEMPORARILY_ABSENT"
        assert t2_data["is_suspicious"] is False
        assert t2_data["event_created"] is False

        # ----------------------------------------------------
        # TEST 3: Student returns before grace period expires
        # Expected: Returns to NORMAL_VERIFIED, no event generated.
        # ----------------------------------------------------
        t3_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t3_res.status_code == 200
        t3_data = t3_res.json()
        assert t3_data["state"] == "NORMAL_VERIFIED"
        assert t3_data["event_created"] is False

        # ----------------------------------------------------
        # TEST 4: Unknown person appears briefly (< confirmation duration)
        # Expected: No immediate event created.
        # ----------------------------------------------------
        t4_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", face2_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t4_res.status_code == 200
        t4_data = t4_res.json()
        assert t4_data["state"] == "IDENTITY_MISMATCH"
        assert t4_data["is_suspicious"] is False  # Pending confirmation!
        assert t4_data["event_created"] is False

        # ----------------------------------------------------
        # TEST 5: Unknown person remains visible (persist past confirmation threshold)
        # Expected: Confirmed IDENTITY_MISMATCH + evidence captured.
        # ----------------------------------------------------
        # Simulate time passage beyond IDENTITY_MISMATCH_CONFIRM_SECONDS
        tracker = ProctoringService.get_tracker(exam_id, student_id)
        tracker.pending_state_start = datetime.now(timezone.utc) - timedelta(seconds=settings.IDENTITY_MISMATCH_CONFIRM_SECONDS + 1)

        t5_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", face2_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t5_res.status_code == 200
        t5_data = t5_res.json()
        assert t5_data["state"] == "IDENTITY_MISMATCH"
        assert t5_data["is_suspicious"] is True
        assert t5_data["event_created"] is True
        assert t5_data["evidence_captured"] is True
        assert t5_data["incident_id"] is not None
        mismatch_event_id = t5_data["event_id"]
        mismatch_incident_id = t5_data["incident_id"]

        # ----------------------------------------------------
        # TEST 8: Unknown person remains for 30s
        # Expected: ONE incident, not hundreds of events.
        # ----------------------------------------------------
        t8_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", face2_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t8_res.status_code == 200
        t8_data = t8_res.json()
        assert t8_data["incident_id"] == mismatch_incident_id
        assert t8_data["event_created"] is False  # Deduplicated! Same incident.

        # ----------------------------------------------------
        # TEST 9: Unknown person leaves and registered student returns
        # Expected: Incident closes -> student returns to NORMAL_VERIFIED, RECOVERED recorded.
        # ----------------------------------------------------
        t9_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t9_res.status_code == 200
        t9_data = t9_res.json()
        assert t9_data["state"] == "NORMAL_VERIFIED"
        assert t9_data["is_suspicious"] is False

        # ----------------------------------------------------
        # TEST 6: Two people appear (both unknown)
        # Expected: MULTIPLE_PERSON + evidence
        # ----------------------------------------------------
        # First frame starts pending
        await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", two_faces_both_unknown_bytes, "image/jpeg")},
            headers=s_headers
        )
        # Simulate time passage past threshold
        tracker = ProctoringService.get_tracker(exam_id, student_id)
        tracker.pending_state_start = datetime.now(timezone.utc) - timedelta(seconds=settings.MULTIPLE_PERSON_CONFIRM_SECONDS + 1)

        t6_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", two_faces_both_unknown_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t6_res.status_code == 200
        t6_data = t6_res.json()
        assert t6_data["state"] == "MULTIPLE_PERSON"
        assert t6_data["is_suspicious"] is True
        assert t6_data["face_count"] >= 2
        assert t6_data["event_created"] is True
        assert t6_data["evidence_captured"] is True

        # Clear back to normal
        await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )

        # ----------------------------------------------------
        # TEST 7: Registered student + unknown person visible together
        # Expected: MULTIPLE_PERSON_IDENTITY_MISMATCH + evidence (High Priority)
        # ----------------------------------------------------
        await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", two_faces_registered_and_unknown_bytes, "image/jpeg")},
            headers=s_headers
        )
        tracker = ProctoringService.get_tracker(exam_id, student_id)
        tracker.pending_state_start = datetime.now(timezone.utc) - timedelta(seconds=settings.MULTIPLE_PERSON_CONFIRM_SECONDS + 1)

        t7_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", two_faces_registered_and_unknown_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t7_res.status_code == 200
        t7_data = t7_res.json()
        assert t7_data["state"] == "MULTIPLE_PERSON_IDENTITY_MISMATCH"
        assert t7_data["is_suspicious"] is True
        assert t7_data["event_created"] is True
        assert t7_data["evidence_captured"] is True

        # ----------------------------------------------------
        # TEST 10: Exam ends -> Monitoring disabled
        # Expected: Detection stops and no events are generated.
        # ----------------------------------------------------
        # Submit attempt
        sub_res = await ac.post(f"/api/v1/attempts/{attempt_id}/submit", headers=s_headers)
        assert sub_res.status_code == 200

        t10_res = await ac.post(
            "/api/v1/proctoring/continuous-verify",
            data={"exam_id": exam_id},
            files={"file": ("frame.jpg", face2_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert t10_res.status_code == 200
        t10_data = t10_res.json()
        assert t10_data["is_suspicious"] is False
        assert "inactive" in t10_data["message"].lower()

        # ----------------------------------------------------
        # TEST 11: Faculty Evidence Access & Review
        # ----------------------------------------------------
        events_list_res = await ac.get(f"/api/v1/proctoring/events/{exam_id}", headers=f_headers)
        assert events_list_res.status_code == 200
        ev_list = events_list_res.json()
        assert ev_list["total"] > 0
        assert any(e["event_type"] == "IDENTITY_MISMATCH" for e in ev_list["events"])
        assert any(e["event_type"] == "RECOVERED" for e in ev_list["events"])

        # Faculty fetches evidence file
        ev_file_res = await ac.get(f"/api/v1/proctoring/evidence/{mismatch_event_id}", headers=f_headers)
        assert ev_file_res.status_code == 200
        assert ev_file_res.headers["content-type"] == "image/jpeg"
        assert len(ev_file_res.content) > 0

        # Faculty reviews event: FALSE_POSITIVE
        review_res = await ac.patch(
            f"/api/v1/proctoring/events/{mismatch_event_id}/review",
            json={"review_status": "FALSE_POSITIVE", "review_comment": "Lighting change caused artifact"},
            headers=f_headers
        )
        assert review_res.status_code == 200
        assert review_res.json()["review_status"] == "FALSE_POSITIVE"
        assert review_res.json()["review_comment"] == "Lighting change caused artifact"
        assert review_res.json()["reviewed_by_name"] == "Prof Proctor"

        # ----------------------------------------------------
        # TEST 12: Security Access Control
        # Other student cannot access another student's evidence
        # ----------------------------------------------------
        other_email = f"other_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Other Student", "email": other_email, "password": "Password123!", "role": "STUDENT"
        })
        o_login = await ac.post("/api/v1/auth/login", json={"email": other_email, "password": "Password123!"})
        o_token = o_login.json()["access_token"]
        o_headers = {"Authorization": f"Bearer {o_token}"}

        forbidden_ev = await ac.get(f"/api/v1/proctoring/evidence/{mismatch_event_id}", headers=o_headers)
        assert forbidden_ev.status_code == 403
