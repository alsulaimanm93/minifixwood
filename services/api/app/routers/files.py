
import re
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID
from ..db import get_db
from ..models import User
from ..schemas import (
    FileCreate, FileOut, InitiateUploadRequest, InitiateUploadResponse,
    CompleteUploadRequest, FileMetadataOut, PresignDownloadResponse,
)
from ..deps import get_current_user
from ..s3 import ensure_bucket, presign_put, presign_get
from . import _audit

router = APIRouter(prefix="/files", tags=["files"])
@router.get("", response_model=list[FileOut])
async def list_files(
    project_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if project_id is None:
        result = await db.execute(text("""
            SELECT id, project_id, kind, name, mime, size_bytes, current_version_id
            FROM files
            ORDER BY updated_at DESC
        """))
    else:
        result = await db.execute(text("""
            SELECT id, project_id, kind, name, mime, size_bytes, current_version_id
            FROM files
            WHERE project_id = :pid
            ORDER BY updated_at DESC
        """), {"pid": str(project_id)})

    rows = result.mappings().all()
    return [FileOut(**r) for r in rows]
@router.get("/{file_id}", response_model=FileOut)
async def get_file(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT id, project_id, kind, name, mime, size_bytes, current_version_id
        FROM files
        WHERE id = :fid
    """), {"fid": str(file_id)})
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "File not found")
    return FileOut(**row)


def safe_name(name: str) -> str:
    name = name.strip().replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^a-zA-Z0-9._ -]+", "_", name)
    return name[:200] if len(name) > 200 else name

@router.post("", response_model=FileOut)
async def create_file(req: FileCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(text("""
        INSERT INTO files (project_id, kind, name, mime, size_bytes, created_by, created_at, updated_at)
        VALUES (:project_id, :kind, :name, :mime, :size_bytes, :created_by, now(), now())
        RETURNING id, project_id, kind, name, mime, size_bytes, current_version_id
    """), {
        "project_id": str(req.project_id) if req.project_id else None,
        "kind": req.kind,
        "name": req.name,
        "mime": req.mime,
        "size_bytes": req.size_bytes,
        "created_by": str(user.id),
    })
    row = result.mappings().one()
    await db.commit()
    fid = row["id"]
    await _audit.write(db, user.id, "file.create", "file", fid, meta={"kind": req.kind, "name": req.name})
    return FileOut(**row)

@router.get("/{file_id}/metadata", response_model=FileMetadataOut)
async def file_metadata(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT f.id as file_id, f.current_version_id,
               v.version_no, v.etag, v.last_modified, v.s3_version_id, v.size_bytes
        FROM files f
        LEFT JOIN file_versions v ON v.id = f.current_version_id
        WHERE f.id = :fid
    """), {"fid": str(file_id)})
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "File not found")
    return FileMetadataOut(**row)

@router.post("/{file_id}/versions/initiate-upload", response_model=InitiateUploadResponse)
async def initiate_upload(file_id: UUID, req: InitiateUploadRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # Ensure bucket exists (dev)
    ensure_bucket()

    # Use an upload UUID in the object key so we don't need DB-side pending rows.
    upid = uuid.uuid4().hex
    filename = safe_name(req.filename)
    object_key = f"files/{file_id}/{upid}/{filename}"

    url, headers = presign_put(object_key, req.mime)
    await _audit.write(db, user.id, "file.upload.initiate", "file", file_id, meta={"object_key": object_key, "size": req.size_bytes})
    return InitiateUploadResponse(object_key=object_key, url=url, headers=headers)

@router.post("/{file_id}/versions/complete-upload", response_model=FileMetadataOut)
async def complete_upload(file_id: UUID, req: CompleteUploadRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # Determine next version_no
    q = await db.execute(text("""
        SELECT COALESCE(MAX(version_no), 0) AS maxv
        FROM file_versions
        WHERE file_id = :fid
    """), {"fid": str(file_id)})
    maxv = int(q.mappings().one()["maxv"])
    version_no = maxv + 1

    # Insert new version
    result = await db.execute(text("""
        INSERT INTO file_versions (file_id, version_no, object_key, etag, sha256, size_bytes, created_by, created_at)
        VALUES (:file_id, :version_no, :object_key, :etag, :sha256, :size_bytes, :created_by, now())
        RETURNING id
    """), {
        "file_id": str(file_id),
        "version_no": version_no,
        "object_key": req.object_key,
        "etag": req.etag,
        "sha256": req.sha256,
        "size_bytes": req.size_bytes,
        "created_by": str(user.id),
    })
    ver_id = result.mappings().one()["id"]

    # Update file current version + size
    await db.execute(text("""
        UPDATE files
        SET current_version_id = :ver_id,
            size_bytes = :size_bytes,
            updated_at = now()
        WHERE id = :fid
    """), {"ver_id": ver_id, "size_bytes": req.size_bytes, "fid": str(file_id)})

    await db.commit()
    await _audit.write(db, user.id, "file.upload.complete", "file_version", ver_id, meta={"file_id": str(file_id), "version_no": version_no})

    # Return updated metadata
    return await file_metadata(file_id, db, user)

@router.post("/{file_id}/presign-download", response_model=PresignDownloadResponse)
async def presign_download(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # Find current version object key
    q = await db.execute(text("""
        SELECT v.object_key
        FROM files f
        JOIN file_versions v ON v.id = f.current_version_id
        WHERE f.id = :fid
    """), {"fid": str(file_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "File has no version yet")
    url = presign_get(row["object_key"])
    return PresignDownloadResponse(url=url)

