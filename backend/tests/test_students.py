import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_student_management_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register Faculty User
        faculty_email = f"faculty_{uuid.uuid4().hex[:8]}@univ.edu"
        faculty_reg = await ac.post("/api/v1/auth/register", json={
            "name": "Prof. Alan",
            "email": faculty_email,
            "password": "Password123!",
            "role": "FACULTY"
        })
        assert faculty_reg.status_code == 201

        faculty_login = await ac.post("/api/v1/auth/login", json={
            "email": faculty_email,
            "password": "Password123!"
        })
        assert faculty_login.status_code == 200
        faculty_token = faculty_login.json()["access_token"]
        faculty_headers = {"Authorization": f"Bearer {faculty_token}"}

        # 2. Faculty Adds Student Manually
        st_email = f"student_{uuid.uuid4().hex[:8]}@univ.edu"
        st_roll = f"CS_{uuid.uuid4().hex[:6]}"
        add_st_res = await ac.post("/api/v1/students", json={
            "name": "Rahul Kumar",
            "email": st_email,
            "student_id": st_roll,
            "phone": "9876543210",
            "department": "CSE",
            "course": "B.Tech",
            "semester": 4,
            "section": "A"
        }, headers=faculty_headers)
        assert add_st_res.status_code == 201
        st_data = add_st_res.json()
        st_profile_id = st_data["id"]
        assert st_data["name"] == "Rahul Kumar"
        assert st_data["student_id"] == st_roll
        assert st_data["is_active"] is True

        # 3. Duplicate Email / Duplicate Student ID Check
        dup_res = await ac.post("/api/v1/students", json={
            "name": "Duplicate Student",
            "email": st_email,
            "student_id": "CS_NEW_99",
        }, headers=faculty_headers)
        assert dup_res.status_code == 400

        dup_id_res = await ac.post("/api/v1/students", json={
            "name": "Duplicate ID",
            "email": f"unique_{uuid.uuid4().hex[:6]}@univ.edu",
            "student_id": st_roll,
        }, headers=faculty_headers)
        assert dup_id_res.status_code == 400

        # 4. Search & Filter Students List
        list_res = await ac.get("/api/v1/students?search=Rahul&department=CSE", headers=faculty_headers)
        assert list_res.status_code == 200
        students_list = list_res.json()
        assert len(students_list) >= 1
        assert any(s["id"] == st_profile_id for s in students_list)

        # 5. Patch Student Status (Deactivate & Activate)
        deact_res = await ac.patch(f"/api/v1/students/{st_profile_id}/status", json={
            "is_active": False
        }, headers=faculty_headers)
        assert deact_res.status_code == 200
        assert deact_res.json()["is_active"] is False

        act_res = await ac.patch(f"/api/v1/students/{st_profile_id}/status", json={
            "is_active": True
        }, headers=faculty_headers)
        assert act_res.status_code == 200
        assert act_res.json()["is_active"] is True

        # 6. Test CSV Bulk Import Preview & Commit
        csv_content = (
            "name,email,student_id,department,semester\n"
            f"Amit Singh,amit_{uuid.uuid4().hex[:6]}@univ.edu,ROLL_{uuid.uuid4().hex[:6]},CSE,4\n"
            f"Priya Sharma,priya_{uuid.uuid4().hex[:6]}@univ.edu,ROLL_{uuid.uuid4().hex[:6]},ECE,2\n"
            "Invalid Row,,NO_EMAIL,ME,1\n"  # Invalid missing email
        )
        files = {"file": ("students.csv", csv_content.encode("utf-8"), "text/csv")}
        preview_res = await ac.post("/api/v1/students/import/preview", files=files, headers=faculty_headers)
        assert preview_res.status_code == 200
        prev_data = preview_res.json()
        assert prev_data["total_rows"] == 3
        assert prev_data["valid_count"] == 2
        assert prev_data["invalid_count"] == 1

        # Commit Valid Rows
        valid_rows = [r for r in prev_data["rows"] if r["is_valid"]]
        commit_res = await ac.post("/api/v1/students/import", json=valid_rows, headers=faculty_headers)
        assert commit_res.status_code == 200
        assert len(commit_res.json()) == 2

        # 7. Student User Access Prohibition (403 Forbidden)
        student_email = f"st_auth_{uuid.uuid4().hex[:8]}@univ.edu"
        await ac.post("/api/v1/auth/register", json={
            "name": "Blocked Student",
            "email": student_email,
            "password": "Password123!",
            "role": "STUDENT"
        })
        st_login = await ac.post("/api/v1/auth/login", json={
            "email": student_email,
            "password": "Password123!"
        })
        student_token = st_login.json()["access_token"]
        student_headers = {"Authorization": f"Bearer {student_token}"}

        st_forbidden = await ac.get("/api/v1/students", headers=student_headers)
        assert st_forbidden.status_code == 403
