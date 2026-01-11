from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from uuid import UUID
from typing import Any, Dict

async def write(
    db: AsyncSession,
    user_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    meta: Dict[str, Any] | None = None,
):
    meta = meta or {}
    await db.execute(
        text("""
            INSERT INTO audit_log (ts, user_id, action, entity_type, entity_id, meta)
            VALUES (now(), :user_id, :action, :entity_type, :entity_id, CAST(:meta AS jsonb))
        """),
        {
            "user_id": str(user_id) if user_id else None,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id else None,
            "meta": json_dumps(meta),
        },
    )
    await db.commit()

def json_dumps(obj):
    import json
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
