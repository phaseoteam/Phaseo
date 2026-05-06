-- Persist structured gateway error payloads for request investigation surfaces.

alter table public.gateway_requests
  add column if not exists error_payload jsonb;

comment on column public.gateway_requests.error_payload is
  'Sanitized structured gateway error payload captured for failed requests, used by request/session/job investigation surfaces.';
