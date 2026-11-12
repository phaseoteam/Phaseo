CREATE OR REPLACE FUNCTION public.get_model_performance_overview(p_model_id text)
 RETURNS TABLE(last_24h jsonb, prev_24h jsonb, hourly_24h jsonb, provider_uptime_24h jsonb, hourly_5d jsonb, time_of_day_5d jsonb, cumulative_tokens jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$with params as (
    select p_model_id as model_id
),
anchors as (
    select
        date_trunc('hour', now() at time zone 'utc') as now_hour,
        (select release_date from private.v2_rpc_models_compat where model_id = p_model_id limit 1) as release_date
),
windows as (
    select
        now_hour,
        now_hour - interval '24 hours' as last24_start,
        now_hour - interval '48 hours' as prev24_start,
        now_hour - interval '120 hours' as last5d_start
    from anchors
),
-- Resolve the request's actual route, not every route belonging to its model.
requests_all as materialized (
    select fact.occurred_at as created_at, fact.success::boolean as success_bool,
        fact.latency_ms, fact.throughput, fact.generation_ms, route.provider_slug as provider
    from public.v2_request_facts fact
    left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
    cross join windows w
    where coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input) = p_model_id
      and fact.occurred_at >= w.last5d_start and fact.occurred_at < w.now_hour
),
requests_last24 as (
    select * from requests_all, windows w
    where created_at >= w.last24_start and created_at < w.now_hour
),
requests_prev24 as (
    select * from requests_all, windows w
    where created_at >= w.prev24_start and created_at < w.last24_start
),
requests_5d as (
    select * from requests_all, windows w
    where created_at >= w.last5d_start and created_at < w.now_hour
),
median_or_null as (
    select 1 as dummy
),
last_24h as (
    select jsonb_build_object(
        'avg_throughput', case when count(*) filter (where throughput is not null) > 0
            then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
            else null end,
        'avg_latency_ms', case when count(*) filter (where latency_ms is not null) > 0
            then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
            else null end,
        'avg_generation_ms', case when count(*) filter (where generation_ms is not null) > 0
            then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
            else null end,
        'uptime_pct', case when count(*) > 0 then (count(*) filter (where success_bool) * 100.0 / count(*)) else null end,
        'total_requests', count(*),
        'successful_requests', count(*) filter (where success_bool)
    ) as value
    from requests_last24
),
prev_24h as (
    select jsonb_build_object(
        'avg_throughput', case when count(*) filter (where throughput is not null) > 0
            then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
            else null end,
        'avg_latency_ms', case when count(*) filter (where latency_ms is not null) > 0
            then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
            else null end,
        'avg_generation_ms', case when count(*) filter (where generation_ms is not null) > 0
            then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
            else null end,
        'uptime_pct', case when count(*) > 0 then (count(*) filter (where success_bool) * 100.0 / count(*)) else null end,
        'total_requests', count(*),
        'successful_requests', count(*) filter (where success_bool)
    ) as value
    from requests_prev24
),
hourly_24h as (
    select coalesce(jsonb_agg(bucket_json order by bucket_start), '[]'::jsonb) as value
    from (
        select
            s.bucket_start,
            jsonb_build_object(
                'bucket', s.bucket_start,
                'avg_throughput', case when count(r.*) filter (where r.throughput is not null) > 0
                    then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
                    else null end,
                'avg_latency_ms', case when count(r.*) filter (where r.latency_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
                    else null end,
                'avg_generation_ms', case when count(r.*) filter (where r.generation_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
                    else null end,
                'requests', count(r.*),
                'success_pct', case when count(r.*) > 0 then (count(*) filter (where r.success_bool) * 100.0 / count(r.*)) else null end,
                'worst_provider_success_pct',
                    (
                        select min(pct) from (
                            select case when count(*) > 0 then (count(*) filter (where r2.success_bool) * 100.0 / count(*)) else null end as pct
                            from requests_last24 r2
                            where r2.created_at >= s.bucket_start
                              and r2.created_at < s.bucket_start + interval '1 hour'
                            group by r2.provider
                        ) provider_stats
                    )
            ) as bucket_json
        from (
            select generate_series(w.last24_start, w.now_hour, interval '1 hour') as bucket_start
            from windows w
        ) s
        left join requests_last24 r
            on r.created_at >= s.bucket_start
           and r.created_at < s.bucket_start + interval '1 hour'
        group by s.bucket_start
    ) buckets
),
provider_uptime_24h as (
    select coalesce(jsonb_agg(provider_json order by requests desc), '[]'::jsonb) as value
    from (
        select
            r.provider,
            count(*) as requests,
            jsonb_build_object(
                'provider', r.provider,
                'provider_name', coalesce(p.api_provider_name, r.provider),
                'avg_throughput', case when count(*) filter (where r.throughput is not null) > 0
                    then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
                    else null end,
                'avg_latency_ms', case when count(*) filter (where r.latency_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
                    else null end,
                'avg_generation_ms', case when count(*) filter (where r.generation_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
                    else null end,
                'requests', count(*),
                'uptime_pct', case when count(*) > 0 then (count(*) filter (where r.success_bool) * 100.0 / count(*)) else null end,
                'uptime_buckets',
                    (
                        select jsonb_agg(bucket_json order by bucket_end asc)
                        from (
                            select
                                bucket_end,
                                jsonb_build_object(
                                    'start', bucket_end - interval '6 hours',
                                    'end', bucket_end,
                                    'success_pct', case when count(pr.*) > 0 then (count(*) filter (where pr.success_bool) * 100.0 / count(pr.*)) else null end
                                ) as bucket_json
                            from (
                                select generate_series(
                                    w.last24_start,
                                    w.now_hour,
                                    interval '6 hours'
                                ) as bucket_end
                                from windows w
                            ) buckets
                            left join requests_last24 pr
                                on pr.provider = r.provider
                               and pr.created_at > buckets.bucket_end - interval '6 hours'
                               and pr.created_at <= buckets.bucket_end
                            group by bucket_end
                        ) per_bucket
                    )
            ) as provider_json
        from requests_last24 r
        left join private.v2_rpc_providers_compat p on p.api_provider_id = r.provider
        group by r.provider, p.api_provider_name
    ) provider_rows
),
hourly_5d as (
    select coalesce(jsonb_agg(bucket_json order by bucket_start), '[]'::jsonb) as value
    from (
        select
            s.bucket_start,
            jsonb_build_object(
                'bucket', s.bucket_start,
                'avg_throughput', case when count(r.*) filter (where r.throughput is not null) > 0
                    then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
                    else null end,
                'avg_latency_ms', case when count(r.*) filter (where r.latency_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
                    else null end,
                'avg_generation_ms', case when count(r.*) filter (where r.generation_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
                    else null end,
                'requests', count(r.*),
                'success_pct', case when count(r.*) > 0 then (count(*) filter (where r.success_bool) * 100.0 / count(r.*)) else null end
            ) as bucket_json
        from (
            select generate_series(w.last5d_start, w.now_hour, interval '1 hour') as bucket_start
            from windows w
        ) s
        left join requests_5d r
            on r.created_at >= s.bucket_start
           and r.created_at < s.bucket_start + interval '1 hour'
        group by s.bucket_start
    ) buckets
),
time_of_day_5d as (
    select coalesce(jsonb_agg(hour_json order by hour), '[]'::jsonb) as value
    from (
        select
            hour,
            jsonb_build_object(
                'hour', hour,
                'avg_throughput', case when count(*) filter (where throughput is not null) > 0
                    then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
                    else null end,
                'avg_latency_ms', case when count(*) filter (where latency_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
                    else null end,
                'avg_generation_ms', case when count(*) filter (where generation_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
                    else null end,
                'sample_count', count(*)
            ) as hour_json
        from (
            select
                extract(hour from created_at) as hour,
                throughput,
                latency_ms,
                generation_ms
            from requests_5d
        ) r
        group by hour
    ) hours
),
-- Count each request's token total once; total_tokens already includes input/output.
token_totals as (
    select coalesce(sum(tokens.total_tokens), 0) as total_tokens
    from public.v2_request_facts fact
    left join lateral (
        select coalesce(
            sum(usage.quantity) filter (where usage.meter_key = 'total_tokens'),
            sum(usage.quantity) filter (where usage.meter_key in ('input_tokens', 'output_tokens')),
            sum(usage.quantity) filter (where usage.meter_key in ('input_text_tokens', 'output_text_tokens')),
            sum(usage.quantity) filter (where usage.meter_key in ('prompt_tokens', 'completion_tokens')),
            0
        ) as total_tokens
        from public.v2_request_usage usage
        where usage.request_event_id = fact.request_event_id
    ) tokens on true
    where coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input) = p_model_id
)
select
    (select value from last_24h) as last_24h,
    (select value from prev_24h) as prev_24h,
    (select value from hourly_24h) as hourly_24h,
    (select value from provider_uptime_24h) as provider_uptime_24h,
    (select value from hourly_5d) as hourly_5d,
    (select value from time_of_day_5d) as time_of_day_5d,
    jsonb_build_object(
        'release_date', (select release_date from anchors),
        'total_tokens', (select total_tokens from token_totals)
    ) as cumulative_tokens;$function$;

CREATE OR REPLACE FUNCTION public.get_model_token_trajectory(p_model_id text)
 RETURNS TABLE(release_date timestamp with time zone, deprecation_date timestamp with time zone, points jsonb, token_milestones jsonb, successor_milestones jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$with model_row as (
  select model_id, release_date, deprecation_date
  from private.v2_rpc_models_compat
  where model_id = p_model_id
  limit 1
),

-- Build the set of gateway_requests.model_id values to include
model_ids as (
  select p_model_id as model_id
  union
  select
    pm.provider_id || '/' || regexp_replace(pm.api_model_id, '^' || pm.provider_id || '/', '')
  from private.v2_rpc_routes_compat pm
  where pm.internal_model_id = p_model_id
),

anchors as (
  select
    mr.release_date,
    mr.deprecation_date,
    -- choose today's UTC day (not "greatest" vs release day; that could invert the range)
    date_trunc('day', now() at time zone 'utc') as today,
    date_trunc('day', mr.release_date) as start_day
  from model_row mr
),

daily_tokens as (
  select
    date_trunc('day', gr.created_at at time zone 'utc') as day,
    sum(
      coalesce(
        nullif((gr.usage ->> 'total_tokens')::numeric, 0),
        coalesce((gr.usage ->> 'input_tokens')::numeric, 0)
        + coalesce((gr.usage ->> 'output_tokens')::numeric, 0)
      )
    ) as tokens
  from private.v2_rpc_gateway_requests_compat gr
  cross join model_row mr
  where gr.model_id in (select model_id from model_ids)
    and mr.release_date is not null
    and gr.created_at >= mr.release_date
  group by 1
),

point_series as (
  select
    gs.day,
    coalesce(dt.tokens, 0) as tokens,
    sum(coalesce(dt.tokens, 0)) over (order by gs.day) as cumulative_tokens,
    floor(extract(epoch from (gs.day - (select release_date from model_row))) / 86400)::int as days_since_release
  from (
    select generate_series(
      (select start_day from anchors),
      (select today from anchors),
      interval '1 day'
    ) as day
  ) gs
  left join daily_tokens dt on dt.day = gs.day
),

points_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD"T"00:00:00.000Z'),
        'tokens', tokens,
        'cumulativeTokens', cumulative_tokens,
        'daysSinceRelease', days_since_release
      )
      order by day
    ),
    '[]'::jsonb
  ) as value
  from point_series
),

milestones as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'threshold', threshold,
        'reachedOn', reached_on,
        'daysSinceRelease', days_since_release
      )
      order by threshold
    ),
    '[]'::jsonb
  ) as value
  from (
    select
      threshold,
      (select to_char(ps.day, 'YYYY-MM-DD"T"00:00:00.000Z')
       from point_series ps
       where ps.cumulative_tokens >= threshold
       order by ps.day asc
       limit 1) as reached_on,
      (select ps.days_since_release
       from point_series ps
       where ps.cumulative_tokens >= threshold
       order by ps.day asc
       limit 1) as days_since_release
    from unnest(array[1000000, 10000000, 100000000, 1000000000]) as threshold
  ) m
),

successors as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'modelId', dm.model_id,
        'name', coalesce(dm.name, dm.model_id),
        'releaseDate', dm.release_date,
        'daysSinceRelease',
          case
            when mr.release_date is null or dm.release_date is null then null
            else floor(extract(epoch from (dm.release_date - mr.release_date)) / 86400)::int
          end
      )
    ),
    '[]'::jsonb
  ) as value
  from private.v2_rpc_models_compat dm
  cross join model_row mr
  where dm.previous_model_id = p_model_id
)

select
  (select release_date from model_row) as release_date,
  (select deprecation_date from model_row) as deprecation_date,
  (select value from points_json) as points,
  (select value from milestones) as token_milestones,
  (select value from successors) as successor_milestones
where (select release_date from model_row) is not null;$function$;
CREATE OR REPLACE FUNCTION public.resolve_public_model_id(p_model_id text, p_provider text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with direct_match as (
  select dm.model_id as canonical_model_id
  from private.v2_rpc_models_compat dm
  where dm.model_id = p_model_id
  limit 1
),
alias_match as (
  select a.api_model_id as canonical_model_id
  from (select alias_slug, model_slug as api_model_id, enabled as is_enabled, effective_from, effective_to, metadata, created_at, updated_at from public.v2_model_aliases) a
  where a.alias_slug = p_model_id
    and coalesce(a.is_enabled, true)
  limit 1
),
provider_match as (
  select coalesce(nullif(pm.model_id, ''), pm.api_model_id) as canonical_model_id,
         pm.is_active_gateway,
         pm.updated_at
  from private.v2_rpc_routes_compat pm
  where (p_provider is null or pm.provider_id = p_provider)
    and (
      pm.model_id = p_model_id
      or pm.api_model_id = p_model_id
      or pm.provider_api_model_id = p_model_id
      or pm.provider_model_slug = p_model_id
    )
  order by pm.is_active_gateway desc, pm.updated_at desc nulls last
  limit 1
)
select canonical_model_id
from (
  select 0 as ord, canonical_model_id from direct_match
  union all
  select 1 as ord, canonical_model_id from alias_match
  union all
  select 2 as ord, canonical_model_id from provider_match
) candidates
where canonical_model_id is not null
  and btrim(canonical_model_id) <> ''
order by ord
limit 1;
$function$;
