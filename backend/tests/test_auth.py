import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_auth_full_flow():
    unique_email = f"student_{uuid.uuid4().hex[:8]}@example.com"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register User
        reg_payload = {
            "name": "Test Student",
            "email": unique_email,
            "password": "Password123!",
            "role": "STUDENT"
        }
        reg_res = await ac.post("/api/v1/auth/register", json=reg_payload)
        assert reg_res.status_code == 201
        user_data = reg_res.json()
        assert user_data["email"] == unique_email
        assert user_data["role"] == "STUDENT"

        # 2. Login User
        login_payload = {
            "email": unique_email,
            "password": "Password123!"
        }
        login_res = await ac.post("/api/v1/auth/login", json=login_payload)
        assert login_res.status_code == 200
        token_data = login_res.json()
        assert "access_token" in token_data
        assert "refresh_token" in token_data

        access_token = token_data["access_token"]
        refresh_token = token_data["refresh_token"]

        # 3. Get /me Profile
        headers = {"Authorization": f"Bearer {access_token}"}
        me_res = await ac.get("/api/v1/auth/me", headers=headers)
        assert me_res.status_code == 200
        assert me_res.json()["email"] == unique_email

        # 4. Refresh Token
        ref_res = await ac.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert ref_res.status_code == 200
        new_token_data = ref_res.json()
        assert "access_token" in new_token_data
        assert "refresh_token" in new_token_data

        # 5. Logout User
        logout_res = await ac.post("/api/v1/auth/logout", json={"refresh_token": new_token_data["refresh_token"]})
        assert logout_res.status_code == 200
        assert logout_res.json()["message"] == "Successfully logged out"
