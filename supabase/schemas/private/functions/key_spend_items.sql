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
            or (served.created_at < '2026-11-09 00:00:00+00'::timestamptz
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
    and not (charged.billing_request_id is not null and (
      exists (
        select 1 from public.credit_ledger movement
        where movement.source_ref_type = 'gateway_request'
          and movement.source_ref_id = charged.billing_request_id
          and movement.workspace_id = charged.workspace_id
          and movement.ref_type = 'gateway_request_charge')
      or ((charged.expected_cost_nanos is not null
          or (charged.created_at < '2026-11-09 00:00:00+00'::timestamptz
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
