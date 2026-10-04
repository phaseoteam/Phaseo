CREATE OR REPLACE FUNCTION public.get_workspace_tier_info (
  p_workspace_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_exists boolean := false;
  v_current_month_nanos bigint := 0;
  v_prev_month_nanos bigint := 0;
  v_current_month_spend numeric(12, 2);
  v_prev_month_spend numeric(12, 2);
  v_current_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc'));
  v_prev_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) - interval '1 month';
  v_next_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) + interval '1 month';
begin
  select exists(
    select 1 from public.workspaces w where w.id = p_workspace_id
  )
  into v_exists;

  if not v_exists then
    raise exception 'Workspace not found: %', p_workspace_id;
  end if;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_current_month_nanos
  from private.v2_rpc_gateway_requests_compat gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_current_month_start_ts
    and gr.created_at < v_next_month_start_ts;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_prev_month_nanos
  from private.v2_rpc_gateway_requests_compat gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_prev_month_start_ts
    and gr.created_at < v_current_month_start_ts;

  v_current_month_spend := round((v_current_month_nanos::numeric / 1000000000.0)::numeric, 2);
  v_prev_month_spend := round((v_prev_month_nanos::numeric / 1000000000.0)::numeric, 2);

  return jsonb_build_object(
    'tier', 'basic',
    'tier_display', 'Standard',
    'markup_percentage', 5.00,
    'threshold_usd', 0,
    'current_month_spend_usd', v_current_month_spend,
    'previous_month_spend_usd', v_prev_month_spend,
    'progress_to_enterprise_pct', 100,
    'is_eligible_for_enterprise', false
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_workspace_tier_info"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_tier_info"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_tier_info"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_tier_info"(uuid) FROM PUBLIC, "anon", "authenticated";
