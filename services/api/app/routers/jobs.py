from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID
from ..db import get_db
from ..models import User
from ..schemas import JobCreate, JobOut
from ..deps import get_current_user
from ..queue import enqueue_job
from . import _audit

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.post("", response_model=JobOut)
async def create_job(req: JobCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(text("""
        INSERT INTO jobs (type, status, progress_pct, stage, payload, result, created_by, created_at, updated_at)
        VALUES (:type, 'queued', 0, NULL, :payload::jsonb, '{}'::jsonb, :created_by, now(), now())
        RETURNING id, type, status, progress_pct, stage, result, error, updated_at
    """), {
        "type": req.type,
        "payload": json_dumps(req.payload),
        "created_by": str(user.id),
    })
    row = result.mappings().one()
    await db.commit()

    job_id = UUID(row["id"])
    enqueue_job(str(job_id))
    await _audit.write(db, user.id, "job.create", "job", job_id, meta={"type": req.type})
    return JobOut(**row)

@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = await db.execute(text("""
        SELECT id, type, status, progress_pct, stage, result, error, updated_at
        FROM jobs
        WHERE id = :id
    """), {"id": str(job_id)})
    row = q.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "Job not found")
    return JobOut(**row)

def json_dumps(obj):
    import json
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
