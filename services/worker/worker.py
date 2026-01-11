import os
import json
import time
import asyncio
from uuid import UUID
from datetime import datetime, timezone
from dotenv import load_dotenv

from redis import Redis
from rq import Worker, Queue, Connection

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/workshop")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

engine = create_async_engine(DATABASE_URL, future=True, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def _set_job(job_id: str, **fields):
    async with SessionLocal() as db:
        sets = []
        params = {"id": job_id}
        for k, v in fields.items():
            if k in ("payload", "result"):
                sets.append(f"{k} = :{k}::jsonb")
                params[k] = json.dumps(v, separators=(",", ":"), ensure_ascii=False)
            else:
                sets.append(f"{k} = :{k}")
                params[k] = v
        sets.append("updated_at = now()")
        await db.execute(text(f"UPDATE jobs SET {', '.join(sets)} WHERE id = :id"), params)
        await db.commit()

async def _get_job(job_id: str):
    async with SessionLocal() as db:
        q = await db.execute(text("SELECT id, type, payload FROM jobs WHERE id = :id"), {"id": job_id})
        return q.mappings().one()

def run_job(job_id: str):
    # RQ runs sync. We bridge to async DB updates.
    asyncio.run(_run_job_async(job_id))

async def _run_job_async(job_id: str):
    row = await _get_job(job_id)
    job_type = row["type"]
    payload = row["payload"] or {}

    await _set_job(job_id, status="running", progress_pct=1, stage="starting")

    try:
        # Placeholder: replace with real nesting/export logic later.
        # Update progress like a real worker.
        for pct, stage in [(10, "loading_inputs"), (35, "processing"), (70, "uploading_outputs"), (100, "done")]:
            await _set_job(job_id, progress_pct=pct, stage=stage)
            await asyncio.sleep(0.5)

        result = {"message": f"Job completed: {job_type}", "payload_echo": payload}
        await _set_job(job_id, status="succeeded", progress_pct=100, stage="done", result=result)

    except Exception as e:
        await _set_job(job_id, status="failed", error=str(e), stage="failed")

def main():
    redis_conn = Redis.from_url(REDIS_URL)
    with Connection(redis_conn):
        worker = Worker([Queue("default")])
        worker.work()

if __name__ == "__main__":
    main()
