-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- phaseo:allow-production-history-backfill reason: Version 20260907234916 is already applied in production; restore its recorded SQL without replaying it.
-- Original version and SQL are retained; this migration is already applied in production.

alter function public.is_admin_user() security invoker;
alter function public.is_admin_user() set search_path = '';
notify pgrst, 'reload schema';
