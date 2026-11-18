import json
import time
from typing import Dict, Any, Optional
import jwt

from app.core.config import settings
from app.core.logging import logger


class LiveKitTokenService:
    """
    Generates authenticated LiveKit SFU access tokens with video grants
    for candidates (publishers with simulcast) and faculty proctors (subscribers with dynacast).
    """

    @classmethod
    def get_room_name(cls, exam_id: str) -> str:
        return f"exam_{exam_id}"

    @classmethod
    def create_token(
        cls,
        user_id: str,
        name: str,
        role: str,
        exam_id: str,
        attempt_id: Optional[str] = None,
        ttl_seconds: int = 14400,  # 4 hours default
    ) -> str:
        now = int(time.time())
        room_name = cls.get_room_name(exam_id)

        is_student = (role.upper() == "STUDENT")
        is_faculty = (role.upper() in ("FACULTY", "ADMIN"))

        identity = f"stu_{user_id}" if is_student else f"fac_{user_id}"

        # Video grant claims matching LiveKit specifications
        video_grant = {
            "room": room_name,
            "roomJoin": True,
            # Students publish video/audio/screen; Faculty only subscribe
            "canPublish": True if is_student else False,
            "canSubscribe": True,
            "canPublishData": True,
        }

        metadata = {
            "role": role.lower(),
            "user_id": user_id,
            "exam_id": exam_id,
            "attempt_id": attempt_id or "",
            "name": name,
        }

        claims = {
            "iss": settings.LIVEKIT_API_KEY,
            "sub": identity,
            "name": name,
            "nbf": now - 5,
            "exp": now + ttl_seconds,
            "video": video_grant,
            "metadata": json.dumps(metadata),
        }

        token = jwt.encode(
            claims,
            settings.LIVEKIT_API_SECRET,
            algorithm="HS256"
        )
        return token
