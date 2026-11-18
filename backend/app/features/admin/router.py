from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import get_current_user, require_roles
from app.features.users.models import User, UserRole
from app.features.admin.schemas import (
    AdminTelemetryResponse,
    AdminSettingsResponse,
    AdminSettingsUpdate,
)
from app.features.admin.service import AdminService

router = APIRouter(prefix="/admin", tags=["Admin Portal"])


@router.get(
    "/telemetry",
    response_model=AdminTelemetryResponse,
    summary="Get system-wide admin telemetry and live health"
)
async def get_system_telemetry(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN]))
):
    return await AdminService.get_telemetry(db)


@router.get(
    "/settings",
    response_model=AdminSettingsResponse,
    summary="Get dynamic platform proctoring & lockdown configurations"
)
async def get_system_settings(
    current_user: User = Depends(require_roles([UserRole.ADMIN]))
):
    return await AdminService.get_settings()


@router.patch(
    "/settings",
    response_model=AdminSettingsResponse,
    summary="Update dynamic platform proctoring & lockdown configurations"
)
async def update_system_settings(
    updates: AdminSettingsUpdate,
    current_user: User = Depends(require_roles([UserRole.ADMIN]))
):
    return await AdminService.update_settings(updates)
