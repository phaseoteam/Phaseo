-- =========================
-- Provider webhook event dedupe + processing tracking
-- =========================

create table if not exists public.gateway_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  kind text null,
  team_id uuid null references public.teams(id) on delete set null,
  internal_id text null,
  payload jsonb not null default '{}'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gateway_provider_events_provider_event_unique
    unique (provider, provider_event_id)
);
create index if not exists gateway_provider_events_provider_created_idx
  on public.gateway_provider_events (provider, created_at desc);
create index if not exists gateway_provider_events_team_created_idx
  on public.gateway_provider_events (team_id, created_at desc)
  where team_id is not null;
alter table public.gateway_provider_events enable row level security;
drop policy if exists gateway_provider_events_select_service on public.gateway_provider_events;
create policy gateway_provider_events_select_service
  on public.gateway_provider_events
  for select
  to service_role
  using (true);
drop policy if exists gateway_provider_events_insert_service on public.gateway_provider_events;
create policy gateway_provider_events_insert_service
  on public.gateway_provider_events
  for insert
  to service_role
  with check (true);
drop policy if exists gateway_provider_events_update_service on public.gateway_provider_events;
create policy gateway_provider_events_update_service
  on public.gateway_provider_events
  for update
  to service_role
  using (true)
  with check (true);
grant select, insert, update on public.gateway_provider_events to service_role;
comment on table public.gateway_provider_events is
  'Webhook/provider event dedupe + processing audit trail for long-running operations.';
