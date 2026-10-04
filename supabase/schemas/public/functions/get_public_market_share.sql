CREATE OR REPLACE FUNCTION public.get_public_market_share (
  p_dimension  text DEFAULT 'organization'::text,
  p_time_range text DEFAULT 'week'::text
)
  RETURNS TABLE (
    name      text,
    requests  bigint,
    tokens    bigint,
    share_pct numeric
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_since date;
begin
  case p_time_range
    when 'today' then v_since := v_today;
    when 'week' then v_since := v_today - 7;
    when 'month' then v_since := v_today - 30;
    else v_since := v_today - 7;
  end case;

  if p_dimension = 'organization' then
    return query
    with base as (
      select
        d.model_id,
        sum(d.success_requests)::bigint as requests,
        sum(d.total_tokens)::bigint as tokens
      from (
with meters as (
  select
    meter.rollup_id,
    jsonb_object_agg(meter.meter_key, meter.quantity) as values
  from public.v2_public_usage_daily_meters meter
  join public.v2_public_usage_daily scoped on scoped.rollup_id = meter.rollup_id
  where scoped.usage_date >= v_since
  group by meter.rollup_id
)
select
  usage.usage_date as day_bucket,
  usage.model_slug as model_id,
  route.provider_slug as provider_id,
  usage.successful_requests as success_requests,
  coalesce(
    (meters.values->>'total_tokens')::numeric,
    (meters.values->>'input_tokens')::numeric + (meters.values->>'output_tokens')::numeric,
    (meters.values->>'input_text_tokens')::numeric + (meters.values->>'output_text_tokens')::numeric,
    0
  )::bigint as total_tokens
from public.v2_public_usage_daily usage
left join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
left join meters on meters.rollup_id = usage.rollup_id
) d
      where d.day_bucket >= v_since
        and lower(d.model_id) not in ('unknown', 'other')
      group by d.model_id
    ),
    grouped as (
      select
        coalesce(org.name, dm.organisation_id) as org_name,
        sum(b.requests)::bigint as req_count,
        sum(b.tokens)::bigint as tok_count
      from base b
      join private.v2_rpc_models_compat dm on dm.model_id = b.model_id
      left join private.v2_rpc_labs_compat org on dm.organisation_id = org.organisation_id
      where dm.organisation_id is not null
      group by org.name, dm.organisation_id
    ),
    totals as (
      select sum(g.req_count)::numeric as total_requests
      from grouped g
    )
    select
      g.org_name as name,
      g.req_count as requests,
      g.tok_count as tokens,
      round((g.req_count::numeric / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from grouped g
    cross join totals t
    where g.req_count > 0
    order by g.req_count desc;
  else
    return query
    with grouped as (
      select
        d.provider_id as provider,
        sum(d.success_requests)::bigint as req_count,
        sum(d.total_tokens)::bigint as tok_count
      from (
with meters as (
  select
    meter.rollup_id,
    jsonb_object_agg(meter.meter_key, meter.quantity) as values
  from public.v2_public_usage_daily_meters meter
  join public.v2_public_usage_daily scoped on scoped.rollup_id = meter.rollup_id
  where scoped.usage_date >= v_since
  group by meter.rollup_id
)
select
  usage.usage_date as day_bucket,
  usage.model_slug as model_id,
  route.provider_slug as provider_id,
  usage.successful_requests as success_requests,
  coalesce(
    (meters.values->>'total_tokens')::numeric,
    (meters.values->>'input_tokens')::numeric + (meters.values->>'output_tokens')::numeric,
    (meters.values->>'input_text_tokens')::numeric + (meters.values->>'output_text_tokens')::numeric,
    0
  )::bigint as total_tokens
from public.v2_public_usage_daily usage
left join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
left join meters on meters.rollup_id = usage.rollup_id
) d
      where d.day_bucket >= v_since
        and d.provider_id is not null
        and d.provider_id <> ''
        and lower(d.provider_id) not in ('unknown', 'other')
      group by d.provider_id
    ),
    totals as (
      select sum(g.req_count)::numeric as total_requests
      from grouped g
    )
    select
      g.provider as name,
      g.req_count as requests,
      g.tok_count as tokens,
      round((g.req_count::numeric / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from grouped g
    cross join totals t
    where g.req_count > 0
    order by g.req_count desc;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_market_share"(text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_market_share"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_market_share"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_market_share"(text, text) TO "postgres";
