CREATE OR REPLACE FUNCTION public.record_workspace_sso_active_user (
  p_workspace_id uuid,
  p_auth_user_id uuid,
  p_seen_at      timestamp with time zone DEFAULT now()
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_period_start date := date_trunc('month', p_seen_at at time zone 'UTC')::date;
  v_quantity bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || v_period_start::text, 0)
  );

  insert into public.workspace_sso_monthly_active_users (
    workspace_id,
    period_start,
    auth_user_id,
    first_seen_at,
    last_seen_at
  ) values (
    p_workspace_id,
    v_period_start,
    p_auth_user_id,
    p_seen_at,
    p_seen_at
  )
  on conflict (workspace_id, period_start, auth_user_id) do update set
    last_seen_at = greatest(
      public.workspace_sso_monthly_active_users.last_seen_at,
      excluded.last_seen_at
    );

  select count(*)
    into v_quantity
  from public.workspace_sso_monthly_active_users
  where workspace_id = p_workspace_id
    and period_start = v_period_start;

  insert into public.workspace_addon_usage_monthly (
    workspace_id,
    addon_key,
    metric_key,
    period_start,
    quantity,
    updated_at
  ) values (
    p_workspace_id,
    'identity',
    'sso_mau',
    v_period_start,
    v_quantity,
    now()
  )
  on conflict (workspace_id, addon_key, metric_key, period_start) do update set
    quantity = excluded.quantity,
    updated_at = now();

  return v_quantity;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_workspace_sso_active_user"(uuid, uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_workspace_sso_active_user"(uuid, uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_workspace_sso_active_user"(uuid, uuid, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_workspace_sso_active_user"(uuid, uuid, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
