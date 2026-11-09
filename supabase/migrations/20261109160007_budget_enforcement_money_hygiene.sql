SET LOCAL lock_timeout = '10s';

-- Functions only: no table is locked here. The table changes that go with them are in the
-- migrations that follow, one table each (20261109160008 to 20261109160012).
--
-- Budget enforcement and money hygiene:
-- 1. Money movements win: a request's spend is its money movements, each at its own time, and its
--    audit cost_nanos only when it has none (private.unbilled_spend). A request charged in steps
--    counts its adjustment ledger rows; a request pending reconciliation (expected_cost_nanos set,
--    or billing_status pending_reconciliation) with an applied charge counts that charge plus
--    greatest(expected - charged, 0); a debited batch counts its debit, not its placeholders or
--    rows. One budget calculation, private.budget_spend_items (requests, holds, money movements),
--    serves workspace and department budgets and the spend-limit seed; one key calculation,
--    private.key_spend_items, serves both request-context key checks, hold admission
--    (gateway_wallet_reserve_once_without_workspace_budget), the seed's key usage and the 80%
--    warnings (sweep_spend_limit_warnings) and blocking spend guardrail counters
--    (private.spend_guardrail_usage, phase D), which now read what the gateway enforces rather than
--    the hourly rollup. Charged requests that did not succeed count toward cost; request counts
--    stay successful requests only. The indexes these reads use are built by the migrations just
--    before this one.
-- 2. gateway_department_budget_status gates batch and video holds (gateway_wallet_reserve_once),
--    realtime sessions (gateway_realtime_create_with_hold, gateway_realtime_extend_hold_once) and
--    the request-context fallback (gateway_fetch_request_context, gateway_fetch_request_context_bundle),
--    which also return the budgets that apply below their limit so the gateway does not cache them.
-- 3. gateway_wallet_reserve_once no longer row-locks workspace_budgets after the workspace
--    advisory lock (lock_workspace_budget_change takes them in the other order).
-- 4. deduct_and_check_top_up raises wallet_not_found instead of returning it, so the charge is not
--    recorded as applied.
-- 5. Drops public.wallet_apply_delta (no callers).
-- 6. The stale-hold reaper also releases video holds whose operation is missing, failed or cancelled,
--    or completed and billed, a day after the hold. This migration releases nothing itself.


-- gateway_spend_limit_seed gains p_contract_version (DEFAULT 1). The three-argument version on main
-- is dropped first, so a coordinator still calling it with three named arguments (during the
-- deploy) resolves to the new function, with contract version 1, instead of an ambiguous overload.
DROP FUNCTION IF EXISTS public.gateway_spend_limit_seed(uuid, uuid[], text[]);

CREATE OR REPLACE FUNCTION private.unbilled_spend (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[] DEFAULT NULL::uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_exclude_charge_ids  text[] DEFAULT '{}'::text[]
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
  --
  -- The SpendLimit Durable Object counts an admission it still holds from memory and lists both
  -- its ids: p_exclude_charge_ids leaves out charge rows by billing request id
  -- (gateway_request_charges.request_id), p_exclude_request_ids request rows by request id.
  -- Unmatched charges before 2026-11-04 00:00 UTC are left out: request rows recorded
  -- billing_request_id only from 2026-11-03 14:43 UTC, so an older charge's request row cannot be
  -- matched and already counts. A charge matched by billing id to a pending audit row counts at any
  -- date: the request readers leave that row's cost out (rule b), so the charge is its only count.
  --
  -- A charge is attributed to gateway_request_charges.key_id, or, when that is NULL (charges written
  -- before the column, and by older gateway code during a deploy, which does not pass p_key_id), to
  -- the key on its request row (by billing request id) or, for a batch capture, to the batch job's
  -- meta.apiKeyId (gateway_async_operations). A charge with no key anywhere counts toward the
  -- workspace only. The lookups run only for a charge without a key.
  --
  -- * 'stepped': every adjustment ledger row of a request charged in steps (rule a), debits and
  --   refunds, at its time.
  -- * 'charge': a one-off charge (no adjustment rows) at its time, while its request row has not
  --   landed or one is pending reconciliation (rule b), each found per charge with LIMIT 1 on
  --   #3534's (workspace_id, billing_request_id) index.
  -- * 'batch': a batch's debit, whole, at its time (rule c): a batch_capture:<batch> charge, or a
  --   reserved batch's async_job_charge ledger row (gateway_wallet_settle_once).
  -- * 'video': a reserved video's async_job_charge debit, whole, at its time (settled or captured
  --   from its video_hold reservation): its captured hold and its audit row's cost stop counting,
  --   so the spend is dated when the money moved, not when the video was submitted.
  -- Batch and video debits are matched by batch or reservation id, not billing id, so the
  -- 2026-11-04 cut-off for charge rows does not apply to them.
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
  select 'charge'::text, charge.request_id, coalesce(charge.key_id, pending.key_id), charge.created_at, charge.cost_nanos
  from public.gateway_request_charges charge
  left join lateral (
    select 1 as found
    from public.gateway_requests request
    where request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
    limit 1
  ) audit on true
  left join lateral (
    select 1 as found, request.key_id
    from public.gateway_requests request
    where request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
      and (request.expected_cost_nanos is not null
        or (request.created_at < (select private.pending_json_cutoff())
            and coalesce(request.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
    limit 1
  ) pending on true
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
    and (charge.created_at >= '2026-11-04 00:00:00+00'::timestamptz or pending.found is not null)
    and not starts_with(charge.request_id, 'batch_capture:')
    and (audit.found is null or pending.found is not null)
    and stepped.found is null
    and (p_key_ids is null or coalesce(charge.key_id, pending.key_id) = any (p_key_ids))
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

COMMENT ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'Spend counted toward budgets and key caps from money movements, each at its time: adjustment ledger rows of requests charged in steps, one-off charges whose request row has not landed or is pending reconciliation, batch debits, and what a delivered request with an expected bill has not had counted (its applied charge, or else the cost of its own rows). Charge rows the SpendLimit Durable Object holds are excluded by billing request id, request rows by request id.';

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";

-- private.gateway_context_access runs as its caller (service_role, through
-- gateway_fetch_request_context_bundle) and reads this.
GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "service_role";

CREATE OR REPLACE FUNCTION private.key_spend_items (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_exclude_charge_ids  text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    key_id uuid,
    at     timestamp with time zone,
    served boolean,
    nanos  bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- What API key limits count for p_key_ids since p_since (NULL: all time), one row per item: the
  -- one key usage calculation behind both request-context key checks, hold admission, the
  -- spend-limit seed and the 80% warnings. Request limits count served rows; cost limits sum nanos.
  -- The SpendLimit Durable Object lists the ids of admissions it holds (see private.unbilled_spend).
  --
  -- * Successful requests: a request each, and their cost unless money movements replace it.
  -- * Charged requests that did not succeed: cost only, unless movements replace it.
  -- Movements replace a row charged in steps, a row pending reconciliation with an applied charge,
  -- a debited batch's batch_usage rows and a settled hold's placeholders (private.unbilled_spend).
  -- * Money movements (private.unbilled_spend), cost only, each at its time.
  -- The replacement checks are the same as private.budget_spend_items', per row through index
  -- lookups.
  select served.key_id, served.created_at, true,
    case when (served.billing_request_id is not null and (
        exists (
          select 1 from public.credit_ledger movement
          where movement.source_ref_type = 'gateway_request'
            and movement.source_ref_id = served.billing_request_id
            and movement.workspace_id = served.workspace_id
            and movement.ref_type = 'gateway_request_charge')
        or ((served.expected_cost_nanos is not null
            or (served.created_at < (select private.pending_json_cutoff())
            and coalesce(served.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
          and exists (
            select 1 from public.gateway_request_charges charge
            where charge.workspace_id = served.workspace_id
              and charge.request_id = served.billing_request_id
              and charge.status = 'applied'))))
      or (starts_with(served.request_id, 'batch_usage:') and (
        exists (
          select 1 from public.gateway_request_charges capture
          where capture.workspace_id = served.workspace_id
            and capture.request_id = 'batch_capture:' || split_part(served.request_id, ':', 2)
            and capture.status = 'applied')
        or exists (
          select 1 from public.credit_ledger debit
          where debit.source_ref_type = 'async_job'
            and debit.source_ref_id = split_part(served.request_id, ':', 2)
            and debit.workspace_id = served.workspace_id
            and debit.ref_type = 'async_job_charge')))
      or (served.endpoint = 'video.generation' and exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = served.workspace_id::text || ':video_hold:' || served.request_id))
      or (starts_with(served.request_id, 'batch_hold_usage:') and exists (
        select 1 from public.gateway_wallet_reservations hold
        where hold.workspace_id = served.workspace_id
          and hold.reservation_id = regexp_replace(substr(served.request_id, 18), ':[^:]*$', '')
          and hold.status not in ('held', 'reserved')))
    then 0 else coalesce(served.cost_nanos, 0) end
  from public.gateway_requests served
  where served.key_id = any (p_key_ids)
    and served.workspace_id = p_workspace_id
    and served.success is true
    and served.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (served.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
  union all
  select charged.key_id, charged.created_at, false, charged.cost_nanos
  from public.gateway_requests charged
  where charged.workspace_id = p_workspace_id
    and charged.key_id = any (p_key_ids)
    and charged.success is not true
    and charged.cost_nanos > 0
    and charged.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (charged.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
    and not (charged.endpoint = 'video.generation' and exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = charged.workspace_id::text || ':video_hold:' || charged.request_id))
    and not (charged.billing_request_id is not null and (
      exists (
        select 1 from public.credit_ledger movement
        where movement.source_ref_type = 'gateway_request'
          and movement.source_ref_id = charged.billing_request_id
          and movement.workspace_id = charged.workspace_id
          and movement.ref_type = 'gateway_request_charge')
      or ((charged.expected_cost_nanos is not null
          or (charged.created_at < (select private.pending_json_cutoff())
            and coalesce(charged.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
        and exists (
          select 1 from public.gateway_request_charges charge
          where charge.workspace_id = charged.workspace_id
            and charge.request_id = charged.billing_request_id
            and charge.status = 'applied'))))
  union all
  select unbilled.key_id, unbilled.at, false, unbilled.nanos
  from private.unbilled_spend(p_workspace_id, p_since, p_key_ids, p_exclude_request_ids, p_exclude_charge_ids) unbilled;
$function$;

COMMENT ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'What API key limits count: successful requests (a request each, and their cost unless money movements replace it), charged requests that did not succeed (cost only, unless replaced), and private.unbilled_spend (money movements, each at its time). Shared by the request-context key checks, hold admission, the spend-limit seed and the 80% warnings.';

REVOKE ALL ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";

-- private.gateway_context_access runs as its caller (service_role, through
-- gateway_fetch_request_context_bundle) and reads this.
GRANT EXECUTE ON FUNCTION "private"."key_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "service_role";

CREATE OR REPLACE FUNCTION private.spend_guardrail_usage (
  p_workspace_id        uuid,
  p_now                 timestamp with time zone,
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_action              text DEFAULT NULL::text
)
  RETURNS TABLE (
    guardrail_id   uuid,
    guardrail_name text,
    spend_period   text,
    spend_action   text,
    spend_counting text,
    limit_nanos    bigint,
    counter        text,
    key_ids        uuid[],
    usage_nanos    bigint,
    period_start   timestamp with time zone,
    reset_at       timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Every spend counter of the workspace's enabled spend guardrails (only those whose action is
  -- p_action, when given), with the keys that count toward it and their spend this UTC period.
  -- A key is covered where public.resolve_key_guardrails says the guardrail applies to it.
  -- A shared guardrail has one counter per assignment (counter 'workspace:', 'department:<id>',
  -- 'member:<id>' or 'key:<id>'), over every key that assignment covers; an each_key guardrail has
  -- one counter per covered key ('key:<id>'). Spend is counted exactly like key cost limits, by
  -- private.key_spend_items over those keys since the period start: request cost (charged
  -- failures included) unless money movements replace it, plus the movements themselves at their
  -- time (stepped charges and refunds, one-off charges without a request row, batch and video
  -- debits, uncollected expected bills). p_exclude_request_ids are the ids of admissions the
  -- SpendLimit Durable Object holds (request ids and billing ids), left out of rows and charges
  -- alike, as for department budgets.
  with spend_guardrails as (
    select g.id, g.name, g.spend_period, g.spend_action, g.spend_counting, g.spend_limit_nanos
    from public.workspace_guardrails g
    where g.workspace_id = p_workspace_id
      and g.kind = 'spend'
      and g.enabled
      and (p_action is null or g.spend_action = p_action)
  ),
  covered as (
    select distinct
      sg.id as guardrail_id,
      case when sg.spend_counting = 'each_key' then 'key:' || k.id::text
        else r.source_type || ':' || coalesce(r.source_id::text, '') end as counter,
      k.id as key_id
    from public.keys k
    cross join lateral public.resolve_key_guardrails(p_workspace_id, k.id) r
    join spend_guardrails sg on sg.id = r.guardrail_id
    where k.workspace_id = p_workspace_id
      and exists (select 1 from spend_guardrails)
  ),
  counters as (
    select covered.guardrail_id, covered.counter, array_agg(covered.key_id order by covered.key_id) as key_ids
    from covered
    group by covered.guardrail_id, covered.counter
  )
  select
    sg.id,
    sg.name,
    sg.spend_period,
    sg.spend_action,
    sg.spend_counting,
    sg.spend_limit_nanos,
    c.counter,
    c.key_ids,
    coalesce((
      select sum(item.nanos)
      from private.key_spend_items(p_workspace_id, p.period_start, c.key_ids,
        coalesce(p_exclude_request_ids, '{}'::text[]), coalesce(p_exclude_request_ids, '{}'::text[])) item
      where item.at >= coalesce(p.period_start, '-infinity'::timestamptz)
        and item.at <= p_now
    ), 0)::bigint,
    p.period_start,
    p.reset_at
  from counters c
  join spend_guardrails sg on sg.id = c.guardrail_id
  cross join lateral private.spend_limit_period(sg.spend_period, p_now) p
  order by sg.name, sg.id, c.counter;
$function$;

COMMENT ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) IS 'Spend counters of a workspace''s enabled spend guardrails: one per assignment when shared, one per covered key when each_key, with their keys and their spend this UTC period, counted exactly like key cost limits (private.key_spend_items).';

REVOKE ALL ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) TO "service_role";

CREATE OR REPLACE FUNCTION private.budget_spend_items (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[] DEFAULT NULL::uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_exclude_charge_ids  text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    key_id uuid,
    at     timestamp with time zone,
    active boolean,
    nanos  bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The spend that counts toward workspace and department budgets, one row per item, shared by
  -- gateway_workspace_budget_status and private.department_budget_usage (and so the spend-limit
  -- seed). A budget's usage is the sum of nanos over rows that are active or at/after its period
  -- start. p_key_ids limits the rows to those keys (NULL: the whole workspace). p_since (NULL: all
  -- time) bounds the history read, written as created_at >= coalesce(...) so partitions of
  -- gateway_requests are pruned under generic plans; active holds are returned whenever they were
  -- made. The SpendLimit Durable Object counts an admission it holds from memory and lists both
  -- its ids: p_exclude_request_ids leaves out request rows by request id, p_exclude_charge_ids
  -- charge rows by billing request id.
  --
  -- * Requests: every gateway_requests row with a positive cost, whether or not it succeeded (a
  --   cancelled or failed request can still be charged), read as two disjoint parts so each uses
  --   its partial index, except excluded request ids, the batch_hold_usage rows of a hold that
  --   is still active, which the hold itself counts, and rows whose money movements replace them
  --   (private.unbilled_spend counts the movements): a request charged in steps, a failure row
  --   pending reconciliation whose charge was applied, a debited batch's batch_usage rows and a
  --   settled hold's placeholders. Each is decided per row with index lookups
  --   (credit_ledger_source_ref_idx, the gateway_request_charges and reservation primary keys),
  --   with no assumption about when the row landed.
  -- * Active holds (held or reserved), in every period until they end: video and free-model
  --   holds less the cost already audited for them, other holds (batch, realtime) less what was
  --   captured or released. Realtime holds carry no key; their session does.
  -- * Captured video and free-model holds made in the period, less the cost audited for them, so
  --   a capture counts before (or without) its request row and once after it lands.
  -- * Money movements (private.unbilled_spend), each at its time: stepped charges, one-off charges
  --   whose request row has not landed or is pending reconciliation, batch debits, and the
  --   uncollected part of delivered requests pending reconciliation.
  --
  -- Holds and request rows are matched by workspace and ids; their keys are compared null-safely
  -- because deleting a key sets both key_id columns to NULL (ON DELETE SET NULL).
  select request.key_id, request.created_at, false, request.cost_nanos
  from public.gateway_requests request
  where request.workspace_id = p_workspace_id
    and (p_key_ids is null or request.key_id = any (p_key_ids))
    and request.success is true
    and request.cost_nanos > 0
    and request.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
    and not (request.request_id like 'batch_hold_usage:%' and exists (
      select 1 from public.gateway_wallet_reservations hold
      where hold.workspace_id = request.workspace_id
        and hold.key_id is not distinct from request.key_id
        and hold.status in ('held', 'reserved')
        and starts_with(request.request_id, 'batch_hold_usage:' || hold.reservation_id || ':')
    ))
    -- Charged in steps, or pending reconciliation with an applied charge.
    and not (request.billing_request_id is not null and (
      exists (
        select 1 from public.credit_ledger movement
        where movement.source_ref_type = 'gateway_request'
          and movement.source_ref_id = request.billing_request_id
          and movement.workspace_id = request.workspace_id
          and movement.ref_type = 'gateway_request_charge')
      or ((request.expected_cost_nanos is not null
          or (request.created_at < (select private.pending_json_cutoff())
            and coalesce(request.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
        and exists (
          select 1 from public.gateway_request_charges charge
          where charge.workspace_id = request.workspace_id
            and charge.request_id = request.billing_request_id
            and charge.status = 'applied'))))
    -- A debited batch's rows.
    and not (starts_with(request.request_id, 'batch_usage:') and (
      exists (
        select 1 from public.gateway_request_charges capture
        where capture.workspace_id = request.workspace_id
          and capture.request_id = 'batch_capture:' || split_part(request.request_id, ':', 2)
          and capture.status = 'applied')
      or exists (
        select 1 from public.credit_ledger debit
        where debit.source_ref_type = 'async_job'
          and debit.source_ref_id = split_part(request.request_id, ':', 2)
          and debit.workspace_id = request.workspace_id
          and debit.ref_type = 'async_job_charge')))
    -- A debited video's audit row (its debit counts, at its time).
    and not (request.endpoint = 'video.generation' and exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = request.workspace_id::text || ':video_hold:' || request.request_id))
    -- A settled hold's placeholders (batch_hold_usage:<reservation>:<n>).
    and not (starts_with(request.request_id, 'batch_hold_usage:') and exists (
      select 1 from public.gateway_wallet_reservations hold
      where hold.workspace_id = request.workspace_id
        and hold.reservation_id = regexp_replace(substr(request.request_id, 18), ':[^:]*$', '')
        and hold.status not in ('held', 'reserved')))
  union all
  -- Charged requests that did not succeed (gateway_requests_charged_unsuccessful_cost_idx).
  select request.key_id, request.created_at, false, request.cost_nanos
  from public.gateway_requests request
  where request.workspace_id = p_workspace_id
    and (p_key_ids is null or request.key_id = any (p_key_ids))
    and request.success is not true
    and request.cost_nanos > 0
    and request.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
    -- A debited video's audit row.
    and not (request.endpoint = 'video.generation' and exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = request.workspace_id::text || ':video_hold:' || request.request_id))
    -- Charged in steps, or pending reconciliation with an applied charge.
    and not (request.billing_request_id is not null and (
      exists (
        select 1 from public.credit_ledger movement
        where movement.source_ref_type = 'gateway_request'
          and movement.source_ref_id = request.billing_request_id
          and movement.workspace_id = request.workspace_id
          and movement.ref_type = 'gateway_request_charge')
      or ((request.expected_cost_nanos is not null
          or (request.created_at < (select private.pending_json_cutoff())
            and coalesce(request.detail_metadata -> 'accounting_finalization' ->> 'billing_status' = 'pending_reconciliation', false)))
        and exists (
          select 1 from public.gateway_request_charges charge
          where charge.workspace_id = request.workspace_id
            and charge.request_id = request.billing_request_id
            and charge.status = 'applied'))))
  union all
  select coalesce(reservation.key_id, session.key_id), reservation.created_at,
    reservation.status in ('held', 'reserved'),
    case
      when reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%' then
        greatest(0, (case when reservation.status = 'captured'
          then coalesce(reservation.settled_amount_nanos, reservation.amount_nanos)
          else reservation.amount_nanos end) - coalesce(audit.cost, 0))
      else greatest(0, reservation.amount_nanos - coalesce(reservation.captured_nanos, 0) - coalesce(reservation.released_nanos, 0))
    end
  from public.gateway_wallet_reservations reservation
  left join public.gateway_realtime_sessions session
    on reservation.key_id is null
    and session.workspace_id = reservation.workspace_id
    and session.session_id = reservation.hold_ref_id
  left join lateral (
    select sum(request.cost_nanos) as cost
    from public.gateway_requests request
    where (reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%')
      and request.workspace_id = reservation.workspace_id
      and request.key_id is not distinct from reservation.key_id
      and request.request_id = reservation.hold_ref_id
      and coalesce(request.cost_nanos, 0) > 0
      and (reservation.reservation_id not like 'free_model_hold:%'
        or request.detail_metadata->>'free_model_fee_request_id' = substr(reservation.reservation_id, 17))
  ) audit on true
  where reservation.workspace_id = p_workspace_id
    and (p_key_ids is null or coalesce(reservation.key_id, session.key_id) = any (p_key_ids))
    and (reservation.status in ('held', 'reserved')
      or (reservation.status = 'captured'
        and (reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%')
        and reservation.created_at >= coalesce(p_since, '-infinity'::timestamptz)
        -- A video hold whose debit is recorded counts through the debit (private.unbilled_spend).
        and not exists (
          select 1 from public.credit_ledger debit
          where debit.ref_type = 'async_job_charge'
            and debit.ref_id = reservation.workspace_id::text || ':' || reservation.reservation_id)))
  union all
  select unbilled.key_id, unbilled.at, false, unbilled.nanos
  from private.unbilled_spend(p_workspace_id, p_since, p_key_ids, p_exclude_request_ids, p_exclude_charge_ids) unbilled;
$function$;

COMMENT ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'Spend items counted toward workspace and department budgets: positive-cost requests except those whose money movements replace them, active holds in every period, captured video and free-model holds less their audited cost (each hold''s batch_hold_usage rows counted once), and private.unbilled_spend (money movements, each at its time).';

REVOKE ALL ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";

CREATE OR REPLACE FUNCTION private.department_budget_usage (
  p_workspace_id        uuid,
  p_key_id              uuid   DEFAULT NULL::uuid,
  p_exclude_request_ids text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    id              uuid,
    department_id   uuid,
    department_name text,
    budget_interval text,
    limit_nanos     bigint,
    period_start    timestamp with time zone,
    reset_at        timestamp with time zone,
    usage_nanos     bigint,
    key_ids         uuid[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Each department budget of the workspace (only the departments p_key_id counts toward, when
  -- given) with its usage this UTC period: the private.budget_spend_items of the department's keys
  -- (private.department_budget_key_departments), less excluded request ids. The one department
  -- usage calculation behind gateway_department_budget_status (admission) and
  -- gateway_spend_limit_seed (the SpendLimit Durable Object).
  with department_keys as materialized (
    select kd.key_id, kd.department_id
    from private.department_budget_key_departments(p_workspace_id) kd
  ), budgets as materialized (
    select b.id, b.department_id, d.name, b.interval, b.limit_nanos, p.period_start, p.reset_at
    from public.workspace_department_budgets b
    join public.workspace_departments d on d.id = b.department_id
    cross join lateral private.spend_limit_period(b.interval, now()) p
    where b.workspace_id = p_workspace_id
      and (p_key_id is null or b.department_id in (
        select dk.department_id from department_keys dk where dk.key_id = p_key_id))
  ), items as materialized (
    select item.key_id, item.at, item.active, item.nanos
    from private.budget_spend_items(
      p_workspace_id,
      (select min(budgets.period_start) from budgets),
      array(select distinct dk.key_id from department_keys dk where dk.department_id in (select budgets.department_id from budgets)),
      p_exclude_request_ids,
      p_exclude_request_ids
    ) item
  )
  select budgets.id, budgets.department_id, budgets.name, budgets.interval, budgets.limit_nanos,
    budgets.period_start, budgets.reset_at,
    coalesce((
      select sum(items.nanos) from items
      where items.key_id in (select dk.key_id from department_keys dk where dk.department_id = budgets.department_id)
        and (items.active or items.at >= budgets.period_start)
    ), 0)::bigint,
    array(select dk.key_id from department_keys dk where dk.department_id = budgets.department_id order by dk.key_id)
  from budgets;
$function$;

COMMENT ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) IS 'Department budgets of a workspace with their usage this UTC period (private.budget_spend_items of the department''s keys) and keys; shared by gateway_department_budget_status and gateway_spend_limit_seed.';

REVOKE ALL ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) TO "postgres";

CREATE OR REPLACE FUNCTION private.workspace_budget_status (
  p_workspace_id           uuid,
  p_requested_amount_nanos bigint DEFAULT 0,
  p_exclude_request_ids    text[] DEFAULT '{}'::text[],
  p_exclude_charge_ids     text[] DEFAULT '{}'::text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_now timestamptz := now();
  v_result jsonb;
  v_exceeded jsonb;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;
  if coalesce(p_requested_amount_nanos, 0) < 0 then
    raise exception 'requested_amount_must_be_non_negative';
  end if;

  with configured as (
    select
      budget.id,
      budget.workspace_id,
      budget.interval,
      budget.limit_nanos,
      budget.created_by,
      budget.created_at,
      budget.updated_at,
      case budget.interval
        when 'daily' then date_trunc('day', v_now at time zone 'utc') at time zone 'utc'
        when 'weekly' then date_trunc('week', v_now at time zone 'utc') at time zone 'utc'
        when 'monthly' then date_trunc('month', v_now at time zone 'utc') at time zone 'utc'
        else null
      end as window_start,
      case budget.interval
        when 'daily' then (date_trunc('day', v_now at time zone 'utc') + interval '1 day') at time zone 'utc'
        when 'weekly' then (date_trunc('week', v_now at time zone 'utc') + interval '1 week') at time zone 'utc'
        when 'monthly' then (date_trunc('month', v_now at time zone 'utc') + interval '1 month') at time zone 'utc'
        else null
      end as reset_at
    from public.workspace_budgets budget
    where budget.workspace_id = p_workspace_id
  ), items as materialized (
    -- private.budget_spend_items, as for department budgets: positive-cost requests, active holds
    -- in every period, captured video and free-model holds less their audited cost, and unbilled
    -- spend (charges without a request row, delivered requests pending reconciliation).
    select item.at, item.active, item.nanos
    from private.budget_spend_items(
      p_workspace_id,
      (select case when bool_or(configured.window_start is null) then null else min(configured.window_start) end from configured),
      null::uuid[],
      p_exclude_request_ids,
      p_exclude_charge_ids
    ) item
    where exists (select 1 from configured)
  ), usage_rows as (
    select
      configured.*,
      coalesce((
        select sum(items.nanos) from items
        where items.active or configured.window_start is null or items.at >= configured.window_start
      ), 0)::bigint as usage_nanos
    from configured
  ), normalized as (
    select *,
      usage_nanos + coalesce(p_requested_amount_nanos, 0) as projected_usage_nanos,
      greatest(limit_nanos - usage_nanos, 0) as remaining_nanos,
      case
        when coalesce(p_requested_amount_nanos, 0) > 0
          then usage_nanos + p_requested_amount_nanos > limit_nanos
        else usage_nanos >= limit_nanos
      end as exceeded
    from usage_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'workspace_id', workspace_id,
    'interval', interval,
    'limit_nanos', limit_nanos,
    'usage_nanos', usage_nanos,
    'remaining_nanos', remaining_nanos,
    'projected_usage_nanos', projected_usage_nanos,
    'exceeded', exceeded,
    'window_start', window_start,
    'reset_at', reset_at,
    'created_by', created_by,
    'created_at', created_at,
    'updated_at', updated_at
  ) order by case interval when 'daily' then 1 when 'weekly' then 2 when 'monthly' then 3 else 4 end), '[]'::jsonb)
  into v_result
  from normalized;

  select budget
  into v_exceeded
  from jsonb_array_elements(v_result) budget
  where (budget->>'exceeded')::boolean
  order by case budget->>'interval' when 'daily' then 1 when 'weekly' then 2 when 'monthly' then 3 else 4 end
  limit 1;

  if v_exceeded is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'workspace_' || (v_exceeded->>'interval') || '_cost_budget_reached',
      'limit_window', v_exceeded->>'interval',
      'limit_metric', 'cost',
      'current_value', (v_exceeded->>'usage_nanos')::bigint,
      'limit_value', (v_exceeded->>'limit_nanos')::bigint,
      'reset_at', v_exceeded->'reset_at',
      'now', to_jsonb(v_now),
      'budgets', v_result
    );
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'budgets', v_result);
end;
$function$;

COMMENT ON FUNCTION "private"."workspace_budget_status"(uuid, bigint, text[], text[]) IS 'Workspace budgets with usage this UTC period (private.budget_spend_items), for gateway_workspace_budget_status and gateway_spend_limit_seed. p_exclude_request_ids leaves out request rows and p_exclude_charge_ids charge rows of admissions the SpendLimit Durable Object holds (gateway_spend_limit_seed passes both for contract version 2, charge rows only for version 1).';

REVOKE ALL ON FUNCTION "private"."workspace_budget_status"(uuid, bigint, text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."workspace_budget_status"(uuid, bigint, text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_budget_status"(uuid, bigint, text[], text[]) TO "postgres";

CREATE OR REPLACE FUNCTION public.gateway_department_budget_status (
  p_workspace_id           uuid,
  p_key_id                 uuid,
  p_requested_amount_nanos bigint DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Admission check for the department budgets that p_key_id counts toward, the sibling of
-- gateway_workspace_budget_status. A budget blocks once its usage reaches the limit, or, with
-- p_requested_amount_nanos > 0, when usage plus the request would exceed it. Usage comes from
-- private.department_budget_usage, the same calculation gateway_spend_limit_seed gives the
-- SpendLimit Durable Object: positive-cost requests of the department's keys this UTC period plus
-- their outstanding holds. Used for batch, video and realtime holds and the request-context
-- fallback; department_budgets lists the budgets that apply even when none is reached.
declare
  v_now timestamptz := now();
  v_result jsonb;
  v_exceeded jsonb;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;
  if coalesce(p_requested_amount_nanos, 0) < 0 then
    raise exception 'requested_amount_must_be_non_negative';
  end if;
  if p_key_id is null or not exists (
    select 1 from public.workspace_department_budgets b where b.workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'department_budgets', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', usage.id,
    'department_id', usage.department_id,
    'department_name', usage.department_name,
    'interval', usage.budget_interval,
    'limit_nanos', usage.limit_nanos,
    'usage_nanos', usage.usage_nanos,
    'remaining_nanos', greatest(usage.limit_nanos - usage.usage_nanos, 0),
    'exceeded', case
      when coalesce(p_requested_amount_nanos, 0) > 0 then usage.usage_nanos + p_requested_amount_nanos > usage.limit_nanos
      else usage.usage_nanos >= usage.limit_nanos
    end,
    'window_start', usage.period_start,
    'reset_at', usage.reset_at
  ) order by case usage.budget_interval when 'daily' then 1 when 'weekly' then 2 else 3 end,
    usage.department_name, usage.department_id), '[]'::jsonb)
  into v_result
  from private.department_budget_usage(p_workspace_id, p_key_id, '{}'::text[]) usage;

  select budget into v_exceeded
  from jsonb_array_elements(v_result) with ordinality as item(budget, position)
  where (budget->>'exceeded')::boolean
  order by position
  limit 1;

  if v_exceeded is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'department_' || (v_exceeded->>'interval') || '_cost_budget_reached',
      'limit_window', v_exceeded->>'interval',
      'limit_metric', 'cost',
      'current_value', (v_exceeded->>'usage_nanos')::bigint,
      'limit_value', (v_exceeded->>'limit_nanos')::bigint,
      'reset_at', v_exceeded->'reset_at',
      'department_id', v_exceeded->'department_id',
      'department_name', v_exceeded->'department_name',
      'now', to_jsonb(v_now),
      'department_budgets', v_result
    );
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'department_budgets', v_result);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) IS 'Admission check for the department budgets an API key counts toward (private.department_budget_usage: positive-cost requests plus outstanding holds this UTC period), with department_<window>_cost_budget_reached reasons and the applying budgets in department_budgets.';

REVOKE ALL ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_workspace_budget_status (
  p_workspace_id           uuid,
  p_requested_amount_nanos bigint DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Workspace budgets with their usage this UTC period and whether one is reached (or, with
  -- p_requested_amount_nanos, would be passed); see private.workspace_budget_status.
  return private.workspace_budget_status(p_workspace_id, p_requested_amount_nanos, '{}'::text[], '{}'::text[]);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_spend_limit_seed (
  p_workspace_id        uuid,
  p_key_ids             uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_contract_version    integer DEFAULT 1
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  -- Windows and filters must stay identical to the key-limit accounting in
  -- public.gateway_fetch_request_context_without_workspace_budget.
  now_utc     timestamptz := (now() at time zone 'utc');
  day_start   timestamptz := date_trunc('day',  now_utc);
  week_start  timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start timestamptz := date_trunc('month', now_utc);
  v_key_ids   uuid[] := coalesce(p_key_ids, '{}'::uuid[]);
  v_exclude   text[] := coalesce(p_exclude_request_ids, '{}'::text[]);
  v_keys      jsonb;
  v_excluded  jsonb := '[]'::jsonb;
  v_departments jsonb := '[]'::jsonb;
  v_guardrails jsonb := '[]'::jsonb;
begin
  if p_workspace_id is null then
    raise exception using errcode = '22023', message = 'workspace_id_required';
  end if;
  if cardinality(v_key_ids) > 100 then
    raise exception using errcode = '22023', message = 'too_many_key_ids';
  end if;
  -- p_exclude_request_ids is the SpendLimit Durable Object's spend still counted from memory: for
  -- each admission it holds, its request id and its billing request id. gateway_requests rows are
  -- skipped by request_id and charge rows (gateway_request_charges, their adjustment ledger rows)
  -- by billing request id in key and department usage.
  --
  -- p_contract_version says how the calling coordinator treats a held admission whose audit row
  -- this seed reports in excluded_rows:
  -- * 1 (the coordinator on main, and any caller that does not send it): it stops counting the
  --   admission in workspace budgets at once, so workspace usage here leaves out only its charge
  --   rows and counts its request row.
  -- * 2 (fix/async-billing-20261104's coordinator): it keeps counting the admission until a seed
  --   that does not exclude it is published, so workspace usage leaves out its request row too.
  if cardinality(v_exclude) > 5000 then
    raise exception using errcode = '22023', message = 'too_many_excluded_request_ids';
  end if;

  with key_rows as (
    select
      k.id,
      k.status,
      coalesce(k.soft_blocked, false) as soft_blocked,
      k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
      k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos,
      -- Unlimited keys need no history read, as in the context function.
      coalesce(greatest(k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
        k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos) > 0, false) as limited
    from public.keys k
    where k.id = any(v_key_ids)
      and k.workspace_id = p_workspace_id
  ), usage as (
    select
      gr.key_id,
      count(*) filter (where gr.served and gr.at >= day_start)                    as used_day_reqs,
      count(*) filter (where gr.served and gr.at >= week_start)                   as used_wk_reqs,
      count(*) filter (where gr.served and gr.at >= month_start)                  as used_mo_reqs,
      coalesce(sum(gr.nanos) filter (where gr.at >= day_start), 0)::bigint   as used_day_cost,
      coalesce(sum(gr.nanos) filter (where gr.at >= week_start), 0)::bigint  as used_wk_cost,
      coalesce(sum(gr.nanos) filter (where gr.at >= month_start), 0)::bigint as used_mo_cost
    -- The limited keys' usage (private.key_spend_items), less the admissions the coordinator holds.
    from private.key_spend_items(p_workspace_id, least(week_start, month_start),
      array(select key_rows.id from key_rows where key_rows.limited), v_exclude, v_exclude) gr
    group by gr.key_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key_id', key_rows.id,
    'active', key_rows.status = 'active',
    'soft_blocked', key_rows.soft_blocked,
    'limited', key_rows.limited,
    'limits', jsonb_build_object(
      'daily',   jsonb_build_object('requests', key_rows.daily_limit_requests,   'cost_nanos', key_rows.daily_limit_cost_nanos),
      'weekly',  jsonb_build_object('requests', key_rows.weekly_limit_requests,  'cost_nanos', key_rows.weekly_limit_cost_nanos),
      'monthly', jsonb_build_object('requests', key_rows.monthly_limit_requests, 'cost_nanos', key_rows.monthly_limit_cost_nanos)
    ),
    'used', case when key_rows.limited then jsonb_build_object(
      'daily',   jsonb_build_object('requests', coalesce(usage.used_day_reqs, 0), 'cost_nanos', coalesce(usage.used_day_cost, 0)),
      'weekly',  jsonb_build_object('requests', coalesce(usage.used_wk_reqs, 0),  'cost_nanos', coalesce(usage.used_wk_cost, 0)),
      'monthly', jsonb_build_object('requests', coalesce(usage.used_mo_reqs, 0),  'cost_nanos', coalesce(usage.used_mo_cost, 0))
    ) else null end
  ) order by key_rows.id), '[]'::jsonb)
  into v_keys
  from key_rows
  left join usage on usage.key_id = key_rows.id;

  -- Department budgets with their usage this UTC period and every key that counts toward each
  -- department, from private.department_budget_usage, the calculation gateway_department_budget_status
  -- admits holds with: positive-cost requests of the department's keys (less excluded request ids)
  -- plus their outstanding batch, video and realtime holds and unbilled spend.
  if exists (select 1 from public.workspace_department_budgets b where b.workspace_id = p_workspace_id) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', usage.id,
      'department_id', usage.department_id,
      'department_name', usage.department_name,
      'interval', usage.budget_interval,
      'limit_nanos', usage.limit_nanos,
      'usage_nanos', usage.usage_nanos,
      'window_start', usage.period_start,
      'reset_at', usage.reset_at,
      'key_ids', to_jsonb(usage.key_ids)
    ) order by usage.department_id, usage.budget_interval), '[]'::jsonb)
    into v_departments
    from private.department_budget_usage(p_workspace_id, null, v_exclude) usage;
  end if;

  -- Blocking spend guardrails: one entry per counter (private.spend_guardrail_usage), counted
  -- like a department budget over its keys, with the same exclusions.
  if exists (
    select 1 from public.workspace_guardrails g
    where g.workspace_id = p_workspace_id and g.kind = 'spend' and g.enabled and g.spend_action = 'block'
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'guardrail_id', u.guardrail_id,
      'guardrail_name', u.guardrail_name,
      'counting', u.spend_counting,
      'counter', u.counter,
      'interval', u.spend_period,
      'limit_nanos', u.limit_nanos,
      'usage_nanos', u.usage_nanos,
      'window_start', u.period_start,
      'reset_at', u.reset_at,
      'key_ids', to_jsonb(u.key_ids)
    ) order by u.guardrail_name, u.guardrail_id, u.counter), '[]'::jsonb)
    into v_guardrails
    from private.spend_guardrail_usage(p_workspace_id, now(), v_exclude, 'block') u;
  end if;

  -- Excluded requests that are already persisted, so the caller can stop
  -- tracking them separately and count the stored row instead.
  if cardinality(v_exclude) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'request_id', gr.request_id,
      'key_id', gr.key_id,
      'success', gr.success,
      'cost_nanos', coalesce(gr.cost_nanos, 0),
      'created_at', gr.created_at
    ) order by gr.request_id, gr.created_at), '[]'::jsonb)
    into v_excluded
    from public.gateway_requests gr
    where gr.workspace_id = p_workspace_id
      and gr.request_id = any(v_exclude)
      and gr.created_at >= least(week_start, month_start) - interval '1 day';
  end if;

  return jsonb_build_object(
    'now', to_jsonb(now_utc),
    'day_start', to_jsonb(day_start),
    'week_start', to_jsonb(week_start),
    'month_start', to_jsonb(month_start),
    'keys', v_keys,
    'budget_status', private.workspace_budget_status(p_workspace_id, 0,
      case when coalesce(p_contract_version, 1) >= 2 then v_exclude else '{}'::text[] end, v_exclude),
    'excluded_rows', v_excluded,
    'department_budgets', v_departments,
    'guardrail_budgets', v_guardrails
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[], integer) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[], integer) IS 'Seeds the gateway spend-limit coordinator: per-key day/week/month usage with the request-context windows and filters (excluding already-recorded request ids), plus workspace budget status, department budgets and blocking spend guardrail counters with their usage and keys. p_contract_version (default 1) selects how workspace usage treats held admissions: see the function body.';

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[], integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[], integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[], integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.workspace_department_budget_status (
  p_workspace_id uuid,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Each department budget in the workspace with its spend so far in the current UTC period, as
-- a JSON array ordered by department and period. A department's spend is the cost of the API
-- keys private.department_budget_key_departments gives it: keys linked to it, plus, for keys not
-- linked to any department, the keys its members created and their OAuth requests. Spend is
-- private.budget_spend_items, the calculation department admission enforces (money movements,
-- uncollected amounts and active holds included), up to p_now; active holds count in every
-- period. sweep_department_budget_alerts reads this for the 80% and 100% alerts.
declare
  v_result jsonb;
begin
  if p_workspace_id is null or p_now is null then
    raise exception 'invalid_department_budget_status_arguments';
  end if;
  if not exists (select 1 from public.workspace_department_budgets b where b.workspace_id = p_workspace_id) then
    return '[]'::jsonb;
  end if;

  with budgets as (
    select b.*, p.period_start, p.reset_at
    from public.workspace_department_budgets b
    cross join lateral private.spend_limit_period(b.interval, p_now) p
    where b.workspace_id = p_workspace_id
  ),
  key_departments as (
    select kd.key_id, kd.department_id
    from private.department_budget_key_departments(p_workspace_id) kd
  ),
  items as materialized (
    select item.key_id, item.at, item.active, item.nanos
    from private.budget_spend_items(
      p_workspace_id,
      (select min(b.period_start) from budgets b),
      array(select distinct kd.key_id from key_departments kd where kd.department_id in (select b.department_id from budgets b))
    ) item
    where item.active or item.at <= p_now
  ),
  usage as (
    select b.id, coalesce((
      select sum(i.nanos) from items i
      where i.key_id in (select kd.key_id from key_departments kd where kd.department_id = b.department_id)
        and (i.active or i.at >= b.period_start)
    ), 0)::numeric as used_nanos
    from budgets b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'workspace_id', b.workspace_id,
    'department_id', b.department_id,
    'department_name', d.name,
    'interval', b.interval,
    'limit_nanos', b.limit_nanos,
    'usage_nanos', u.used_nanos,
    'remaining_nanos', greatest(b.limit_nanos - u.used_nanos, 0),
    'exceeded', u.used_nanos >= b.limit_nanos,
    'window_start', b.period_start,
    'reset_at', b.reset_at,
    'created_by', b.created_by,
    'created_at', b.created_at,
    'updated_at', b.updated_at
  ) order by d.name, b.department_id, case b.interval when 'daily' then 1 when 'weekly' then 2 else 3 end), '[]'::jsonb)
  into v_result
  from budgets b
  join usage u on u.id = b.id
  join public.workspace_departments d on d.id = b.department_id;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."workspace_department_budget_status"(uuid, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_department_budget_status"(uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_department_budget_status"(uuid, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."workspace_department_budget_status"(uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.sweep_department_budget_alerts (
  p_now timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Sends a money push to owners and admins once per department budget, period and limit value
-- when the department reaches about 80% of the budget (department_budget_warning), and again
-- when it reaches 100% (department_budget_reached). The gateway refuses the department's requests,
-- holds and realtime sessions at 100% without sending a push, so the 100% alert comes from this
-- sweep and says those requests are refused until the budget resets. Spend is
-- workspace_department_budget_status's, the same calculation admission enforces; the sweep runs
-- every 15 minutes, so a push can arrive after blocking has started. No warning is sent once the budget is
-- reached. A limit changed mid-period can alert again. Only workspaces with a department budget
-- are read.
declare
  v_budgets integer;
  v_alerted integer := 0;
  v_count integer;
  v_workspace uuid;
begin
  if p_now is null then
    raise exception 'invalid_department_budget_sweep_time';
  end if;

  select count(*) into v_budgets from public.workspace_department_budgets;
  if v_budgets = 0 then
    return jsonb_build_object('budgets', 0, 'alerted', 0);
  end if;

  for v_workspace in select distinct b.workspace_id from public.workspace_department_budgets b loop
    with status as (
      select
        (s ->> 'id') as budget_id,
        (s ->> 'department_name') as department_name,
        (s ->> 'interval') as time_window,
        (s ->> 'limit_nanos')::numeric as limit_value,
        (s ->> 'usage_nanos')::numeric as used
      from jsonb_array_elements(public.workspace_department_budget_status(v_workspace, p_now)) s
    ),
    due as (
      select
        st.*,
        p.period_start,
        p.reset_at,
        case when st.used >= st.limit_value then 'department_budget_reached' else 'department_budget_warning' end as kind,
        to_char(p.period_start at time zone 'UTC', 'YYYY-MM-DD') || ':' || st.limit_value as period_key,
        case when char_length(st.department_name) > 40 then left(st.department_name, 39) || '…' else st.department_name end as name,
        case st.time_window when 'daily' then ' so far today.' when 'weekly' then ' so far this week.' else ' so far this month.' end as so_far
      from status st
      cross join lateral private.spend_limit_period(st.time_window, p_now) p
      where st.used >= 0.8 * st.limit_value
    ),
    inserted as (
      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, payload, occurred_at)
      select
        v_workspace,
        d.kind,
        'money',
        d.kind || ':department_budget:' || d.budget_id || ':' || d.time_window || ':' || d.period_key,
        jsonb_build_object(
          'push', jsonb_build_object(
            'title', case when d.kind = 'department_budget_reached'
              then d.name || ' has used its ' || d.time_window || ' budget'
              else d.name || ' is at about 80% of its ' || d.time_window || ' budget' end,
            'body', private.spend_limit_amount('cost', d.used) || ' of ' || private.spend_limit_amount('cost', d.limit_value)
              || d.so_far
              || case when d.kind = 'department_budget_reached' then ' The department''s requests are now refused until the budget resets.' else '' end,
            'href', '/settings/usage/overview'
          ),
          'departmentBudgetId', d.budget_id, 'window', d.time_window, 'metric', 'cost',
          'limit', d.limit_value, 'used', d.used, 'periodStart', d.period_start, 'resetAt', d.reset_at
        ),
        p_now
      from due d
      where d.kind = 'department_budget_reached'
        or not exists (
          select 1 from public.workspace_notification_events e
          where e.dedupe_key = 'department_budget_reached:department_budget:' || d.budget_id || ':' || d.time_window || ':' || d.period_key
        )
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_count from inserted;
    v_alerted := v_alerted + v_count;
  end loop;

  return jsonb_build_object('budgets', v_budgets, 'alerted', v_alerted);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sweep_department_budget_alerts"(timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_department_budget_alerts"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_department_budget_alerts"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_department_budget_alerts"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

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
  key_usage as (
    -- One read per workspace of its limited keys since the earlier of this week's and this month's start.
    select
      u.key_id,
      count(*) filter (where u.served and u.at >= v_day) as day_requests,
      count(*) filter (where u.served and u.at >= v_week) as week_requests,
      count(*) filter (where u.served and u.at >= v_month) as month_requests,
      coalesce(sum(u.nanos) filter (where u.at >= v_day), 0) as day_cost,
      coalesce(sum(u.nanos) filter (where u.at >= v_week), 0) as week_cost,
      coalesce(sum(u.nanos) filter (where u.at >= v_month), 0) as month_cost
    from (select distinct k.workspace_id from limited_keys k) w
    cross join lateral private.key_spend_items(w.workspace_id, least(v_week, v_month),
      array(select k.id from limited_keys k where k.workspace_id = w.workspace_id)) u
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
      'key_limit_warning', 'key:' || k.id || ':' || l.metric, l.time_window, l.metric,
      l.limit_value::numeric,
      l.used
    from limited_keys k
    left join key_usage ku on ku.key_id = k.id
    cross join lateral (values
      ('daily', 'requests', k.daily_limit_requests, coalesce(ku.day_requests, 0)::numeric),
      ('weekly', 'requests', k.weekly_limit_requests, coalesce(ku.week_requests, 0)::numeric),
      ('monthly', 'requests', k.monthly_limit_requests, coalesce(ku.month_requests, 0)::numeric),
      ('daily', 'cost', k.daily_limit_cost_nanos, coalesce(ku.day_cost, 0)::numeric),
      ('weekly', 'cost', k.weekly_limit_cost_nanos, coalesce(ku.week_cost, 0)::numeric),
      ('monthly', 'cost', k.monthly_limit_cost_nanos, coalesce(ku.month_cost, 0)::numeric)
    ) l(time_window, metric, limit_value, used)
    where l.limit_value > 0
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

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_limit_warnings"(timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_limit_warnings"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_limit_warnings"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_limit_warnings"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.gateway_context_access (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  credit_status       jsonb;
  key_status          jsonb;
  key_limit_status    jsonb;
  min_balance_nanos bigint := case when endpoint like 'video.%' or endpoint like 'batch%' then 1000000000 else 100000000 end; -- 1.00 USD

  providers           jsonb;
  pricing             jsonb;
  preset_data         jsonb := null;
  preset_matches      jsonb := null;

  -- key row fields
  v_key_active        boolean;
  v_key_team_ok       boolean;
  v_soft_blocked      boolean;

  v_day_req_limit     bigint;
  v_wk_req_limit      bigint;
  v_mo_req_limit      bigint;
  v_day_cost_limit    bigint;
  v_wk_cost_limit     bigint;
  v_mo_cost_limit     bigint;

  now_utc             timestamptz := (now() at time zone 'utc');
  day_start           timestamptz := date_trunc('day',  now_utc);
  week_start          timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start         timestamptz := date_trunc('month', now_utc);

  used_day_reqs       bigint;
  used_wk_reqs        bigint;
  used_mo_reqs        bigint;
  used_day_cost       bigint;
  used_wk_cost        bigint;
  used_mo_cost        bigint;

  within_limits       boolean := true;
  limit_reason        text := null;
  limit_window        text := null;
  limit_metric        text := null;
  current_value       bigint := null;
  limit_value         bigint := null;
  limit_reset_at      timestamptz := null;

  -- Preset handling
  is_preset           boolean := false;
  preset_name         text := null;
  preset_publisher    text := null;

  -- Resolve model from alias if exists
  resolved_model      text := gateway_context_access.model;
  base_model          text;

  team_enrichment     jsonb;
  key_enrichment      jsonb;

  -- Team aggregates
  team_total_requests bigint;
  team_total_spend_nanos bigint;
  team_spend_24h_nanos bigint;
  team_spend_7d_nanos bigint;
  team_spend_30d_nanos bigint;
  team_requests_1h bigint;
  team_requests_24h bigint;
  team_created_at timestamptz;
  team_tier text;
  team_balance_nanos bigint;
  team_reserved_nanos bigint;

  -- Key aggregates
  key_name text;
  key_created_at timestamptz;
  key_total_requests bigint;
  key_total_spend_nanos bigint;
begin
  base_model := gateway_context_access.model;
  -- hard requirement: key must be provided
  if gateway_context_access.api_key_id is null then
    raise exception using errcode = '22023', message = 'missing_api_key', detail = 'api_key_id is required';
  end if;

  -- Check if model is a preset (starts with @)
  if base_model like '@%' then
    is_preset := true;
    preset_name := substring(base_model from 2); -- Remove @ prefix

    -- Fetch preset configuration. Qualified references resolve a
    -- public publisher globally; unqualified references remain workspace-local.
    if position('/' in preset_name) > 0 then
      preset_publisher := split_part(preset_name, '/', 1);
      preset_name := substring(preset_name from position('/' in preset_name) + 1);
      select jsonb_agg(m.match) into preset_matches from (
        select jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'config', p.config, 'visibility', p.visibility, 'publisher', w.publisher_handle
      ) as match
      from public.presets p
      join public.workspaces w on w.id = p.workspace_id
      where p.archived_at is null and lower(p.slug) = lower(preset_name)
        and p.visibility = 'public'
        and true
        and (lower(w.publisher_handle) = lower(preset_publisher) or exists (select 1 from public.workspace_publisher_handle_aliases alias where alias.workspace_id = w.id and alias.handle = lower(preset_publisher)))
      limit 2
      ) m;
      -- Slugs are matched case-insensitively; two matches would make the choice arbitrary.
      if jsonb_array_length(coalesce(preset_matches, '[]'::jsonb)) > 1 then
        raise exception using
          errcode = '22023',
          message = 'preset_ambiguous',
          detail = format('Preset "%s" matches more than one preset', preset_name);
      end if;
      preset_data := preset_matches -> 0;
    else
      select jsonb_agg(m.match) into preset_matches from (
        select jsonb_build_object(
        'id', p.id, 'name', p.name,
        'slug', coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', '')),
        'description', p.description, 'config', p.config, 'visibility', p.visibility
      ) as match
      from public.presets p
      where p.archived_at is null and lower(coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', ''))) = lower(preset_name)
        and p.workspace_id = gateway_context_access.workspace_id
        and (
          p.visibility in ('public', 'team')
          or p.created_by = (
            select ak.created_by from public.keys ak
            where ak.id = gateway_context_access.api_key_id
              and ak.workspace_id = gateway_context_access.workspace_id
              and ak.status = 'active'
          )
        )
      limit 2
      ) m;
      -- Slugs are matched case-insensitively; two matches would make the choice arbitrary.
      if jsonb_array_length(coalesce(preset_matches, '[]'::jsonb)) > 1 then
        raise exception using
          errcode = '22023',
          message = 'preset_ambiguous',
          detail = format('Preset "%s" matches more than one preset', preset_name);
      end if;
      preset_data := preset_matches -> 0;
    end if;

    if preset_data is null then
      raise exception using
        errcode = '22023',
        message = 'preset_not_found',
        detail = format('Preset "%s" not found or not accessible', preset_name);
    end if;

    -- Extract model from preset config (fallback to default/default_model/model/first models entry)
    base_model := coalesce(
      preset_data->'config'->>'defaultModel',
      preset_data->'config'->>'default_model',
      preset_data->'config'->>'model',
      preset_data->'config'->'models'->>0,
      preset_data->'config'->'allowedModels'->>0,
      preset_data->'config'->'allowed_models'->>0
    );

    if base_model is null then
      raise exception using
        errcode = '22023',
        message = 'preset_no_model',
        detail = format('Preset "%s" has no model configured', preset_name);
    end if;
  end if;

  -- Resolve alias/model indirection:
  -- 1) explicit alias table (`v2_model_aliases`)
  -- 2) provider-scoped slug form (`provider/provider_model_slug`)
  resolved_model := coalesce(
    (
      select a.api_model_id
      from (select alias_slug, model_slug as api_model_id, enabled as is_enabled from public.v2_model_aliases) a
      where a.alias_slug = base_model
        and a.is_enabled = true
        and a.api_model_id is not null
      limit 1
    ),
    (
      select m.api_model_id
      from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at from public.v2_model_provider_routes) m
      where position('/' in base_model) > 0
        and m.provider_id = split_part(base_model, '/', 1)
        and m.provider_model_slug = regexp_replace(base_model, '^[^/]+/', '')
        and m.is_active_gateway
        and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
        and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
      order by coalesce(m.effective_from, to_timestamp(0)) desc, m.provider_api_model_id
      limit 1
    ),
    base_model
  );

  -- validate key row, status, and team
  select
    (k.status = 'active'),
    (k.workspace_id = gateway_context_access.workspace_id),
    k.soft_blocked,
    k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
    k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
  into
    v_key_active,
    v_key_team_ok,
    v_soft_blocked,
    v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
    v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit
  from public.keys k
  where k.id = gateway_context_access.api_key_id
  limit 1;

  if v_key_active is null then
    raise exception using errcode = '22023', message = 'api_key_not_found', detail = 'key id does not exist';
  end if;
  if not v_key_team_ok then
    raise exception using errcode = '22023', message = 'api_key_wrong_team', detail = 'key does not belong to provided workspace_id';
  end if;
  if not v_key_active then
    raise exception using errcode = '22023', message = 'api_key_inactive', detail = 'key status is not active';
  end if;

  key_status := jsonb_build_object('ok', true, 'mode', 'first_party');

  -- credit check
  credit_status :=
    coalesce((
      select case
        when greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0) >= min_balance_nanos then
          jsonb_build_object(
            'ok', true,
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
        else
          jsonb_build_object(
            'ok', false,
            'reason', 'insufficient_funds',
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
      end
      from public.wallets w
      where w.workspace_id = gateway_context_access.workspace_id
      limit 1
    ), jsonb_build_object('ok', false, 'reason', 'wallet_missing'));

  -- per-key limits (requests + cost)
  -- Unlimited keys need no history read. Unknown telemetry stays NULL.
  if greatest(v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
      v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit) > 0 then
  select
    count(*) filter (where gr.served and gr.at >= day_start)                    as used_day_reqs,
    count(*) filter (where gr.served and gr.at >= week_start)                   as used_wk_reqs,
    count(*) filter (where gr.served and gr.at >= month_start)                  as used_mo_reqs,
    coalesce(sum(gr.nanos) filter (where gr.at >= day_start), 0)::bigint   as used_day_cost,
    coalesce(sum(gr.nanos) filter (where gr.at >= week_start), 0)::bigint  as used_wk_cost,
    coalesce(sum(gr.nanos) filter (where gr.at >= month_start), 0)::bigint as used_mo_cost
  into
    used_day_reqs, used_wk_reqs, used_mo_reqs,
    used_day_cost, used_wk_cost, used_mo_cost
  -- The key's usage (private.key_spend_items): successful requests count as requests and cost,
  -- charged ones that did not succeed and money movements as cost only.
  from private.key_spend_items(gateway_context_access.workspace_id, least(week_start, month_start), array[gateway_context_access.api_key_id]) gr;
  end if;

  if v_soft_blocked then
    within_limits := false;
    limit_reason := 'key_limit_soft_blocked';
    limit_metric := 'soft_blocked';
  end if;
  if within_limits and v_day_req_limit > 0 and used_day_reqs >= v_day_req_limit then
    within_limits := false;
    limit_reason := 'daily_request_limit_reached';
    limit_window := 'daily';
    limit_metric := 'requests';
    current_value := used_day_reqs;
    limit_value := v_day_req_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_req_limit > 0 and used_wk_reqs >= v_wk_req_limit then
    within_limits := false;
    limit_reason := 'weekly_request_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'requests';
    current_value := used_wk_reqs;
    limit_value := v_wk_req_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_req_limit > 0 and used_mo_reqs >= v_mo_req_limit then
    within_limits := false;
    limit_reason := 'monthly_request_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'requests';
    current_value := used_mo_reqs;
    limit_value := v_mo_req_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;
  if within_limits and v_day_cost_limit > 0 and used_day_cost >= v_day_cost_limit then
    within_limits := false;
    limit_reason := 'daily_cost_limit_reached';
    limit_window := 'daily';
    limit_metric := 'cost';
    current_value := used_day_cost;
    limit_value := v_day_cost_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_cost_limit > 0 and used_wk_cost >= v_wk_cost_limit then
    within_limits := false;
    limit_reason := 'weekly_cost_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'cost';
    current_value := used_wk_cost;
    limit_value := v_wk_cost_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_cost_limit > 0 and used_mo_cost >= v_mo_cost_limit then
    within_limits := false;
    limit_reason := 'monthly_cost_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'cost';
    current_value := used_mo_cost;
    limit_value := v_mo_cost_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;

  key_limit_status :=
    jsonb_build_object(
      'ok', within_limits,
      'reason', limit_reason,
      'limit_window', limit_window,
      'limit_metric', limit_metric,
      'current_value', current_value,
      'limit_value', limit_value,
      'reset_at', to_jsonb(limit_reset_at),
      'now', to_jsonb(now_utc),
      'buckets', jsonb_build_object(
        'daily', jsonb_build_object(
          'window_start', to_jsonb(day_start),
          'requests_used', used_day_reqs,
          'requests_limit', v_day_req_limit,
          'cost_used_nanos', used_day_cost,
          'cost_limit_nanos', v_day_cost_limit
        ),
        'weekly', jsonb_build_object(
          'window_start', to_jsonb(week_start),
          'requests_used', used_wk_reqs,
          'requests_limit', v_wk_req_limit,
          'cost_used_nanos', used_wk_cost,
          'cost_limit_nanos', v_wk_cost_limit
        ),
        'monthly', jsonb_build_object(
          'window_start', to_jsonb(month_start),
          'requests_used', used_mo_reqs,
          'requests_limit', v_mo_req_limit,
          'cost_used_nanos', used_mo_cost,
          'cost_limit_nanos', v_mo_cost_limit
        )
      )
    );

  -- ============================================================================
  -- TEAM & KEY ENRICHMENT (Wide Event Context for Observability)
  -- Purpose: Gather user/team context for comprehensive logging (loggingsucks.com pattern)
  -- ============================================================================
  -- Team metadata & wallet
  select
    t.created_at,
    coalesce(t.tier, 'basic'),
    greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
    coalesce(w.reserved_nanos, 0)::bigint
  into
    team_created_at,
    team_tier,
    team_balance_nanos,
    team_reserved_nanos
  from public.workspaces t
  left join public.wallets w on w.workspace_id = t.id
  where t.id = gateway_context_access.workspace_id
  limit 1;

  -- Historical analytics belong in reporting, not request admission.
  -- Leave their enrichment fields NULL instead of scanning lifetime logs.

  -- Calculate tier using calendar-month qualification + lock-window grace.
  -- Function maintains team tier/counters in database when state changes.
  team_tier := public.calculate_tier_with_grace(gateway_context_access.workspace_id, team_spend_30d_nanos);

  team_enrichment := jsonb_build_object(
    'tier', team_tier,
    'created_at', to_jsonb(team_created_at),
    'account_age_days', extract(epoch from (now_utc - team_created_at)) / 86400,
    'balance_nanos', team_balance_nanos,
    'available_nanos', team_balance_nanos,
    'reserved_nanos', team_reserved_nanos,
    'balance_usd', round((team_balance_nanos::numeric / 1000000000.0)::numeric, 2),
    'balance_is_low', team_balance_nanos < min_balance_nanos,
    'total_requests', team_total_requests,
    'total_spend_nanos', team_total_spend_nanos,
    'total_spend_usd', round((team_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_24h_nanos', team_spend_24h_nanos,
    'spend_24h_usd', round((team_spend_24h_nanos::numeric / 1000000000.0)::numeric, 4),
    'spend_7d_nanos', team_spend_7d_nanos,
    'spend_7d_usd', round((team_spend_7d_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_30d_nanos', team_spend_30d_nanos,
    'spend_30d_usd', round((team_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_1h', team_requests_1h,
    'requests_24h', team_requests_24h
  );

  -- Key metadata & aggregates
  select
    k.name,
    k.created_at
  into
    key_name,
    key_created_at
  from public.keys k
  where k.id = gateway_context_access.api_key_id
  limit 1;

  -- Lifetime key analytics are not required to authenticate or enforce limits.

  key_enrichment := jsonb_build_object(
    'name', key_name,
    'created_at', to_jsonb(key_created_at),
    'key_age_days', extract(epoch from (now_utc - key_created_at)) / 86400,
    'total_requests', key_total_requests,
    'total_spend_nanos', key_total_spend_nanos,
    'total_spend_usd', round((key_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_today', used_day_reqs,
    'spend_today_nanos', used_day_cost,
    'spend_today_usd', round((used_day_cost::numeric / 1000000000.0)::numeric, 4),
    'daily_limit_pct', case
      when v_day_req_limit > 0 then round((used_day_reqs::numeric / v_day_req_limit::numeric * 100)::numeric, 1)
      else null
    end
  );

  providers := '[]'::jsonb;
  pricing := '{}'::jsonb;

  return jsonb_build_object(
    'workspace_id', gateway_context_access.workspace_id,
    'resolved_model', resolved_model,
    'preset', preset_data,
    'key_ok', key_status,
    'key_limit_ok', key_limit_status,
    'credit_ok', credit_status,
    'providers', providers,
    'pricing', pricing,
    'team_enrichment', team_enrichment,
    'key_enrichment', key_enrichment
  );
end;

$function$;

GRANT EXECUTE ON FUNCTION "private"."gateway_context_access"(uuid, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "private"."gateway_context_access"(uuid, text, text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."gateway_context_access"(uuid, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."gateway_context_access"(uuid, text, text, uuid) TO "postgres";

CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_without_workspace_budget (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  credit_status       jsonb;
  key_status          jsonb;
  key_limit_status    jsonb;
  min_balance_nanos bigint := case when endpoint like 'video.%' or endpoint like 'batch%' then 1000000000 else 100000000 end; -- 1.00 USD

  providers           jsonb;
  pricing             jsonb;
  preset_data         jsonb := null;
  preset_matches      jsonb := null;

  -- key row fields
  v_key_active        boolean;
  v_key_team_ok       boolean;
  v_soft_blocked      boolean;

  v_day_req_limit     bigint;
  v_wk_req_limit      bigint;
  v_mo_req_limit      bigint;
  v_day_cost_limit    bigint;
  v_wk_cost_limit     bigint;
  v_mo_cost_limit     bigint;

  now_utc             timestamptz := (now() at time zone 'utc');
  day_start           timestamptz := date_trunc('day',  now_utc);
  week_start          timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start         timestamptz := date_trunc('month', now_utc);

  used_day_reqs       bigint;
  used_wk_reqs        bigint;
  used_mo_reqs        bigint;
  used_day_cost       bigint;
  used_wk_cost        bigint;
  used_mo_cost        bigint;

  within_limits       boolean := true;
  limit_reason        text := null;
  limit_window        text := null;
  limit_metric        text := null;
  current_value       bigint := null;
  limit_value         bigint := null;
  limit_reset_at      timestamptz := null;

  -- Preset handling
  is_preset           boolean := false;
  preset_name         text := null;
  preset_publisher    text := null;
  preset_ref          text := null;
  pinned_version      jsonb := null;

  -- Resolve model from alias if exists
  resolved_model      text := gateway_fetch_request_context_without_workspace_budget.model;
  base_model          text;

  team_enrichment     jsonb;
  key_enrichment      jsonb;

  -- Team aggregates
  team_total_requests bigint;
  team_total_spend_nanos bigint;
  team_spend_24h_nanos bigint;
  team_spend_7d_nanos bigint;
  team_spend_30d_nanos bigint;
  team_requests_1h bigint;
  team_requests_24h bigint;
  team_created_at timestamptz;
  team_tier text;
  team_balance_nanos bigint;
  team_reserved_nanos bigint;

  -- Key aggregates
  key_name text;
  key_created_at timestamptz;
  key_total_requests bigint;
  key_total_spend_nanos bigint;
begin
  base_model := gateway_fetch_request_context_without_workspace_budget.model;
  -- hard requirement: key must be provided
  if gateway_fetch_request_context_without_workspace_budget.api_key_id is null then
    raise exception using errcode = '22023', message = 'missing_api_key', detail = 'api_key_id is required';
  end if;

  -- Check if model is a preset (starts with @)
  if base_model like '@%' then
    is_preset := true;
    preset_name := substring(base_model from 2); -- Remove @ prefix
    -- "@slug@ref" and "@handle/slug@ref" pin a published version: its label
    -- (v3, 1.2.0, 2026.10.27) or a named label such as production.
    if position('@' in preset_name) > 0 then
      preset_ref := substring(preset_name from position('@' in preset_name) + 1);
      preset_name := substring(preset_name from 1 for position('@' in preset_name) - 1);
    end if;

    -- Fetch preset configuration. Qualified references resolve a
    -- public publisher globally; unqualified references remain workspace-local.
    if position('/' in preset_name) > 0 then
      preset_publisher := split_part(preset_name, '/', 1);
      preset_name := substring(preset_name from position('/' in preset_name) + 1);
      select jsonb_agg(m.match) into preset_matches from (
        select jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'config', p.config, 'visibility', p.visibility, 'publisher', w.publisher_handle,
        'version_id', p.active_version_id,
        'version_label', (select v.version_label from public.preset_versions v where v.id = p.active_version_id)
      ) as match
      from public.presets p
      join public.workspaces w on w.id = p.workspace_id
      where p.archived_at is null and lower(p.slug) = lower(preset_name)
        and p.visibility = 'public'
        and true
        and (lower(w.publisher_handle) = lower(preset_publisher) or exists (select 1 from public.workspace_publisher_handle_aliases alias where alias.workspace_id = w.id and alias.handle = lower(preset_publisher)))
      limit 2
      ) m;
      -- Slugs are matched case-insensitively; two matches would make the choice arbitrary.
      if jsonb_array_length(coalesce(preset_matches, '[]'::jsonb)) > 1 then
        raise exception using
          errcode = '22023',
          message = 'preset_ambiguous',
          detail = format('Preset "%s" matches more than one preset', preset_name);
      end if;
      preset_data := preset_matches -> 0;
    else
      select jsonb_agg(m.match) into preset_matches from (
        select jsonb_build_object(
        'id', p.id, 'name', p.name,
        'slug', coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', '')),
        'description', p.description, 'config', p.config, 'visibility', p.visibility,
        'version_id', p.active_version_id,
        'version_label', (select v.version_label from public.preset_versions v where v.id = p.active_version_id)
      ) as match
      from public.presets p
      where p.archived_at is null and lower(coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', ''))) = lower(preset_name)
        and p.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
        and (
          p.visibility in ('public', 'team')
          or p.created_by = (
            select ak.created_by from public.keys ak
            where ak.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
              and ak.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and ak.status = 'active'
          )
        )
      limit 2
      ) m;
      -- Slugs are matched case-insensitively; two matches would make the choice arbitrary.
      if jsonb_array_length(coalesce(preset_matches, '[]'::jsonb)) > 1 then
        raise exception using
          errcode = '22023',
          message = 'preset_ambiguous',
          detail = format('Preset "%s" matches more than one preset', preset_name);
      end if;
      preset_data := preset_matches -> 0;
    end if;

    if preset_data is null then
      raise exception using
        errcode = '22023',
        message = 'preset_not_found',
        detail = format('Preset "%s" not found or not accessible', preset_name);
    end if;

    if preset_ref is not null then
      -- An exact version label (v3, 1.2.0, 2026.10.27) wins; otherwise a named
      -- label points at a version. Labels never look like version labels.
      -- Public references reach public versions only; workspace references
      -- apply the preset access rule to the pinned version's visibility.
      select jsonb_build_object(
        'name', v.name, 'slug', v.slug, 'description', v.description,
        'config', v.config, 'visibility', v.visibility,
        'version_id', v.id, 'version_label', v.version_label, 'ref', preset_ref
      ) into pinned_version
      from public.preset_versions v
      where v.preset_id = (preset_data->>'id')::uuid
        and v.id = coalesce(
          (select exact.id from public.preset_versions exact
            where exact.preset_id = v.preset_id and exact.version_label = preset_ref),
          (select l.version_id from public.preset_version_labels l
            where l.preset_id = v.preset_id and l.label = lower(preset_ref))
        )
        and case
          when preset_publisher is not null then v.visibility = 'public'
          else v.visibility in ('public', 'team') or exists (
            select 1 from public.presets p
            join public.keys ak on ak.created_by = p.created_by
            where p.id = v.preset_id
              and ak.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
              and ak.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and ak.status = 'active'
          )
        end;
      if pinned_version is null then
        raise exception using
          errcode = '22023',
          message = 'preset_version_not_found',
          detail = format('Version "%s" of preset "%s" not found', preset_ref, preset_name);
      end if;
      preset_data := preset_data || pinned_version;
    end if;

    -- Extract model from preset config (fallback to default/default_model/model/first models entry)
    base_model := coalesce(
      preset_data->'config'->>'defaultModel',
      preset_data->'config'->>'default_model',
      preset_data->'config'->>'model',
      preset_data->'config'->'models'->>0,
      preset_data->'config'->'allowedModels'->>0,
      preset_data->'config'->'allowed_models'->>0
    );

    if base_model is null then
      raise exception using
        errcode = '22023',
        message = 'preset_no_model',
        detail = format('Preset "%s" has no model configured', preset_name);
    end if;
  end if;

  -- Resolve alias/model indirection:
  -- 1) explicit alias table (`v2_model_aliases`)
  -- 2) provider-scoped slug form (`provider/provider_model_slug`)
  resolved_model := coalesce(
    (
      select a.api_model_id
      from (select alias_slug, model_slug as api_model_id, enabled as is_enabled from public.v2_model_aliases) a
      where a.alias_slug = base_model
        and a.is_enabled = true
        and a.api_model_id is not null
      limit 1
    ),
    (
      select m.api_model_id
      from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at, metadata from public.v2_model_provider_routes) m
      where position('/' in base_model) > 0
        and m.provider_id = split_part(base_model, '/', 1)
        and m.provider_model_slug = regexp_replace(base_model, '^[^/]+/', '')
        and m.is_active_gateway
        and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
        and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
      order by coalesce(m.effective_from, to_timestamp(0)) desc, m.provider_api_model_id
      limit 1
    ),
    base_model
  );

  -- validate key row, status, and team
  select
    (k.status = 'active'),
    (k.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id),
    k.soft_blocked,
    k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
    k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
  into
    v_key_active,
    v_key_team_ok,
    v_soft_blocked,
    v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
    v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit
  from public.keys k
  where k.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
  limit 1;

  if v_key_active is null then
    raise exception using errcode = '22023', message = 'api_key_not_found', detail = 'key id does not exist';
  end if;
  if not v_key_team_ok then
    raise exception using errcode = '22023', message = 'api_key_wrong_team', detail = 'key does not belong to provided workspace_id';
  end if;
  if not v_key_active then
    raise exception using errcode = '22023', message = 'api_key_inactive', detail = 'key status is not active';
  end if;

  key_status := jsonb_build_object('ok', true, 'mode', 'first_party');

  -- credit check
  credit_status :=
    coalesce((
      select case
        when greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0) >= min_balance_nanos then
          jsonb_build_object(
            'ok', true,
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
        else
          jsonb_build_object(
            'ok', false,
            'reason', 'insufficient_funds',
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
      end
      from public.wallets w
      where w.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
      limit 1
    ), jsonb_build_object('ok', false, 'reason', 'wallet_missing'));

  -- per-key limits (requests + cost)
  -- Unlimited keys need no history read. Unknown telemetry stays NULL.
  if greatest(v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
      v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit) > 0 then
  select
    count(*) filter (where gr.served and gr.at >= day_start)                    as used_day_reqs,
    count(*) filter (where gr.served and gr.at >= week_start)                   as used_wk_reqs,
    count(*) filter (where gr.served and gr.at >= month_start)                  as used_mo_reqs,
    coalesce(sum(gr.nanos) filter (where gr.at >= day_start), 0)::bigint   as used_day_cost,
    coalesce(sum(gr.nanos) filter (where gr.at >= week_start), 0)::bigint  as used_wk_cost,
    coalesce(sum(gr.nanos) filter (where gr.at >= month_start), 0)::bigint as used_mo_cost
  into
    used_day_reqs, used_wk_reqs, used_mo_reqs,
    used_day_cost, used_wk_cost, used_mo_cost
  -- The key's usage (private.key_spend_items): successful requests count as requests and cost,
  -- charged ones that did not succeed and money movements as cost only.
  from private.key_spend_items(gateway_fetch_request_context_without_workspace_budget.workspace_id, least(week_start, month_start), array[gateway_fetch_request_context_without_workspace_budget.api_key_id]) gr;
  end if;

  if v_soft_blocked then
    within_limits := false;
    limit_reason := 'key_limit_soft_blocked';
    limit_metric := 'soft_blocked';
  end if;
  if within_limits and v_day_req_limit > 0 and used_day_reqs >= v_day_req_limit then
    within_limits := false;
    limit_reason := 'daily_request_limit_reached';
    limit_window := 'daily';
    limit_metric := 'requests';
    current_value := used_day_reqs;
    limit_value := v_day_req_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_req_limit > 0 and used_wk_reqs >= v_wk_req_limit then
    within_limits := false;
    limit_reason := 'weekly_request_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'requests';
    current_value := used_wk_reqs;
    limit_value := v_wk_req_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_req_limit > 0 and used_mo_reqs >= v_mo_req_limit then
    within_limits := false;
    limit_reason := 'monthly_request_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'requests';
    current_value := used_mo_reqs;
    limit_value := v_mo_req_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;
  if within_limits and v_day_cost_limit > 0 and used_day_cost >= v_day_cost_limit then
    within_limits := false;
    limit_reason := 'daily_cost_limit_reached';
    limit_window := 'daily';
    limit_metric := 'cost';
    current_value := used_day_cost;
    limit_value := v_day_cost_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_cost_limit > 0 and used_wk_cost >= v_wk_cost_limit then
    within_limits := false;
    limit_reason := 'weekly_cost_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'cost';
    current_value := used_wk_cost;
    limit_value := v_wk_cost_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_cost_limit > 0 and used_mo_cost >= v_mo_cost_limit then
    within_limits := false;
    limit_reason := 'monthly_cost_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'cost';
    current_value := used_mo_cost;
    limit_value := v_mo_cost_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;

  key_limit_status :=
    jsonb_build_object(
      'ok', within_limits,
      'reason', limit_reason,
      'limit_window', limit_window,
      'limit_metric', limit_metric,
      'current_value', current_value,
      'limit_value', limit_value,
      'reset_at', to_jsonb(limit_reset_at),
      'now', to_jsonb(now_utc),
      'buckets', jsonb_build_object(
        'daily', jsonb_build_object(
          'window_start', to_jsonb(day_start),
          'requests_used', used_day_reqs,
          'requests_limit', v_day_req_limit,
          'cost_used_nanos', used_day_cost,
          'cost_limit_nanos', v_day_cost_limit
        ),
        'weekly', jsonb_build_object(
          'window_start', to_jsonb(week_start),
          'requests_used', used_wk_reqs,
          'requests_limit', v_wk_req_limit,
          'cost_used_nanos', used_wk_cost,
          'cost_limit_nanos', v_wk_cost_limit
        ),
        'monthly', jsonb_build_object(
          'window_start', to_jsonb(month_start),
          'requests_used', used_mo_reqs,
          'requests_limit', v_mo_req_limit,
          'cost_used_nanos', used_mo_cost,
          'cost_limit_nanos', v_mo_cost_limit
        )
      )
    );

  -- ============================================================================
  -- TEAM & KEY ENRICHMENT (Wide Event Context for Observability)
  -- Purpose: Gather user/team context for comprehensive logging (loggingsucks.com pattern)
  -- ============================================================================
  -- Team metadata & wallet
  select
    t.created_at,
    coalesce(t.tier, 'basic'),
    greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
    coalesce(w.reserved_nanos, 0)::bigint
  into
    team_created_at,
    team_tier,
    team_balance_nanos,
    team_reserved_nanos
  from public.workspaces t
  left join public.wallets w on w.workspace_id = t.id
  where t.id = gateway_fetch_request_context_without_workspace_budget.workspace_id
  limit 1;

  -- Historical analytics belong in reporting, not request admission.
  -- Leave their enrichment fields NULL instead of scanning lifetime logs.

  -- Calculate tier using calendar-month qualification + lock-window grace.
  -- Function maintains team tier/counters in database when state changes.
  team_tier := calculate_tier_with_grace(gateway_fetch_request_context_without_workspace_budget.workspace_id, team_spend_30d_nanos);

  team_enrichment := jsonb_build_object(
    'tier', team_tier,
    'created_at', to_jsonb(team_created_at),
    'account_age_days', extract(epoch from (now_utc - team_created_at)) / 86400,
    'balance_nanos', team_balance_nanos,
    'available_nanos', team_balance_nanos,
    'reserved_nanos', team_reserved_nanos,
    'balance_usd', round((team_balance_nanos::numeric / 1000000000.0)::numeric, 2),
    'balance_is_low', team_balance_nanos < min_balance_nanos,
    'total_requests', team_total_requests,
    'total_spend_nanos', team_total_spend_nanos,
    'total_spend_usd', round((team_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_24h_nanos', team_spend_24h_nanos,
    'spend_24h_usd', round((team_spend_24h_nanos::numeric / 1000000000.0)::numeric, 4),
    'spend_7d_nanos', team_spend_7d_nanos,
    'spend_7d_usd', round((team_spend_7d_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_30d_nanos', team_spend_30d_nanos,
    'spend_30d_usd', round((team_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_1h', team_requests_1h,
    'requests_24h', team_requests_24h
  );

  -- Key metadata & aggregates
  select
    k.name,
    k.created_at
  into
    key_name,
    key_created_at
  from public.keys k
  where k.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
  limit 1;

  -- Lifetime key analytics are not required to authenticate or enforce limits.

  key_enrichment := jsonb_build_object(
    'name', key_name,
    'created_at', to_jsonb(key_created_at),
    'key_age_days', extract(epoch from (now_utc - key_created_at)) / 86400,
    'total_requests', key_total_requests,
    'total_spend_nanos', key_total_spend_nanos,
    'total_spend_usd', round((key_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_today', used_day_reqs,
    'spend_today_nanos', used_day_cost,
    'spend_today_usd', round((used_day_cost::numeric / 1000000000.0)::numeric, 4),
    'daily_limit_pct', case
      when v_day_req_limit > 0 then round((used_day_reqs::numeric / v_day_req_limit::numeric * 100)::numeric, 1)
      else null
    end
  );

  -- provider candidates (BYOK) + pricing, fully qualifying params
  with provider_rows as (
    select distinct on (m.provider_api_model_id)
      m.provider_api_model_id,
      m.provider_id,
      m.api_model_id,
      m.provider_model_slug, coalesce((select route.metadata -> 'availability' from public.v2_model_provider_routes route where route.provider_model_id = m.provider_api_model_id and jsonb_typeof(route.metadata -> 'availability') = 'object' and (route.metadata -> 'availability' ->> 'mode') in ('allowlist', 'blocklist') and jsonb_typeof(route.metadata -> 'availability' -> 'countries') = 'array'), p.metadata -> 'availability') as availability,
      m.routing_status as model_status,
      coalesce((m.metadata->>'external_routing_override')::boolean, false) as external_routing_override,
      m.input_modalities,
      m.output_modalities,
      p.prompt_training_policy,
      p.data_policy_tier,
      p.data_policy_confidence,
      p.data_policy_contract_mode,
	  p.data_policy_variant,
      c.status as capability_status,
      coalesce(c.params,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('data_policy',public.resolve_catalog_data_policy(m.provider_api_model_id,c.capability_id))) as capability_params,
      c.max_input_tokens,
      c.max_output_tokens
    from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at, metadata from public.v2_model_provider_routes) m
    join (select model_slug as model_id, lab_slug as organisation_id, name, description, status, hidden, announced_at as announcement_date, released_at as release_date, deprecated_at as deprecation_date, retired_at as retirement_date, previous_model_slug as previous_model_id, input_modalities as input_types, output_modalities as output_types, metadata, created_at, updated_at from public.v2_models) dm
      on dm.model_id = coalesce(m.model_id, m.api_model_id)
    join public.v2_providers p
      on p.provider_slug = m.provider_id
    join (select provider_model_id as provider_api_model_id, capability_id, status, params, max_input_tokens, max_output_tokens, effective_from, effective_to, created_at, updated_at from public.v2_route_capabilities) c
      on c.provider_api_model_id = m.provider_api_model_id
    where m.api_model_id = resolved_model
      and coalesce(dm.hidden, false) = false
      and (dm.status is null or lower(dm.status) in ('active', 'available', 'deprecated', 'retired'))
      and c.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
      and c.status in ('active', 'degraded', 'deranked', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3')
      and m.is_active_gateway
      and (
        p.status <> 'external'
        or coalesce((m.metadata->>'external_routing_override')::boolean, false)
      )
      and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
      and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
    order by m.provider_api_model_id, coalesce(c.updated_at, c.created_at) desc
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'provider_id', pr.provider_id,
          'api_model_id', pr.api_model_id,
          'pricing_key', pr.provider_id,
          'provider_model_slug', pr.provider_model_slug, 'availability', pr.availability,
          'model_status', pr.model_status,
          'external_routing_override', pr.external_routing_override,
          'input_modalities', pr.input_modalities,
          'output_modalities', pr.output_modalities,
          'prompt_training_policy', coalesce(pr.prompt_training_policy, 'unknown'),
          'data_policy_tier', coalesce(pr.data_policy_tier, 'unknown'),
          'data_policy_confidence', coalesce(pr.data_policy_confidence, 'unknown'),
          'data_policy_contract_mode', coalesce(pr.data_policy_contract_mode, 'none'),
		  'data_policy_variant', coalesce(pr.data_policy_variant, 'standard'),
          'capability_status', pr.capability_status,
          'capability_params', coalesce(pr.capability_params, '{}'::jsonb),
          'max_input_tokens', pr.max_input_tokens,
          'max_output_tokens', pr.max_output_tokens,
          'supports_endpoint', true,
          'base_weight', 1,
          'byok_meta', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'provider_id', bk.provider_id,
                'id', bk.id,
                'name', bk.name,
                'fingerprint_sha256', bk.fingerprint_sha256,
                'key_version', bk.key_version,
                'always_use', bk.always_use
              )
            )
            from public.byok_keys bk
            where bk.workspace_id    = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and bk.provider_id = pr.provider_id
              and bk.enabled     = true
          ), '[]'::jsonb)
        )
      ), '[]'::jsonb
    ) as provider_payload,
    coalesce(
      jsonb_object_agg(
        pr.provider_id,
        (
          with rules as (
            select r.*
            from (select meter.sku_meter_id::text as rule_id, route.provider_slug as provider_id, route.model_slug as api_model_id, route.provider_slug || ':' || route.model_slug || ':' || sku.operation as model_key, sku.operation as capability_id, coalesce(sku.service_tier_slug, 'standard') as pricing_plan, meter.meter_key as meter, meter.unit, meter.unit_quantity as unit_size, meter.price_nanos / 1000000000.0 as price_per_unit, coalesce(nullif(meter.metadata->>'included_quantity', '')::numeric, nullif(sku.metadata->>'included_quantity', '')::numeric, 0) as included_quantity, sku.currency, coalesce(nullif(meter.metadata->>'priority', '')::integer, meter.meter_order, 100) as priority, sku.effective_from, sku.effective_to, coalesce(sku.metadata->'match', meter.metadata->'match', '[]'::jsonb) as match, coalesce(sku.metadata->>'billing_timestamp_basis', 'request_start') as billing_timestamp_basis, coalesce(sku.metadata->'time_windows', '[]'::jsonb) as time_windows, greatest(sku.updated_at, meter.updated_at) as updated_at from public.v2_pricing_skus sku join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id where sku.status = 'active' and meter.billable) r
            -- TODO: Redesign pricing selection to key on provider_api_model_id or
            -- explicit variant metadata so provider-only SKUs (for example CrofAI
            -- precision tiers) can share a parent internal model without forcing
            -- distinct api_model_id values just to preserve pricing separation.
            where r.model_key =
              pr.provider_id || ':' || resolved_model || ':' || gateway_fetch_request_context_without_workspace_budget.endpoint
              and r.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
              and (r.effective_from is null or r.effective_from <= now() at time zone 'utc')
              and (r.effective_to   is null or (now() at time zone 'utc') < r.effective_to)
          ),
          ordered_rules as (
            select
              jsonb_agg(
                jsonb_build_object(
                  'id', r.rule_id,
                  'pricing_plan', r.pricing_plan,
                  'meter', r.meter,
                  'unit', r.unit,
                  'unit_size', r.unit_size,
                  'price_per_unit', r.price_per_unit,
                  'included_quantity', r.included_quantity,
                  'currency', r.currency,
                  'match', r.match,
                  'priority', r.priority,
                  'billing_timestamp_basis', coalesce(r.billing_timestamp_basis, 'request_start'),
                  'time_windows', coalesce(r.time_windows, '[]'::jsonb)
                )
                order by r.priority desc, coalesce(r.effective_from, now() at time zone 'utc') desc
              ) as items,
              max(r.updated_at) as version_ts,
              min(r.effective_from) as effective_from,
              min(r.effective_to) as effective_to
            from rules r
          )
          select jsonb_build_object(
            'provider', pr.provider_id,
            'model', resolved_model,
            'endpoint', gateway_fetch_request_context_without_workspace_budget.endpoint,
            'effective_from', to_jsonb(o.effective_from),
            'effective_to',   to_jsonb(o.effective_to),
            'currency', 'USD',
            'version', to_jsonb(o.version_ts),
            'rules', coalesce(o.items, '[]'::jsonb)
          )
          from ordered_rules o
        )
      ),
      '{}'::jsonb
    ) as pricing_payload
  into providers, pricing
  from provider_rows pr;

  return jsonb_build_object(
    'workspace_id', gateway_fetch_request_context_without_workspace_budget.workspace_id,
    'resolved_model', resolved_model,
    'preset', preset_data,
    'key_ok', key_status,
    'key_limit_ok', key_limit_status,
    'credit_ok', credit_status,
    'providers', providers,
    'pricing', pricing,
    'team_enrichment', team_enrichment,
    'key_enrichment', key_enrichment
  );
end;

$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_without_workspace_budget"(uuid, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_without_workspace_budget"(uuid, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_without_workspace_budget"(uuid, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_without_workspace_budget"(uuid, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_wallet_reserve_once_without_workspace_budget (
  p_workspace_id   uuid,
  p_reservation_id text,
  p_amount_nanos   bigint,
  p_hold_ref_id    text    DEFAULT NULL::text,
  p_key_id         uuid    DEFAULT NULL::uuid,
  p_request_count  integer DEFAULT NULL::integer
)
  RETURNS TABLE (
    ok                    boolean,
    applied               boolean,
    reason                text,
    amount_nanos          bigint,
    before_balance_nanos  bigint,
    after_balance_nanos   bigint,
    before_reserved_nanos bigint,
    after_reserved_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.gateway_wallet_reservations%rowtype;
  v_key public.keys%rowtype;
  v_available bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  v_week_start timestamptz := (date_trunc('week', now() at time zone 'utc') at time zone 'utc');
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'utc') at time zone 'utc');
  v_day_requests bigint := 0;
  v_week_requests bigint := 0;
  v_month_requests bigint := 0;
  v_day_cost bigint := 0;
  v_week_cost bigint := 0;
  v_month_cost bigint := 0;
  v_requested_count integer := greatest(0, coalesce(p_request_count, 0));
  v_video_exposure record;
begin
  if p_workspace_id is null or coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'invalid_reservation_identity';
  end if;
  if p_amount_nanos is null or p_amount_nanos <= 0 then
    raise exception 'invalid_reservation_amount';
  end if;
  if p_key_id is not null and v_requested_count <= 0 then
    raise exception 'batch_request_count_required';
  end if;
  if v_requested_count > 10000 then
    raise exception 'batch_request_limit_exceeded';
  end if;

  select * into v_existing
  from public.gateway_wallet_reservations
  where workspace_id = p_workspace_id and reservation_id = p_reservation_id
  for update;
  if found then
    select * into v_wallet from public.wallets
    where workspace_id = p_workspace_id for update;
    if not found then
      return query select false, false, 'wallet_not_found'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if v_existing.amount_nanos <> p_amount_nanos
      or v_existing.key_id is distinct from p_key_id
      or coalesce(v_existing.request_count, 0) <> v_requested_count then
      raise exception 'reservation_identity_mismatch';
    end if;
    if v_existing.status in ('held', 'reserved') then
      return query select true, false, 'already_reserved'::text, v_existing.amount_nanos,
        coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
        coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
      return;
    end if;
    return query select false, false, 'reservation_not_active'::text, v_existing.amount_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;

  if p_key_id is not null then
    select * into v_key from public.keys where id = p_key_id for update;
    if not found then
      return query select false, false, 'key_not_found'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if v_key.workspace_id <> p_workspace_id then
      return query select false, false, 'key_wrong_workspace'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if v_key.status <> 'active' or (v_key.expires_at is not null and v_key.expires_at <= now()) then
      return query select false, false, 'key_not_active'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.soft_blocked, false) then
      return query select false, false, 'key_limit_soft_blocked'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    -- The key's usage (private.key_spend_items): successful requests count as requests and cost,
    -- charged ones that did not succeed and money movements as cost only.
    select
      count(*) filter (where usage.served and usage.at >= v_day_start),
      count(*) filter (where usage.served and usage.at >= v_week_start),
      count(*) filter (where usage.served and usage.at >= v_month_start),
      coalesce(sum(usage.nanos) filter (where usage.at >= v_day_start), 0),
      coalesce(sum(usage.nanos) filter (where usage.at >= v_week_start), 0),
      coalesce(sum(usage.nanos) filter (where usage.at >= v_month_start), 0)
    into v_day_requests, v_week_requests, v_month_requests,
      v_day_cost, v_week_cost, v_month_cost
    from private.key_spend_items(p_workspace_id, least(v_day_start, v_week_start, v_month_start), array[p_key_id]) usage;

    -- Video create audit rows have zero cost until completion. Count the unpaid
    -- portion of each reservation under the same key lock as admission. Captured
    -- reservations bridge the gap until the final request audit is persisted.
    -- Active holds remain exposure across budget-window boundaries.
    with exposure as (
      select r.created_at, r.status in ('held', 'reserved') as active,
        greatest(0, (case when r.status = 'captured'
          then coalesce(r.settled_amount_nanos, r.amount_nanos)
          else r.amount_nanos end) - coalesce(a.cost, 0)) as cost,
        case when coalesce(a.requests, 0) = 0 then 1 else 0 end as requests
      from public.gateway_wallet_reservations r
      left join lateral (
        select sum(gr.cost_nanos) as cost, count(*) as requests
        from public.gateway_requests gr
        where gr.workspace_id = r.workspace_id and gr.key_id = r.key_id
          and gr.request_id = r.hold_ref_id
          and (r.reservation_id not like 'free_model_hold:%' or
            gr.detail_metadata->>'free_model_fee_request_id' = substr(r.reservation_id, 17))
          and (gr.success is true or gr.cost_nanos > 0)
      ) a on true
      where r.workspace_id = p_workspace_id and r.key_id = p_key_id
        and (r.reservation_id like 'video_hold:%' or r.reservation_id like 'free_model_hold:%')
        and r.status in ('held', 'reserved', 'captured')
        and (r.status in ('held', 'reserved') or r.created_at >= least(v_day_start, v_week_start, v_month_start))
        -- A captured video whose debit is recorded counts through the debit, at its time
        -- (private.key_spend_items, above).
        and not (r.status = 'captured' and exists (
          select 1 from public.credit_ledger debit
          where debit.ref_type = 'async_job_charge'
            and debit.ref_id = r.workspace_id::text || ':' || r.reservation_id))
    )
    select
      coalesce(sum(cost) filter (where active or created_at >= v_day_start), 0) as day_cost,
      coalesce(sum(cost) filter (where active or created_at >= v_week_start), 0) as week_cost,
      coalesce(sum(cost) filter (where active or created_at >= v_month_start), 0) as month_cost,
      coalesce(sum(requests) filter (where active or created_at >= v_day_start), 0) as day_requests,
      coalesce(sum(requests) filter (where active or created_at >= v_week_start), 0) as week_requests,
      coalesce(sum(requests) filter (where active or created_at >= v_month_start), 0) as month_requests
    into v_video_exposure from exposure;
    v_day_cost := v_day_cost + v_video_exposure.day_cost;
    v_week_cost := v_week_cost + v_video_exposure.week_cost;
    v_month_cost := v_month_cost + v_video_exposure.month_cost;
    v_day_requests := v_day_requests + v_video_exposure.day_requests;
    v_week_requests := v_week_requests + v_video_exposure.week_requests;
    v_month_requests := v_month_requests + v_video_exposure.month_requests;

    if coalesce(v_key.daily_limit_requests, 0) > 0
      and v_day_requests + v_requested_count > v_key.daily_limit_requests then
      return query select false, false, 'daily_request_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.weekly_limit_requests, 0) > 0
      and v_week_requests + v_requested_count > v_key.weekly_limit_requests then
      return query select false, false, 'weekly_request_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.monthly_limit_requests, 0) > 0
      and v_month_requests + v_requested_count > v_key.monthly_limit_requests then
      return query select false, false, 'monthly_request_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.daily_limit_cost_nanos, 0) > 0
      and v_day_cost + p_amount_nanos > v_key.daily_limit_cost_nanos then
      return query select false, false, 'daily_cost_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.weekly_limit_cost_nanos, 0) > 0
      and v_week_cost + p_amount_nanos > v_key.weekly_limit_cost_nanos then
      return query select false, false, 'weekly_cost_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.monthly_limit_cost_nanos, 0) > 0
      and v_month_cost + p_amount_nanos > v_key.monthly_limit_cost_nanos then
      return query select false, false, 'monthly_cost_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
  end if;

  select * into v_wallet from public.wallets
  where workspace_id = p_workspace_id for update;
  if not found then
    return query select false, false, 'wallet_not_found'::text, p_amount_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;
  v_available := coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0);
  if v_available < p_amount_nanos then
    return query select false, false, 'insufficient_balance'::text, p_amount_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;

  insert into public.gateway_wallet_reservations (
    reservation_id, workspace_id, amount_nanos, status, hold_ref_id,
    key_id, request_count, created_at, updated_at
  ) values (
    p_reservation_id, p_workspace_id, p_amount_nanos, 'reserved',
    nullif(trim(coalesce(p_hold_ref_id, '')), ''), p_key_id,
    nullif(v_requested_count, 0), now(), now()
  );

  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);
  update public.wallets
  set reserved_nanos = v_before_reserved + p_amount_nanos, updated_at = now()
  where workspace_id = p_workspace_id
  returning * into v_wallet;

  if p_key_id is not null and p_reservation_id not like 'video_hold:%' and p_reservation_id not like 'free_model_hold:%' then
    insert into public.gateway_requests (
      workspace_id, request_id, endpoint, model_id, provider,
      status_code, success, usage, cost_nanos, currency, key_id
    )
    select
      p_workspace_id,
      'batch_hold_usage:' || p_reservation_id || ':' || item::text,
      'batch',
      'batch/reserved',
      null,
      202,
      true,
      jsonb_build_object('batch_reserved', true),
      (p_amount_nanos / v_requested_count)
        + case when item <= (p_amount_nanos % v_requested_count) then 1 else 0 end,
      'USD',
      p_key_id
    from generate_series(1, v_requested_count) as item
    ;
  end if;

  return query select true, true, null::text, p_amount_nanos,
    v_before_balance, coalesce(v_wallet.balance_nanos, 0),
    v_before_reserved, coalesce(v_wallet.reserved_nanos, 0);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_reserve_once_without_workspace_budget"(uuid, text, bigint, text, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_reserve_once_without_workspace_budget"(uuid, text, bigint, text, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_reserve_once_without_workspace_budget"(uuid, text, bigint, text, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_reserve_once_without_workspace_budget"(uuid, text, bigint, text, uuid, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_wallet_reserve_once (
  p_workspace_id   uuid,
  p_reservation_id text,
  p_amount_nanos   bigint,
  p_hold_ref_id    text    DEFAULT NULL::text,
  p_key_id         uuid    DEFAULT NULL::uuid,
  p_request_count  integer DEFAULT NULL::integer
)
  RETURNS TABLE (
    ok                    boolean,
    applied               boolean,
    reason                text,
    amount_nanos          bigint,
    before_balance_nanos  bigint,
    after_balance_nanos   bigint,
    before_reserved_nanos bigint,
    after_reserved_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_budget_status jsonb;
  v_department_status jsonb;
  v_balance_nanos bigint;
  v_reserved_nanos bigint;
begin
  -- Serializes holds with each other and with budget changes: the lock_workspace_budget_change
  -- trigger takes the same lock on every write to workspace_budgets and
  -- workspace_department_budgets. No budget row lock here, which would invert that order.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));

  if not exists (
    select 1 from public.gateway_wallet_reservations
    where workspace_id = p_workspace_id and reservation_id = p_reservation_id
  ) then
    v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, p_amount_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      return query select false, false, (v_budget_status->>'reason')::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    v_department_status := public.gateway_department_budget_status(p_workspace_id, p_key_id, p_amount_nanos);
    if not coalesce((v_department_status->>'ok')::boolean, true) then
      return query select false, false, (v_department_status->>'reason')::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    if p_reservation_id like 'video_hold:%' or p_reservation_id like 'batch_hold:%' then
      select coalesce(wallet.balance_nanos, 0), coalesce(wallet.reserved_nanos, 0)
      into v_balance_nanos, v_reserved_nanos
      from public.wallets wallet
      where wallet.workspace_id = p_workspace_id
      for update;
      if found and v_balance_nanos - v_reserved_nanos < 1000000000 then
        return query select false, false, 'insufficient_funds'::text, p_amount_nanos,
          v_balance_nanos, v_balance_nanos, v_reserved_nanos, v_reserved_nanos;
        return;
      end if;
    end if;
  end if;

  return query
  select * from public.gateway_wallet_reserve_once_without_workspace_budget(
    p_workspace_id, p_reservation_id, p_amount_nanos, p_hold_ref_id, p_key_id, p_request_count
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_realtime_create_with_hold (
  p_workspace_id             uuid,
  p_session_id               text,
  p_key_id                   uuid,
  p_user_id                  text,
  p_source                   text,
  p_provider                 text,
  p_model_id                 text,
  p_provider_model_id        text,
  p_voice                    text,
  p_expires_at               timestamp with time zone,
  p_reservation_prefix       text,
  p_reservation_id           text,
  p_hold_nanos               bigint,
  p_client_secret_hash       text,
  p_metadata                 jsonb                    DEFAULT '{}'::jsonb,
  p_max_workspace_sessions   integer                  DEFAULT 8,
  p_max_key_sessions         integer                  DEFAULT 4,
  p_max_user_sessions        integer                  DEFAULT 1,
  p_max_creations_per_minute integer                  DEFAULT 8
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_budget_status jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, p_hold_nanos);
  if not coalesce((v_budget_status->>'ok')::boolean, true) then
    raise exception '%', v_budget_status->>'reason';
  end if;
  v_budget_status := public.gateway_department_budget_status(p_workspace_id, p_key_id, p_hold_nanos);
  if not coalesce((v_budget_status->>'ok')::boolean, true) then
    raise exception '%', v_budget_status->>'reason';
  end if;

  return query select * from public.gateway_realtime_create_with_hold_without_workspace_budget(
    p_workspace_id, p_session_id, p_key_id, p_user_id, p_source, p_provider,
    p_model_id, p_provider_model_id, p_voice, p_expires_at, p_reservation_prefix,
    p_reservation_id, p_hold_nanos, p_client_secret_hash, p_metadata,
    p_max_workspace_sessions, p_max_key_sessions, p_max_user_sessions,
    p_max_creations_per_minute
  );
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_realtime_extend_hold_once (
  p_workspace_id          uuid,
  p_session_id            text,
  p_reservation_id        text,
  p_target_reserved_nanos bigint,
  p_estimated_cost_nanos  bigint DEFAULT 0
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_current_reserved_nanos bigint;
  v_key_id uuid;
  v_additional_nanos bigint;
  v_budget_status jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select reserved_nanos, key_id into v_current_reserved_nanos, v_key_id
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id;
  if not found then raise exception 'realtime_session_not_found'; end if;

  v_additional_nanos := greatest(0, coalesce(p_target_reserved_nanos, 0) - coalesce(v_current_reserved_nanos, 0));
  if v_additional_nanos > 0 then
    v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, v_additional_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      raise exception '%', v_budget_status->>'reason';
    end if;
    v_budget_status := public.gateway_department_budget_status(p_workspace_id, v_key_id, v_additional_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      raise exception '%', v_budget_status->>'reason';
    end if;
  end if;

  return query select * from public.gateway_realtime_extend_hold_once_without_workspace_budget(
    p_workspace_id, p_session_id, p_reservation_id, p_target_reserved_nanos,
    p_estimated_cost_nanos
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_context jsonb;
  v_budget_status jsonb;
begin
  v_context := public.gateway_fetch_request_context_without_workspace_budget(workspace_id, model, endpoint, api_key_id);
  v_budget_status := public.gateway_workspace_budget_status(workspace_id, 0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean, true)
    and not coalesce((v_budget_status->>'ok')::boolean, true) then
    v_context := jsonb_set(v_context, '{key_limit_ok}', v_budget_status, true);
  end if;
  -- Department budgets, for when the SpendLimit Durable Object cannot decide. Budgets that apply
  -- are returned even below their limit, so the gateway never caches this admission.
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean, true) then
    v_budget_status := public.gateway_department_budget_status(workspace_id, api_key_id, 0);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      v_context := jsonb_set(v_context, '{key_limit_ok}', v_budget_status, true);
    elsif jsonb_array_length(coalesce(v_budget_status->'department_budgets', '[]'::jsonb)) > 0 then
      v_context := jsonb_set(v_context, '{key_limit_ok,department_budgets}', v_budget_status->'department_budgets', true);
    end if;
  end if;
  return v_context;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) IS 'V2 gateway request context with current and historical workspace publisher handle resolution.';

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_bundle (
  workspace_id    uuid,
  model           text,
  endpoint        text,
  api_key_id      uuid,
  include_catalog boolean DEFAULT true
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_context jsonb;
  v_budget jsonb;
  v_department jsonb;
  v_byok jsonb;
  v_settings jsonb;
  v_billing text;
  v_catalog jsonb;
  v_endpoints text[];
begin
  if model like '@%' or endpoint not in ('responses','chat.completions','messages','text.generate') then
    raise exception 'unsupported_context_bundle' using errcode='22023';
  end if;
  v_context := private.gateway_context_access(workspace_id,model,endpoint,api_key_id);
  v_budget := public.gateway_workspace_budget_status(workspace_id,0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean,true) and not coalesce((v_budget->>'ok')::boolean,true) then
    v_context := jsonb_set(v_context,'{key_limit_ok}',v_budget,true);
  end if;
  -- Department budgets, for when the SpendLimit Durable Object cannot decide. Budgets that apply
  -- are returned even below their limit, so Workers never reuse this admission snapshot.
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean,true) then
    v_department := public.gateway_department_budget_status(workspace_id,api_key_id,0);
    if not coalesce((v_department->>'ok')::boolean,true) then
      v_context := jsonb_set(v_context,'{key_limit_ok}',v_department,true);
    elsif jsonb_array_length(coalesce(v_department->'department_budgets','[]'::jsonb))>0 then
      v_context := jsonb_set(v_context,'{key_limit_ok,department_budgets}',v_department->'department_budgets',true);
    end if;
  end if;
  -- Return configured workspace budgets even when below their limit, so Workers
  -- never reuse an admission snapshot for a workspace with a spending cap.
  if jsonb_array_length(coalesce(v_budget->'budgets','[]'::jsonb))>0 then
    v_context := jsonb_set(v_context,'{key_limit_ok,budgets}',v_budget->'budgets',true);
  end if;
  select coalesce(jsonb_object_agg(provider_id,items),'{}'::jsonb) into v_byok from (
    select bk.provider_id,jsonb_agg(jsonb_build_object('provider_id',bk.provider_id,'id',bk.id,
      'fingerprint_sha256',bk.fingerprint_sha256,'key_version',bk.key_version,'always_use',bk.always_use)) as items
    from public.byok_keys bk where bk.workspace_id=gateway_fetch_request_context_bundle.workspace_id and bk.enabled
    group by bk.provider_id
  ) byok;
  select jsonb_build_object(
    'routing_mode',s.routing_mode,'byok_fallback_enabled',s.byok_fallback_enabled,'beta_channel_enabled',s.beta_channel_enabled,
    'alpha_channel_enabled',s.alpha_channel_enabled,'cache_aware_routing_enabled',s.cache_aware_routing_enabled,
    'privacy_zdr_only',s.privacy_zdr_only,'privacy_enable_paid_may_train',s.privacy_enable_paid_may_train,
    'privacy_enable_free_may_train',s.privacy_enable_free_may_train,'privacy_enable_input_output_logging',s.privacy_enable_input_output_logging,
    'io_logging_enabled',s.io_logging_enabled,'io_logging_include_provider_payloads',s.io_logging_include_provider_payloads,
    'data_contribution_enabled',s.data_contribution_enabled,'data_contribution_policy_version',s.data_contribution_policy_version,
    'data_contribution_sample_rate_bps',s.data_contribution_sample_rate_bps,'data_contribution_classifier_sample_rate_bps',s.data_contribution_classifier_sample_rate_bps,
    'data_contribution_discount_bps',s.data_contribution_discount_bps,'response_healing_enabled',s.response_healing_enabled,
    'response_healing_locked',s.response_healing_locked,'response_healing_mode',s.response_healing_mode
  ) into v_settings from public.workspace_settings s where s.workspace_id=gateway_fetch_request_context_bundle.workspace_id;
  select billing_mode into v_billing from public.workspaces where id=workspace_id;
  if v_settings is null or v_billing is null or v_billing not in ('wallet','invoice') then
    raise exception 'workspace_context_enrichment_missing';
  end if;
  v_endpoints := case when endpoint='text.generate' then array['text.generate'] else array['text.generate',endpoint] end;
  if include_catalog then v_catalog := public.gateway_fetch_public_catalog(model,v_endpoints); end if;
  return jsonb_build_object('context',v_context,'byok',v_byok,'settings',v_settings,'billingMode',v_billing,'catalog',v_catalog);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.deduct_and_check_top_up (
  p_workspace_id uuid,
  p_cost_nanos   bigint
)
  RETURNS json
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_new_balance bigint;
  v_overdraft_nanos bigint;
  v_low boolean;
  v_trigger_top_up boolean;
begin
  if p_cost_nanos is null or p_cost_nanos <= 0 then
    raise exception 'invalid_cost_nanos';
  end if;

  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  -- Nothing was debited, so the caller must not record this charge as applied.
  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- The request has already been served, so its real cost is always charged.
  -- When it is more than the unreserved balance the wallet goes into overdraft
  -- (balance below reserved, or below zero); admission then blocks the
  -- workspace until it is topped up. overdraft_nanos is the part of this cost
  -- that the unreserved balance did not cover.
  v_new_balance := v_wallet.balance_nanos - p_cost_nanos;
  v_overdraft_nanos := greatest(0, p_cost_nanos - greatest(0, v_wallet.balance_nanos - coalesce(v_wallet.reserved_nanos, 0)));

  -- One auto top-up at a time: the marker is set under this row lock and
  -- cleared when the top-up is credited, or expires after 15 minutes.
  v_low := v_wallet.auto_top_up_enabled and v_new_balance < v_wallet.low_balance_threshold;
  v_trigger_top_up := v_low and (
    v_wallet.auto_top_up_in_flight_until is null or v_wallet.auto_top_up_in_flight_until <= now()
  );

  update public.wallets
  set balance_nanos = v_new_balance,
      auto_top_up_in_flight_until = case
        when v_trigger_top_up then now() + interval '15 minutes'
        else auto_top_up_in_flight_until
      end
  where workspace_id = p_workspace_id;

  if v_trigger_top_up then
    return json_build_object(
      'status', 'top_up_required',
      'auto_top_up_amount_nanos', v_wallet.auto_top_up_amount,
      'auto_top_up_account_id', v_wallet.auto_top_up_account_id,
      'stripe_customer_id', v_wallet.stripe_customer_id,
      'new_balance_nanos', v_new_balance,
      'overdraft_nanos', v_overdraft_nanos
    );
  end if;
  if v_low then
    return json_build_object('status', 'top_up_pending', 'new_balance_nanos', v_new_balance, 'overdraft_nanos', v_overdraft_nanos);
  end if;
  return json_build_object('status', 'top_up_not_required', 'new_balance_nanos', v_new_balance, 'overdraft_nanos', v_overdraft_nanos);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_wallet_release_stale_orphan_batch_reservations (
  p_older_than_seconds integer DEFAULT 1800,
  p_limit              integer DEFAULT 100
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_released integer := 0;
begin
  -- Batch holds with no batch operation, and video holds at least a day old whose video
  -- operation is missing, failed or cancelled, or completed and already billed. A video still
  -- queued or running, or completed but not billed, keeps its hold for billing to settle.
  for v_reservation in
    select reservation.*
    from public.gateway_wallet_reservations reservation
    where reservation.status in ('held', 'reserved')
      and (
        (reservation.reservation_id like 'batch_hold:%'
          and reservation.created_at < now() - make_interval(secs => greatest(300, p_older_than_seconds))
          and not exists (
            select 1
            from public.gateway_async_operations operation
            where operation.workspace_id = reservation.workspace_id
              and operation.kind = 'batch'
              and (
                operation.request_id = reservation.hold_ref_id
                or operation.meta ->> 'reservationId' = reservation.reservation_id
                or operation.meta ->> 'reservation_id' = reservation.reservation_id
              )
          ))
        or (reservation.reservation_id like 'video_hold:%'
          and reservation.created_at < now() - make_interval(secs => greatest(86400, p_older_than_seconds))
          and not exists (
            select 1
            from public.gateway_async_operations operation
            where operation.workspace_id = reservation.workspace_id
              and operation.kind = 'video'
              and (
                operation.request_id = reservation.hold_ref_id
                or operation.meta ->> 'reservationId' = reservation.reservation_id
                or operation.meta ->> 'reservation_id' = reservation.reservation_id
              )
              and not (
                operation.status in ('failed', 'cancelled', 'canceled', 'expired')
                or (operation.status = 'completed' and operation.billed_at is not null)
              )
          ))
      )
    order by reservation.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
  loop
    update public.wallets
    set reserved_nanos = greatest(0, coalesce(reserved_nanos, 0) - v_reservation.amount_nanos),
        updated_at = now()
    where workspace_id = v_reservation.workspace_id
      and coalesce(reserved_nanos, 0) >= v_reservation.amount_nanos;

    if found then
      update public.gateway_wallet_reservations
      set status = 'released',
          release_ref_id = case when v_reservation.reservation_id like 'video_hold:%'
            then 'stale_orphan_video_reaper' else 'stale_orphan_batch_reaper' end,
          released_at = now(),
          updated_at = now()
      where workspace_id = v_reservation.workspace_id
        and reservation_id = v_reservation.reservation_id;
      v_released := v_released + 1;
    end if;
  end loop;
  return v_released;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_release_stale_orphan_batch_reservations"(integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_release_stale_orphan_batch_reservations"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_release_stale_orphan_batch_reservations"(integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_release_stale_orphan_batch_reservations"(integer, integer) FROM PUBLIC, "anon", "authenticated";

DROP FUNCTION IF EXISTS public.wallet_apply_delta(uuid, bigint);
