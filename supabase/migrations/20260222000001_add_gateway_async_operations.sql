-- =========================
-- Async operations registry for long-running jobs (video, batch)
-- =========================

create table if not exists public.gateway_async_operations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('video', 'batch')),
  internal_id text not null,
  native_id text null,
  provider text null,
  model text null,
  status text null,
  meta jsonb not null default '{}'::jsonb,
  billed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gateway_async_operations_team_kind_internal_unique
    unique (team_id, kind, internal_id)
);

create index if not exists gateway_async_operations_team_kind_created_idx
  on public.gateway_async_operations (team_id, kind, created_at desc);

create index if not exists gateway_async_operations_team_kind_native_idx
  on public.gateway_async_operations (team_id, kind, native_id)
  where native_id is not null;

alter table public.gateway_async_operations enable row level security;

drop policy if exists gateway_async_operations_select_own_team on public.gateway_async_operations;
create policy gateway_async_operations_select_own_team
  on public.gateway_async_operations
  for select
  to authenticated
  using (public.is_team_member(team_id));

drop policy if exists gateway_async_operations_insert_service on public.gateway_async_operations;
create policy gateway_async_operations_insert_service
  on public.gateway_async_operations
  for insert
  to service_role
  with check (true);

drop policy if exists gateway_async_operations_update_service on public.gateway_async_operations;
create policy gateway_async_operations_update_service
  on public.gateway_async_operations
  for update
  to service_role
  using (true)
  with check (true);

grant select on public.gateway_async_operations to authenticated;
grant select, insert, update on public.gateway_async_operations to service_role;

comment on table public.gateway_async_operations is
  'Team-scoped registry for long-running operations (video/batch) with ownership and billing markers.';
comment on column public.gateway_async_operations.internal_id is
  'Gateway-facing identifier used on retrieval routes (e.g. /videos/{id}, /batches/{id}).';
comment on column public.gateway_async_operations.native_id is
  'Provider-native operation identifier for upstream polling APIs.';
