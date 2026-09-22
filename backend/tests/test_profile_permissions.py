import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_student_profile_and_permission_workflow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register and login student user
        st_email = f"student_{uuid.uuid4().hex[:8]}@univ.edu"
        st_reg = await ac.post("/api/v1/auth/register", json={
            "name": "Jane Student",
            "email": st_email,
            "password": "Password123!",
            "role": "STUDENT"
        })
        assert st_reg.status_code == 201
        st_login = await ac.post("/api/v1/auth/login", json={
            "email": st_email,
            "password": "Password123!"
        })
        assert st_login.status_code == 200
        st_token = st_login.json()["access_token"]
        st_headers = {"Authorization": f"Bearer {st_token}"}

        # 2. Register and login faculty user
        fac_email = f"faculty_{uuid.uuid4().hex[:8]}@univ.edu"
        fac_reg = await ac.post("/api/v1/auth/register", json={
            "name": "Dr. Smith",
            "email": fac_email,
            "password": "Password123!",
            "role": "FACULTY"
        })
        assert fac_reg.status_code == 201
        fac_login = await ac.post("/api/v1/auth/login", json={
            "email": fac_email,
            "password": "Password123!"
        })
        assert fac_login.status_code == 200
        fac_token = fac_login.json()["access_token"]
        fac_headers = {"Authorization": f"Bearer {fac_token}"}

        # 3. Check student profile initially incomplete
        me_res = await ac.get("/api/v1/students/me", headers=st_headers)
        assert me_res.status_code == 200
        st_profile = me_res.json()
        assert st_profile["profile_completed"] is False
        assert st_profile["batch"] is None

        # 4. First-time profile completion (Student sets Batch B2, course, phone)
        comp_res = await ac.put("/api/v1/students/me/profile", json={
            "name": "Jane Doe",
            "batch": "B2",
            "course": "Computer Science",
            "semester": 4,
            "phone": "9876543210"
        }, headers=st_headers)
        assert comp_res.status_code == 200
        comp_data = comp_res.json()
        assert comp_data["name"] == "Jane Doe"
        assert comp_data["batch"] == "B2"
        assert comp_data["phone"] == "9876543210"
        assert comp_data["profile_completed"] is True
        st_profile_id = comp_data["id"]

        # 5. Invalid batch validation check
        invalid_batch_res = await ac.put("/api/v1/students/me/profile", json={
            "batch": "B99"
        }, headers=st_headers)
        assert invalid_batch_res.status_code == 422

        # 6. Attempt to edit without permission -> Should be 403 Forbidden (Locked)
        locked_edit_res = await ac.put("/api/v1/students/me/profile", json={
            "phone": "9999999999"
        }, headers=st_headers)
        assert locked_edit_res.status_code == 403
        assert "locked" in locked_edit_res.json()["detail"].lower()

        # 7. Student attempts to grant permission to self -> Should be 403 Forbidden
        self_grant_res = await ac.post(f"/api/v1/students/{st_profile_id}/permissions", json={
            "allowed_fields": ["phone"],
            "notes": "Self grant attempt"
        }, headers=st_headers)
        assert self_grant_res.status_code == 403

        # 8. Faculty views batch summaries
        batch_summary_res = await ac.get("/api/v1/faculty/batches", headers=fac_headers)
        assert batch_summary_res.status_code == 200
        batches = batch_summary_res.json()
        b2_summary = next(b for b in batches if b["batch"] == "B2")
        assert b2_summary["student_count"] >= 1
        assert b2_summary["completed_count"] >= 1

        # 9. Faculty views students in batch B2
        b2_students_res = await ac.get("/api/v1/faculty/batches/B2/students", headers=fac_headers)
        assert b2_students_res.status_code == 200
        b2_students = b2_students_res.json()
        assert any(s["id"] == st_profile_id for s in b2_students)

        # 10. Faculty grants field-level permission ONLY for ["phone"]
        grant_res = await ac.post(f"/api/v1/students/{st_profile_id}/permissions", json={
            "allowed_fields": ["phone"],
            "expires_hours": 12,
            "notes": "Allowed to update phone number"
        }, headers=fac_headers)
        assert grant_res.status_code == 201
        perm_data = grant_res.json()
        assert perm_data["status"] == "ACTIVE"
        assert perm_data["allowed_fields"] == ["phone"]
        assert perm_data["granted_by_name"] == "Dr. Smith"

        # 11. Student tries to edit unpermitted field (e.g. batch) -> Should be 403 Forbidden
        unpermitted_edit_res = await ac.put("/api/v1/students/me/profile", json={
            "batch": "B3"
        }, headers=st_headers)
        assert unpermitted_edit_res.status_code == 403
        assert "not in your faculty-approved edit permission" in unpermitted_edit_res.json()["detail"]

        # 12. Student edits permitted field ["phone"] -> Should succeed
        permitted_edit_res = await ac.put("/api/v1/students/me/profile", json={
            "phone": "9123456780"
        }, headers=st_headers)
        assert permitted_edit_res.status_code == 200
        assert permitted_edit_res.json()["phone"] == "9123456780"

        # 13. Check that permission is now consumed (USED) and profile is re-locked
        after_used_edit_res = await ac.put("/api/v1/students/me/profile", json={
            "phone": "9999999999"
        }, headers=st_headers)
        assert after_used_edit_res.status_code == 403
        assert "locked" in after_used_edit_res.json()["detail"].lower()

        # 14. Check permission history
        perm_history_res = await ac.get(f"/api/v1/students/{st_profile_id}/permissions", headers=fac_headers)
        assert perm_history_res.status_code == 200
        perms = perm_history_res.json()
        assert len(perms) >= 1
        assert perms[0]["status"] == "USED"

        # 15. Faculty Profile workflow
        fac_prof_res = await ac.get("/api/v1/faculty/me", headers=fac_headers)
        assert fac_prof_res.status_code == 200
        fac_prof = fac_prof_res.json()
        assert fac_prof["name"] == "Dr. Smith"

        fac_update_res = await ac.put("/api/v1/faculty/me", json={
            "department": "Computer Science & Engineering",
            "designation": "Associate Professor",
            "phone": "9876500000",
            "assigned_batches": ["B1", "B2"]
        }, headers=fac_headers)
        assert fac_update_res.status_code == 200
        updated_fac = fac_update_res.json()
        assert updated_fac["department"] == "Computer Science & Engineering"
        assert updated_fac["designation"] == "Associate Professor"
        assert updated_fac["assigned_batches"] == ["B1", "B2"]
