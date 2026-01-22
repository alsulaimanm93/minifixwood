-- 004_user_employee_link.sql
-- Link users to employees + force password change

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id UUID NULL REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- one user per employee (allow multiple NULLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_users_employee_id'
  ) THEN
    CREATE UNIQUE INDEX uq_users_employee_id ON users(employee_id) WHERE employee_id IS NOT NULL;
  END IF;
END $$;
