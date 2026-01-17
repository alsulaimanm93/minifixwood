
import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID
from fastapi.responses import StreamingResponse
from ..core.config import settings

from ..db import get_db
from ..models import User
from ..schemas import (
    FileCreate, FileRenameRequest, FileOut, InitiateUploadRequest, InitiateUploadResponse,
    CompleteUploadRequest, FileMetadataOut, PresignDownloadResponse, FileVersionOut,
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


async def _ensure_not_locked(file_id: UUID, db: AsyncSession, user: User):
    now = datetime.now(timezone.utc)
    q = await db.execute(text("""
        SELECT id, locked_by, expires_at
        FROM locks
        WHERE file_id = :fid AND active = true
        ORDER BY locked_at DESC
        LIMIT 1
    """), {"fid": str(file_id)})
    row = q.mappings().one_or_none()
    if not row:
        return

    # auto-expire stale locks
    if row.get("expires_at") and row["expires_at"] <= now:
        await db.execute(text("UPDATE locks SET active=false WHERE id=:id"), {"id": str(row["id"])})
        return

    if str(row["locked_by"]) != str(user.id):
        raise HTTPException(409, detail={"message": "Locked", "locked_by": row["locked_by"], "expires_at": row.get("expires_at")})


@router.patch("/{file_id}", response_model=FileOut)
async def rename_file(file_id: UUID, req: FileRenameRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # block rename if locked by someone else
    await _ensure_not_locked(file_id, db, user)

    q = await db.execute(text("""
        SELECT id, project_id, kind, name, mime, size_bytes, current_version_id
        FROM files
        WHERE id = :fid
    """), {"fid": str(file_id)})
    cur = q.mappings().one_or_none()
    if not cur:
        raise HTTPException(404, "File not found")

    # keep original extension (renaming should not change file type)
    old_name = (cur.get("name") or "").strip()
    old_ext = ""
    if "." in old_name:
        i = old_name.rfind(".")
        if 0 < i < len(old_name) - 1:
            old_ext = old_name[i:]  # includes dot

    new_name = safe_name(req.name or "")
    if not new_name:
        raise HTTPException(422, "Invalid name")

    if old_ext:
        # If user supplied an extension, ignore it (and keep the original).
        base = new_name
        low = base.lower()
        old_low = old_ext.lower()
        common_exts = {
            "pdf","doc","docx","xls","xlsx","csv","png","jpg","jpeg","gif","webp","dxf","nc","tap","gcode","txt","zip","rar","7z"
        }

        if low.endswith(old_low):
            base = base[:-len(old_ext)]
        else:
            m = re.match(r"^(.*)\.([A-Za-z0-9]{1,8})$", base)
            if m and (m.group(2) or "").lower() in common_exts:
                base = m.group(1)

        base = base.rstrip(" .").strip()
        new_name = f"{base}{old_ext}" if base else ""

        if not new_name:
            raise HTTPException(422, "Invalid name")

    result = await db.execute(text("""
        UPDATE files
        SET name = :name, updated_at = now()
        WHERE id = :fid
        RETURNING id, project_id, kind, name, mime, size_bytes, current_version_id
    """), {"fid": str(file_id), "name": new_name})
    row = result.mappings().one()
    await db.commit()
    await _audit.write(db, user.id, "file.rename", "file", file_id, meta={"old_name": cur.get("name"), "new_name": new_name})
    return FileOut(**row)


@router.delete("/{file_id}")
async def delete_file(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # block delete if locked by someone else
    await _ensure_not_locked(file_id, db, user)

    q = await db.execute(text("SELECT id, name FROM files WHERE id = :fid"), {"fid": str(file_id)})
    f = q.mappings().one_or_none()
    if not f:
        raise HTTPException(404, "File not found")

    qk = await db.execute(text("SELECT object_key FROM file_versions WHERE file_id = :fid"), {"fid": str(file_id)})
    keys = [r["object_key"] for r in qk.mappings().all() if r.get("object_key")]

    await db.execute(text("DELETE FROM files WHERE id = :fid"), {"fid": str(file_id)})
    await db.commit()
    await _audit.write(db, user.id, "file.delete", "file", file_id, meta={"name": f.get("name")})

    # best-effort object cleanup (DB delete already committed)
    try:
        from ..s3 import s3_internal_client
        c = s3_internal_client()
        for k in keys:
            try:
                c.delete_object(Bucket=settings.s3_bucket, Key=k)
            except Exception:
                pass
    except Exception:
        pass

    return {"ok": True}


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
@router.get("/{file_id}/versions", response_model=list[FileVersionOut])
async def list_versions(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT id, version_no, size_bytes, created_at, created_by
        FROM file_versions
        WHERE file_id = :fid
        ORDER BY version_no DESC
    """), {"fid": str(file_id)})
    rows = result.mappings().all()
    return [FileVersionOut(**r) for r in rows]


@router.post("/{file_id}/versions/{version_id}/presign-download", response_model=PresignDownloadResponse)
async def presign_download_version(file_id: UUID, version_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT f.name, f.mime, v.object_key
        FROM files f
        JOIN file_versions v ON v.id = :vid AND v.file_id = f.id
        WHERE f.id = :fid
    """), {"fid": str(file_id), "vid": str(version_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "Version not found")

    filename = safe_name(row["name"] or "file")
    mime = row.get("mime")

    url = presign_get(
        row["object_key"],
        response_content_type=mime,
        response_content_disposition=f'inline; filename="{filename}"',
    )
    return PresignDownloadResponse(url=url)

@router.post("/{file_id}/presign-download", response_model=PresignDownloadResponse)
async def presign_download(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT f.name, f.mime, v.object_key
        FROM files f
        JOIN file_versions v ON v.id = f.current_version_id
        WHERE f.id = :fid
    """), {"fid": str(file_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "File has no version yet")

    filename = safe_name(row["name"] or "file")
    mime = row.get("mime")

    url = presign_get(
        row["object_key"],
        response_content_type=mime,
        response_content_disposition=f'inline; filename="{filename}"',
    )
    return PresignDownloadResponse(url=url)


@router.get("/{file_id}/download")
async def download_file(file_id: UUID, inline: int = 0, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
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
    return RedirectResponse(url, status_code=302)

@router.get("/{file_id}/versions/{version_id}/download")
async def download_version(file_id: UUID, version_id: UUID, inline: int = 0, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT f.name, f.mime, v.object_key
        FROM files f
        JOIN file_versions v ON v.id = :vid AND v.file_id = f.id
        WHERE f.id = :fid
    """), {"fid": str(file_id), "vid": str(version_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "Version not found")

    filename = safe_name(row["name"] or "file")
    mime = row.get("mime")
    disp = f'inline; filename="{filename}"' if inline else f'attachment; filename="{filename}"'

    url = presign_get(
        row["object_key"],
        response_content_type=mime,
        response_content_disposition=disp,
    )
    return RedirectResponse(url, status_code=302)

@router.get("/{file_id}/preview")
async def preview_file(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
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
    return RedirectResponse(url, status_code=302)
@router.get("/{file_id}/pdf")
async def pdf_inline(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT f.name, v.object_key
        FROM files f
        JOIN file_versions v ON v.id = f.current_version_id
        WHERE f.id = :fid
    """), {"fid": str(file_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "File has no version yet")

    # fetch from MinIO using INTERNAL client (server-side)
    from ..s3 import s3_internal_client
    c = s3_internal_client()
    obj = c.get_object(Bucket=settings.s3_bucket, Key=row["object_key"])

    filename = safe_name(row["name"] or "file.pdf")
    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return StreamingResponse(obj["Body"].iter_chunks(), media_type="application/pdf", headers=headers)
@router.get("/{file_id}/versions")
async def list_versions(file_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT id, version_no, object_key, size_bytes, created_at, created_by
        FROM file_versions
        WHERE file_id = :fid
        ORDER BY version_no DESC
    """), {"fid": str(file_id)})
    return result.mappings().all()
@router.post("/{file_id}/versions/{version_id}/presign-download", response_model=PresignDownloadResponse)
async def presign_download_version(file_id: UUID, version_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT f.name, f.mime, v.object_key
        FROM files f
        JOIN file_versions v ON v.id = :vid AND v.file_id = f.id
        WHERE f.id = :fid
    """), {"fid": str(file_id), "vid": str(version_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "Version not found")

    filename = safe_name(row["name"] or "file")
    mime = row.get("mime")

    url = presign_get(
        row["object_key"],
        response_content_type=mime,
        response_content_disposition=f'inline; filename="{filename}"',
    )
    return PresignDownloadResponse(url=url)

