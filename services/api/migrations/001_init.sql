CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','manager','designer','worker','viewer','hr','site_supervisor')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PROJECTS
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_no int UNIQUE,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'under_preparation','prepared_for_quotation','pending_confirmation',
    'current','finished','rejected'
  )),
  priority int NOT NULL DEFAULT 0,
  eta_date date,
  total_amount numeric,
  paid_amount numeric,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FILES (logical files)
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('skp','dxf','pdf','nc','image','other')),
  name text NOT NULL,
  mime text,
  size_bytes bigint NOT NULL DEFAULT 0,
  current_version_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FILE VERSIONS (immutable)
CREATE TABLE IF NOT EXISTS file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version_no int NOT NULL,
  object_key text NOT NULL,
  etag text,
  last_modified timestamptz,
  s3_version_id text,
  sha256 text,
  size_bytes bigint NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, version_no)
);

ALTER TABLE files
  ADD CONSTRAINT fk_files_current_version
  FOREIGN KEY (current_version_id) REFERENCES file_versions(id);

-- LOCKS (check-out)
CREATE TABLE IF NOT EXISTS locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  locked_by uuid NOT NULL REFERENCES users(id),
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  client_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('exclusive')),
  active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS locks_one_active_per_file
ON locks(file_id)
WHERE active = true;

-- JOBS (background tasks)
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','canceled')),
  progress_pct int NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  stage text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  ip inet,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS projects_status_updated_idx ON projects(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS files_project_kind_idx ON files(project_id, kind);
CREATE INDEX IF NOT EXISTS file_versions_file_verno_idx ON file_versions(file_id, version_no DESC);
CREATE INDEX IF NOT EXISTS jobs_status_updated_idx ON jobs(status, updated_at DESC);

-- SEED ADMIN (dev)
-- password: admin123
INSERT INTO users (email, name, password_hash, role)
VALUES (
  'admin@local',
  'Admin',
  '$2b$12$M3PP7B0nJ0xQZs7x2w.5eOv8T3p9s0Y0D1HfYj9Qw1m0mK3gqF.6C',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
