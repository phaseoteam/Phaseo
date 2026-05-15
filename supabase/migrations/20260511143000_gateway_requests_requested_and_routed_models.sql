-- Add explicit requested/routed model identity to gateway request audit rows.
-- Keep legacy model_id unchanged for backwards compatibility.

alter table public.gateway_requests
  add column if not exists requested_model_id text null,
  add column if not exists routed_model_id text null;

update public.gateway_requests
set
  requested_model_id = coalesce(requested_model_id, model_id),
  routed_model_id = coalesce(routed_model_id, model_id)
where requested_model_id is null
   or routed_model_id is null;

create index if not exists idx_gateway_requests_workspace_requested_model_created
  on public.gateway_requests(workspace_id, requested_model_id, created_at desc)
  where requested_model_id is not null;

create index if not exists idx_gateway_requests_workspace_routed_model_created
  on public.gateway_requests(workspace_id, routed_model_id, created_at desc)
  where routed_model_id is not null;

comment on column public.gateway_requests.requested_model_id is 'Original model id requested by the client before any routing or router expansion.';
comment on column public.gateway_requests.routed_model_id is 'Concrete routed model id chosen for execution. For non-router requests this typically matches the requested model.';
