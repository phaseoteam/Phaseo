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
  --   (b) a row pending reconciliation (expected_cost_nanos set, or
  --       detail_metadata.accounting_finalization.billing_status 'pending_reconciliation') whose
  --       gateway_request_charges row was applied (a pending row with none counts its audit cost);
  --   (c) a batch's batch_usage rows once the batch is debited, and its batch_hold_usage
  --       placeholders once its hold has settled.
  --
  -- The SpendLimit Durable Object counts an admission it still holds from memory and lists both
  -- its ids: p_exclude_charge_ids leaves out charge rows by billing request id
  -- (gateway_request_charges.request_id), p_exclude_request_ids request rows by request id.
  -- Charges before 2026-11-04 00:00 UTC are left out: request rows recorded billing_request_id only
  -- from 2026-11-03 14:43 UTC, so an older charge's request row cannot be matched and already
  -- counts.
  --
  -- * 'stepped': every adjustment ledger row of a request charged in steps (rule a), debits and
  --   refunds, at its time, attributed to the key on the charge row.
  -- * 'charge': a one-off charge (no adjustment rows) at its time, while its request row has not
  --   landed or one is pending reconciliation (rule b), each found per charge with LIMIT 1 on
  --   #3534's (workspace_id, billing_request_id) index.
  -- * 'batch': a batch's debit, whole, at its time (rule c): a batch_capture:<batch> charge, or a
  --   reserved batch's async_job_charge ledger row (gateway_wallet_settle_once).
  -- * 'unpaid': what a request pending reconciliation with an applied charge (stepped or one-off)
  --   has not collected, greatest(max(expected_cost_nanos) - charge.cost_nanos, 0) per billing
  --   request id, at the time of the row with the largest expected amount.
  select 'stepped'::text, charge.request_id, charge.key_id, movement.created_at, -movement.amount_nanos
  from public.credit_ledger movement
  join public.gateway_request_charges charge
    on charge.workspace_id = movement.workspace_id
    and charge.request_id = movement.source_ref_id
  where movement.workspace_id = p_workspace_id
    and movement.ref_type = 'gateway_request_charge'
    and movement.source_ref_type = 'gateway_request'
    and movement.status = 'applied'
    and movement.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and (p_key_ids is null or charge.key_id = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'charge'::text, charge.request_id, charge.key_id, charge.created_at, charge.cost_nanos
  from public.gateway_request_charges charge
  left join lateral (
    select 1 as found
    from public.gateway_requests request
    where request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
    limit 1
  ) audit on true
  left join lateral (
    select 1 as found
    from public.gateway_requests request
    where request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
      and (request.expected_cost_nanos is not null
        or coalesce(request.detail_metadata #>> '{accounting_finalization,billing_status}' = 'pending_reconciliation', false))
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
    and charge.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and not starts_with(charge.request_id, 'batch_capture:')
    and (audit.found is null or pending.found is not null)
    and stepped.found is null
    and (p_key_ids is null or charge.key_id = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'batch'::text, charge.request_id, charge.key_id, charge.created_at, charge.cost_nanos
  from public.gateway_request_charges charge
  where charge.workspace_id = p_workspace_id
    and starts_with(charge.request_id, 'batch_capture:')
    and charge.status = 'applied'
    and charge.cost_nanos > 0
    and charge.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and (p_key_ids is null or charge.key_id = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'batch'::text, debit.ref_id, hold.key_id, debit.created_at, -debit.amount_nanos
  from public.credit_ledger debit
  join public.gateway_wallet_reservations hold
    on hold.workspace_id = debit.workspace_id
    and hold.reservation_id = substr(debit.ref_id, length(debit.workspace_id::text) + 2)
  where debit.workspace_id = p_workspace_id
    and debit.ref_type = 'async_job_charge'
    and starts_with(debit.ref_id, p_workspace_id::text || ':batch_hold:')
    and debit.amount_nanos < 0
    and debit.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and (p_key_ids is null or hold.key_id = any (p_key_ids))
  union all
  select 'unpaid'::text, owed.billing_request_id, owed.key_id, owed.at, owed.nanos
  from (
    select distinct on (request.billing_request_id)
      request.billing_request_id, request.key_id, request.created_at as at,
      request.expected_cost_nanos - charge.cost_nanos as nanos
    from public.gateway_requests request
    join public.gateway_request_charges charge
      on charge.workspace_id = request.workspace_id
      and charge.request_id = request.billing_request_id
      and charge.status = 'applied'
    where request.workspace_id = p_workspace_id
      and request.expected_cost_nanos is not null
      and (p_key_ids is null or request.key_id = any (p_key_ids))
      and request.created_at >= coalesce(p_since, '-infinity'::timestamptz)
      and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
    order by request.billing_request_id, request.expected_cost_nanos desc, request.created_at
  ) owed
  where owed.nanos > 0;
$function$;

COMMENT ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'Spend counted toward budgets and key caps from money movements, each at its time: adjustment ledger rows of requests charged in steps, one-off charges whose request row has not landed or is pending reconciliation, batch debits, and what a request pending reconciliation with an applied charge has not collected. Charge rows the SpendLimit Durable Object holds are excluded by billing request id, request rows by request id.';

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";

-- private.gateway_context_access runs as its caller (service_role, through
-- gateway_fetch_request_context_bundle) and reads this.
GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "service_role";
