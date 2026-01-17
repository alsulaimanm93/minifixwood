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
from datetime import date, timedelta

from ..schemas import ProjectCreate, ProjectUpdate, ProjectOut
from ..deps import get_current_user
from ..s3 import ensure_bucket, s3_internal_client
from . import _audit

router = APIRouter(prefix="/projects", tags=["projects"])

def _calc_eta_skip_fridays(payment_date: date | None, max_days_to_finish: int | None) -> date | None:
    """Compute ETA by adding working days, skipping Fridays only."""
    if not payment_date or not max_days_to_finish or max_days_to_finish <= 0:
        return None

    d = payment_date
    remaining = max_days_to_finish
    while remaining > 0:
        d = d + timedelta(days=1)
        # Monday=0 ... Friday=4
        if d.weekday() == 4:
            continue
        remaining -= 1
    return d

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

def _calc_eta_skip_fridays(payment_date: date | None, max_days_to_finish: int | None) -> date | None:
    if not payment_date or not max_days_to_finish or max_days_to_finish <= 0:
        return None
    d = payment_date
    remaining = max_days_to_finish
    while remaining > 0:
        d = d + timedelta(days=1)
        if d.weekday() == 4:  # Friday
            continue
        remaining -= 1
    return d


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
    # Always create new projects under_preparation (ignore any client-sent status).
    forced_status = "under_preparation"

    # Use raw SQL to keep it simple and explicit (timestamps handled in SQL).
    result = await db.execute(text("""
        INSERT INTO projects (project_no, name, status, priority, created_by, created_at, updated_at)
        VALUES (:project_no, :name, :status, :priority, :created_by, now(), now())
        RETURNING
          id, project_no, name, status, priority, updated_at,
          payment_date, max_days_to_finish, eta_date,
          total_amount, paid_amount,
          inventory_state, missing_items, inventory_notes
    """), {
        "project_no": req.project_no,
        "name": req.name,
        "status": forced_status,
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
async def update_project(project_id: UUID, req: ProjectUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # load current row first so we can do "partial updates" safely
    cur_res = await db.execute(text("""
        SELECT
          id, project_no, name, status, priority, updated_at,
          payment_date, max_days_to_finish, eta_date,
          total_amount, paid_amount,
          inventory_state, missing_items, inventory_notes
        FROM projects
        WHERE id=:id
    """), {"id": str(project_id)})
    cur = cur_res.mappings().one()

    # choose next values (keep old when req field is None)
    next_project_no = cur["project_no"] if req.project_no is None else req.project_no
    next_name = cur["name"] if req.name is None else req.name
    next_status = cur["status"] if req.status is None else req.status
    next_priority = cur["priority"] if req.priority is None else req.priority

    next_payment_date = cur["payment_date"] if req.payment_date is None else req.payment_date
    next_max_days = cur["max_days_to_finish"] if req.max_days_to_finish is None else req.max_days_to_finish

    next_total = cur["total_amount"] if req.total_amount is None else req.total_amount
    next_paid = cur["paid_amount"] if req.paid_amount is None else req.paid_amount

    next_inventory_state = cur["inventory_state"] if req.inventory_state is None else req.inventory_state
    next_missing_items = cur["missing_items"] if req.missing_items is None else req.missing_items
    next_inventory_notes = cur["inventory_notes"] if req.inventory_notes is None else req.inventory_notes

    # compute ETA (skip Fridays only)
    eta = _calc_eta_skip_fridays(next_payment_date, next_max_days)

    result = await db.execute(text("""
        UPDATE projects
        SET
          project_no=:project_no,
          name=:name,
          status=:status,
          priority=:priority,

          payment_date=:payment_date,
          max_days_to_finish=:max_days_to_finish,
          eta_date=:eta_date,

          total_amount=:total_amount,
          paid_amount=:paid_amount,

          inventory_state=:inventory_state,
          missing_items=:missing_items,
          inventory_notes=:inventory_notes,

          updated_at=now()
        WHERE id=:id
        RETURNING
          id, project_no, name, status, priority, updated_at,
          payment_date, max_days_to_finish, eta_date,
          total_amount, paid_amount,
          inventory_state, missing_items, inventory_notes
    """), {
        "id": str(project_id),

        "project_no": next_project_no,
        "name": next_name,
        "status": next_status,
        "priority": next_priority,

        "payment_date": next_payment_date,
        "max_days_to_finish": next_max_days,
        "eta_date": eta,

        "total_amount": next_total,
        "paid_amount": next_paid,

        "inventory_state": next_inventory_state,
        "missing_items": next_missing_items,
        "inventory_notes": next_inventory_notes,
    })
    row = result.mappings().one()
    await db.commit()

    await _audit.write(
        db, user.id, "project.update", "project", project_id,
        meta={"name": row.get("name"), "status": row.get("status")}
    )
    return ProjectOut(**row)
