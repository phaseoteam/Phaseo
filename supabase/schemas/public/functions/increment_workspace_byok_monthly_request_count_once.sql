CREATE OR REPLACE FUNCTION public.increment_workspace_byok_monthly_request_count_once (
  p_workspace_id    uuid,
  p_now             timestamp with time zone,
  p_request_count   bigint,
  p_idempotency_key text
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
  v_month_start timestamptz := (date_trunc('month', p_now at time zone 'UTC') at time zone 'UTC');
  v_inserted bigint;
begin
  if p_workspace_id is null or p_request_count < 1 or nullif(trim(p_idempotency_key),'') is null then
    raise exception 'workspace, positive request count, and idempotency key are required';
  end if;
  insert into public.workspace_byok_monthly_usage_events(workspace_id,month_start,idempotency_key,request_count)
  values(p_workspace_id,v_month_start,p_idempotency_key,p_request_count)
  on conflict do nothing returning workspace_byok_monthly_usage_events.request_count into v_inserted;
  if v_inserted is not null then
    insert into public.workspace_byok_monthly_usage as usage(workspace_id,month_start,request_count,created_at,updated_at)
    values(p_workspace_id,v_month_start,v_inserted,now(),now())
    on conflict(workspace_id,month_start) do update
      set request_count=usage.request_count+excluded.request_count,updated_at=now();
  end if;
  return query select u.month_start,u.request_count from public.workspace_byok_monthly_usage u
    where u.workspace_id=p_workspace_id and u.month_start=v_month_start;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."increment_workspace_byok_monthly_request_count_once"(uuid, timestamp WITH time zone, bigint, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."increment_workspace_byok_monthly_request_count_once"(uuid, timestamp WITH time zone, bigint, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."increment_workspace_byok_monthly_request_count_once"(uuid, timestamp WITH time zone, bigint, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."increment_workspace_byok_monthly_request_count_once"(uuid, timestamp WITH time zone, bigint, text) FROM PUBLIC, "anon", "authenticated";
