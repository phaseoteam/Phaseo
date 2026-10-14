-- Recent credit spend for the billing runway, summed in the database instead of
-- reading charge rows through PostgREST.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_workspace_recent_credit_spend (
  p_workspace_id uuid,
  p_since        timestamp with time zone
)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- Credits actually charged to the workspace's wallet since p_since, for the billing runway.
-- Requests record their wallet charge in gateway_request_charges; async jobs and realtime
-- sessions record theirs as credit_ledger charges instead. The two never overlap.
-- Service role only: the account route checks workspace membership before calling it.
select (
  coalesce((
    select sum(charge.cost_nanos)
    from public.gateway_request_charges charge
    where charge.workspace_id = p_workspace_id
      and charge.status = 'applied'
      and charge.created_at >= p_since
  ), 0)
  + coalesce((
    select sum(-ledger.amount_nanos)
    from public.credit_ledger ledger
    where ledger.workspace_id = p_workspace_id
      and ledger.kind = 'charge'
      and ledger.amount_nanos < 0
      and ledger.created_at >= p_since
  ), 0)
)::bigint;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_workspace_recent_credit_spend"(uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_recent_credit_spend"(uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_recent_credit_spend"(uuid, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_recent_credit_spend"(uuid, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
