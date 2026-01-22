-- 009_salary_payments.sql
-- Multiple partial payments per employee per month

CREATE TABLE IF NOT EXISTS salary_payments (
  id UUID PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  month TEXT NOT NULL,            -- YYYY-MM
  amount NUMERIC NOT NULL,
  paid_on DATE NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_salary_payments_emp_month'
  ) THEN
    CREATE INDEX ix_salary_payments_emp_month ON salary_payments(employee_id, month);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_salary_payments_paid_on'
  ) THEN
    CREATE INDEX ix_salary_payments_paid_on ON salary_payments(paid_on);
  END IF;
END $$;
