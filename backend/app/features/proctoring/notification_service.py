import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.features.proctoring.models import Notification


class NotificationService:
    """
    Centralized Notification Service for student and faculty examination lifecycle events.
    Enforces deduplication to prevent repeated alerts during API retries or rejoins.
    """

    @classmethod
    async def create_notification(
        cls,
        db: AsyncSession,
        user_id: str,
        notif_type: str,
        title: str,
        message: str,
        exam_id: Optional[str] = None,
        exam_attempt_id: Optional[str] = None,
        deduplicate_seconds: float = 60.0
    ) -> Notification:
        """
        Creates an in-app notification if an identical notification was not sent within deduplicate_seconds.
        """
        now = datetime.now(timezone.utc)

        # Check for recent duplicate
        if deduplicate_seconds > 0:
            recent_cutoff = datetime.fromtimestamp(now.timestamp() - deduplicate_seconds, tz=timezone.utc)
            query = select(Notification).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.type == notif_type,
                    Notification.created_at >= recent_cutoff
                )
            )
            if exam_attempt_id:
                query = query.where(Notification.exam_attempt_id == exam_attempt_id)
            elif exam_id:
                query = query.where(Notification.exam_id == exam_id)

            existing = (await db.execute(query)).scalars().first()
            if existing:
                return existing

        notif = Notification(
            id=str(uuid.uuid4()),
            user_id=user_id,
            exam_id=exam_id,
            exam_attempt_id=exam_attempt_id,
            type=notif_type,
            title=title,
            message=message,
            is_read=False,
            created_at=now
        )
        db.add(notif)
        try:
            await db.commit()
            await db.refresh(notif)
        except Exception as e:
            logger.debug(f"Notification creation commit: {e}")
        return notif

    @classmethod
    async def get_user_notifications(
        cls,
        db: AsyncSession,
        user_id: str,
        limit: int = 50,
        unread_only: bool = False
    ) -> List[Notification]:
        query = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            query = query.where(Notification.is_read == False)
        query = query.order_by(Notification.created_at.desc()).limit(limit)
        res = await db.execute(query)
        return res.scalars().all()

    @classmethod
    async def mark_as_read(
        cls,
        db: AsyncSession,
        notification_id: str,
        user_id: str
    ) -> bool:
        res = await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id
            )
        )
        notif = res.scalar_one_or_none()
        if notif:
            notif.is_read = True
            await db.commit()
            return True
        return False
