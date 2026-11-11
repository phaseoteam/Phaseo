SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.unbilled_spend (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[]                   DEFAULT NULL::uuid[],
  p_exclude_request_ids text[]                   DEFAULT '{}'::text[],
  p_exclude_charge_ids  text[]                   DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    kind               text,
    billing_request_id text,
    key_id             uuid,
    at                 timestamp with time zone,
    nanos              bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Spend that budgets and key caps count from money movements rather than from a request row's
  -- cost, one row per movement, by billing request id. p_key_ids limits the rows to those keys
  -- (NULL: the whole workspace); p_since (NULL: all time) is the earliest window the caller counts.
  --
  -- Money movements win: a request's spend is its movements, each at its own time, and its audit
  -- cost_nanos only when it has none. The request readers (private.budget_spend_items,
  -- private.key_spend_items) leave out the cost of the rows these movements replace:
  --   (a) a request charged in steps (adjustment ledger rows from gateway_charge_request_total);
  --   (b) a row pending reconciliation whose gateway_request_charges row was applied. Pending:
  --       expected_cost_nanos is set, or, for a row written before the deploy's marker
  --       (private.pending_json_cutoff(), set when this release's migrations ran, plus the time
  --       old Workers take to drain), detail_metadata.accounting_finalization.billing_status is
  --       'pending_reconciliation'. Older gateway code flagged pending rows only in that JSON; the
  --       gateway now always sets expected_cost_nanos on them. The marker is read once per
  --       statement, and created_at is compared before the JSON, so newer rows never read
  --       detail_metadata.
  --   (c) a batch's batch_usage rows once the batch is debited, and its batch_hold_usage
  --       placeholders once its hold has settled.
  --   (d) a realtime session's summary row (gateway_requests.realtime_session_id), always.
  --
  -- The SpendLimit Durable Object counts an admission it still holds from memory and lists both
  -- its ids: p_exclude_charge_ids leaves out charge rows by billing request id
  -- (gateway_request_charges.request_id), p_exclude_request_ids request rows by request id.
  -- Unmatched charges before 2026-11-04 00:00 UTC are left out: request rows recorded
  -- billing_request_id only from 2026-11-03 14:43 UTC, so an older charge's request row cannot be
  -- matched and already counts. A charge matched by billing id counts at any date: for a pending
  -- audit row the request readers leave that row's cost out (rule b), so the charge is its only
  -- count; for failure rows that under-record it (below), only the shortfall counts.
  --
  -- A charge is attributed to gateway_request_charges.key_id, or, when that is NULL (charges written
  -- before the column, and by older gateway code during a deploy, which does not pass p_key_id), to
  -- the key on its request row (by billing request id) or, for a batch capture, to the batch job's
  -- meta.apiKeyId (gateway_async_operations). A charge with no key anywhere counts toward the
  -- workspace only. The stepped and batch lookups run only for a charge without a key.
  --
  -- * 'stepped': every adjustment ledger row of a request charged in steps (rule a), debits and
  --   refunds, at its time.
  -- * 'charge': a one-off charge (no adjustment rows) at its time: whole while its request row has
  --   not landed or one is pending reconciliation (rule b); otherwise, when none of its rows
  --   succeeded, what its rows' cost (which the request readers count) falls short of it. A Worker
  --   older than the lost-charge fix wrote a failure after a confirmed debit with no cost, and
  --   that stored row would otherwise hide the debit. Its rows are read once per charge, by
  --   #3633's (workspace_id, billing_request_id) index, including held ones, whose cost the
  --   coordinator counts from memory.
  -- * 'batch': a batch's debit, whole, at its time (rule c): a batch_capture:<batch> charge, or a
  --   reserved batch's async_job_charge ledger row (gateway_wallet_settle_once).
  -- * 'video': a reserved video's async_job_charge debit, whole, at its time (settled or captured
  --   from its video_hold reservation): its captured hold and its audit row's cost stop counting,
  --   so the spend is dated when the money moved, not when the video was submitted.
  -- Batch and video debits are matched by batch or reservation id, not billing id, so the
  -- 2026-11-04 cut-off for charge rows does not apply to them.
  -- * 'realtime': a realtime session's realtime_session ledger debits, each at its time (the
  --   confirmed part captured at billing review, <session>:confirmed:<n>, and the charge at
  --   settlement), to the session's key; and, when the session ended (settlement sets ended_at),
  --   what its summary row's cost (the full priced cost, any uncollected part included) exceeds the
  --   session's captured_nanos, the sum of those debits. The summary row is dated when the session
  --   started, so counting it whole put a session that crossed a period boundary in the earlier
  --   period. The request readers leave its cost out (rule d), so a session counts
  --   greatest(summary cost, debits), once. While a session runs its holds count instead
  --   (private.budget_spend_items). The summary row is found by its unique
  --   (realtime_session_id, created_at) index.
  -- * 'unpaid': what a delivered request with an expected bill (expected_cost_nanos) has not had
  --   counted yet, per billing request id, at the time of its row with the largest expected
  --   amount: greatest(max(expected_cost_nanos) - counted, 0). Counted is its applied charge (one-off
  --   or stepped total) when it has one, whose rows the request readers then leave out (rule b);
  --   otherwise its rows' own cost, which they count. So a delivered request whose charge never
  --   applied still counts its expected bill, the audit cost is never counted twice, and a bill of 0
  --   counts 0. Rows without a billing request id stand alone, by request id.
  select 'stepped'::text, charge.request_id, coalesce(charge.key_id, audited.key_id), movement.created_at, -movement.amount_nanos
  from public.credit_ledger movement
  join public.gateway_request_charges charge
    on charge.workspace_id = movement.workspace_id
    and charge.request_id = movement.source_ref_id
  left join lateral (
    select request.key_id
    from public.gateway_requests request
    where charge.key_id is null
      and request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
      and request.key_id is not null
    limit 1
  ) audited on true
  where movement.workspace_id = p_workspace_id
    and movement.ref_type = 'gateway_request_charge'
    and movement.source_ref_type = 'gateway_request'
    and movement.status = 'applied'
    and movement.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and (p_key_ids is null or coalesce(charge.key_id, audited.key_id) = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'charge'::text, charge.request_id, coalesce(charge.key_id, audit.key_id), charge.created_at,
    case when audit.found and not audit.pending then charge.cost_nanos - audit.row_cost else charge.cost_nanos end
  from public.gateway_request_charges charge
  left join lateral (
    select count(*) > 0 as found,
      coalesce(bool_or(request.success is true), false) as succeeded,
      coalesce(bool_or(request.expected_cost_nanos is not null
        or (request.created_at < (select private.pending_json_cutoff())
            and coalesce(request.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false))), false) as pending,
      coalesce(sum(greatest(coalesce(request.cost_nanos, 0), 0)), 0) as row_cost,
      (array_agg(request.key_id) filter (where request.key_id is not null))[1] as key_id
    from public.gateway_requests request
    where request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
  ) audit on true
  left join lateral (
    select 1 as found
    from public.credit_ledger movement
    where movement.source_ref_type = 'gateway_request'
      and movement.source_ref_id = charge.request_id
      and movement.workspace_id = charge.workspace_id
      and movement.ref_type = 'gateway_request_charge'
    limit 1
  ) stepped on true
  where charge.workspace_id = p_workspace_id
    and charge.status = 'applied'
    and charge.cost_nanos > 0
    and charge.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and (charge.created_at >= '2026-11-04 00:00:00+00'::timestamptz or audit.found)
    and not starts_with(charge.request_id, 'batch_capture:')
    and (not audit.found or audit.pending or (not audit.succeeded and charge.cost_nanos > audit.row_cost))
    and stepped.found is null
    and (p_key_ids is null or coalesce(charge.key_id, audit.key_id) = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'batch'::text, charge.request_id, coalesce(charge.key_id, job.key_id), charge.created_at, charge.cost_nanos
  from public.gateway_request_charges charge
  left join lateral (
    select case when job.meta ->> 'apiKeyId' ~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
      then (job.meta ->> 'apiKeyId')::uuid end as key_id
    from public.gateway_async_operations job
    where charge.key_id is null
      and job.workspace_id = charge.workspace_id
      and job.kind = 'batch'
      and job.internal_id = substr(charge.request_id, 15)
    limit 1
  ) job on true
  where charge.workspace_id = p_workspace_id
    and starts_with(charge.request_id, 'batch_capture:')
    and charge.status = 'applied'
    and charge.cost_nanos > 0
    and charge.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and (p_key_ids is null or coalesce(charge.key_id, job.key_id) = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select case when starts_with(debit.ref_id, p_workspace_id::text || ':video_hold:') then 'video' else 'batch' end,
    debit.ref_id, hold.key_id, debit.created_at, -debit.amount_nanos
  from public.credit_ledger debit
  join public.gateway_wallet_reservations hold
    on hold.workspace_id = debit.workspace_id
    and hold.reservation_id = substr(debit.ref_id, length(debit.workspace_id::text) + 2)
  where debit.workspace_id = p_workspace_id
    and debit.ref_type = 'async_job_charge'
    and (starts_with(debit.ref_id, p_workspace_id::text || ':batch_hold:')
      or starts_with(debit.ref_id, p_workspace_id::text || ':video_hold:'))
    and debit.amount_nanos < 0
    and debit.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and (p_key_ids is null or hold.key_id = any (p_key_ids))
  union all
  select 'realtime'::text, debit.ref_id, session.key_id, debit.created_at, -debit.amount_nanos
  from public.credit_ledger debit
  left join public.gateway_realtime_sessions session
    on session.session_id = case when strpos(debit.ref_id, ':confirmed:') > 0
      then left(debit.ref_id, strpos(debit.ref_id, ':confirmed:') - 1) else debit.ref_id end
  where debit.workspace_id = p_workspace_id
    and debit.ref_type = 'realtime_session'
    and debit.amount_nanos < 0
    and debit.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and (p_key_ids is null or session.key_id = any (p_key_ids))
  union all
  select 'realtime'::text, session.session_id, coalesce(summary.key_id, session.key_id),
    coalesce(session.ended_at, session.started_at), summary.cost_nanos - coalesce(session.captured_nanos, 0)
  from public.gateway_realtime_sessions session
  join public.gateway_requests summary
    on summary.realtime_session_id = session.session_id
    and summary.created_at = session.started_at
  where session.workspace_id = p_workspace_id
    and coalesce(session.ended_at, session.started_at) >= coalesce(p_since, '-infinity'::timestamptz)
    and summary.workspace_id = p_workspace_id
    -- Bound the realtime index scan before the merge join; ordinary requests have NULL here.
    and summary.realtime_session_id is not null
    and summary.cost_nanos > coalesce(session.captured_nanos, 0)
    and (p_key_ids is null or coalesce(summary.key_id, session.key_id) = any (p_key_ids))
  union all
  select 'unpaid'::text, owed.billing_request_id, owed.key_id, owed.at, owed.nanos
  from (
    select pending.billing_request_id, pending.key_id, pending.at,
      pending.expected - coalesce(charge.cost_nanos, pending.row_cost) as nanos
    from (
      select coalesce(request.billing_request_id, request.request_id) as billing_request_id,
        bool_or(request.billing_request_id is not null) as has_billing_id,
        (array_agg(request.key_id order by request.expected_cost_nanos desc, request.created_at))[1] as key_id,
        (array_agg(request.created_at order by request.expected_cost_nanos desc, request.created_at))[1] as at,
        max(request.expected_cost_nanos) as expected,
        sum(greatest(coalesce(request.cost_nanos, 0), 0)) as row_cost
      from public.gateway_requests request
      where request.workspace_id = p_workspace_id
        and request.expected_cost_nanos is not null
        and (p_key_ids is null or request.key_id = any (p_key_ids))
        and request.created_at >= coalesce(p_since, '-infinity'::timestamptz)
        and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
      group by coalesce(request.billing_request_id, request.request_id)
    ) pending
    left join public.gateway_request_charges charge
      on pending.has_billing_id
      and charge.workspace_id = p_workspace_id
      and charge.request_id = pending.billing_request_id
      and charge.status = 'applied'
  ) owed
  where owed.nanos > 0;
$function$;

CREATE OR REPLACE FUNCTION public.sweep_spend_limit_warnings (
  p_now timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Warns once when a workspace budget or an active API key's limit is about 80% used in its
-- current period, as a money push: owners and admins hear about it, and for a key limit so does
-- the key's creator. Usage is what the gateway enforces, up to p_now: private.budget_spend_items
-- for workspace budgets and private.key_spend_items for keys, so money movements win (a request
-- charged in steps counts its movements, a delivered request pending reconciliation its charge and
-- what remains uncollected, a debited batch its debit). Nothing is sent for a limit already reached
-- this period (record_spend_limit_reached), or one at 100% or more: the gateway blocks the next
-- request and that alert follows. Weekly and
-- monthly warnings say when the limit runs out at the period's pace so far, if that is before
-- the period ends. One event per budget or key limit, period and limit value, so a limit raised
-- mid-period can warn again. Only workspaces with a budget or a limited key are read.
declare
  v_day timestamptz := (private.spend_limit_period('daily', p_now)).period_start;
  v_week timestamptz := (private.spend_limit_period('weekly', p_now)).period_start;
  v_month timestamptz := (private.spend_limit_period('monthly', p_now)).period_start;
  v_budgets integer;
  v_keys integer;
  v_warned integer;
begin
  if p_now is null then
    raise exception 'invalid_spend_limit_sweep_time';
  end if;

  select count(*) into v_budgets from public.workspace_budgets;
  select count(*) into v_keys
  from public.keys k
  where k.status = 'active'
    and greatest(k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
      k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos) > 0;
  if v_budgets = 0 and v_keys = 0 then
    return jsonb_build_object('budgets', 0, 'limitedKeys', 0, 'warned', 0);
  end if;

  with limited_keys as (
    select k.id, k.workspace_id, k.name, k.created_by,
      k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
      k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
    from public.keys k
    where k.status = 'active'
      and greatest(k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
        k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos) > 0
  ),
  key_limits as materialized (
    -- Once warned or reached, this limit cannot warn again until its period or value changes.
    -- Exclude it before reading spend, rather than repeating that work every quarter hour.
    select k.*, l.time_window, l.metric, l.limit_value, p.period_start
    from limited_keys k
    cross join lateral (values
      ('daily', 'requests', k.daily_limit_requests),
      ('weekly', 'requests', k.weekly_limit_requests),
      ('monthly', 'requests', k.monthly_limit_requests),
      ('daily', 'cost', k.daily_limit_cost_nanos),
      ('weekly', 'cost', k.weekly_limit_cost_nanos),
      ('monthly', 'cost', k.monthly_limit_cost_nanos)
    ) l(time_window, metric, limit_value)
    cross join lateral private.spend_limit_period(l.time_window, p_now) p
    where l.limit_value > 0
      and not exists (
        select 1 from public.workspace_notification_events e
        where e.dedupe_key in (
          'key_limit_warning:key:' || k.id || ':' || l.metric || ':' || l.time_window || ':' || to_char(p.period_start at time zone 'UTC', 'YYYY-MM-DD') || ':' || l.limit_value,
          'key_limit_reached:key:' || k.id || ':' || l.metric || ':' || l.time_window || ':' || to_char(p.period_start at time zone 'UTC', 'YYYY-MM-DD') || ':' || l.limit_value
        )
      )
  ),
  key_windows as (
    select k.workspace_id, array_agg(distinct k.id) as key_ids, min(k.period_start) as since
    from key_limits k
    group by k.workspace_id
  ),
  key_usage as materialized (
    -- One spend read per workspace, only as far back as an unnotified limit needs.
    select
      u.key_id,
      count(*) filter (where u.served and u.at >= v_day) as day_requests,
      count(*) filter (where u.served and u.at >= v_week) as week_requests,
      count(*) filter (where u.served and u.at >= v_month) as month_requests,
      coalesce(sum(u.nanos) filter (where u.at >= v_day), 0) as day_cost,
      coalesce(sum(u.nanos) filter (where u.at >= v_week), 0) as week_cost,
      coalesce(sum(u.nanos) filter (where u.at >= v_month), 0) as month_cost
    from key_windows w
    cross join lateral private.key_spend_items(w.workspace_id, w.since, w.key_ids) u
    where u.at <= p_now
    group by u.key_id
  ),
  limits as (
    select
      b.workspace_id, null::uuid as key_id, null::text as key_name, null::uuid as key_created_by,
      'budget_warning' as kind, 'budget:' || b.id as subject, b.interval as time_window, 'cost' as metric,
      b.limit_nanos::numeric as limit_value,
      (
        -- Active holds count in every period, as the gateway's budget check counts them.
        select coalesce(sum(item.nanos), 0)
        from private.budget_spend_items(b.workspace_id, (private.spend_limit_period(b.interval, p_now)).period_start) item
        where (item.active or item.at >= coalesce((private.spend_limit_period(b.interval, p_now)).period_start, '-infinity'::timestamptz))
          and item.at <= p_now
      )::numeric as used
    from public.workspace_budgets b
    union all
    select
      k.workspace_id, k.id, k.name, k.created_by,
      'key_limit_warning', 'key:' || k.id || ':' || k.metric, k.time_window, k.metric,
      k.limit_value::numeric,
      case k.metric when 'requests' then
        case k.time_window when 'daily' then coalesce(ku.day_requests, 0) when 'weekly' then coalesce(ku.week_requests, 0) else coalesce(ku.month_requests, 0) end
      else
        case k.time_window when 'daily' then coalesce(ku.day_cost, 0) when 'weekly' then coalesce(ku.week_cost, 0) else coalesce(ku.month_cost, 0) end
      end
    from key_limits k
    left join key_usage ku on ku.key_id = k.id
  ),
  due as (
    select
      l.*,
      p.period_start,
      p.reset_at,
      coalesce(to_char(p.period_start at time zone 'UTC', 'YYYY-MM-DD'), 'lifetime') || ':' || l.limit_value as period_key,
      case
        when l.time_window in ('weekly', 'monthly') and l.used > 0
          and p.period_start + (p_now - p.period_start) * (l.limit_value / l.used)::double precision < p.reset_at
          then p.period_start + (p_now - p.period_start) * (l.limit_value / l.used)::double precision
      end as runs_out_at,
      case when l.key_name is null then null
        when char_length(l.key_name) > 40 then '''' || left(l.key_name, 39) || '…'''
        else '''' || l.key_name || ''''
      end as quoted_key,
      case l.time_window when 'daily' then ' so far today.' when 'weekly' then ' so far this week.' when 'monthly' then ' so far this month.' else ' in total.' end as so_far
    from limits l
    cross join lateral private.spend_limit_period(l.time_window, p_now) p
    where l.used >= 0.8 * l.limit_value
      and l.used < l.limit_value
  ),
  inserted as (
    insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, key_id, key_created_by, payload, occurred_at)
    select
      d.workspace_id,
      d.kind,
      'money',
      d.kind || ':' || d.subject || ':' || d.time_window || ':' || d.period_key,
      d.key_id,
      d.key_created_by,
      jsonb_build_object(
        'push', jsonb_build_object(
          'title', case when d.kind = 'budget_warning'
            then 'About 80% of the ' || d.time_window || ' budget used'
            else 'API key ' || d.quoted_key || ' is at about 80% of its ' || d.time_window || ' limit' end,
          'body', case when d.metric = 'cost'
              then private.spend_limit_amount('cost', d.used) || ' of ' || private.spend_limit_amount('cost', d.limit_value)
              else to_char(d.used, 'FM999,999,999,990') || ' of ' || private.spend_limit_amount('requests', d.limit_value) end
            || d.so_far
            || coalesce(' At this pace it runs out around ' || to_char(d.runs_out_at at time zone 'UTC', 'Mon FMDD') || '.', ''),
          'href', case when d.kind = 'budget_warning' then '/settings/usage/overview' else '/settings/keys' end,
          'lowerLead', d.kind = 'budget_warning'
        ),
        'window', d.time_window, 'metric', d.metric, 'limit', d.limit_value, 'used', d.used,
        'periodStart', d.period_start, 'resetAt', d.reset_at, 'runsOutAt', d.runs_out_at
      ),
      p_now
    from due d
    where not exists (
      select 1 from public.workspace_notification_events e
      where e.dedupe_key = replace(d.kind, '_warning', '_reached') || ':' || d.subject || ':' || d.time_window || ':' || d.period_key
    )
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::integer into v_warned from inserted;

  return jsonb_build_object('budgets', v_budgets, 'limitedKeys', v_keys, 'warned', v_warned);
end;
$function$;
