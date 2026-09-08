-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

-- These non-unique indexes are covered by existing indexes with matching
-- leading columns, operator classes, collations, ordering and predicates.
-- Bound lock acquisition so a busy table fails the migration instead of
-- holding up application traffic while waiting for a maintenance lock.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DROP INDEX public.scim_groups_workspace_id_idx;
DROP INDEX public.byok_keys_workspace_provider_idx;
DROP INDEX public.oauth_authorizations_user_id_idx;
DROP INDEX public.presets_workspace_id_idx;
DROP INDEX public.workspace_broadcast_destinations_workspace_id_idx;
