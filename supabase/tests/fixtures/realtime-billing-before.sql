-- Minimal pre-migration shape of the realtime billing objects touched by
-- 20261022092218_realtime_billing_hardening.sql. Only the columns, indexes and
-- function signatures the migration and its test use; no unrelated objects.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create table public.workspaces (id uuid primary key);
create table public.keys (id uuid primary key, workspace_id uuid not null);
create table public.users (user_id uuid primary key, role text not null);

create table public.wallets (
  workspace_id uuid primary key,
  balance_nanos bigint not null default 0,
  reserved_nanos bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.gateway_wallet_reservations (
  workspace_id uuid not null,
  reservation_id text not null,
  amount_nanos bigint not null check (amount_nanos > 0),
  status text not null check (status in ('held', 'reserved', 'captured', 'released')),
  hold_ref_id text,
  capture_ref_id text,
  release_ref_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_nanos bigint not null default 0,
  released_nanos bigint not null default 0,
  captured_at timestamptz,
  released_at timestamptz,
  constraint gateway_wallet_reservations_capture_amount_check
    check (captured_nanos >= 0 and released_nanos >= 0 and captured_nanos + released_nanos <= amount_nanos),
  primary key (workspace_id, reservation_id)
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  event_time timestamptz not null default now(),
  kind text not null,
  amount_nanos bigint not null,
  before_balance_nanos bigint not null,
  after_balance_nanos bigint not null,
  ref_type text not null,
  ref_id text not null,
  created_at timestamptz not null default now(),
  status text,
  before_reserved_nanos bigint,
  after_reserved_nanos bigint
);
create unique index credit_ledger_ref_type_ref_id_key on public.credit_ledger (ref_type, ref_id);

create table public.gateway_requests (
  id uuid primary key default gen_random_uuid(),
  realtime_session_id text,
  created_at timestamptz not null,
  native_response_id text,
  status_code integer,
  success boolean,
  error_code text,
  error_message text,
  generation_ms integer,
  usage jsonb,
  cost_nanos bigint,
  currency text,
  pricing_lines jsonb
);

create table public.gateway_realtime_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  workspace_id uuid not null,
  key_id uuid references public.keys(id) on delete set null,
  user_id text,
  provider text not null,
  model_id text not null,
  status text not null default 'created',
  started_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz,
  last_event_at timestamptz,
  reservation_prefix text not null,
  reservation_count integer not null default 0,
  reserved_nanos bigint not null default 0,
  captured_nanos bigint not null default 0,
  released_nanos bigint not null default 0,
  estimated_cost_nanos bigint not null default 0,
  final_cost_nanos bigint,
  usage jsonb not null default '{}'::jsonb,
  pricing_lines jsonb not null default '[]'::jsonb,
  provider_session_id text,
  provider_native_id text,
  disconnect_reason text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gateway_realtime_billing_reviews (
  session_id text primary key references public.gateway_realtime_sessions(session_id) on delete cascade,
  workspace_id uuid not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  access_blocked boolean not null default true,
  version bigint not null default 1,
  opened_at timestamptz not null default now(),
  review_due_at timestamptz not null default (now() + interval '1 day'),
  retry_after timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  recovery_error text,
  evidence_usage jsonb,
  evidence_metadata jsonb,
  billable_usage jsonb,
  confirmed_cost_nanos bigint check (confirmed_cost_nanos >= 0),
  pricing_lines jsonb not null default '[]'::jsonb,
  evidence_complete boolean not null default false,
  resolved_at timestamptz,
  summary_synced_at timestamptz
);
create index gateway_realtime_billing_reviews_workspace_id_idx on public.gateway_realtime_billing_reviews (workspace_id)
  where access_blocked;

create table public.gateway_realtime_billing_decisions (
  operation_id uuid primary key default gen_random_uuid(),
  session_id text not null references public.gateway_realtime_billing_reviews(session_id) on delete cascade,
  workspace_id uuid not null,
  actor_user_id text,
  action text not null,
  reason text not null,
  review_version bigint not null,
  cost_nanos bigint,
  created_at timestamptz not null default now()
);

-- Old signatures the migration drops, and trigger functions it replaces.
create function public.gateway_realtime_settle_once(uuid, text, bigint, jsonb, jsonb, text, text, text, text)
  returns void language sql as 'select';
create function public.gateway_realtime_mark_billing_unresolved(uuid, text, jsonb, text)
  returns void language sql as 'select';
create function public.gateway_realtime_review_admission() returns trigger language plpgsql as 'begin return new; end';
create function public.gateway_realtime_review_lifecycle() returns trigger language plpgsql as 'begin return new; end';
create function public.gateway_realtime_enforce_provider_concurrency() returns trigger language plpgsql as 'begin return new; end';

create trigger gateway_realtime_provider_concurrency_guard before insert on public.gateway_realtime_sessions
  for each row execute function public.gateway_realtime_enforce_provider_concurrency();
create trigger realtime_billing_review_admission before insert on public.gateway_realtime_sessions
  for each row execute function public.gateway_realtime_review_admission();
create trigger realtime_billing_review_lifecycle after update of status, usage, metadata on public.gateway_realtime_sessions
  for each row execute function public.gateway_realtime_review_lifecycle();
