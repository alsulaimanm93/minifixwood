-- 008_attendance.sql
-- Daily attendance tracking for salary deduction

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',  -- present | absent | leave | sick | etc
  deduct BOOLEAN NOT NULL DEFAULT TRUE,    -- if false, absence won't deduct salary
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_attendance_employee_day'
  ) THEN
    CREATE UNIQUE INDEX uq_attendance_employee_day ON attendance(employee_id, day);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_attendance_day'
  ) THEN
    CREATE INDEX ix_attendance_day ON attendance(day);
  END IF;
END $$;
