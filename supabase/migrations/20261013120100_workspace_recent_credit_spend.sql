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
-- Service role only: the account route checks workspace membership before calling it.
select coalesce(sum(charge.cost_nanos), 0)::bigint
from public.gateway_request_charges charge
where charge.workspace_id = p_workspace_id
  and charge.status = 'applied'
  and charge.created_at >= p_since;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_workspace_recent_credit_spend"(uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_recent_credit_spend"(uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_recent_credit_spend"(uuid, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_recent_credit_spend"(uuid, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
