-- 003_hr.sql
-- Employees / Salaries / Loans

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NULL,
  position TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  hire_date DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  base_salary NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- unique email (allow multiple NULLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_employees_email'
  ) THEN
    CREATE UNIQUE INDEX uq_employees_email ON employees (email) WHERE email IS NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS salaries (
  id UUID PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  month TEXT NOT NULL,
  gross NUMERIC NULL,
  deductions NUMERIC NULL,
  net NUMERIC NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  paid_on DATE NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_salaries_employee_month'
  ) THEN
    CREATE INDEX ix_salaries_employee_month ON salaries (employee_id, month);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  principal NUMERIC NULL,
  remaining NUMERIC NULL,
  monthly_deduction NUMERIC NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_loans_employee_status'
  ) THEN
    CREATE INDEX ix_loans_employee_status ON loans (employee_id, status);
  END IF;
END $$;
