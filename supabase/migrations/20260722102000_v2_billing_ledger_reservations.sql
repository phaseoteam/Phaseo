-- v2 billing primitives
--
-- The ledger contains only balance-affecting entries. Temporary holds live in
-- reservations and are captured/released into ledger entries by service code.

create table if not exists public.v2_credit_ledger (
  entry_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_time timestamptz not null default now(),
  entry_type text not null,
  amount_nanos bigint not null,
  currency text not null default 'USD',
  source_type text,
  source_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_credit_ledger_amount_check check (amount_nanos <> 0),
  constraint v2_credit_ledger_type_check check (entry_type in (
    'payment', 'grant', 'refund', 'charge', 'reservation_capture',
    'reservation_release', 'adjustment', 'expiration'
  )),
  constraint v2_credit_ledger_idempotency_check check (length(trim(idempotency_key)) > 0),
  constraint v2_credit_ledger_source_check check ((source_type is null) = (source_id is null))
);

create unique index if not exists v2_credit_ledger_idempotency_key
  on public.v2_credit_ledger (workspace_id, idempotency_key);
create index if not exists v2_credit_ledger_workspace_time_idx
  on public.v2_credit_ledger (workspace_id, event_time desc, entry_id desc);
create index if not exists v2_credit_ledger_source_idx
  on public.v2_credit_ledger (source_type, source_id)
  where source_type is not null;

create table if not exists public.v2_credit_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purpose text not null,
  amount_nanos bigint not null,
  captured_nanos bigint not null default 0,
  released_nanos bigint not null default 0,
  status text not null default 'held',
  idempotency_key text not null,
  external_ref text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint v2_credit_reservations_amount_check check (amount_nanos > 0),
  constraint v2_credit_reservations_captured_check check (captured_nanos >= 0),
  constraint v2_credit_reservations_released_check check (released_nanos >= 0),
  constraint v2_credit_reservations_balance_check check (captured_nanos + released_nanos <= amount_nanos),
  constraint v2_credit_reservations_status_check check (status in ('held', 'partially_captured', 'captured', 'partially_released', 'released', 'expired', 'cancelled')),
  constraint v2_credit_reservations_idempotency_check check (length(trim(idempotency_key)) > 0),
  constraint v2_credit_reservations_key unique (workspace_id, idempotency_key)
);

create index if not exists v2_credit_reservations_workspace_status_idx
  on public.v2_credit_reservations (workspace_id, status, created_at desc);
create index if not exists v2_credit_reservations_expiry_idx
  on public.v2_credit_reservations (expires_at)
  where status in ('held', 'partially_captured', 'partially_released');
create index if not exists v2_credit_reservations_external_ref_idx
  on public.v2_credit_reservations (external_ref)
  where external_ref is not null;

alter table public.v2_credit_ledger enable row level security;
alter table public.v2_credit_reservations enable row level security;

drop policy if exists v2_credit_ledger_workspace_select on public.v2_credit_ledger;
create policy v2_credit_ledger_workspace_select on public.v2_credit_ledger
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists v2_credit_reservations_workspace_select on public.v2_credit_reservations;
create policy v2_credit_reservations_workspace_select on public.v2_credit_reservations
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.v2_credit_ledger, public.v2_credit_reservations to authenticated;
grant insert on public.v2_credit_ledger to service_role;
grant insert, update on public.v2_credit_reservations to service_role;

comment on table public.v2_credit_ledger is 'Append-only balance-affecting credit entries. Do not write temporary holds here.';
comment on table public.v2_credit_reservations is 'Temporary credit holds for batch, video, and other asynchronous operations; capture/release emits ledger entries.';
