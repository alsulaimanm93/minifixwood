from __future__ import annotations

import hashlib
import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from uuid import UUID

from ..core.config import settings
from ..db import get_db
from ..models import Project, User
from ..schemas import ProjectCreate, ProjectOut
from ..deps import get_current_user
from ..s3 import ensure_bucket, s3_internal_client
from . import _audit

router = APIRouter(prefix="/projects", tags=["projects"])


def safe_name(name: str) -> str:
    name = name.strip().replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^a-zA-Z0-9._ -]+", "_", name)
    return name[:200] if len(name) > 200 else name


def _guess_mime(filename: str) -> str:
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    # mimetypes is often missing office types on Linux containers
    override = {
        "pdf": "application/pdf",
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls": "application/vnd.ms-excel",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
    }
    if ext in override:
        return override[ext]

    mt, _ = mimetypes.guess_type(filename)
    return mt or "application/octet-stream"


def _template_root() -> Path:
    # app/routers/projects.py -> app/
    return Path(__file__).resolve().parents[1] / "templates" / "project_default"


def _kind_from_top_folder(top: str) -> str | None:
    t = (top or "").strip().lower()

    # common naming styles + your exact folder name from the template zip
    if t in {"commercial", "invoices", "invoice", "contracts", "contract", "invoices & contracts", "invoices & contract", "invoices and contracts"}:
        return "commercial"

    if t in {"technical", "tech"}:
        return "technical"

    if t in {"cnc", "cam", "toolpath"}:
        return "cnc"

    if t in {"images", "image", "photos", "photo"}:
        return "images"

    if t in {"materials", "material", "bom"}:
        return "materials"

    # fallback: if people rename folder but it still contains keywords
    if "invoice" in t or "contract" in t or "quotation" in t or "quote" in t:
        return "commercial"

    return None


async def seed_project_templates(project_id: UUID, db: AsyncSession, user: User) -> dict:
    root = _template_root()
    if not root.exists():
        return {"created": 0, "skipped": 0, "reason": f"template folder not found: {root}"}

    ensure_bucket()
    s3 = s3_internal_client()

    created = 0
    skipped = 0

    try:
        for p in sorted(root.rglob("*")):
            if not p.is_file():
                continue

            rel = p.relative_to(root)
            # ignore hidden / keep files
            if rel.name.startswith(".") or rel.name.lower() in {".keep", "thumbs.db", ".ds_store"}:
                continue

            top = rel.parts[0] if rel.parts else ""
            kind = _kind_from_top_folder(top)
            if not kind:
                # if someone drops a file directly under root, ignore it
                continue

            display_name = safe_name(rel.name)

            # idempotent: skip if same name+kind already exists in this project
            exists = await db.execute(text("""
                SELECT id
                FROM files
                WHERE project_id = :pid AND kind = :kind AND name = :name
                LIMIT 1
            """), {"pid": str(project_id), "kind": kind, "name": display_name})

            if exists.mappings().one_or_none():
                skipped += 1
                continue

            data = p.read_bytes()
            size_bytes = len(data)
            sha256 = hashlib.sha256(data).hexdigest()
            mime = _guess_mime(display_name)

            # create file row
            f_ins = await db.execute(text("""
                INSERT INTO files (project_id, kind, name, mime, size_bytes, created_by, created_at, updated_at)
                VALUES (:project_id, :kind, :name, :mime, :size_bytes, :created_by, now(), now())
                RETURNING id
            """), {
                "project_id": str(project_id),
                "kind": kind,
                "name": display_name,
                "mime": mime,
                "size_bytes": size_bytes,
                "created_by": str(user.id),
            })
            fid = f_ins.mappings().one()["id"]

            # upload to S3
            upid = uuid.uuid4().hex
            object_key = f"files/{fid}/seed/{upid}/{safe_name(display_name)}"
            s3.put_object(
                Bucket=settings.s3_bucket,
                Key=object_key,
                Body=data,
                ContentType=mime,
            )

            # create version 1
            v_ins = await db.execute(text("""
                INSERT INTO file_versions (file_id, version_no, object_key, etag, sha256, size_bytes, created_by, created_at)
                VALUES (:file_id, 1, :object_key, NULL, :sha256, :size_bytes, :created_by, now())
                RETURNING id
            """), {
                "file_id": str(fid),
                "object_key": object_key,
                "sha256": sha256,
                "size_bytes": size_bytes,
                "created_by": str(user.id),
            })
            ver_id = v_ins.mappings().one()["id"]

            await db.execute(text("""
                UPDATE files
                SET current_version_id = :ver_id,
                    size_bytes = :size_bytes,
                    updated_at = now()
                WHERE id = :fid
            """), {"ver_id": str(ver_id), "size_bytes": size_bytes, "fid": str(fid)})

            created += 1

        await db.commit()
        return {"created": created, "skipped": skipped}
    except Exception:
        await db.rollback()
        raise


@router.get("", response_model=list[ProjectOut])
async def list_projects(status: str = "current", db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(select(Project).where(Project.status == status).order_by(Project.updated_at.desc()))
    rows = q.scalars().all()
    return [ProjectOut(
        id=p.id, project_no=p.project_no, name=p.name, status=p.status, priority=p.priority, updated_at=p.updated_at
    ) for p in rows]


@router.get("/all", response_model=list[ProjectOut])
async def list_projects_all(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(select(Project).order_by(Project.updated_at.desc()))
    rows = q.scalars().all()
    return [ProjectOut(
        id=p.id, project_no=p.project_no, name=p.name, status=p.status, priority=p.priority, updated_at=p.updated_at
    ) for p in rows]


@router.post("", response_model=ProjectOut)
async def create_project(req: ProjectCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # Use raw SQL to keep it simple and explicit (timestamps handled in SQL).
    result = await db.execute(text("""
        INSERT INTO projects (project_no, name, status, priority, created_by, created_at, updated_at)
        VALUES (:project_no, :name, :status, :priority, :created_by, now(), now())
        RETURNING id, project_no, name, status, priority, updated_at
    """), {
        "project_no": req.project_no,
        "name": req.name,
        "status": req.status,
        "priority": req.priority,
        "created_by": str(user.id),
    })
    row = result.mappings().one()
    await db.commit()
    pid = row["id"]

    seed_result: dict | None = None
    if getattr(req, "seed_templates", True):
        try:
            seed_result = await seed_project_templates(pid, db, user)
        except Exception as e:
            await db.rollback()
            # keep project creation working even if templates fail
            seed_result = {"created": 0, "skipped": 0, "error": str(e)}

    await _audit.write(db, user.id, "project.create", "project", pid, meta={"name": req.name, "status": req.status, "seed": seed_result})
    return ProjectOut(**row)


@router.post("/{project_id}/seed-templates")
async def seed_templates(project_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # Optional helper for when you change the template folder later.
    # Safe to run multiple times (it skips name+kind duplicates).
    q = await db.execute(text("SELECT id FROM projects WHERE id=:id"), {"id": str(project_id)})
    if not q.mappings().one_or_none():
        raise HTTPException(404, "Project not found")

    res = await seed_project_templates(project_id, db, user)
    await _audit.write(db, user.id, "project.seed_templates", "project", project_id, meta=res)
    return {"ok": True, **res}


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: UUID, req: ProjectCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(text("""
        UPDATE projects
        SET project_no=:project_no, name=:name, status=:status, priority=:priority, updated_at=now()
        WHERE id=:id
        RETURNING id, project_no, name, status, priority, updated_at
    """), {
        "id": str(project_id),
        "project_no": req.project_no,
        "name": req.name,
        "status": req.status,
        "priority": req.priority,
    })
    row = result.mappings().one()
    await db.commit()
    await _audit.write(db, user.id, "project.update", "project", project_id, meta={"name": req.name, "status": req.status})
    return ProjectOut(**row)
