-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

set local lock_timeout='5s';
-- Scope meter aggregation to selected rollups, preserving existing columns,
-- token fallback rules, visibility filters, and security-invoker behavior.


create or replace view public.v2_web_private_usage_daily
with (security_invoker = true) as
select
  usage.usage_date::timestamptz as bucket_15m,
  usage.workspace_id,
  usage.model_slug as canonical_model_id,
  route.provider_slug as provider,
  usage.app_id,
  usage.requests,
  usage.successful_requests as success_requests,
  usage.cost_nanos::bigint as total_cost_nanos,
  usage.latency_sum_ms,
  usage.latency_count as latency_samples,
  usage.throughput_sum,
  usage.throughput_count as throughput_samples,
  coalesce(meters.total_tokens, 0) as total_tokens
from public.v2_private_usage_daily usage
left join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
left join lateral (
  select
    coalesce(
      max(meter.quantity) filter (where meter.meter_key = 'total_tokens'),
      sum(meter.quantity) filter (
        where meter.meter_key in (
          'input_tokens', 'output_tokens',
          'input_text_tokens', 'output_text_tokens'
        )
      ),
      0
    )::numeric as total_tokens
  from public.v2_private_usage_daily_meters meter
  where meter.rollup_id = usage.rollup_id
) meters on true;

-- Canonical ranking RPCs over V2 daily/hourly rollups.
create or replace function public.get_public_model_rankings(
  p_time_range text default 'week',
  p_metric text default 'tokens',
  p_limit integer default 50
)
returns table (
  model_id text, provider text, requests bigint, total_tokens bigint,
  input_tokens bigint, output_tokens bigint, total_cost_usd numeric,
  median_latency_ms numeric, median_throughput numeric, success_rate numeric,
  rank integer, prev_rank integer, trend text
)
language sql stable security invoker set search_path = public
as $$
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
$$;



-- Return complete summaries and distinct facets as scalar JSON. PostgREST's
-- row limit must not truncate the underlying daily rollups before aggregation.
create or replace function public.get_private_usage_summary(
  p_workspace_id uuid, p_from timestamptz, p_to timestamptz
)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
with scoped as materialized (
  select coalesce(nullif(usage.model_slug, ''), 'unknown') as model,
    coalesce(nullif(route.provider_slug, ''), 'unknown') as provider,
    usage.requests, usage.cost_nanos, usage.latency_sum_ms, usage.latency_count
  from public.v2_private_usage_daily usage
  left join public.v2_model_provider_routes route using (provider_model_id)
  where usage.workspace_id = p_workspace_id
    -- Native date predicates use the existing workspace/date index. Retain
    -- timestamp comparisons to preserve partial-day and session-timezone behavior.
    and usage.usage_date >= p_from::date and usage.usage_date <= p_to::date
    and usage.usage_date::timestamptz >= p_from
    and usage.usage_date::timestamptz <= p_to
), models as (
  select model, sum(requests) as requests, sum(cost_nanos) / 1e9 as cost,
    (sum(latency_sum_ms) filter (where latency_count > 0 and latency_sum_ms > 0))::numeric
      / nullif(sum(latency_count) filter (where latency_count > 0 and latency_sum_ms > 0), 0) as speed_ms
  from scoped group by model
), providers as (
  select provider, sum(requests) as requests from scoped group by provider
)
select jsonb_build_object(
  'topModel', (select jsonb_build_object('name', model, 'requests', requests) from models order by requests desc, model limit 1),
  'topProvider', (select jsonb_build_object('name', provider, 'requests', requests) from providers order by requests desc, provider limit 1),
  'mostExpensive', (select jsonb_build_object('name', model, 'cost', cost) from models order by cost desc, model limit 1),
  'fastestModel', (select jsonb_build_object('name', model, 'speedMs', round(speed_ms)) from models where speed_ms > 0 order by speed_ms, model limit 1)
);
$$;

create or replace function public.get_private_usage_facets(
  p_workspace_id uuid, p_from timestamptz, p_to timestamptz
)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
select coalesce(jsonb_agg(to_jsonb(facet) order by canonical_model_id, provider, app_id), '[]'::jsonb)
from (
  select distinct usage.model_slug as canonical_model_id, route.provider_slug as provider, usage.app_id
  from public.v2_private_usage_daily usage
  left join public.v2_model_provider_routes route using (provider_model_id)
  where usage.workspace_id = p_workspace_id
    and usage.usage_date >= p_from::date and usage.usage_date <= p_to::date
    and usage.usage_date::timestamptz >= p_from
    and usage.usage_date::timestamptz <= p_to
) facet;
$$;

revoke all on function public.get_private_usage_summary(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.get_private_usage_facets(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_private_usage_summary(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.get_private_usage_facets(uuid, timestamptz, timestamptz) to authenticated, service_role;



-- Filter meter inputs using the RPC's date bounds; keep grouped scans for broad ranges.
CREATE OR REPLACE FUNCTION public.get_public_market_share(p_dimension text DEFAULT 'organization'::text, p_time_range text DEFAULT 'week'::text)
 RETURNS TABLE(name text, requests bigint, tokens bigint, share_pct numeric)
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



-- Filter meter inputs using the RPC's date bounds; keep grouped scans for broad ranges.
CREATE OR REPLACE FUNCTION public.get_public_market_share_timeseries(p_dimension text DEFAULT 'organization'::text, p_time_range text DEFAULT 'year'::text, p_bucket_size text DEFAULT 'week'::text, p_top_n integer DEFAULT 8)
 RETURNS TABLE(bucket timestamp with time zone, name text, requests bigint, tokens bigint, colour text)
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
  join public.v2_public_usage_hourly scoped on scoped.rollup_id = meter.rollup_id
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
from public.v2_public_usage_hourly usage
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
  join public.v2_public_usage_daily scoped on scoped.rollup_id = meter.rollup_id
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
from public.v2_public_usage_daily usage
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

