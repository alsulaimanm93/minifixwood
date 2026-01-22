-- 005_payroll_breakdown.sql
-- payroll breakdown + prevent duplicates

ALTER TABLE salaries
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS overtime_pay NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS loan_deduction NUMERIC NULL;

-- one payroll row per employee per month (allow update/upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_salaries_employee_month'
  ) THEN
    CREATE UNIQUE INDEX uq_salaries_employee_month ON salaries(employee_id, month);
  END IF;
END $$;
