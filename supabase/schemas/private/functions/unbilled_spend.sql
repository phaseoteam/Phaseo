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
  -- Spend that budgets and key caps count although no ordinary request row carries it yet, one
  -- row per wallet movement, by billing request id. p_key_ids limits the rows to those keys (NULL:
  -- the whole workspace); p_since (NULL: all time) is the earliest window the caller counts.
  --
  -- The SpendLimit Durable Object counts an admission it still holds from memory and lists both
  -- its ids: p_exclude_charge_ids leaves out charge rows by billing request id
  -- (gateway_request_charges.request_id), p_exclude_request_ids request rows by request id.
  --
  -- A wallet charge counts until a gateway_requests row with its billing_request_id lands (that
  -- row then counts), probed per charge with LIMIT 1 on #3534's (workspace_id, billing_request_id)
  -- index. Charges before 2026-11-04 00:00 UTC are left out: request rows recorded
  -- billing_request_id only from 2026-11-03 14:43 UTC, so an older charge's audit row cannot be
  -- matched and is already counted.
  --
  -- * 'stepped': a stream charged at drain checkpoints (gateway_charge_request_total), through the
  --   adjustment ledger rows it writes, one per debit or refund, each at its own time; attributed
  --   to the key on the charge row.
  -- * 'charge': a one-off charge (no adjustment rows), one movement at the charge's time.
  -- * 'batch': a correction at the debit's time that makes a batch count exactly its debit: the
  --   debit less the per-row request rows that already count it, which may be negative (a capture
  --   cheaper than its hold, whose batch_hold_usage placeholders were written at the held price).
  --   The rows stay in their own windows. A batch without a reservation is charged as
  --   batch_capture:<batch>; a reserved batch is settled into an async_job_charge ledger row
  --   (gateway_wallet_settle_once). Rows are found by batch identity, whenever they were written:
  --   the batch_usage:<batch>: (or batch_hold_usage:<reservation>:) prefix, as a range on
  --   gateway_requests_batch_rows_idx (text_pattern_ops, since the collation is not C).
  -- * 'unpaid': a delivered request whose wallet charge failed (expected_cost_nanos, pending
  --   reconciliation): the part of the expected amount cost_nanos does not cover, so the row
  --   counts greatest(cost_nanos, expected_cost_nanos) and a later charge never counts twice.
  select 'stepped'::text, charge.request_id, charge.key_id, movement.created_at, -movement.amount_nanos
  from public.credit_ledger movement
  join public.gateway_request_charges charge
    on charge.workspace_id = movement.workspace_id
    and charge.request_id = movement.source_ref_id
  left join lateral (
    select 1 as found
    from public.gateway_requests request
    where request.workspace_id = charge.workspace_id
      and request.billing_request_id = charge.request_id
    limit 1
  ) audit on true
  where movement.workspace_id = p_workspace_id
    and movement.ref_type = 'gateway_request_charge'
    and movement.source_ref_type = 'gateway_request'
    and movement.status = 'applied'
    and movement.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and audit.found is null
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
    and audit.found is null
    and stepped.found is null
    and (p_key_ids is null or charge.key_id = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'batch'::text, charge.request_id, charge.key_id, charge.created_at,
    charge.cost_nanos - coalesce(persisted.cost, 0)
  from public.gateway_request_charges charge
  left join lateral (
    select sum(request.cost_nanos) as cost
    from public.gateway_requests request
    where request.workspace_id = charge.workspace_id
      -- The constant range selects gateway_requests_batch_rows_idx; the second is this batch's rows.
      and request.request_id ~>=~ 'batch' and request.request_id ~<~ 'batci'
      and request.request_id ~>=~ ('batch_usage:' || substr(charge.request_id, 15) || ':') and request.request_id ~<~ ('batch_usage:' || substr(charge.request_id, 15) || ';')
      and request.cost_nanos > 0
  ) persisted on true
  where charge.workspace_id = p_workspace_id
    and starts_with(charge.request_id, 'batch_capture:')
    and charge.status = 'applied'
    and charge.cost_nanos > 0
    and charge.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and (p_key_ids is null or charge.key_id = any (p_key_ids))
    and not (charge.request_id = any (coalesce(p_exclude_charge_ids, '{}'::text[])))
  union all
  select 'batch'::text, debit.ref_id, hold.key_id, debit.created_at,
    -debit.amount_nanos - coalesce(persisted.cost, 0) - coalesce(placeholders.cost, 0)
  from public.credit_ledger debit
  join public.gateway_wallet_reservations hold
    on hold.workspace_id = debit.workspace_id
    and hold.reservation_id = substr(debit.ref_id, length(debit.workspace_id::text) + 2)
  left join lateral (
    select sum(request.cost_nanos) as cost
    from public.gateway_requests request
    where request.workspace_id = debit.workspace_id
      -- The constant range selects gateway_requests_batch_rows_idx; the second is this batch's rows.
      and request.request_id ~>=~ 'batch' and request.request_id ~<~ 'batci'
      and request.request_id ~>=~ ('batch_usage:' || debit.source_ref_id || ':') and request.request_id ~<~ ('batch_usage:' || debit.source_ref_id || ';')
      and request.cost_nanos > 0
  ) persisted on true
  left join lateral (
    select sum(request.cost_nanos) as cost
    from public.gateway_requests request
    where request.workspace_id = debit.workspace_id
      -- The constant range selects gateway_requests_batch_rows_idx; the second is this batch's rows.
      and request.request_id ~>=~ 'batch' and request.request_id ~<~ 'batci'
      and request.request_id ~>=~ ('batch_hold_usage:' || hold.reservation_id || ':') and request.request_id ~<~ ('batch_hold_usage:' || hold.reservation_id || ';')
      and request.cost_nanos > 0
  ) placeholders on true
  where debit.workspace_id = p_workspace_id
    and debit.ref_type = 'async_job_charge'
    and starts_with(debit.ref_id, p_workspace_id::text || ':batch_hold:')
    and debit.amount_nanos < 0
    and debit.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and (p_key_ids is null or hold.key_id = any (p_key_ids))
  union all
  select 'unpaid'::text, request.billing_request_id, request.key_id, request.created_at,
    request.expected_cost_nanos - greatest(coalesce(request.cost_nanos, 0), 0)
  from public.gateway_requests request
  where request.workspace_id = p_workspace_id
    and request.expected_cost_nanos is not null
    and request.expected_cost_nanos > greatest(coalesce(request.cost_nanos, 0), 0)
    and (p_key_ids is null or request.key_id = any (p_key_ids))
    and request.created_at >= coalesce(p_since, '-infinity'::timestamptz)
    and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])));
$function$;

COMMENT ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) IS 'Spend counted toward budgets and key caps that no ordinary request row carries yet, by wallet movement: stepped charges through their adjustment ledger rows (each at its time), one-off charges without a request row, batch debits their rows do not cover, and the uncharged part of delivered requests pending reconciliation (expected_cost_nanos). Charge rows the SpendLimit Durable Object holds are excluded by billing request id, request rows by request id.';

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "postgres";

-- private.gateway_context_access runs as its caller (service_role, through
-- gateway_fetch_request_context_bundle) and reads this.
GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[], text[], text[]) TO "service_role";
