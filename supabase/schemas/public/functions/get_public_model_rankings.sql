CREATE OR REPLACE FUNCTION public.get_public_model_rankings (
  p_time_range text    DEFAULT 'week'::text,
  p_metric     text    DEFAULT 'tokens'::text,
  p_limit      integer DEFAULT 50
)
  RETURNS TABLE (
    model_id          text,
    provider          text,
    requests          bigint,
    total_tokens      bigint,
    input_tokens      bigint,
    output_tokens     bigint,
    total_cost_usd    numeric,
    median_latency_ms numeric,
    median_throughput numeric,
    success_rate      numeric,
    rank              integer,
    prev_rank         integer,
    trend             text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with bounds as (
    select
      case p_time_range when 'today' then current_date when 'month' then current_date - 30 when 'year' then current_date - 365 else current_date - 7 end as since_date,
      case p_time_range when 'today' then current_date - 1 when 'month' then current_date - 60 when 'year' then current_date - 730 else current_date - 14 end as previous_since,
      case p_time_range when 'today' then current_date when 'month' then current_date - 30 when 'year' then current_date - 365 else current_date - 7 end as previous_until
  ),
  meters as (
    select meter.rollup_id,
      sum(meter.quantity) filter (where meter.meter_key in ('input_tokens','output_tokens'))::bigint as total_tokens,
      sum(meter.quantity) filter (where meter.meter_key = 'input_tokens')::bigint as input_tokens,
      sum(meter.quantity) filter (where meter.meter_key = 'output_tokens')::bigint as output_tokens
    from public.v2_public_usage_daily_meters meter
    -- Broad yearly rankings keep the efficient full meter aggregate. For
    -- shorter periods, exclude historical meters before grouping.
    where p_time_range = 'year' or exists (
      select 1 from public.v2_public_usage_daily scoped cross join bounds
      where scoped.rollup_id = meter.rollup_id
        and scoped.usage_date >= bounds.previous_since
        and lower(scoped.model_slug) not in ('unknown','other')
    )
    group by meter.rollup_id
  ),
  all_periods as (
    select usage.usage_date, usage.model_slug, route.provider_slug as provider,
      usage.requests, usage.successful_requests, usage.latency_sum_ms, usage.latency_count,
      usage.throughput_sum, usage.throughput_count,
      coalesce(meter.total_tokens,0) as total_tokens,
      coalesce(meter.input_tokens,0) as input_tokens,
      coalesce(meter.output_tokens,0) as output_tokens
    from public.v2_public_usage_daily usage
    left join public.v2_model_provider_routes route on route.provider_model_id = usage.provider_model_id
    left join meters meter on meter.rollup_id = usage.rollup_id
    cross join bounds
    where usage.usage_date >= bounds.previous_since
      and lower(usage.model_slug) not in ('unknown','other')
  ),
  current_period as (
    select row.model_slug, coalesce(row.provider,'unknown') as provider,
      sum(row.requests)::bigint as requests, sum(row.successful_requests)::bigint as successes,
      sum(row.total_tokens)::bigint as total_tokens, sum(row.input_tokens)::bigint as input_tokens,
      sum(row.output_tokens)::bigint as output_tokens, sum(row.latency_sum_ms)::numeric as latency_sum,
      sum(row.latency_count)::bigint as latency_count, sum(row.throughput_sum)::numeric as throughput_sum,
      sum(row.throughput_count)::bigint as throughput_count
    from all_periods row cross join bounds where row.usage_date >= bounds.since_date
    group by row.model_slug, coalesce(row.provider,'unknown')
  ),
  previous_period as (
    select row.model_slug, coalesce(row.provider,'unknown') as provider,
      sum(row.requests)::bigint as requests, sum(row.total_tokens)::bigint as total_tokens
    from all_periods row cross join bounds
    where row.usage_date >= bounds.previous_since and row.usage_date < bounds.previous_until
    group by row.model_slug, coalesce(row.provider,'unknown')
  ),
  current_ranked as (
    select current_period.*, row_number() over (order by case p_metric when 'requests' then requests::numeric when 'cost' then 0 else total_tokens::numeric end desc, model_slug, provider)::integer as position
    from current_period where requests > 0
  ),
  previous_ranked as (
    select previous_period.*, row_number() over (order by case p_metric when 'requests' then requests::numeric when 'cost' then 0 else total_tokens::numeric end desc, model_slug, provider)::integer as position
    from previous_period where requests > 0
  )
  select current.model_slug, current.provider, current.requests, current.total_tokens,
    current.input_tokens, current.output_tokens, 0::numeric,
    round(current.latency_sum / nullif(current.latency_count,0), 0),
    round(current.throughput_sum / nullif(current.throughput_count,0), 2),
    round(current.successes::numeric / nullif(current.requests,0), 4),
    current.position, previous.position,
    case when previous.position is null then 'new' when current.position < previous.position then 'up' when current.position > previous.position then 'down' else 'same' end
  from current_ranked current
  left join previous_ranked previous using (model_slug, provider)
  order by current.position
  limit greatest(1, least(coalesce(p_limit,50),250));
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_model_rankings"(text, text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_model_rankings"(text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_model_rankings"(text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_model_rankings"(text, text, integer) TO "postgres";
