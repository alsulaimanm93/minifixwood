from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from uuid import UUID
from ..db import get_db
from ..models import Project, User
from ..schemas import ProjectCreate, ProjectOut
from ..deps import get_current_user
from . import _audit

router = APIRouter(prefix="/projects", tags=["projects"])

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
    await _audit.write(db, user.id, "project.create", "project", pid, meta={"name": req.name, "status": req.status})
    return ProjectOut(**row)

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
