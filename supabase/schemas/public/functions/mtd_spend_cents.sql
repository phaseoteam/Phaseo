CREATE OR REPLACE FUNCTION public.mtd_spend_cents (
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
  v_now_utc timestamptz := now();
  v_current_month_start_ts timestamptz := (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  v_mtd_nanos bigint := 0;
  v_mtd_cents bigint := 0;
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
  into v_mtd_nanos
  from private.v2_rpc_gateway_requests_compat gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_current_month_start_ts
    and gr.created_at <= v_now_utc;

  v_mtd_cents := floor(v_mtd_nanos::numeric / 10000000.0)::bigint;
  return v_mtd_cents;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mtd_spend_cents (
  p_team  uuid,
  p_basis text DEFAULT 'top_up'::text
)
  RETURNS bigint
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$declare
  month_start_utc timestamptz :=
    (date_trunc('month', (now() at time zone 'Europe/London'))
     at time zone 'Europe/London');
  total bigint;
begin
  select coalesce(sum(amount_nanos),0)::bigint into total
  from credit_ledger
  where team_id = p_team
    and created_at >= month_start_utc
    and created_at <  now()
    and kind in ('top_up','auto_top_up');
  return total;
end;$function$;

GRANT EXECUTE ON FUNCTION "public"."mtd_spend_cents"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."mtd_spend_cents"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."mtd_spend_cents"(uuid, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."mtd_spend_cents"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mtd_spend_cents"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mtd_spend_cents"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mtd_spend_cents"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mtd_spend_cents"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mtd_spend_cents"(uuid) FROM PUBLIC, "anon";
