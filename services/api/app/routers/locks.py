from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID
from ..db import get_db
from ..models import User
from ..schemas import LockAcquireRequest, LockOut, LockReleaseRequest
from ..deps import get_current_user
from . import _audit

router = APIRouter(prefix="/locks", tags=["locks"])

LEASE_MINUTES = 15

@router.post("/acquire", response_model=LockOut)
async def acquire(req: LockAcquireRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=LEASE_MINUTES)

    # If there's an active lock by someone else (not expired), block.
    q = await db.execute(text("""
        SELECT id, file_id, locked_by, expires_at, active
        FROM locks
        WHERE file_id = :fid AND active = true
        LIMIT 1
    """), {"fid": str(req.file_id)})
    existing = q.mappings().one_or_none()
    if existing and existing["expires_at"] > now and str(existing["locked_by"]) == str(user.id):
        return LockOut(**existing)

    if existing:
        # auto-expire stale locks
        if existing["expires_at"] <= now:
            await db.execute(text("UPDATE locks SET active=false WHERE id=:id"), {"id": str(existing["id"])})
            await db.commit()
        else:
            if str(existing["locked_by"]) != str(user.id):
                raise HTTPException(409, detail={"message": "Locked", "locked_by": existing["locked_by"], "expires_at": existing["expires_at"]})

    # Create lock
    result = await db.execute(text("""
        INSERT INTO locks (file_id, locked_by, locked_at, expires_at, client_id, mode, active)
        VALUES (:fid, :uid, now(), :expires, :client_id, 'exclusive', true)
        RETURNING id, file_id, locked_by, expires_at, active
    """), {"fid": str(req.file_id), "uid": str(user.id), "expires": expires, "client_id": req.client_id})
    row = result.mappings().one()
    await db.commit()
    lock_id = row["id"]
    await _audit.write(db, user.id, "lock.acquire", "lock", lock_id, meta={"file_id": str(req.file_id), "client_id": req.client_id})
    return LockOut(**row)

@router.post("/heartbeat", response_model=LockOut)
async def heartbeat(lock_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=LEASE_MINUTES)
    result = await db.execute(text("""
        UPDATE locks
        SET expires_at = :expires
        WHERE id = :id AND active = true AND locked_by = :uid
        RETURNING id, file_id, locked_by, expires_at, active
    """), {"id": str(lock_id), "expires": expires, "uid": str(user.id)})
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "Lock not found")
    await db.commit()
    return LockOut(**row)

@router.post("/release")
async def release(req: LockReleaseRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(text("""
        UPDATE locks SET active=false
        WHERE id = :id AND locked_by = :uid AND active = true
        RETURNING id, file_id
    """), {"id": str(req.lock_id), "uid": str(user.id)})
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(404, "Lock not found")
    await db.commit()
    await _audit.write(db, user.id, "lock.release", "lock", row["id"], meta={"file_id": row["file_id"]})
    return {"ok": True}
