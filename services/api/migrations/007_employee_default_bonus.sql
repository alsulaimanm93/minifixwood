-- 007_employee_default_bonus.sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS default_bonus NUMERIC NULL;
