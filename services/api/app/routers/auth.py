from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from . import _audit
from ..db import get_db
from ..models import User
from ..schemas import LoginRequest, TokenResponse, MeResponse
from ..core.security import verify_password, create_access_token, hash_password
from ..core.config import settings
from ..deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db), response: Response = None):
    q = await db.execute(select(User).where(User.email == req.email, User.is_active == True))
    user = q.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email/password")

    token = create_access_token(str(user.id), extra={"role": user.role})
    # Safer auth: store token in an HttpOnly cookie (not accessible to JS)
    if response is not None:
        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,
            samesite="lax",
            secure=False,  # set True if you serve over HTTPS
            max_age=settings.jwt_expire_minutes * 60,
            path="/",
        )

    await _audit.write(db, user.id, "auth.login", "user", user.id, meta={"email": user.email})

    return TokenResponse(
        access_token=token,
        must_change_password=bool(getattr(user, "must_change_password", False)),
    )
@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    return {"ok": True}

@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    return MeResponse(id=user.id, email=user.email, name=user.name, role=user.role)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change_password")
async def change_password(
    req: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_pw = (req.new_password or "").strip()
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user.password_hash = hash_password(new_pw)
    user.must_change_password = False
    user.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await _audit.write(db, user.id, "auth.change_password", "user", user.id, meta={"email": user.email})
    return {"ok": True}
