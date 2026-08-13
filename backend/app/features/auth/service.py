from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.core.redis import RedisSessionService
from app.features.users.models import User, UserRole
from app.features.users.service import UserService
from app.features.students.service import StudentService
from app.features.auth.schemas import RegisterRequest, LoginRequest, TokenResponse, UserResponse


class AuthService:
    @staticmethod
    async def register(db: AsyncSession, req: RegisterRequest) -> UserResponse:
        existing_user = await UserService.get_by_email(db, req.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address is already registered"
            )

        user = await UserService.create_user(
            db=db,
            name=req.name,
            email=req.email,
            password=req.password,
            role=req.role
        )

        # Auto-create student profile if role is STUDENT
        if user.role == UserRole.STUDENT:
            await StudentService.ensure_student_profile(db, user)

        return UserResponse.model_validate(user)

    @staticmethod
    async def login(db: AsyncSession, req: LoginRequest) -> TokenResponse:
        user = await UserService.get_by_email(db, req.email)
        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )

        access_token = create_access_token(user_id=user.id, role=user.role.value)
        refresh_token, jti, expire_seconds = create_refresh_token(user_id=user.id)

        # Store in Redis session
        await RedisSessionService.store_refresh_token(
            user_id=user.id,
            jti=jti,
            expire_seconds=expire_seconds
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user=UserResponse.model_validate(user)
        )

    @staticmethod
    async def refresh_tokens(db: AsyncSession, refresh_token_str: str) -> TokenResponse:
        payload = decode_token(refresh_token_str)

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token type"
            )

        user_id = payload.get("sub")
        jti = payload.get("jti")

        if not user_id or not jti:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed refresh token"
            )

        # Verify in Redis (Token rotation & reuse detection)
        is_valid = await RedisSessionService.is_refresh_token_valid(user_id=user_id, jti=jti)
        if not is_valid:
            # Possible token reuse attack detected! Revoke all tokens for this user
            await RedisSessionService.revoke_all_user_tokens(user_id=user_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token invalidated or reused. Please log in again."
            )

        user = await UserService.get_by_id(db, user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )

        # Revoke old refresh token JTI
        await RedisSessionService.revoke_refresh_token(user_id=user_id, jti=jti)

        # Issue new token pair (Rotation)
        new_access_token = create_access_token(user_id=user.id, role=user.role.value)
        new_refresh_token, new_jti, expire_seconds = create_refresh_token(user_id=user.id)

        await RedisSessionService.store_refresh_token(
            user_id=user.id,
            jti=new_jti,
            expire_seconds=expire_seconds
        )

        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            user=UserResponse.model_validate(user)
        )

    @staticmethod
    async def logout(refresh_token_str: str) -> None:
        try:
            payload = decode_token(refresh_token_str)
            user_id = payload.get("sub")
            jti = payload.get("jti")
            if user_id and jti:
                await RedisSessionService.revoke_refresh_token(user_id=user_id, jti=jti)
        except Exception:
            # Ignore invalid token during logout
            pass
