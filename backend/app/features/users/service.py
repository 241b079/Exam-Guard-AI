from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.users.models import User, UserRole
from app.core.security import hash_password


class UserService:
    @staticmethod
    async def get_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()

    @staticmethod
    async def create_user(
        db: AsyncSession,
        name: str,
        email: str,
        password: str,
        role: UserRole = UserRole.STUDENT
    ) -> User:
        user = User(
            name=name,
            email=email.lower(),
            password_hash=hash_password(password),
            role=role,
            is_active=True
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user
