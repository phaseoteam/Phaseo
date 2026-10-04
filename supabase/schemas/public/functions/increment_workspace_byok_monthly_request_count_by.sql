CREATE OR REPLACE FUNCTION public.increment_workspace_byok_monthly_request_count_by (
  p_workspace_id  uuid,
  p_now           timestamp with time zone,
  p_request_count bigint
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
  if p_workspace_id is null then raise exception 'p_workspace_id is required'; end if;
  if p_request_count is null or p_request_count < 1 then raise exception 'p_request_count must be positive'; end if;
  v_month_start := (date_trunc('month', p_now at time zone 'UTC') at time zone 'UTC');
  insert into public.workspace_byok_monthly_usage as usage (
    workspace_id, month_start, request_count, created_at, updated_at
  ) values (
    p_workspace_id, v_month_start, p_request_count, now(), now()
  ) on conflict (workspace_id, month_start) do update
    set request_count = usage.request_count + excluded.request_count,
        updated_at = now();
  return query select u.month_start, u.request_count
    from public.workspace_byok_monthly_usage u
    where u.workspace_id = p_workspace_id and u.month_start = v_month_start;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."increment_workspace_byok_monthly_request_count_by"(uuid, timestamp WITH time zone, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."increment_workspace_byok_monthly_request_count_by"(uuid, timestamp WITH time zone, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."increment_workspace_byok_monthly_request_count_by"(uuid, timestamp WITH time zone, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."increment_workspace_byok_monthly_request_count_by"(uuid, timestamp WITH time zone, bigint) FROM PUBLIC, "anon", "authenticated";
