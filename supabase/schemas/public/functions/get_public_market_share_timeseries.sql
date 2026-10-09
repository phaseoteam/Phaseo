CREATE OR REPLACE FUNCTION public.get_public_market_share_timeseries (
  p_dimension   text    DEFAULT 'organization'::text,
  p_time_range  text    DEFAULT 'year'::text,
  p_bucket_size text    DEFAULT 'week'::text,
  p_top_n       integer DEFAULT 8
)
  RETURNS TABLE (
    bucket   timestamp with time zone,
    name     text,
    requests bigint,
    tokens   bigint,
    colour   text
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_since timestamptz;
  v_dimension text := lower(coalesce(p_dimension, 'provider'));
  v_bucket_size text := lower(coalesce(p_bucket_size, 'day'));
begin
  case lower(coalesce(p_time_range, 'week'))
    when '24h' then v_since := now() - interval '24 hours';
    when 'today' then v_since := date_trunc('day', now());
    when 'week' then v_since := now() - interval '7 days';
    when 'month' then v_since := now() - interval '30 days';
    when 'year' then v_since := now() - interval '1 year';
    else v_since := now() - interval '1 year';
  end case;

  return query
  with source_rows as (
    select
      case
        when v_bucket_size = 'hour' then date_trunc('hour', usage.bucket_15m)
        when v_bucket_size = 'day' then date_trunc('day', usage.bucket_15m)
        when v_bucket_size = 'month' then date_trunc('month', usage.bucket_15m)
        else date_trunc('week', usage.bucket_15m)
      end as time_bucket,
      usage.canonical_model_id as model_slug,
      usage.provider,
      usage.requests,
      usage.total_tokens
    from (
with meters as (
  select
    meter.rollup_id,
    coalesce(
      max(meter.quantity) filter (where meter.meter_key = 'total_tokens'),
      sum(meter.quantity) filter (where meter.meter_key in ('input_tokens', 'output_tokens')),
      sum(meter.quantity) filter (where meter.meter_key in ('input_text_tokens', 'output_text_tokens')),
      0
    )::numeric as total_tokens
  from public.v2_public_usage_hourly_meters meter
  join public.reporting_usage_hourly scoped on scoped.rollup_id = meter.rollup_id
  where v_bucket_size = 'hour' and scoped.bucket_start >= v_since
  group by meter.rollup_id
)
select
  usage.bucket_start as bucket_15m,
  usage.model_slug as canonical_model_id,
  route.provider_slug as provider,
  usage.app_id,
  usage.requests,
  usage.successful_requests as success_requests,
  coalesce(meters.total_tokens, 0) as total_tokens,
  usage.cost_nanos::bigint as total_cost_nanos,
  usage.latency_sum_ms,
  usage.latency_count as latency_samples,
  usage.throughput_sum,
  usage.throughput_count as throughput_samples,
  usage.generation_sum_ms,
  usage.generation_count as generation_samples
from public.reporting_usage_hourly usage
join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
  and coalesce(route.is_stealth, false) = false
  and route.routing_enabled = true
  and route.status in ('active', 'degraded')
  and (route.effective_from is null or route.effective_from <= now())
  and (route.effective_to is null or route.effective_to > now())
join public.v2_models model
  on model.model_slug = usage.model_slug
  and model.hidden = false
  and model.status <> 'disabled'
left join meters on meters.rollup_id = usage.rollup_id
) usage
    where v_bucket_size = 'hour'
      and usage.bucket_15m >= v_since

    union all

    select
      case
        when v_bucket_size = 'day' then usage.day_bucket::timestamptz
        when v_bucket_size = 'month' then date_trunc('month', usage.day_bucket::timestamp)::timestamptz
        else date_trunc('week', usage.day_bucket::timestamp)::timestamptz
      end as time_bucket,
      usage.canonical_model_id as model_slug,
      usage.provider,
      usage.requests,
      usage.total_tokens
    from (
with meters as (
  select
    meter.rollup_id,
    coalesce(
      max(meter.quantity) filter (where meter.meter_key = 'total_tokens'),
      sum(meter.quantity) filter (where meter.meter_key in ('input_tokens', 'output_tokens')),
      sum(meter.quantity) filter (where meter.meter_key in ('input_text_tokens', 'output_text_tokens')),
      0
    )::numeric as total_tokens
  from public.v2_public_usage_daily_meters meter
  join public.reporting_usage_daily scoped on scoped.rollup_id = meter.rollup_id
  where v_bucket_size <> 'hour' and scoped.usage_date >= (v_since at time zone 'utc')::date
  group by meter.rollup_id
)
select
  usage.usage_date as day_bucket,
  usage.model_slug as canonical_model_id,
  route.provider_slug as provider,
  usage.app_id,
  usage.requests,
  usage.successful_requests as success_requests,
  coalesce(meters.total_tokens, 0) as total_tokens,
  usage.cost_nanos::bigint as total_cost_nanos,
  usage.latency_sum_ms,
  usage.latency_count as latency_samples,
  usage.throughput_sum,
  usage.throughput_count as throughput_samples,
  usage.generation_sum_ms,
  usage.generation_count as generation_samples
from public.reporting_usage_daily usage
join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
  and coalesce(route.is_stealth, false) = false
  and route.routing_enabled = true
  and route.status in ('active', 'degraded')
  and (route.effective_from is null or route.effective_from <= now())
  and (route.effective_to is null or route.effective_to > now())
join public.v2_models model
  on model.model_slug = usage.model_slug
  and model.hidden = false
  and model.status <> 'disabled'
left join meters on meters.rollup_id = usage.rollup_id
) usage
    where v_bucket_size <> 'hour'
      and usage.day_bucket >= (v_since at time zone 'utc')::date
  ),
  grouped as (
    select
      source.time_bucket,
      case
        when v_dimension = 'organization' then coalesce(nullif(lab.name, ''), nullif(model.lab_slug, ''), 'Unknown')
        else source.provider
      end as group_name,
      sum(source.requests)::bigint as request_count,
      sum(source.total_tokens)::bigint as token_count,
      case
        when v_dimension = 'organization' then max(lab.metadata ->> 'colour')
        else max(provider.metadata ->> 'colour')
      end as group_colour
    from source_rows source
    left join public.v2_models model on model.model_slug = source.model_slug
    left join public.v2_labs lab on lab.lab_slug = model.lab_slug
    left join public.v2_providers provider on provider.provider_slug = source.provider
    where (
      v_dimension = 'organization'
      and model.lab_slug is not null
    ) or (
      v_dimension <> 'organization'
      and source.provider is not null
      and source.provider <> ''
    )
    group by source.time_bucket, group_name
  ),
  top_groups as (
    select grouped.group_name
    from grouped
    group by grouped.group_name
    order by sum(grouped.request_count) desc, grouped.group_name
    limit greatest(coalesce(p_top_n, 8), 1)
  ),
  bucketed as (
    select
      grouped.time_bucket,
      case
        when grouped.group_name in (select top_groups.group_name from top_groups) then grouped.group_name
        else 'Other'
      end as group_name,
      sum(grouped.request_count)::bigint as request_count,
      sum(grouped.token_count)::bigint as token_count,
      max(case
        when grouped.group_name in (select top_groups.group_name from top_groups) then grouped.group_colour
        else null
      end) as group_colour
    from grouped
    group by grouped.time_bucket, group_name
  )
  select
    bucketed.time_bucket as bucket,
    bucketed.group_name as name,
    bucketed.request_count as requests,
    bucketed.token_count as tokens,
    bucketed.group_colour as colour
  from bucketed
  order by bucketed.time_bucket, bucketed.request_count desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_market_share_timeseries"(text, text, text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_market_share_timeseries"(text, text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_market_share_timeseries"(text, text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_market_share_timeseries"(text, text, text, integer) TO "postgres";
