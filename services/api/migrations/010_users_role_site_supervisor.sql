ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['admin','hr','manager','employee','designer','worker','viewer','site_supervisor']::text[]));
