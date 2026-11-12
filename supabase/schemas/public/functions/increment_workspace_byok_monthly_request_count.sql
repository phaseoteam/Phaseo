CREATE OR REPLACE FUNCTION public.increment_workspace_byok_monthly_request_count (
  p_team_id uuid,
  p_now     timestamp with time zone DEFAULT now()
)
  RETURNS TABLE (
    month_start   timestamp with time zone,
    request_count bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_month_start timestamptz;
begin
  if p_team_id is null then
    raise exception 'p_team_id is required';
  end if;

  v_month_start := (date_trunc('month', p_now at time zone 'UTC') at time zone 'UTC');

  insert into public.team_byok_monthly_usage as usage (
    team_id,
    month_start,
    request_count,
    created_at,
    updated_at
  )
  values (
    p_team_id,
    v_month_start,
    1,
    now(),
    now()
  )
  on conflict (team_id, month_start)
  do update
    set request_count = usage.request_count + 1,
        updated_at = now();

  return query
  select u.month_start, u.request_count
  from public.team_byok_monthly_usage u
  where u.team_id = p_team_id
    and u.month_start = v_month_start;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."increment_workspace_byok_monthly_request_count"(uuid, timestamp WITH time zone) TO "service_role";

COMMENT ON FUNCTION "public"."increment_workspace_byok_monthly_request_count"(uuid, timestamp with time zone) IS 'Atomically increments BYOK request count for team/month (UTC month boundary) and returns updated count.';

REVOKE ALL ON FUNCTION "public"."increment_workspace_byok_monthly_request_count"(uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."increment_workspace_byok_monthly_request_count"(uuid, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."increment_workspace_byok_monthly_request_count"(uuid, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
