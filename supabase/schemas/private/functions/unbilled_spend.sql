CREATE OR REPLACE FUNCTION private.unbilled_spend (
  p_workspace_id uuid,
  p_since        timestamp with time zone,
  p_key_ids      uuid[] DEFAULT NULL::uuid[]
)
  RETURNS TABLE (
    kind               text,
    billing_request_id text,
    key_id             uuid,
    at                 timestamp with time zone,
    nanos              bigint,
    recorded_nanos     bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Spend that budgets and key caps count although no ordinary request row carries it, by
  -- billing request id. The database is the source of truth for both kinds; the SpendLimit
  -- Durable Object drops its own copy of any id gateway_spend_limit_seed lists, so these rows
  -- are never excluded. p_key_ids limits the rows to those keys (NULL: the whole workspace);
  -- p_since (NULL: all time) is the earliest window the caller counts.
  --
  -- * 'charge': an applied wallet charge (gateway_request_charges) whose request row has not
  --   landed: an open stepped charge (gateway_charge_request_total, is_final false) or a final
  --   charge whose audit row was never written. Counted at its debit time (created_at), for the
  --   key the charge records, until a gateway_requests row with that billing_request_id lands
  --   (#3534's index on workspace_id, billing_request_id). Batch captures are left out: their cost
  --   is on per-row request rows without a billing id. Charges before 2026-11-04 00:00 UTC are
  --   left out: request rows recorded billing_request_id only from 2026-11-03 14:43 UTC, so an
  --   older charge's audit row cannot be matched and is already counted.
  -- * 'unpaid': a delivered request whose wallet charge failed (expected_cost_nanos, written by
  --   the request audit, pending reconciliation): the part of the expected amount cost_nanos does
  --   not cover, so the row counts greatest(cost_nanos, expected_cost_nanos) and a later charge
  --   never counts twice. recorded_nanos is expected_cost_nanos.
  select 'charge'::text, charge.request_id, charge.key_id, charge.created_at, charge.cost_nanos, charge.cost_nanos
  from public.gateway_request_charges charge
  where charge.workspace_id = p_workspace_id
    and charge.status = 'applied'
    and charge.cost_nanos > 0
    and charge.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), '2026-11-04 00:00:00+00'::timestamptz)
    and charge.request_id not like 'batch\_capture:%'
    and (p_key_ids is null or charge.key_id = any (p_key_ids))
    and not exists (
      select 1 from public.gateway_requests request
      where request.workspace_id = charge.workspace_id
        and request.billing_request_id = charge.request_id
    )
  union all
  select 'unpaid'::text, request.billing_request_id, request.key_id, request.created_at,
    request.expected_cost_nanos - greatest(coalesce(request.cost_nanos, 0), 0), request.expected_cost_nanos
  from public.gateway_requests request
  where request.workspace_id = p_workspace_id
    and request.expected_cost_nanos is not null
    and request.expected_cost_nanos > greatest(coalesce(request.cost_nanos, 0), 0)
    and (p_key_ids is null or request.key_id = any (p_key_ids))
    and request.created_at >= coalesce(p_since, '-infinity'::timestamptz);
$function$;

COMMENT ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[]) IS 'Spend counted toward budgets and key caps that no ordinary request row carries: applied wallet charges whose request row has not landed (by debit time) and the uncharged part of delivered requests pending reconciliation (expected_cost_nanos), by billing request id. Shared by budget_spend_items, the request-context key-limit checks, hold admission and gateway_spend_limit_seed.';

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[]) TO "postgres";

-- private.gateway_context_access runs as its caller (service_role, through
-- gateway_fetch_request_context_bundle) and reads this.
GRANT EXECUTE ON FUNCTION "private"."unbilled_spend"(uuid, timestamp with time zone, uuid[]) TO "service_role";
