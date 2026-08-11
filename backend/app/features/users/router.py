from fastapi import APIRouter, Depends
from app.features.users.models import User
from app.features.users.schemas import UserResponse
from app.features.auth.dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
