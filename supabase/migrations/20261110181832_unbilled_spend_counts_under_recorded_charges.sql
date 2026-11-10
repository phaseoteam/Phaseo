SET LOCAL lock_timeout = '10s';

-- Functions only: no table is locked here.
--
-- A one-off charge also counts when its request rows under-record it: a Worker older than the
-- lost-charge fix wrote a failure after a confirmed debit with no cost_nanos, and that stored row
-- hid the debit from budgets, key limits and spend guardrails. private.unbilled_spend now counts
-- what such rows' cost falls short of the applied charge (none of them succeeded), and takes the
-- key from the matched request row when the charge has none. Every budget, key and guardrail
-- reader reaches one-off charges through it.

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

COMMENT ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'Spend counted toward budgets and key caps from money movements, each at its time: adjustment ledger rows of requests charged in steps, one-off charges whose request row has not landed or is pending reconciliation (or what failure rows that under-record a charge fall short of it), batch debits, and what a delivered request with an expected bill has not had counted (its applied charge, or else the cost of its own rows). Charge rows the SpendLimit Durable Object holds are excluded by billing request id, request rows by request id.';

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";

-- private.gateway_context_access runs as its caller (service_role, through
-- gateway_fetch_request_context_bundle) and reads this.
GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "service_role";
