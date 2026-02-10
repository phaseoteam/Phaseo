-- =========================
-- gateway_requests: add location + drop request uniqueness
-- =========================

alter table public.gateway_requests
  add column if not exists location text;
drop index if exists public.gateway_requests_team_request_uidx;
