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
    must_change_password: bool = False

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




class ProjectThumbnailUpdate(BaseModel):
    # file_id must be a file that belongs to the same project (or null to clear)
    file_id: Optional[UUID] = None


class ProjectOut(BaseModel):
    id: UUID
    project_no: Optional[int]
    name: str
    status: str
    priority: int
    created_at: datetime
    updated_at: datetime

    # Thumbnail (points to existing file)
    thumbnail_file_id: Optional[UUID] = None

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

# Inventory (high-end, lot-based)
class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class SupplierOut(BaseModel):
    id: UUID
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class ItemCreate(BaseModel):
    sku: str
    name: str
    category: Optional[str] = None
    type: str  # sheet | fitting | appliance | consumable
    uom: str = "pcs"
    default_supplier_id: Optional[UUID] = None
    min_stock: Optional[float] = None

class ItemUpdate(BaseModel):
    sku: str
    name: str
    category: Optional[str] = None
    type: str
    uom: str = "pcs"
    default_supplier_id: Optional[UUID] = None
    min_stock: Optional[float] = None
    is_active: bool = True

class ItemOut(BaseModel):
    id: UUID
    sku: str
    name: str
    category: Optional[str] = None
    type: str
    uom: str
    default_supplier_id: Optional[UUID] = None
    min_stock: Optional[float] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

class StockLotReceive(BaseModel):
    item_id: UUID
    qty: float
    location: Optional[str] = None
    unit_cost: Optional[float] = None
    ref: Optional[str] = None

class StockLotOut(BaseModel):
    id: UUID
    item_id: UUID
    location: Optional[str] = None
    qty_on_hand: float
    qty_reserved: float
    unit_cost: Optional[float] = None
    source: str
    ref: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
class StockLotView(BaseModel):
    id: UUID
    item_id: UUID
    sku: str
    name: str
    type: str
    uom: str
    location: Optional[str] = None
    qty_on_hand: float
    qty_reserved: float
    unit_cost: Optional[float] = None
    source: str
    ref: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class SheetLotCreate(BaseModel):
    material_item_id: UUID
    thickness_mm: Optional[int] = None
    w_mm: int
    h_mm: int
    qty: int = 1
    usable: bool = True
    location: Optional[str] = None
    tag_code: Optional[str] = None
    project_origin_id: Optional[UUID] = None
    source: str = "purchase"  # purchase | remnant | adjustment
    unit_cost: Optional[float] = None

class SheetLotOut(BaseModel):
    id: UUID
    material_item_id: UUID
    thickness_mm: Optional[int] = None
    w_mm: int
    h_mm: int
    qty: int
    usable: bool
    location: Optional[str] = None
    tag_code: Optional[str] = None
    project_origin_id: Optional[UUID] = None
    reserved_for_project_id: Optional[UUID] = None
    source: str
    unit_cost: Optional[float] = None
    created_at: datetime
    updated_at: datetime
class SheetLotView(BaseModel):
    id: UUID
    material_item_id: UUID
    material_sku: str
    material_name: str
    thickness_mm: Optional[int] = None
    w_mm: int
    h_mm: int
    qty: int
    usable: bool
    location: Optional[str] = None
    tag_code: Optional[str] = None
    project_origin_id: Optional[UUID] = None
    reserved_for_project_id: Optional[UUID] = None
    source: str
    unit_cost: Optional[float] = None
    created_at: datetime
    updated_at: datetime

class SheetReserveReq(BaseModel):
    project_id: UUID

class ProjectRequirementUpsert(BaseModel):
    item_id: UUID
    qty_required: float
    notes: Optional[str] = None
    source: str = "manual"

class ProjectRequirementOut(BaseModel):
    id: UUID
    project_id: UUID
    item_id: UUID
    qty_required: float
    notes: Optional[str] = None
    source: str
    updated_at: datetime

class ProjectAvailabilityRow(BaseModel):
    item_id: UUID
    sku: str
    name: str
    type: str
    uom: str
    qty_required: float
    qty_on_hand: float
    qty_reserved_total: float
    qty_available_net: float
    qty_to_buy: float

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
