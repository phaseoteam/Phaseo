-- Net credit ledger change for GET /v1/credits thirty_day_usage, summed in the
-- database instead of reading ledger rows through PostgREST (capped at 1,000 rows).
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which
-- is not available where this was authored. It matches the definition in
-- schemas/public/functions/get_workspace_credit_ledger_net.sql.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_workspace_credit_ledger_net (
  p_workspace_id uuid,
  p_since        timestamp with time zone
)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- Net change in the workspace's credit ledger since p_since: credits added (top-ups, codes)
-- count as positive and charges as negative. GET /v1/credits reports it as
-- thirty_day_usage. Summed here so no PostgREST row cap can truncate the total.
-- Service role only: the route checks the management key's workspace before calling it.
select coalesce(sum(ledger.amount_nanos), 0)::bigint
from public.credit_ledger ledger
where ledger.workspace_id = p_workspace_id
  and ledger.created_at >= p_since;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_workspace_credit_ledger_net"(uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_credit_ledger_net"(uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_credit_ledger_net"(uuid, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_credit_ledger_net"(uuid, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
