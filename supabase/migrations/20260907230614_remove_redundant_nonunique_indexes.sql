-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

-- Each removed index has an equivalent valid UNIQUE/PRIMARY index with the
-- same keys and ordering. Keep all constraints and their backing indexes.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop index if exists public.keys_hash_idx;
drop index if exists public.management_keys_hash_idx;
drop index if exists public.gateway_dynamic_route_keys_route_idx;
drop index if exists public.v2_execution_plans_runtime_lookup_idx;
drop index if exists public.v2_request_attempts_request_idx;
drop index if exists public.v2_request_routing_decisions_request_idx;
