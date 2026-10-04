CREATE OR REPLACE FUNCTION public.monthly_spend_prev_cents (
  p_workspace_id uuid
)
  RETURNS bigint
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_current_month_start_ts timestamptz := (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  v_prev_month_start_ts timestamptz := ((date_trunc('month', now() at time zone 'UTC') - interval '1 month') at time zone 'UTC');
  v_prev_month_nanos bigint := 0;
  v_prev_month_cents bigint := 0;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;

  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  ) and not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = v_user_id
  ) then
    raise exception 'workspace_forbidden';
  end if;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_prev_month_nanos
  from private.v2_rpc_gateway_requests_compat gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_prev_month_start_ts
    and gr.created_at < v_current_month_start_ts;

  v_prev_month_cents := floor(v_prev_month_nanos::numeric / 10000000.0)::bigint;
  return v_prev_month_cents;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."monthly_spend_prev_cents"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."monthly_spend_prev_cents"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."monthly_spend_prev_cents"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."monthly_spend_prev_cents"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."monthly_spend_prev_cents"(uuid) FROM PUBLIC, "anon";
