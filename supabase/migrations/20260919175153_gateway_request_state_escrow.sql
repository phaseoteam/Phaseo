-- Staging-only escrow. Ordinary wallets and charge RPCs keep their existing
-- ownership. No rows are enrolled by this migration.
create table public.gateway_request_state_allocations (
  workspace_id uuid primary key references public.workspaces(id),
  allocation_id uuid not null unique,
  cap_nanos bigint not null check (cap_nanos between 1 and 1000000000),
  spent_nanos bigint not null default 0 check (spent_nanos >= 0),
  held_nanos bigint not null default 0 check (held_nanos >= 0),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  check (spent_nanos + held_nanos <= cap_nanos)
);
create table public.gateway_request_state_events (
  workspace_id uuid not null references public.gateway_request_state_allocations(workspace_id),
  sequence bigint not null check (sequence > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, sequence)
);
create table public.gateway_request_state_reservations (
  workspace_id uuid not null references public.gateway_request_state_allocations(workspace_id),
  reservation_id text not null,
  payload jsonb not null,
  primary key (workspace_id, reservation_id)
);
alter table public.gateway_request_state_allocations enable row level security;
alter table public.gateway_request_state_events enable row level security;
alter table public.gateway_request_state_reservations enable row level security;
revoke all on public.gateway_request_state_allocations, public.gateway_request_state_events,
  public.gateway_request_state_reservations from public, anon, authenticated;
grant select, insert, update on public.gateway_request_state_allocations,
  public.gateway_request_state_events, public.gateway_request_state_reservations to service_role;

-- Reserving the whole allocation removes it from the legacy spendable balance.
-- It is not represented as a normal job hold that an orphan cleaner may release.
create function public.gateway_request_state_allocate(p_workspace_id uuid, p_allocation_id uuid, p_cap_nanos bigint)
returns public.gateway_request_state_allocations
language plpgsql security invoker set search_path = '' as $$
declare
  w public.wallets%rowtype;
  a public.gateway_request_state_allocations%rowtype;
begin
  if p_cap_nanos is null or p_cap_nanos < 1 or p_cap_nanos > 1000000000 then raise exception 'invalid_test_cap'; end if;
  select * into w from public.wallets where workspace_id = p_workspace_id for update;
  if not found then raise exception 'wallet_not_found'; end if;
  select * into a from public.gateway_request_state_allocations where workspace_id = p_workspace_id;
  if found then
    if a.allocation_id <> p_allocation_id or a.cap_nanos <> p_cap_nanos then raise exception 'allocation_conflict'; end if;
    return a;
  end if;
  if w.auto_top_up_enabled or w.balance_nanos <> p_cap_nanos or w.reserved_nanos <> 0 then
    raise exception 'test_wallet_must_have_exact_unreserved_allocation_and_no_auto_topup';
  end if;
  update public.wallets set reserved_nanos = reserved_nanos + p_cap_nanos, updated_at = now() where workspace_id = p_workspace_id;
  insert into public.gateway_request_state_allocations(workspace_id,allocation_id,cap_nanos)
    values(p_workspace_id,p_allocation_id,p_cap_nanos) returning * into a;
  insert into public.credit_ledger(workspace_id,kind,amount_nanos,before_balance_nanos,after_balance_nanos,
    before_reserved_nanos,after_reserved_nanos,ref_type,ref_id,status)
  values(p_workspace_id,'hold',0,w.balance_nanos,w.balance_nanos,0,p_cap_nanos,'request_state_allocation',p_allocation_id::text,'held');
  return a;
end $$;

-- Ordered, exactly-once projection: retries after a lost acknowledgment are safe.
-- A gap or payload conflict aborts the complete transaction, including the ledger.
create function public.gateway_request_state_project(p_event jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  a public.gateway_request_state_allocations%rowtype;
  w public.wallets%rowtype;
  previous jsonb;
  prior_event jsonb;
  r jsonb := p_event->'reservation';
  seq bigint := (p_event->>'sequence')::bigint;
  amount bigint := (r->>'amountNanos')::bigint;
  actual bigint := (r->>'actualNanos')::bigint;
  delta bigint := 0;
  held bigint;
  balance bigint;
begin
  select * into a from public.gateway_request_state_allocations
    where workspace_id = (p_event->>'workspaceId')::uuid for update;
  if not found or a.allocation_id::text is distinct from p_event->>'allocationId' then raise exception 'allocation_not_found'; end if;
  select payload into prior_event from public.gateway_request_state_events where workspace_id=a.workspace_id and sequence=seq;
  if found then
    if prior_event <> p_event then raise exception 'event_conflict'; end if;
    return seq;
  end if;
  if a.status <> 'active' or seq is null or seq <> a.last_sequence+1 then raise exception 'event_sequence_gap'; end if;
  if p_event->>'version' is distinct from '1' or r->>'id' is null or length(r->>'id') not between 1 and 256
    or amount is null or amount < 0 or amount > a.cap_nanos then raise exception 'invalid_event'; end if;
  select payload into previous from public.gateway_request_state_reservations
    where workspace_id=a.workspace_id and reservation_id=r->>'id';
  held := a.held_nanos;
  if r->>'status' = 'held' then
    if previous is not null or actual is not null then raise exception 'invalid_hold'; end if;
    held := held + amount;
  elsif r->>'status' in ('captured','released') then
    if previous is null or previous->>'status' <> 'held' or
      (previous - 'status' - 'actualNanos') <> (r - 'status' - 'actualNanos') then raise exception 'invalid_transition'; end if;
    if actual is null or actual < 0 or actual > amount or (r->>'status'='released' and actual<>0) then raise exception 'invalid_settlement'; end if;
    held := held - amount;
    delta := actual;
  else raise exception 'invalid_reservation_status';
  end if;
  balance := a.cap_nanos-a.spent_nanos-delta;
  if held < 0 or held > balance or balance < 0 or
    (p_event->>'balanceNanos')::bigint is distinct from balance or
    (p_event->>'reservedNanos')::bigint is distinct from held then raise exception 'projection_invariant'; end if;
  select * into w from public.wallets where workspace_id=a.workspace_id for update;
  if not found or w.balance_nanos < delta or w.reserved_nanos < a.cap_nanos-a.spent_nanos then raise exception 'escrow_fence_lost'; end if;
  if delta > 0 then
    update public.wallets set balance_nanos=balance_nanos-delta,reserved_nanos=reserved_nanos-delta,updated_at=now()
      where workspace_id=a.workspace_id;
  end if;
  insert into public.credit_ledger(workspace_id,kind,amount_nanos,before_balance_nanos,after_balance_nanos,
    before_reserved_nanos,after_reserved_nanos,ref_type,ref_id,status)
  values(a.workspace_id,case when r->>'status'='captured' then 'capture' when r->>'status'='released' then 'release' else 'hold' end,
    -delta,w.balance_nanos,w.balance_nanos-delta,w.reserved_nanos,w.reserved_nanos-delta,
    'request_state_event',a.allocation_id::text||':'||seq::text,r->>'status');
  insert into public.gateway_request_state_reservations values(a.workspace_id,r->>'id',r)
    on conflict(workspace_id,reservation_id) do update set payload=excluded.payload;
  insert into public.gateway_request_state_events(workspace_id,sequence,payload) values(a.workspace_id,seq,p_event);
  update public.gateway_request_state_allocations set spent_nanos=spent_nanos+delta,held_nanos=held,last_sequence=seq where workspace_id=a.workspace_id;
  return seq;
end $$;
revoke all on function public.gateway_request_state_allocate(uuid,uuid,bigint), public.gateway_request_state_project(jsonb) from public,anon,authenticated;
grant execute on function public.gateway_request_state_allocate(uuid,uuid,bigint), public.gateway_request_state_project(jsonb) to service_role;

-- Staging projections are intentionally separate from legacy operational rows:
-- production reconciliation must never claim the same staging job a second time.
create table public.gateway_request_state_rows (
  workspace_id uuid not null references public.gateway_request_state_allocations(workspace_id),
  collection text not null check (collection in ('gateway_async_operations','gateway_batch_requests',
    'gateway_batch_file_uploads','gateway_realtime_sessions','gateway_async_webhook_deliveries')),
  identity text not null,
  revision bigint not null check (revision > 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,collection,identity)
);
alter table public.gateway_request_state_rows enable row level security;
revoke all on public.gateway_request_state_rows from public, anon, authenticated;
grant select,insert,update on public.gateway_request_state_rows to service_role;
create function public.gateway_request_state_project_row(p_event jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare
  wid uuid := (p_event->'row'->>'workspace_id')::uuid;
  prior public.gateway_request_state_rows%rowtype;
  rev bigint := (p_event->>'revision')::bigint;
begin
  perform 1 from public.gateway_request_state_allocations where workspace_id=wid and status='active' for update;
  if not found then raise exception 'allocation_not_active'; end if;
  select * into prior from public.gateway_request_state_rows
    where workspace_id=wid and collection=p_event->>'table' and identity=p_event->>'identity';
  if found and prior.revision >= rev then
    if prior.revision=rev and prior.payload <> p_event->'row' then raise exception 'row_projection_conflict'; end if;
    return rev;
  end if;
  insert into public.gateway_request_state_rows(workspace_id,collection,identity,revision,payload)
    values(wid,p_event->>'table',p_event->>'identity',rev,p_event->'row')
    on conflict(workspace_id,collection,identity) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now();
  return rev;
end $$;
revoke all on function public.gateway_request_state_project_row(jsonb) from public,anon,authenticated;
grant execute on function public.gateway_request_state_project_row(jsonb) to service_role;

create table public.gateway_request_state_changes (
  workspace_id uuid primary key references public.gateway_request_state_allocations(workspace_id),
  revision bigint not null default 1,
  acknowledged_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.gateway_request_state_changes enable row level security;
revoke all on public.gateway_request_state_changes from public,anon,authenticated;
grant select,insert,update on public.gateway_request_state_changes to service_role;
create function public.gateway_request_state_ack_changes(p_workspace_id uuid,p_revision bigint)
returns void language sql security invoker set search_path='' as $$
  update public.gateway_request_state_changes set acknowledged_revision=greatest(acknowledged_revision,least(revision,p_revision)) where workspace_id=p_workspace_id;
$$;
revoke all on function public.gateway_request_state_ack_changes(uuid,bigint) from public,anon,authenticated;
grant execute on function public.gateway_request_state_ack_changes(uuid,bigint) to service_role;

-- Narrow trigger authority: client mutations can signal enrolled workspaces but
-- cannot read keys, enroll wallets, modify allocations or acknowledge delivery.
create function public.gateway_request_state_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  value jsonb;
  wid uuid;
  affected uuid[] := '{}';
  versions jsonb[];
begin
  if tg_level = 'STATEMENT' then
    insert into public.gateway_request_state_changes(workspace_id)
      select workspace_id from public.gateway_request_state_allocations where status='active'
      on conflict(workspace_id) do update set revision=gateway_request_state_changes.revision+1,updated_at=now();
    return null;
  end if;
  versions := case tg_op when 'INSERT' then array[to_jsonb(new)] when 'DELETE' then array[to_jsonb(old)] else array[to_jsonb(old),to_jsonb(new)] end;
  -- Moving a record invalidates both owners, not just its new workspace.
  foreach value in array versions loop
    wid := nullif(case when tg_table_name='workspaces' then value->>'id' else value->>'workspace_id' end,'')::uuid;
    if wid is null and value->>'key_id' is not null then
      select workspace_id into wid from public.keys where id=(value->>'key_id')::uuid;
    end if;
    if wid is not null and not (wid=any(affected)) and exists(select 1 from public.gateway_request_state_allocations where workspace_id=wid and status='active') then
      insert into public.gateway_request_state_changes(workspace_id) values(wid)
        on conflict(workspace_id) do update set revision=gateway_request_state_changes.revision+1,updated_at=now();
      affected := array_append(affected,wid);
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.gateway_request_state_changed() from public,anon,authenticated;
do $$
declare t text;
begin
  foreach t in array array['keys','workspaces','workspace_settings','workspace_members','workspace_member_guardrails','workspace_guardrails','key_guardrails','byok_keys','presets','gateway_dynamic_routes','gateway_dynamic_route_keys','workspace_budgets','gateway_async_webhook_endpoints'] loop
    if to_regclass('public.'||t) is not null then
      execute format('create trigger request_state_changed after insert or update or delete on public.%I for each row execute function public.gateway_request_state_changed()',t);
    end if;
  end loop;
  foreach t in array array['v2_models','v2_providers','v2_model_provider_routes','v2_route_capabilities','v2_pricing_skus','v2_pricing_sku_meters','v2_route_variants','v2_model_aliases'] loop
    if to_regclass('public.'||t) is not null then
      execute format('create trigger request_state_changed after insert or update or delete on public.%I for each statement execute function public.gateway_request_state_changed()',t);
    end if;
  end loop;
end $$;
