import secrets
import string
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import require_roles
from ..models import User, Employee
from ..core.security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])

ALLOWED_ROLES = ("admin", "hr", "manager", "employee", "designer", "worker", "viewer")

def _now():
    return datetime.now(timezone.utc)

def _gen_temp_password(n: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))

def _pg_info(e: Exception):
    orig = getattr(e, "orig", None)
    sqlstate = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    constraint = getattr(orig, "constraint_name", None)
    msg = str(orig or e)
    return sqlstate, constraint, msg

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    employee_id: Optional[str] = None
    must_change_password: bool = False

class UserCreate(BaseModel):
    employee_id: str
    role: str
    is_active: bool = True
    # Frontend always sends email (or asks user for it)
    email: Optional[str] = None

class UserUpdate(BaseModel):
    employee_id: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    email: Optional[str] = None
    name: Optional[str] = None

class UserCreateResult(UserOut):
    temp_password: Optional[str] = None

@router.get("/users", response_model=List[UserOut], dependencies=[Depends(require_roles("admin", "hr"))])
async def list_users(
    email: Optional[str] = Query(default=None),
    employee_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User)

    if email:
        em = email.strip().lower()
        if em:
            stmt = stmt.where(User.email == em)

    if employee_id:
        try:
            eid = uuid.UUID(employee_id)
            stmt = stmt.where(User.employee_id == eid)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid employee_id")

    q = await db.execute(stmt.order_by(User.created_at.desc()))
    rows = q.scalars().all()
    return [
        UserOut(
            id=str(x.id),
            email=x.email,
            name=x.name,
            role=x.role,
            is_active=bool(x.is_active),
            employee_id=str(x.employee_id) if getattr(x, "employee_id", None) else None,
            must_change_password=bool(getattr(x, "must_change_password", False)),
        )
        for x in rows
    ]

@router.post("/users", response_model=UserCreateResult, dependencies=[Depends(require_roles("admin", "hr"))])
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    role = payload.role.strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role (allowed: {', '.join(ALLOWED_ROLES)})")

    try:
        emp_id = uuid.UUID(payload.employee_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid employee_id")

    q = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = q.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=400, detail="Employee not found")

    email = (payload.email or emp.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Employee has no email (required for login)")

    # Enforce: one user per employee
    q2 = await db.execute(select(User).where(User.employee_id == emp_id))
    existing = q2.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="This employee already has a user")

    temp = _gen_temp_password()
    now = _now()

    u = User(
        id=uuid.uuid4(),
        email=email,
        name=emp.name,
        password_hash=hash_password(temp),
        role=role,
        is_active=payload.is_active,
        employee_id=emp_id,
        must_change_password=True,
        created_at=now,
        updated_at=now,
    )
    db.add(u)

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()

        # If email exists already, try to attach that user (if not linked elsewhere)
        q3 = await db.execute(select(User).where(User.email == email))
        u2 = q3.scalar_one_or_none()
        if u2:
            if u2.employee_id and u2.employee_id != emp_id:
                raise HTTPException(status_code=400, detail="Email already exists")

            # attach + reset password
            temp2 = _gen_temp_password()
            u2.employee_id = emp_id
            u2.name = emp.name
            u2.role = role
            u2.is_active = payload.is_active
            u2.password_hash = hash_password(temp2)
            u2.must_change_password = True
            u2.updated_at = _now()

            try:
                await db.commit()
            except IntegrityError as e2:
                await db.rollback()
                sqlstate, constraint, msg = _pg_info(e2)
                raise HTTPException(status_code=400, detail=f"Could not attach existing user: {msg}")

            await db.refresh(u2)
            return UserCreateResult(
                id=str(u2.id),
                email=u2.email,
                name=u2.name,
                role=u2.role,
                is_active=bool(u2.is_active),
                employee_id=str(u2.employee_id) if u2.employee_id else None,
                must_change_password=bool(getattr(u2, "must_change_password", False)),
                temp_password=temp2,
            )

        # Not email-related => show real message
        sqlstate, constraint, msg = _pg_info(e)
        raise HTTPException(status_code=400, detail=f"Could not create user: {msg}")

    await db.refresh(u)
    return UserCreateResult(
        id=str(u.id),
        email=u.email,
        name=u.name,
        role=u.role,
        is_active=bool(u.is_active),
        employee_id=str(u.employee_id) if u.employee_id else None,
        must_change_password=bool(u.must_change_password),
        temp_password=temp,
    )

@router.patch("/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_roles("admin", "hr"))])
async def update_user(user_id: str, payload: UserUpdate, db: AsyncSession = Depends(get_db)):
    try:
        uid = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    q = await db.execute(select(User).where(User.id == uid))
    u = q.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        em = payload.email.strip().lower()
        if not em:
            raise HTTPException(status_code=400, detail="Email cannot be empty")
        u.email = em

    if payload.name is not None:
        nm = payload.name.strip()
        if not nm:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        u.name = nm

    if payload.role is not None:
        rr = payload.role.strip().lower()
        if rr not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid role (allowed: {', '.join(ALLOWED_ROLES)})")
        u.role = rr

    if payload.is_active is not None:
        u.is_active = bool(payload.is_active)

    if payload.employee_id is not None:
        if str(payload.employee_id).strip() == "":
            u.employee_id = None
        else:
            try:
                u.employee_id = uuid.UUID(payload.employee_id)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid employee_id")

    u.updated_at = _now()

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        sqlstate, constraint, msg = _pg_info(e)
        if sqlstate == "23505":
            raise HTTPException(status_code=400, detail="Email already exists")
        raise HTTPException(status_code=400, detail=f"Could not update user: {msg}")

    await db.refresh(u)
    return UserOut(
        id=str(u.id),
        email=u.email,
        name=u.name,
        role=u.role,
        is_active=bool(u.is_active),
        employee_id=str(u.employee_id) if u.employee_id else None,
        must_change_password=bool(getattr(u, "must_change_password", False)),
    )

@router.delete("/users/{user_id}", dependencies=[Depends(require_roles("admin", "hr"))])
async def delete_user(user_id: str, db: AsyncSession = Depends(get_db)):
    try:
        uid = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    q = await db.execute(select(User).where(User.id == uid))
    u = q.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(u)
    await db.commit()
    return {"ok": True}

@router.post("/users/{user_id}/reset_password", response_model=UserCreateResult, dependencies=[Depends(require_roles("admin", "hr"))])
async def reset_password(user_id: str, db: AsyncSession = Depends(get_db)):
    try:
        uid = uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    q = await db.execute(select(User).where(User.id == uid))
    u = q.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    temp = _gen_temp_password()
    u.password_hash = hash_password(temp)
    u.must_change_password = True
    u.updated_at = _now()

    await db.commit()
    await db.refresh(u)

    return UserCreateResult(
        id=str(u.id),
        email=u.email,
        name=u.name,
        role=u.role,
        is_active=bool(u.is_active),
        employee_id=str(u.employee_id) if getattr(u, "employee_id", None) else None,
        must_change_password=bool(getattr(u, "must_change_password", False)),
        temp_password=temp,
    )
