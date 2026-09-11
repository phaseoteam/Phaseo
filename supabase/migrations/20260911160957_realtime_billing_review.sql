begin;

create table public.gateway_realtime_billing_reviews (
  session_id text primary key references public.gateway_realtime_sessions(session_id),
  workspace_id uuid not null references public.workspaces(id),
  status text not null default 'open' check (status in ('open', 'resolved')),
  access_blocked boolean not null default true,
  version bigint not null default 1,
  opened_at timestamptz not null default now(),
  review_due_at timestamptz not null default now() + interval '1 day',
  retry_after timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  recovery_error text,
  evidence_usage jsonb,
  evidence_metadata jsonb,
  billable_usage jsonb,
  confirmed_cost_nanos bigint check (confirmed_cost_nanos >= 0),
  pricing_lines jsonb not null default '[]',
  evidence_complete boolean not null default false,
  resolved_at timestamptz,
  summary_synced_at timestamptz
);
create index on public.gateway_realtime_billing_reviews (retry_after) where status = 'open';
create index on public.gateway_realtime_billing_reviews (workspace_id) where access_blocked;
create table public.gateway_realtime_billing_decisions (
  operation_id uuid primary key default gen_random_uuid(),
  session_id text not null references public.gateway_realtime_billing_reviews(session_id),
  workspace_id uuid not null,
  actor_user_id text,
  action text not null,
  reason text not null,
  review_version bigint not null,
  cost_nanos bigint,
  created_at timestamptz not null default now()
);
create index on public.gateway_realtime_billing_decisions (session_id, created_at);
alter table public.gateway_realtime_billing_reviews enable row level security;
alter table public.gateway_realtime_billing_decisions enable row level security;
revoke all on public.gateway_realtime_billing_reviews, public.gateway_realtime_billing_decisions from public, anon, authenticated;
revoke all on public.gateway_realtime_billing_reviews, public.gateway_realtime_billing_decisions from service_role;
grant select on public.gateway_realtime_billing_reviews, public.gateway_realtime_billing_decisions to service_role;

create function public.gateway_realtime_review_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'billing_unresolved' then
    insert into public.gateway_realtime_billing_reviews (session_id, workspace_id, evidence_usage, evidence_metadata)
    values (new.session_id, new.workspace_id, new.usage, new.metadata) on conflict do nothing;
    if old.usage is distinct from new.usage or old.metadata is distinct from new.metadata then
      update public.gateway_realtime_billing_reviews set confirmed_cost_nanos = null,
        evidence_complete = false, version = version + 1, retry_after = now()
      where session_id = new.session_id and status = 'open';
    end if;
  elsif new.status in ('completed', 'failed', 'cancelled', 'expired') then
    insert into public.gateway_realtime_billing_decisions
      (session_id, workspace_id, action, reason, review_version, cost_nanos)
    select session_id, workspace_id, 'settled', coalesce(new.disconnect_reason, 'server_settlement'),
      version, new.final_cost_nanos
    from public.gateway_realtime_billing_reviews where session_id = new.session_id and status = 'open';
    update public.gateway_realtime_billing_reviews set status = 'resolved', resolved_at = now(), version = version + 1
    where session_id = new.session_id and status = 'open';
  end if;
  return new;
end $$;
create trigger realtime_billing_review_lifecycle after update of status, usage, metadata
on public.gateway_realtime_sessions for each row execute function public.gateway_realtime_review_lifecycle();

-- An incident stays an admission block after a write-off until an admin explicitly clears it.
create function public.gateway_realtime_review_admission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.wallets where workspace_id = new.workspace_id for update;
  if exists (select 1 from public.gateway_realtime_billing_reviews
    where workspace_id = new.workspace_id and access_blocked) then
    raise exception 'realtime_billing_review_required';
  end if;
  return new;
end $$;
create trigger realtime_billing_review_admission before insert on public.gateway_realtime_sessions
for each row execute function public.gateway_realtime_review_admission();

-- Backfill the queue only. This does not capture, release, or alter any existing hold.
insert into public.gateway_realtime_billing_reviews (session_id, workspace_id, evidence_usage, evidence_metadata)
select session_id, workspace_id, usage, metadata from public.gateway_realtime_sessions where status = 'billing_unresolved';

create function public.gateway_realtime_review_evidence(
  p_session_id text, p_expected_usage jsonb, p_expected_metadata jsonb,
  p_cost_nanos bigint, p_pricing_lines jsonb, p_complete boolean, p_error text, p_billable_usage jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.gateway_realtime_sessions%rowtype;
begin
  select * into v_session from public.gateway_realtime_sessions where session_id = p_session_id for update;
  if not found or v_session.status <> 'billing_unresolved'
    or v_session.usage is distinct from p_expected_usage
    or v_session.metadata is distinct from p_expected_metadata then return false; end if;
  update public.gateway_realtime_billing_reviews set evidence_usage = p_expected_usage,
    evidence_metadata = p_expected_metadata, confirmed_cost_nanos = p_cost_nanos,
    billable_usage = p_billable_usage,
    pricing_lines = coalesce(p_pricing_lines, '[]'), evidence_complete = coalesce(p_complete, false),
    recovery_error = left(p_error, 200), attempts = attempts + 1, last_attempt_at = now(),
    retry_after = now() + interval '1 day', version = version + 1
  where session_id = p_session_id and status = 'open';
  return found;
end $$;

create function public.gateway_realtime_review_decide(
  p_session_id text, p_actor_user_id text, p_operation_id uuid,
  p_expected_version bigint, p_action text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.gateway_realtime_sessions%rowtype;
  v_review public.gateway_realtime_billing_reviews%rowtype;
  v_previous public.gateway_realtime_billing_decisions%rowtype;
  v_settlement record;
  v_held bigint;
  v_cost bigint;
begin
  if not exists (select 1 from public.users where user_id::text = p_actor_user_id and lower(role::text) = 'admin') then
    raise exception 'realtime_review_forbidden';
  end if;
  if p_action is null or p_action not in ('retry', 'retain', 'capture_confirmed', 'write_off', 'restore_access')
    or p_operation_id is null or p_expected_version is null
    or p_reason is null or length(trim(p_reason)) < 10 or length(p_reason) > 1000 then
    raise exception 'realtime_review_invalid_decision';
  end if;
  select * into v_session from public.gateway_realtime_sessions where session_id = p_session_id;
  if not found then raise exception 'realtime_review_not_found'; end if;
  -- Match the existing settlement lock order: reservations, wallet, session, review.
  perform 1 from public.gateway_wallet_reservations r where r.workspace_id = v_session.workspace_id
    and r.status in ('held', 'reserved') and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%')
    order by r.created_at, r.reservation_id for update;
  perform 1 from public.wallets where workspace_id = v_session.workspace_id for update;
  select * into v_session from public.gateway_realtime_sessions where session_id = p_session_id for update;
  select * into v_review from public.gateway_realtime_billing_reviews where session_id = p_session_id for update;
  if not found then raise exception 'realtime_review_not_found'; end if;
  select * into v_previous from public.gateway_realtime_billing_decisions where operation_id = p_operation_id;
  if found then
    if v_previous.session_id <> p_session_id or v_previous.actor_user_id is distinct from p_actor_user_id
      or v_previous.action <> p_action or v_previous.reason <> trim(p_reason) then
      raise exception 'realtime_review_idempotency_conflict';
    end if;
    return jsonb_build_object('applied', false, 'already_applied', true);
  end if;
  if v_review.version <> p_expected_version then raise exception 'realtime_review_stale'; end if;
  if p_action = 'restore_access' then
    if v_review.status <> 'resolved' then raise exception 'realtime_review_still_open'; end if;
    update public.gateway_realtime_billing_reviews set access_blocked = false, version = version + 1 where session_id = p_session_id;
  else
    if v_review.status <> 'open' or v_session.status <> 'billing_unresolved' then raise exception 'realtime_review_closed'; end if;
    if p_action in ('retry', 'retain') then
      if p_action = 'retain' and now() >= v_review.opened_at + interval '7 days' then
        raise exception 'realtime_review_retention_limit';
      end if;
      update public.gateway_realtime_billing_reviews set
        retry_after = case when p_action = 'retry' then now() else retry_after end,
        review_due_at = case when p_action = 'retain' then least(now() + interval '1 day', opened_at + interval '7 days') else review_due_at end,
        version = version + 1 where session_id = p_session_id;
    else
      v_cost := 0;
      if p_action = 'capture_confirmed' then
        if v_review.confirmed_cost_nanos is null or v_review.billable_usage is null
          or v_review.evidence_usage is distinct from v_session.usage
          or v_review.evidence_metadata is distinct from v_session.metadata then raise exception 'realtime_review_evidence_missing'; end if;
        v_cost := v_review.confirmed_cost_nanos;
      end if;
      select coalesce(sum(amount_nanos), 0) into v_held from public.gateway_wallet_reservations r
      where r.workspace_id = v_session.workspace_id and r.status in ('held', 'reserved')
        and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%');
      if v_cost > v_held then raise exception 'realtime_review_cost_exceeds_hold'; end if;
      if p_action = 'write_off' then
        update public.gateway_realtime_billing_reviews set evidence_usage = v_session.usage, evidence_metadata = v_session.metadata
        where session_id = p_session_id;
      end if;
      select * into v_settlement from public.gateway_realtime_settle_once(v_session.workspace_id, p_session_id,
        v_cost, case when p_action = 'capture_confirmed' then v_review.billable_usage else '{}'::jsonb end,
        case when p_action = 'capture_confirmed' then v_review.pricing_lines else '[]'::jsonb end,
        'failed', 'billing_review_' || p_action, 'billing_review_resolved', null);
      if not coalesce(v_settlement.applied, false) then raise exception 'realtime_review_settlement_failed'; end if;
    end if;
  end if;
  insert into public.gateway_realtime_billing_decisions
    (operation_id, session_id, workspace_id, actor_user_id, action, reason, review_version, cost_nanos)
  values (p_operation_id, p_session_id, v_session.workspace_id, p_actor_user_id, p_action, trim(p_reason), v_review.version, v_cost);
  return jsonb_build_object('applied', true, 'already_applied', false);
end $$;

revoke all on function public.gateway_realtime_review_lifecycle(), public.gateway_realtime_review_admission() from public, anon, authenticated;
revoke all on function public.gateway_realtime_review_evidence(text,jsonb,jsonb,bigint,jsonb,boolean,text,jsonb) from public, anon, authenticated;
revoke all on function public.gateway_realtime_review_decide(text,text,uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.gateway_realtime_review_evidence(text,jsonb,jsonb,bigint,jsonb,boolean,text,jsonb) to service_role;
grant execute on function public.gateway_realtime_review_decide(text,text,uuid,bigint,text,text) to service_role;

create function public.gateway_realtime_review_summary_synced(p_session_id text) returns void
language sql security definer set search_path = '' as $$
  update public.gateway_realtime_billing_reviews set summary_synced_at = now()
  where session_id = p_session_id and status = 'resolved';
$$;
revoke all on function public.gateway_realtime_review_summary_synced(text) from public, anon, authenticated;
grant execute on function public.gateway_realtime_review_summary_synced(text) to service_role;

commit;
