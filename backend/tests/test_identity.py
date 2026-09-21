import os
import uuid
import pytest
import numpy as np
import cv2
from httpx import AsyncClient, ASGITransport
from app.main import app


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
def invalid_image_bytes():
    return b"not an image corrupted data"


@pytest.mark.asyncio
async def test_identity_unauthenticated(face1_bytes):
    """Unauthenticated users must be rejected with 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.post(
            "/api/v1/identity/verify",
            data={"exam_id": str(uuid.uuid4())},
            files={"file": ("photo.jpg", face1_bytes, "image/jpeg")}
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_identity_faculty_forbidden(face1_bytes):
    """Faculty users cannot perform student identity verification."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        email = f"prof_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof X", "email": email, "password": "Password123!", "role": "FACULTY"
        })
        login_res = await ac.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
        token = login_res.json()["access_token"]

        res = await ac.post(
            "/api/v1/identity/verify",
            data={"exam_id": str(uuid.uuid4())},
            files={"file": ("photo.jpg", face1_bytes, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_identity_end_to_end_verification(face1_bytes, face2_bytes, no_face_bytes, invalid_image_bytes):
    """
    Comprehensive End-to-End Test:
    1. Faculty creates and publishes exam with an MCQ question.
    2. Student registers (initially without profile photo).
    3. Verification fails because student has no profile photo.
    4. Student uploads registered profile photo (face1.jpg).
    5. Live photo with no face fails with user-friendly error.
    6. Corrupted image fails with 400.
    7. Live photo of a DIFFERENT person (face2.jpg) fails verification (verified=False).
    8. Attempting to save question answer while unverified fails with 403.
    9. Live photo of the MATCHING student (face1.jpg) succeeds (verified=True).
    10. After successful verification, student can now answer questions.
    11. Status endpoint returns verified=True with student name and roll number.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Faculty sets up published exam
        faculty_email = f"fac_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Prof Proctor", "email": faculty_email, "password": "Password123!", "role": "FACULTY"
        })
        f_login = await ac.post("/api/v1/auth/login", json={"email": faculty_email, "password": "Password123!"})
        f_token = f_login.json()["access_token"]
        f_headers = {"Authorization": f"Bearer {f_token}"}

        exam_res = await ac.post("/api/v1/exams", json={
            "title": "Algorithms Exam",
            "duration_minutes": 45,
            "availability_type": "ALWAYS"
        }, headers=f_headers)
        exam_id = exam_res.json()["id"]

        q_res = await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "What is the time complexity of QuickSort average case?",
            "options": ["O(N log N)", "O(N^2)", "O(1)", "O(N)"],
            "correct_answer": "O(N log N)",
            "marks": 5.0
        }, headers=f_headers)
        q_id = q_res.json()["id"]

        await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=f_headers)

        # 2. Student Registers
        student_email = f"stud_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Alice Wonder", "email": student_email, "password": "Password123!", "role": "STUDENT"
        })
        s_login = await ac.post("/api/v1/auth/login", json={"email": student_email, "password": "Password123!"})
        s_token = s_login.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}

        # 3. Missing profile photo check
        no_photo_res = await ac.post(
            "/api/v1/identity/verify",
            data={"exam_id": exam_id},
            files={"file": ("live.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert no_photo_res.status_code == 400
        assert "No profile photo is available" in no_photo_res.json()["detail"]

        # 4. Student uploads official profile photo (face1.jpg)
        upload_res = await ac.post(
            "/api/v1/students/me/photo",
            files={"file": ("profile.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert upload_res.status_code == 200
        uploaded_profile = upload_res.json()
        assert uploaded_profile["profile_picture_url"] is not None

        # Check GET /api/v1/students/me returns photo URL and student ID
        me_res = await ac.get("/api/v1/students/me", headers=s_headers)
        assert me_res.status_code == 200
        assert me_res.json()["student_id"] is not None
        assert me_res.json()["profile_picture_url"] == uploaded_profile["profile_picture_url"]

        # 5. Invalid / Corrupted image check
        corrupt_res = await ac.post(
            "/api/v1/identity/verify",
            data={"exam_id": exam_id},
            files={"file": ("live.jpg", invalid_image_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert corrupt_res.status_code == 400
        assert "Invalid or corrupted" in corrupt_res.json()["detail"]

        # 6. Live image with NO face detected
        no_face_res = await ac.post(
            "/api/v1/identity/verify",
            data={"exam_id": exam_id},
            files={"file": ("live.jpg", no_face_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert no_face_res.status_code == 400
        assert "No face detected" in no_face_res.json()["detail"]

        # 7. DIFFERENT PERSON (face2.jpg) -> Fails identity verification
        diff_res = await ac.post(
            "/api/v1/identity/verify",
            data={"exam_id": exam_id},
            files={"file": ("live.jpg", face2_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert diff_res.status_code == 200
        diff_data = diff_res.json()
        assert diff_data["verified"] is False
        assert diff_data["similarity"] < 0.363
        assert "could not be verified" in diff_data["message"]

        # 8. Gating Check: Student attempt is not verified, answering question must be blocked
        # Start or get attempt
        att_start = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=s_headers)
        attempt_id = att_start.json()["id"]
        assert att_start.json()["identity_verified"] is False

        # Attempt to save answer without identity verification
        blocked_save = await ac.post(
            f"/api/v1/attempts/{attempt_id}/answers",
            json={
                "question_id": q_id,
                "selected_option": "O(N log N)",
                "is_marked_for_review": False
            },
            headers=s_headers
        )
        assert blocked_save.status_code == 403
        assert "Identity verification required" in blocked_save.json()["detail"]

        # 9. MATCHING PERSON (face1.jpg) -> Verified
        match_res = await ac.post(
            "/api/v1/identity/verify",
            data={"exam_id": exam_id},
            files={"file": ("live.jpg", face1_bytes, "image/jpeg")},
            headers=s_headers
        )
        assert match_res.status_code == 200
        match_data = match_res.json()
        assert match_data["verified"] is True
        assert match_data["similarity"] >= 0.90
        assert match_data["attempt_id"] == attempt_id

        # 10. Now student can save answers successfully
        allowed_save = await ac.post(
            f"/api/v1/attempts/{attempt_id}/answers",
            json={
                "question_id": q_id,
                "selected_option": "O(N log N)",
                "is_marked_for_review": False
            },
            headers=s_headers
        )
        assert allowed_save.status_code == 200

        # 11. Check GET /api/v1/identity/status/{exam_id}
        status_res = await ac.get(f"/api/v1/identity/status/{exam_id}", headers=s_headers)
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["is_verified"] is True
        assert status_data["student_name"] == "Alice Wonder"
        assert status_data["similarity"] is not None
        assert status_data["profile_picture_url"] is not None
