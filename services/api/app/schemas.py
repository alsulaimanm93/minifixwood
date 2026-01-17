from pydantic import BaseModel, Field
from typing import Optional, Any, Dict, List
from uuid import UUID
from datetime import datetime, date

# Auth
class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class MeResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: str

# Projects
class ProjectCreate(BaseModel):
    name: str
    status: str = "current"
    priority: int = 0
    project_no: Optional[int] = None
    seed_templates: bool = True


class ProjectUpdate(BaseModel):
    # All optional; missing fields are not modified.
    project_no: Optional[int] = None
    name: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None

    payment_date: Optional[date] = None
    max_days_to_finish: Optional[int] = None

    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None

    inventory_state: Optional[dict] = None
    missing_items: Optional[str] = None
    inventory_notes: Optional[str] = None




class ProjectOut(BaseModel):
    id: UUID
    project_no: Optional[int]
    name: str
    status: str
    priority: int
    updated_at: datetime

    # Payments / delivery
    eta_date: Optional[date] = None
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    payment_date: Optional[date] = None
    max_days_to_finish: Optional[int] = None

    # Inventory
    inventory_state: Dict[str, Any] = Field(default_factory=dict)
    missing_items: Optional[str] = None
    inventory_notes: Optional[str] = None

    # Payments / delivery
    eta_date: Optional[date] = None
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    payment_date: Optional[date] = None
    max_days_to_finish: Optional[int] = None

    # Inventory (lightweight now)
    inventory_state: Dict[str, Any] = Field(default_factory=dict)
    missing_items: Optional[str] = None
    inventory_notes: Optional[str] = None

# Files
class FileCreate(BaseModel):
    project_id: Optional[UUID] = None
    kind: str
    name: str
    mime: Optional[str] = None
    size_bytes: int = 0

class FileRenameRequest(BaseModel):
    name: str

class FileOut(BaseModel):
    id: UUID
    project_id: Optional[UUID]
    kind: str
    name: str
    mime: Optional[str]
    size_bytes: int
    current_version_id: Optional[UUID]

class InitiateUploadRequest(BaseModel):
    mime: Optional[str] = None
    size_bytes: int
    filename: str

class InitiateUploadResponse(BaseModel):
    upload_type: str = "single"
    object_key: str
    url: str
    headers: Dict[str, str] = Field(default_factory=dict)

class CompleteUploadRequest(BaseModel):
    object_key: str
    size_bytes: int
    etag: Optional[str] = None
    sha256: Optional[str] = None

class FileMetadataOut(BaseModel):
    file_id: UUID
    current_version_id: Optional[UUID]
    version_no: Optional[int]
    etag: Optional[str]
    last_modified: Optional[datetime]
    s3_version_id: Optional[str]
    size_bytes: Optional[int]

class PresignDownloadResponse(BaseModel):
    url: str

class FileVersionOut(BaseModel):
    id: UUID
    version_no: int
    size_bytes: int | None = None
    created_at: datetime | None = None
    created_by: UUID | None = None


# Locks
class LockAcquireRequest(BaseModel):
    file_id: UUID
    client_id: str

class LockOut(BaseModel):
    id: UUID
    file_id: UUID
    locked_by: UUID
    expires_at: datetime
    active: bool

class LockReleaseRequest(BaseModel):
    lock_id: UUID

# Jobs
class JobCreate(BaseModel):
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)

class JobOut(BaseModel):
    id: UUID
    type: str
    status: str
    progress_pct: int
    stage: Optional[str]
    result: Dict[str, Any]
    error: Optional[str]
    updated_at: datetime
