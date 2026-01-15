import re
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..models import User
from ..s3 import ensure_bucket, presign_put, presign_get
from ..schemas import (
    FileCreate, FileOut, InitiateUploadRequest, InitiateUploadResponse,
    CompleteUploadRequest, FileMetadataOut, PresignDownloadResponse,
)
from . import _audit

router = APIRouter(prefix="/files", tags=["files"])


def safe_name(name: str) -> str:
    name = (name or "").strip()
    name = re.sub(r"[^\w\-. ]+", "_", name, flags=re.UNICODE)
    return name[:180] if name else "file"


@router.get("/{file_id}/presign-download", response_model=PresignDownloadResponse)
async def presign_download_get(
    file_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await presign_download(file_id, db, user)


@router.get("/{file_id}/preview")
async def preview_file(
    file_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = await db.execute(text("""
        SELECT f.name, f.mime, v.object_key
        FROM files f
        JOIN file_versions v ON v.id = f.current_version_id
        WHERE f.id = :fid
    """), {"fid": str(file_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "File has no version yet")

    mime = (row.get("mime") or "").strip().lower()
    if not (mime.startswith("image/") or mime == "application/pdf"):
        raise HTTPException(415, "Preview not supported for this file type")

    url = presign_get(row["object_key"], expires_sec=900)
    return RedirectResponse(url, status_code=302)


@router.get("/{file_id}/download")
async def download_file(
    file_id: UUID,
    inline: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = await db.execute(text("""
        SELECT v.object_key
        FROM files f
        JOIN file_versions v ON v.id = f.current_version_id
        WHERE f.id = :fid
    """), {"fid": str(file_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "File has no version yet")

    url = presign_get(row["object_key"], expires_sec=900)
    return RedirectResponse(url, status_code=302)
