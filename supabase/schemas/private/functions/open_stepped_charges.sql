CREATE OR REPLACE FUNCTION private.open_stepped_charges (
  p_workspace_id uuid
)
  RETURNS TABLE (
    billing_request_id text,
    key_id             uuid,
    created_at         timestamp with time zone,
    cost_nanos         bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Stepped stream charges (gateway_charge_request_total: applied, not final) whose
  -- gateway_requests row has not landed: money already taken for a stream whose worker may have
  -- stopped before writing it. Identified by billing request id (gateway_request_charges.request_id,
  -- gateway_requests.billing_request_id), never by the public request id. Read from
  -- gateway_request_charges_open_step_idx, each checked against the (workspace_id,
  -- billing_request_id) index on gateway_requests.
  select charge.request_id, charge.key_id, charge.created_at, charge.cost_nanos
  from public.gateway_request_charges charge
  where charge.workspace_id = p_workspace_id
    and charge.is_final is false
    and charge.status = 'applied'
    and charge.cost_nanos > 0
    and not exists (
      select 1 from public.gateway_requests request
      where request.workspace_id = charge.workspace_id
        and request.billing_request_id = charge.request_id
    );
$function$;

COMMENT ON FUNCTION "private"."open_stepped_charges"(uuid) IS 'Applied, not yet final stepped stream charges of a workspace whose request row has not landed, by billing request id. Counted by budget_spend_items and the key usage of gateway_spend_limit_seed.';

REVOKE ALL ON FUNCTION "private"."open_stepped_charges"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."open_stepped_charges"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."open_stepped_charges"(uuid) TO "postgres";
