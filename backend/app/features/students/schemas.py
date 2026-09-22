from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from app.features.students.permission_models import PermissionStatus


ALLOWED_BATCHES = ["B1", "B2", "B3", "B4", "B5"]


def validate_batch_value(v: Optional[str]) -> Optional[str]:
    if v is not None and v != "":
        clean = v.strip().upper()
        if clean not in ALLOWED_BATCHES:
            raise ValueError(f"Invalid batch '{v}'. Allowed options: {', '.join(ALLOWED_BATCHES)}")
        return clean
    return None


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    student_id: str = Field(..., min_length=1, max_length=50)
    batch: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6)
    phone: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[int] = Field(None, ge=1, le=12)
    section: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None

    @field_validator("batch")
    @classmethod
    def check_batch(cls, v: Optional[str]) -> Optional[str]:
        return validate_batch_value(v)


class StudentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    batch: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[int] = Field(None, ge=1, le=12)
    section: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    profile_picture_url: Optional[str] = None

    @field_validator("batch")
    @classmethod
    def check_batch(cls, v: Optional[str]) -> Optional[str]:
        return validate_batch_value(v)


class StudentSelfUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    batch: Optional[str] = None
    phone: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[int] = Field(None, ge=1, le=12)
    section: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    profile_picture_url: Optional[str] = None

    @field_validator("batch")
    @classmethod
    def check_batch(cls, v: Optional[str]) -> Optional[str]:
        return validate_batch_value(v)


class StudentStatusPatch(BaseModel):
    is_active: bool


class StudentResponse(BaseModel):
    id: str  # StudentProfile ID
    user_id: str
    name: str
    email: EmailStr
    is_active: bool
    student_id: str
    batch: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[int] = None
    section: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    profile_picture_url: Optional[str] = None
    profile_completed: bool = False
    active_permission: Optional["PermissionResponse"] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PermissionGrantRequest(BaseModel):
    allowed_fields: List[str] = Field(..., min_length=1, description="List of profile fields allowed to edit")
    expires_hours: Optional[int] = Field(None, ge=1, le=720, description="Optional expiry in hours")
    notes: Optional[str] = None

    @field_validator("allowed_fields")
    @classmethod
    def check_fields(cls, v: List[str]) -> List[str]:
        valid_fields = {"name", "batch", "phone", "course", "semester", "section", "date_of_birth", "gender", "address", "profile_picture_url"}
        lowered = [f.strip().lower() for f in v if f.strip()]
        for f in lowered:
            if f not in valid_fields:
                raise ValueError(f"Field '{f}' cannot be granted for edit. Valid fields: {', '.join(sorted(valid_fields))}")
        return lowered


class PermissionResponse(BaseModel):
    id: str
    student_profile_id: str
    granted_by_id: str
    granted_by_name: str
    allowed_fields: List[str]
    status: PermissionStatus
    granted_at: datetime
    expires_at: Optional[datetime] = None
    used_at: Optional[datetime] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StudentImportRow(BaseModel):
    row_number: int
    name: str
    email: str
    student_id: str
    batch: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[int] = None
    section: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    is_valid: bool = True
    errors: List[str] = []


class StudentImportPreviewResponse(BaseModel):
    total_rows: int
    valid_count: int
    invalid_count: int
    rows: List[StudentImportRow]
