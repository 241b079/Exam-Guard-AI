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

    @staticmethod
    async def list_users(
        db: AsyncSession,
        search: Optional[str] = None,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> list[User]:
        query = select(User).order_by(User.created_at.desc())
        if role is not None:
            query = query.where(User.role == role)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        if search:
            term = f"%{search.lower()}%"
            query = query.where(User.name.ilike(term) | User.email.ilike(term))
        query = query.limit(limit).offset(offset)
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def update_role(db: AsyncSession, user_id: str, new_role: UserRole) -> User:
        user = await UserService.get_by_id(db, user_id)
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user.role = new_role
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def update_status(db: AsyncSession, user_id: str, is_active: bool) -> User:
        user = await UserService.get_by_id(db, user_id)
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user.is_active = is_active
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def update_user(
        db: AsyncSession,
        user_id: str,
        name: Optional[str] = None,
        email: Optional[str] = None,
        password: Optional[str] = None,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None
    ) -> User:
        user = await UserService.get_by_id(db, user_id)
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if email and email.lower() != user.email.lower():
            existing = await UserService.get_by_email(db, email)
            if existing and existing.id != user_id:
                from fastapi import HTTPException, status
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already in use")
            user.email = email.lower()

        if name is not None:
            user.name = name
        if password:
            user.password_hash = hash_password(password)
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active

        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def delete_user(db: AsyncSession, user_id: str) -> None:
        user = await UserService.get_by_id(db, user_id)
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        await db.delete(user)
        await db.commit()
