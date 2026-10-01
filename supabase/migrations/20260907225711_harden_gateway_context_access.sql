-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- phaseo:allow-production-history-backfill reason: Version 20260907225711 is already applied in production; restore its recorded SQL without replaying it.
-- Original version and SQL are retained; this migration is already applied in production.

-- Gateway context accepts trusted workspace/key identities and returns private metadata.
revoke execute on function public.gateway_fetch_request_context(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.gateway_fetch_request_context(uuid, text, text, uuid) to service_role;
