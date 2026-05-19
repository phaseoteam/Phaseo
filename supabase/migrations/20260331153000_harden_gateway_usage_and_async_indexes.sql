-- Harden usage and async-operation query paths for logs/jobs/sessions surfaces.
-- Focus: team-scoped logs filtering, request investigation lookups, and async polling.

-- ---------------------------------------------------------------------------
-- gateway_requests (partitioned): support common settings/logs filters.
-- ---------------------------------------------------------------------------
create index if not exists gateway_requests_team_provider_created_idx
  on public.gateway_requests (team_id, provider, created_at desc)
  where provider is not null;
create index if not exists gateway_requests_team_model_created_idx
  on public.gateway_requests (team_id, model_id, created_at desc)
  where model_id is not null;
create index if not exists gateway_requests_team_request_id_created_idx
  on public.gateway_requests (team_id, request_id, created_at desc);
-- ---------------------------------------------------------------------------
-- gateway_request_details: team-safe request-id debug lookups.
-- ---------------------------------------------------------------------------
create index if not exists idx_gateway_request_details_team_request_id_created
  on public.gateway_request_details (team_id, request_id, created_at desc);
-- ---------------------------------------------------------------------------
-- gateway_async_operations: support team views + global reconciliation loops.
-- ---------------------------------------------------------------------------
create index if not exists gateway_async_operations_team_kind_updated_idx
  on public.gateway_async_operations (team_id, kind, updated_at desc);
create index if not exists gateway_async_operations_kind_unbilled_updated_idx
  on public.gateway_async_operations (kind, updated_at asc)
  where billed_at is null;
create index if not exists gateway_async_operations_kind_provider_native_created_idx
  on public.gateway_async_operations (kind, provider, native_id, created_at desc)
  where provider is not null and native_id is not null;
create index if not exists gateway_async_operations_kind_status_updated_idx
  on public.gateway_async_operations (kind, status, updated_at asc)
  where status is not null;
