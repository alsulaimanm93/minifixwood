-- 006_payroll_components.sql
-- monthly payroll components (saved per employee per month)

ALTER TABLE salaries
  ADD COLUMN IF NOT EXISTS bonuses NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS manual_deductions NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS already_paid NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS loan_override NUMERIC NULL;
