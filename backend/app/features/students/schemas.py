from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    student_id: str = Field(..., min_length=1, max_length=50)
    password: Optional[str] = Field(None, min_length=6)
    phone: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[int] = Field(None, ge=1, le=12)
    section: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None


class StudentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[int] = Field(None, ge=1, le=12)
    section: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None


class StudentStatusPatch(BaseModel):
    is_active: bool


class StudentResponse(BaseModel):
    id: str  # StudentProfile ID
    user_id: str
    name: str
    email: EmailStr
    is_active: bool
    student_id: str
    phone: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    semester: Optional[int] = None
    section: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StudentImportRow(BaseModel):
    row_number: int
    name: str
    email: str
    student_id: str
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
