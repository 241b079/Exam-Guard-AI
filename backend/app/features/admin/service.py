import json
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import text, select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis_client
from app.core.logging import logger
from app.features.users.models import User, UserRole
from app.features.exams.models import Exam, ExamStatus
from app.features.attempts.models import ExamAttempt, AttemptStatus, ExamViolation, ViolationType
from app.features.proctoring.models import ProctoringEvent, EventReviewStatus
from app.features.proctoring.signaling import signaling_manager
from app.features.admin.schemas import (
    AdminTelemetryResponse,
    UsersTelemetry,
    ExamsTelemetry,
    AttemptsTelemetry,
    ViolationsTelemetry,
    ProctoringTelemetry,
    SystemHealthTelemetry,
    ConnectionsTelemetry,
    RecentActivityItem,
    AdminSettingsResponse,
    AdminSettingsUpdate,
)

# In-memory settings fallback cache
_system_settings: Dict[str, Any] = {
    "face_match_threshold": settings.FACE_VERIFICATION_THRESHOLD,
    "multiple_person_grace_sec": 3.0,
    "looking_away_threshold_sec": 3.0,
    "object_detection_enabled": True,
    "audio_anomaly_detection_enabled": True,
    "strict_lockdown_enabled": True,
    "max_rejoins_allowed": 3,
    "system_announcement": "",
}


class AdminService:
    @classmethod
    async def get_settings(cls) -> AdminSettingsResponse:
        try:
            client = await get_redis_client()
            raw = await client.get("admin:system_settings")
            if raw:
                data = json.loads(raw)
                return AdminSettingsResponse(**data)
        except Exception as e:
            logger.debug(f"Redis get_settings fallback to memory: {e}")

        return AdminSettingsResponse(**_system_settings)

    @classmethod
    async def update_settings(cls, updates: AdminSettingsUpdate) -> AdminSettingsResponse:
        current = await cls.get_settings()
        current_dict = current.model_dump()

        update_dict = updates.model_dump(exclude_unset=True)
        for k, v in update_dict.items():
            if v is not None:
                current_dict[k] = v
                _system_settings[k] = v

        try:
            client = await get_redis_client()
            await client.set("admin:system_settings", json.dumps(current_dict))
        except Exception as e:
            logger.warning(f"Failed to persist settings to Redis: {e}")

        return AdminSettingsResponse(**current_dict)

    @classmethod
    async def get_telemetry(cls, db: AsyncSession) -> AdminTelemetryResponse:
        # 1. Measure PostgreSQL latency & health
        pg_status = "healthy"
        pg_latency = 0.0
        try:
            t0 = time.perf_counter()
            await db.execute(text("SELECT 1"))
            pg_latency = round((time.perf_counter() - t0) * 1000, 2)
        except Exception as e:
            pg_status = f"unhealthy ({str(e)})"

        # 2. Redis status
        redis_status = "healthy"
        try:
            client = await get_redis_client()
            await client.ping()
        except Exception:
            redis_status = "fallback (in-memory)"

        # 3. Users breakdown
        users_tel = UsersTelemetry()
        try:
            res = await db.execute(
                select(User.role, User.is_active, func.count(User.id)).group_by(User.role, User.is_active)
            )
            for role, is_active, count in res.fetchall():
                users_tel.total += count
                if is_active:
                    users_tel.active += count
                else:
                    users_tel.inactive += count

                if role == UserRole.STUDENT:
                    users_tel.students += count
                elif role == UserRole.FACULTY:
                    users_tel.faculty += count
                elif role == UserRole.ADMIN:
                    users_tel.admins += count
        except Exception as e:
            logger.warning(f"Error querying users telemetry: {e}")

        # 4. Exams breakdown
        exams_tel = ExamsTelemetry()
        try:
            res = await db.execute(select(Exam.status, func.count(Exam.id)).group_by(Exam.status))
            for status, count in res.fetchall():
                exams_tel.total += count
                if status == ExamStatus.DRAFT:
                    exams_tel.draft += count
                elif status == ExamStatus.PUBLISHED:
                    exams_tel.published += count
                elif status == ExamStatus.CLOSED:
                    exams_tel.closed += count
        except Exception as e:
            logger.warning(f"Error querying exams telemetry: {e}")

        # 5. Attempts breakdown
        attempts_tel = AttemptsTelemetry()
        try:
            res = await db.execute(select(ExamAttempt.status, func.count(ExamAttempt.id)).group_by(ExamAttempt.status))
            for status, count in res.fetchall():
                attempts_tel.total += count
                if status == AttemptStatus.IN_PROGRESS:
                    attempts_tel.in_progress += count
                elif status == AttemptStatus.SUBMITTED:
                    attempts_tel.submitted += count
                elif status == AttemptStatus.GRADED:
                    attempts_tel.graded += count
        except Exception as e:
            logger.warning(f"Error querying attempts telemetry: {e}")

        # 6. Violations breakdown
        violations_tel = ViolationsTelemetry()
        try:
            res = await db.execute(
                select(ExamViolation.violation_type, func.count(ExamViolation.id)).group_by(ExamViolation.violation_type)
            )
            for v_type, count in res.fetchall():
                violations_tel.total += count
                violations_tel.by_type[str(v_type.value if hasattr(v_type, 'value') else v_type)] = count
        except Exception as e:
            logger.warning(f"Error querying violations telemetry: {e}")

        # 7. Proctoring Events breakdown
        proctoring_tel = ProctoringTelemetry()
        try:
            res = await db.execute(
                select(ProctoringEvent.review_status, func.count(ProctoringEvent.id)).group_by(ProctoringEvent.review_status)
            )
            for status, count in res.fetchall():
                proctoring_tel.total_events += count
                status_str = status.value if hasattr(status, 'value') else str(status)
                if status_str == "PENDING":
                    proctoring_tel.pending_review += count
                elif status_str == "CONFIRMED":
                    proctoring_tel.confirmed += count
                elif status_str == "DISMISSED":
                    proctoring_tel.dismissed += count
                elif status_str == "FALSE_POSITIVE":
                    proctoring_tel.false_positives += count
        except Exception as e:
            logger.warning(f"Error querying proctoring telemetry: {e}")

        # 8. Real-time active connections
        active_sessions = 0
        try:
            for exam_id, peers in signaling_manager.active_connections.items():
                active_sessions += len(peers)
        except Exception:
            pass

        # 9. Recent Activity feed (latest 10 entries across exams, attempts, violations)
        activity: List[RecentActivityItem] = []
        try:
            # Recent violations
            v_res = await db.execute(
                select(ExamViolation).order_by(desc(ExamViolation.detected_at)).limit(5)
            )
            for v in v_res.scalars().all():
                v_type = v.violation_type.value if hasattr(v.violation_type, 'value') else str(v.violation_type)
                activity.append(
                    RecentActivityItem(
                        id=f"v_{v.id}",
                        type="VIOLATION_DETECTED",
                        description=f"Incident recorded: {v_type}",
                        timestamp=v.detected_at.isoformat() if v.detected_at else datetime.now(timezone.utc).isoformat()
                    )
                )

            # Recent exams
            e_res = await db.execute(
                select(Exam).order_by(desc(Exam.created_at)).limit(5)
            )
            for ex in e_res.scalars().all():
                activity.append(
                    RecentActivityItem(
                        id=f"e_{ex.id}",
                        type="EXAM_CREATED",
                        description=f"Exam '{ex.title}' ({ex.status.value})",
                        timestamp=ex.created_at.isoformat() if ex.created_at else datetime.now(timezone.utc).isoformat()
                    )
                )

            # Sort combined activity desc by timestamp
            activity.sort(key=lambda x: x.timestamp, reverse=True)
            activity = activity[:10]
        except Exception as e:
            logger.warning(f"Error querying recent activity: {e}")

        return AdminTelemetryResponse(
            users=users_tel,
            exams=exams_tel,
            attempts=attempts_tel,
            violations=violations_tel,
            proctoring=proctoring_tel,
            connections=ConnectionsTelemetry(active_candidate_sessions=active_sessions),
            system_health=SystemHealthTelemetry(
                postgres=pg_status,
                postgres_latency_ms=pg_latency,
                redis=redis_status,
                server_time=datetime.now(timezone.utc).isoformat(),
                app_env=settings.APP_ENV
            ),
            recent_activity=activity
        )
