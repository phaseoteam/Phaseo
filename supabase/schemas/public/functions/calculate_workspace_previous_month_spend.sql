CREATE OR REPLACE FUNCTION public.calculate_workspace_previous_month_spend (
  p_team_id uuid
)
  RETURNS numeric
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
    v_spend_nanos bigint;
    v_spend_usd numeric(12, 2);
    v_prev_month_start timestamptz;
    v_prev_month_end timestamptz;
BEGIN
    -- Calculate previous calendar month boundaries
    v_prev_month_start := date_trunc('month', now() - interval '1 month');
    v_prev_month_end := date_trunc('month', now());

    -- Sum all successful request costs from previous month
    SELECT COALESCE(SUM(cost_nanos), 0)
    INTO v_spend_nanos
    FROM private.v2_rpc_gateway_requests_compat
    WHERE team_id = p_team_id
      AND success = true
      AND created_at >= v_prev_month_start
      AND created_at < v_prev_month_end;

    -- Convert nanos to USD
    v_spend_usd := ROUND((v_spend_nanos::numeric / 1000000000.0)::numeric, 2);

    RETURN v_spend_usd;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."calculate_workspace_previous_month_spend"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."calculate_workspace_previous_month_spend"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."calculate_workspace_previous_month_spend"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."calculate_workspace_previous_month_spend"(uuid) FROM PUBLIC, "anon", "authenticated";
