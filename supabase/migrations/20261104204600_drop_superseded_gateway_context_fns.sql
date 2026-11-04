-- Drop the superseded compiled-context and catalogue-source gateway functions.
-- The gateway admits requests through public.gateway_fetch_request_context_bundle and
-- public.gateway_fetch_request_context_with_reservations (private.gateway_context_access).
-- Nothing in the repo calls the six functions below, prod edge logs for 2026-10-28..2026-11-04
-- show no /rest/v1/rpc calls to them, and on prod each helper is called only by another
-- function in this set. Entry points go first, then the helpers they call.
-- DROP FUNCTION only: no tables, rows or grants on other objects change.
drop function if exists public.gateway_fetch_request_context_bundle_v2(uuid, text, text, uuid, boolean, boolean);
drop function if exists public.gateway_fetch_compiled_context_authority(uuid, text, text, uuid);
drop function if exists public.gateway_catalogue_source();
drop function if exists public.gateway_fetch_workspace_runtime(uuid);
drop function if exists private.gateway_compiled_context_access(uuid, text, text, uuid);
drop function if exists private.project_routing_catalogue_row(jsonb);
