from typing import List, Union, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_ENV: str = "development"
    SECRET_KEY: str = Field(..., min_length=16, description="JWT Secret key")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    DATABASE_URL: str = Field(..., description="PostgreSQL async connection string")
    REDIS_URL: str = Field(..., description="Redis connection string")
    
    CORS_ORIGINS: Union[str, List[str]] = "http://localhost:3000"
    CORS_ORIGIN_REGEX: Optional[str] = r"^https?://.*\.ngrok(-free)?\.(app|dev)$"
    
    # Face verification & continuous monitoring settings
    FACE_VERIFICATION_THRESHOLD: float = 0.363
    UPLOAD_DIR: str = "uploads"
    EVIDENCE_DIR: str = "proctoring-evidence"
    IDENTITY_MISMATCH_CONFIRM_SECONDS: float = 3.0
    ABSENCE_GRACE_SECONDS: float = 5.0
    MULTIPLE_PERSON_CONFIRM_SECONDS: float = 2.0
    INCIDENT_COOLDOWN_SECONDS: float = 30.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                return json.loads(v)
            return [i.strip() for i in v.split(",") if i.strip()]
        return v


settings = Settings()
