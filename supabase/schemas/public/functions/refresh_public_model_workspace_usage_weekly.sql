CREATE OR REPLACE FUNCTION public.refresh_public_model_workspace_usage_weekly (
  p_since timestamp with time zone DEFAULT (now() - '84 days'::interval),
  p_until timestamp with time zone DEFAULT now()
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_since_week date := date_trunc('week', p_since at time zone 'utc')::date;
  v_until_week date := date_trunc('week', (p_until - interval '1 microsecond') at time zone 'utc')::date;
begin
  delete from public.reporting_model_workspace_usage_weekly
  where week_start >= v_since_week and week_start <= v_until_week;
  insert into public.public_model_workspace_usage_weekly
    (week_start, model_id, workspace_hash, requests, refreshed_at)
  select date_trunc('week', fact.occurred_at at time zone 'utc')::date,
    coalesce(nullif(fact.routed_model_slug,''),nullif(fact.requested_model_slug,'')),
    md5('public-model-workspace:' || fact.workspace_id::text), count(*)::bigint, now()
  from public.reporting_request_facts fact
  where fact.occurred_at >= p_since and fact.occurred_at < p_until
    and fact.success is true and fact.workspace_id is not null
    and coalesce(nullif(fact.routed_model_slug,''),nullif(fact.requested_model_slug,'')) is not null
    and lower(coalesce(nullif(fact.routed_model_slug,''),nullif(fact.requested_model_slug,''))) not in ('unknown','other')
  group by 1,2,3;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_public_model_workspace_usage_weekly"(timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_public_model_workspace_usage_weekly"(timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_public_model_workspace_usage_weekly"(timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_public_model_workspace_usage_weekly"(timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
