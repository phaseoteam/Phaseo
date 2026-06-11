-- Store request-level diagnostics used by the observability request detail view.

alter table public.gateway_requests
  add column if not exists detail_metadata jsonb;

comment on column public.gateway_requests.detail_metadata is
  'Request-level routing, provider, guardrail, and plugin diagnostics for observability detail views.';
