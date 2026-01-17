from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .routers import auth, projects, files, locks, jobs, inventory

app = FastAPI(title="Workshop API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(files.router)
app.include_router(locks.router)
app.include_router(jobs.router)
app.include_router(inventory.router)

@app.get("/health")
async def health():
    return {"ok": True}
