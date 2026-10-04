CREATE OR REPLACE FUNCTION public.backfill_gateway_request_normalized_usage (
  p_since timestamp with time zone DEFAULT (now() - '90 days'::interval),
  p_until timestamp with time zone DEFAULT now()
)
  RETURNS bigint
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_count bigint;
begin
  update public.gateway_requests
  set usage = usage
  where created_at >= p_since
    and created_at < p_until;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."backfill_gateway_request_normalized_usage"(timestamp WITH time zone, timestamp WITH time zone) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."backfill_gateway_request_normalized_usage"(timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

COMMENT ON FUNCTION "public"."backfill_gateway_request_normalized_usage"(timestamp with time zone, timestamp with time zone) IS 'Recomputes normalized per-request usage columns for gateway_requests in a bounded created_at window.';

REVOKE ALL ON FUNCTION "public"."backfill_gateway_request_normalized_usage"(timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."backfill_gateway_request_normalized_usage"(timestamp WITH time zone, timestamp WITH time zone) TO "postgres";
