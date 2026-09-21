from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class VerificationResponse(BaseModel):
    verified: bool
    message: str
    similarity: float
    attempt_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class VerificationStatusResponse(BaseModel):
    exam_id: str
    is_verified: bool
    verified_at: Optional[datetime] = None
    similarity: Optional[float] = None
    student_name: str
    student_id: str
    profile_picture_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
