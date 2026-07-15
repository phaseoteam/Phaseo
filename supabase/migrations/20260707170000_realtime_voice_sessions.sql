-- Durable realtime voice sessions with wallet hold/extend/final-settle support.

-- Realtime sessions depend on wallet holds. The current wallet reservation RPC
-- writes active holds as "reserved", while older schemas only allowed "held".
alter table public.gateway_wallet_reservations
  drop constraint if exists gateway_wallet_reservations_status_check;
alter table public.gateway_wallet_reservations
  add constraint gateway_wallet_reservations_status_check
  check (status in ('held', 'reserved', 'captured', 'released'));
create table if not exists public.gateway_realtime_sessions (
  id uuid not null default gen_random_uuid(),
  session_id text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key_id uuid null references public.keys(id) on delete set null,
  user_id text null,
  source text not null default 'api' check (source in ('api', 'chat')),
  provider text not null,
  model_id text not null,
  provider_model_id text null,
  voice text null,
  status text not null default 'created' check (
    status in ('created', 'connected', 'ending', 'completed', 'failed', 'cancelled', 'expired')
  ),
  started_at timestamptz not null default now(),
  connected_at timestamptz null,
  ended_at timestamptz null,
  expires_at timestamptz null,
  last_event_at timestamptz null,
  reservation_prefix text not null,
  reservation_count integer not null default 0,
  reserved_nanos bigint not null default 0,
  captured_nanos bigint not null default 0,
  released_nanos bigint not null default 0,
  estimated_cost_nanos bigint not null default 0,
  final_cost_nanos bigint null,
  currency text not null default 'USD',
  usage jsonb not null default '{}'::jsonb,
  pricing_lines jsonb not null default '[]'::jsonb,
  provider_session_id text null,
  provider_native_id text null,
  provider_client_secret_hash text null,
  disconnect_reason text null,
  error_code text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gateway_realtime_sessions_pkey primary key (id),
  constraint gateway_realtime_sessions_session_id_key unique (session_id)
);
create index if not exists idx_gateway_realtime_sessions_workspace_created
  on public.gateway_realtime_sessions (workspace_id, created_at desc);
create index if not exists idx_gateway_realtime_sessions_key_created
  on public.gateway_realtime_sessions (key_id, created_at desc);
create index if not exists idx_gateway_realtime_sessions_status_updated
  on public.gateway_realtime_sessions (status, updated_at desc);
alter table public.gateway_realtime_sessions enable row level security;
drop policy if exists gateway_realtime_sessions_select_own_workspace on public.gateway_realtime_sessions;
create policy gateway_realtime_sessions_select_own_workspace
  on public.gateway_realtime_sessions
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists gateway_realtime_sessions_service_all on public.gateway_realtime_sessions;
create policy gateway_realtime_sessions_service_all
  on public.gateway_realtime_sessions
  for all
  to service_role
  using (true)
  with check (true);
grant select on public.gateway_realtime_sessions to authenticated;
grant select, insert, update on public.gateway_realtime_sessions to service_role;
create or replace function public.gateway_realtime_settle_once(
  p_workspace_id uuid,
  p_session_id text,
  p_final_cost_nanos bigint,
  p_usage jsonb default '{}'::jsonb,
  p_pricing_lines jsonb default '[]'::jsonb,
  p_status text default 'completed',
  p_disconnect_reason text default null,
  p_error_code text default null,
  p_error_message text default null
)
returns table(
  applied boolean,
  already_applied boolean,
  status text,
  final_cost_nanos bigint,
  reserved_nanos bigint,
  captured_nanos bigint,
  released_nanos bigint,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  before_reserved_nanos bigint,
  after_reserved_nanos bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.gateway_realtime_sessions%rowtype;
  v_wallet public.wallets%rowtype;
  v_cost bigint;
  v_held bigint := 0;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_next_status text;
begin
  if p_workspace_id is null then
    raise exception 'missing_workspace_id';
  end if;
  if coalesce(trim(p_session_id), '') = '' then
    raise exception 'missing_session_id';
  end if;
  if p_final_cost_nanos is null or p_final_cost_nanos < 0 then
    raise exception 'invalid_final_cost_nanos';
  end if;

  v_next_status := lower(coalesce(nullif(trim(p_status), ''), 'completed'));
  if v_next_status not in ('completed', 'failed', 'cancelled', 'expired') then
    raise exception 'invalid_realtime_terminal_status';
  end if;

  select *
  into v_session
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id
    and session_id = p_session_id
  for update;

  if not found then
    return query select false, false, 'not_found'::text, 0::bigint, 0::bigint, 0::bigint, 0::bigint, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return query
    select
      false,
      true,
      v_session.status::text,
      coalesce(v_session.final_cost_nanos, 0)::bigint,
      coalesce(v_session.reserved_nanos, 0)::bigint,
      coalesce(v_session.captured_nanos, 0)::bigint,
      coalesce(v_session.released_nanos, 0)::bigint,
      null::bigint,
      null::bigint,
      null::bigint,
      null::bigint;
    return;
  end if;

  select coalesce(sum(gwr.amount_nanos), 0)::bigint
  into v_held
  from public.gateway_wallet_reservations gwr
  where gwr.workspace_id = p_workspace_id
    and gwr.status in ('held', 'reserved')
    and (
      gwr.hold_ref_id = p_session_id
      or gwr.reservation_id like v_session.reservation_prefix || '%'
    );

  select *
  into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  v_cost := greatest(0, p_final_cost_nanos);
  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);

  if v_before_reserved < v_held then
    return query select false, false, 'reserved_balance_mismatch'::text, v_cost, v_held, 0::bigint, v_held, v_before_balance, v_before_balance, v_before_reserved, v_before_reserved;
    return;
  end if;

  if v_before_balance < v_cost then
    return query select false, false, 'insufficient_balance'::text, v_cost, v_held, 0::bigint, v_held, v_before_balance, v_before_balance, v_before_reserved, v_before_reserved;
    return;
  end if;

  update public.wallets w
  set balance_nanos = coalesce(w.balance_nanos, 0) - v_cost,
      reserved_nanos = coalesce(w.reserved_nanos, 0) - v_held,
      updated_at = now()
  where w.workspace_id = p_workspace_id
  returning *
  into v_wallet;

  update public.gateway_wallet_reservations gwr
  set status = case when v_cost > 0 then 'captured' else 'released' end,
      capture_ref_id = case when v_cost > 0 then p_session_id else gwr.capture_ref_id end,
      release_ref_id = case when v_cost <= 0 then p_session_id else gwr.release_ref_id end,
      updated_at = now()
  where gwr.workspace_id = p_workspace_id
    and gwr.status in ('held', 'reserved')
    and (
      gwr.hold_ref_id = p_session_id
      or gwr.reservation_id like v_session.reservation_prefix || '%'
    );

  if v_cost > 0 then
    insert into public.credit_ledger (
      workspace_id,
      event_time,
      kind,
      amount_nanos,
      before_balance_nanos,
      after_balance_nanos,
      before_reserved_nanos,
      after_reserved_nanos,
      ref_type,
      ref_id,
      created_at,
      status
    ) values (
      p_workspace_id,
      now(),
      'charge',
      -v_cost,
      v_before_balance,
      coalesce(v_wallet.balance_nanos, 0),
      v_before_reserved,
      coalesce(v_wallet.reserved_nanos, 0),
      'realtime_session',
      p_session_id,
      now(),
      'captured'
    ) on conflict (ref_type, ref_id) do nothing;
  end if;

  update public.gateway_realtime_sessions
  set status = v_next_status,
      ended_at = coalesce(ended_at, now()),
      final_cost_nanos = v_cost,
      captured_nanos = v_cost,
      released_nanos = greatest(0, v_held - v_cost),
      reserved_nanos = v_held,
      usage = coalesce(p_usage, '{}'::jsonb),
      pricing_lines = case when jsonb_typeof(coalesce(p_pricing_lines, '[]'::jsonb)) = 'array' then p_pricing_lines else '[]'::jsonb end,
      disconnect_reason = nullif(trim(coalesce(p_disconnect_reason, '')), ''),
      error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      error_message = nullif(trim(coalesce(p_error_message, '')), ''),
      updated_at = now()
  where workspace_id = p_workspace_id
    and session_id = p_session_id
  returning *
  into v_session;

  return query
  select
    true,
    false,
    v_session.status::text,
    v_cost,
    v_held,
    v_cost,
    greatest(0, v_held - v_cost),
    v_before_balance,
    coalesce(v_wallet.balance_nanos, 0)::bigint,
    v_before_reserved,
    coalesce(v_wallet.reserved_nanos, 0)::bigint;
end;
$$;
revoke all on function public.gateway_realtime_settle_once(uuid, text, bigint, jsonb, jsonb, text, text, text, text) from public;
grant execute on function public.gateway_realtime_settle_once(uuid, text, bigint, jsonb, jsonb, text, text, text, text) to service_role;
-- Keep the managed-chat app attribution trigger compatible with the
-- workspace_id schema used by gateway_requests, keys, and api_apps.
create unique index if not exists api_apps_workspace_id_app_key_key
  on public.api_apps (workspace_id, app_key);
create or replace function public.gateway_requests_attach_chat_app_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_name text;
  v_chat_app_key constant text := 'https://ai-stats.phaseo.app/chat';
  v_app_id uuid;
begin
  if new.app_id is not null then
    return new;
  end if;

  if new.workspace_id is null or new.key_id is null then
    return new;
  end if;

  select k.name into v_key_name
  from public.keys k
  where k.id = new.key_id
  limit 1;

  if coalesce(v_key_name, '') <> '__chat_route_managed_key__' then
    return new;
  end if;

  insert into public.api_apps (
    workspace_id,
    app_key,
    title,
    url,
    is_active,
    last_seen,
    updated_at,
    meta
  )
  values (
    new.workspace_id,
    v_chat_app_key,
    'AI Stats Chat',
    v_chat_app_key,
    true,
    coalesce(new.created_at, now()),
    now(),
    jsonb_build_object(
      'identityUrl', v_chat_app_key,
      'managed', true
    )
  )
  on conflict (workspace_id, app_key) do update
    set title = excluded.title,
        url = excluded.url,
        is_active = true,
        last_seen = greatest(public.api_apps.last_seen, excluded.last_seen),
        updated_at = now(),
        meta = coalesce(public.api_apps.meta, '{}'::jsonb) || excluded.meta
  returning id into v_app_id;

  new.app_id := v_app_id;
  return new;
end;
$$;
drop trigger if exists trg_gateway_requests_attach_chat_app_id on public.gateway_requests;
create trigger trg_gateway_requests_attach_chat_app_id
before insert or update of workspace_id, key_id, app_id
on public.gateway_requests
for each row
execute function public.gateway_requests_attach_chat_app_id();

