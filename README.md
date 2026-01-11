# Workshop Cloud Repo (Cloud-first, multi-user, future-proof)

Pinned stack:
- Web UI: Next.js 15 + React 19 + TypeScript (PWA-ready)
- Backend: FastAPI (Python)
- DB: PostgreSQL
- Object storage: S3-compatible (MinIO in dev)
- Queue/workers: Redis + RQ
- Desktop wrapper (optional): Tauri 2 (Windows) + local cache for *all file types*

## Quick start (dev)

### 1) Start infrastructure
```bash
docker compose up -d
```

### 2) Backend (FastAPI)
```bash
cd services/api
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/mac:
# source .venv/bin/activate
pip install -r requirements.txt

# Apply DB migration (requires psql installed):
bash ../scripts/apply_migrations.sh
# Windows PowerShell alternative (from repo root):
# psql "postgresql://postgres:postgres@localhost:5432/workshop" -f services/api/migrations/001_init.sql

# Run API
uvicorn app.main:app --reload --port 8000
```

### 3) Worker
```bash
cd services/worker
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python worker.py
```

### 4) Web (Next.js)
```bash
cd apps/web
npm install
cp .env.local.example .env.local
npm run dev
```

Open:
- Web: http://localhost:3000
- API docs: http://localhost:8000/docs
- MinIO console: http://localhost:9001 (minio / minio12345)

## Default dev credentials
The migration seeds an admin:
- email: admin@local
- password: admin123

## SketchUp / large files caching (Desktop/Tauri)
The Tauri layer is optional. It provides:
- Local cache folder for *all file types*
- Version check via API metadata
- Download once, reuse instantly if unchanged
- Background upload after edits (manual button in scaffold; add watcher later)

See: `apps/desktop/src-tauri/src/cache.rs`

## Notes
- Presigned upload is implemented as single PUT in this scaffold (works fine for many cases).
  For very large files you can extend `/versions/initiate-upload` to multipart later without changing DB schema.
