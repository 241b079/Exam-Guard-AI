import pytest
from app.features.users.models import UserRole
from app.core.security import hash_password, verify_password, create_access_token, decode_token


def test_password_hashing():
    raw_pass = "SecurePass123!"
    hashed = hash_password(raw_pass)
    assert hashed != raw_pass
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPass", hashed) is False


def test_jwt_token_flow():
    user_id = "test-user-uuid"
    role = UserRole.STUDENT.value

    token = create_access_token(user_id=user_id, role=role)
    decoded = decode_token(token)

    assert decoded["sub"] == user_id
    assert decoded["role"] == role
    assert decoded["type"] == "access"
