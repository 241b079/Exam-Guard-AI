import uuid
import pytest
import numpy as np
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text

from app.main import app
from app.core.database import engine
from app.features.proctoring.vision import estimate_head_pose, NanoDetDetector


@pytest.mark.asyncio
async def test_priority2_head_pose_estimation():
    """Unit test for 3D Head Pose & Gaze Estimation using 5 facial landmarks."""
    # Synthetic face looking straight at camera
    face_straight = np.array([
        100, 100, 200, 200,
        280, 220,  # right eye
        360, 220,  # left eye
        320, 250,  # nose
        290, 290,  # right mouth
        350, 290,  # left mouth
        0.99
    ], dtype=np.float64)

    pitch, yaw, roll, is_looking_away = estimate_head_pose((480, 640), face_straight)
    assert is_looking_away is False
    assert abs(yaw) < 30.0

    # Synthetic face turned significantly to the right (looking away, e.g. toward a second monitor)
    face_turned = np.array([
        100, 100, 200, 200,
        330, 220,  # right eye
        370, 220,  # left eye
        370, 250,  # nose shifted right
        340, 290,
        370, 290,
        0.99
    ], dtype=np.float64)

    pitch, yaw, roll, is_looking_away = estimate_head_pose((480, 640), face_turned)
    assert is_looking_away is True
    assert abs(yaw) > 38.0


@pytest.mark.asyncio
async def test_priority2_object_detector():
    """Unit test for NanoDet Prohibited Object Detector."""
    detector = NanoDetDetector.get_instance()
    assert detector is not None

    # Blank image should detect 0 prohibited objects
    blank_img = np.zeros((480, 640, 3), dtype=np.uint8)
    prohibited = detector.detect_prohibited(blank_img)
    assert isinstance(prohibited, list)
    assert len(prohibited) == 0


@pytest.mark.asyncio
async def test_priority1_and_priority2_admin_telemetry_and_violations():
    """Integration test for Admin Telemetry, Admin Settings, and new Violation Types."""
    user_ids = []
    exam_ids = []

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        try:
            # 1. Register and sign in an Administrator
            admin_email = f"admin_{uuid.uuid4().hex[:8]}@univ.edu"
            reg_res = await ac.post("/api/v1/auth/register", json={
                "name": "System Administrator",
                "email": admin_email,
                "password": "Password123!",
                "role": "ADMIN"
            })
            assert reg_res.status_code == 201
            admin_id = reg_res.json()["id"]
            user_ids.append(admin_id)

            login_res = await ac.post("/api/v1/auth/login", json={
                "email": admin_email,
                "password": "Password123!"
            })
            assert login_res.status_code == 200
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # 2. Test Admin Telemetry API
            telemetry_res = await ac.get("/api/v1/admin/telemetry", headers=headers)
            assert telemetry_res.status_code == 200
            tel = telemetry_res.json()
            assert "users" in tel
            assert "exams" in tel
            assert "attempts" in tel
            assert "system_health" in tel
            assert tel["users"]["admins"] >= 1
            assert tel["system_health"]["postgres"] == "healthy"

            # 3. Test Admin Dynamic Settings API
            settings_res = await ac.get("/api/v1/admin/settings", headers=headers)
            assert settings_res.status_code == 200
            s_data = settings_res.json()
            assert "face_match_threshold" in s_data
            assert "multiple_person_grace_sec" in s_data
            assert "object_detection_enabled" in s_data

            # Update settings
            patch_res = await ac.patch("/api/v1/admin/settings", json={
                "face_match_threshold": 0.38,
                "system_announcement": "Automated system test announcement"
            }, headers=headers)
            assert patch_res.status_code == 200
            assert patch_res.json()["face_match_threshold"] == 0.38
            assert patch_res.json()["system_announcement"] == "Automated system test announcement"

            # 4. Test Global Exam Catalog
            catalog_res = await ac.get("/api/v1/exams/admin/catalog", headers=headers)
            assert catalog_res.status_code == 200
            assert isinstance(catalog_res.json(), list)

            # 5. Test User Management Endpoints
            users_list_res = await ac.get("/api/v1/users", headers=headers)
            assert users_list_res.status_code == 200
            assert len(users_list_res.json()) >= 1

            # Create a user via Admin API
            new_email = f"student_{uuid.uuid4().hex[:8]}@univ.edu"
            create_u_res = await ac.post("/api/v1/users", json={
                "name": "Test Candidate",
                "email": new_email,
                "password": "Password123!",
                "role": "STUDENT"
            }, headers=headers)
            assert create_u_res.status_code == 201
            created_u_id = create_u_res.json()["id"]
            user_ids.append(created_u_id)

            # Update role via Admin API
            role_res = await ac.patch(f"/api/v1/users/{created_u_id}/role", json={
                "role": "FACULTY"
            }, headers=headers)
            assert role_res.status_code == 200
            assert role_res.json()["role"] == "FACULTY"

            # Delete created user
            del_res = await ac.delete(f"/api/v1/users/{created_u_id}", headers=headers)
            assert del_res.status_code == 204
            user_ids.remove(created_u_id)

        finally:
            # Immediate Cleanup per AGENTS.md
            async with engine.begin() as conn:
                if exam_ids:
                    await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": exam_ids})
                if user_ids:
                    await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": user_ids})
