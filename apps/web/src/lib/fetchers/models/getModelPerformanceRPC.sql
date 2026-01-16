
with
-- 1) Build the set of gateway model_id values we consider "this model"
model_ids as (
  select p_model_id as model_id
  union
  select pm.api_model_id
  from public.data_api_provider_models pm
  where pm.internal_model_id = p_model_id
),

-- 2) Anchor times in UTC as timestamptz (safe to compare with created_at timestamptz)
anchors as (
  select
    (date_trunc('hour', now() at time zone 'utc') at time zone 'utc') as now_hour,
    (select release_date
     from public.data_models
     where model_id = p_model_id
     limit 1) as release_date
),
windows as (
  select
    now_hour,
    now_hour - interval '24 hours'  as last24_start,
    now_hour - interval '48 hours'  as prev24_start,
    now_hour - interval '120 hours' as last5d_start
  from anchors
),

-- 3) Requests for the last 5d (used by 5d + 24h calcs)
requests_5d as (
  select
    gr.created_at,
    gr.success as success_bool,
    gr.latency_ms,
    gr.throughput,
    gr.generation_ms,
    gr.provider,
    gr.usage
  from public.gateway_requests gr
  join model_ids mi on mi.model_id = gr.model_id
  join windows w on gr.created_at >= w.last5d_start
              and gr.created_at <  w.now_hour
),

requests_last24 as (
  select r.*
  from requests_5d r, windows w
  where r.created_at >= w.last24_start
    and r.created_at <  w.now_hour
),
requests_prev24 as (
  select r.*
  from requests_5d r, windows w
  where r.created_at >= w.prev24_start
    and r.created_at <  w.last24_start
),

-- 4) 24h aggregates
last_24h as (
  select jsonb_build_object(
    'avg_throughput',
      case when count(*) filter (where throughput is not null) > 0
        then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
        else null end,
    'avg_latency_ms',
      case when count(*) filter (where latency_ms is not null) > 0
        then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
        else null end,
    'avg_generation_ms',
      case when count(*) filter (where generation_ms is not null) > 0
        then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
        else null end,
    'uptime_pct',
      case when count(*) > 0
        then (count(*) filter (where success_bool) * 100.0 / count(*))
        else null end,
    'total_requests', count(*),
    'successful_requests', count(*) filter (where success_bool)
  ) as value
  from requests_last24
),
prev_24h as (
  select jsonb_build_object(
    'avg_throughput',
      case when count(*) filter (where throughput is not null) > 0
        then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
        else null end,
    'avg_latency_ms',
      case when count(*) filter (where latency_ms is not null) > 0
        then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
        else null end,
    'avg_generation_ms',
      case when count(*) filter (where generation_ms is not null) > 0
        then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
        else null end,
    'uptime_pct',
      case when count(*) > 0
        then (count(*) filter (where success_bool) * 100.0 / count(*))
        else null end,
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
        'avg_throughput',
          case when count(r.*) filter (where r.throughput is not null) > 0
            then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
            else null end,
        'avg_latency_ms',
          case when count(r.*) filter (where r.latency_ms is not null) > 0
            then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
            else null end,
        'avg_generation_ms',
          case when count(r.*) filter (where r.generation_ms is not null) > 0
            then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
            else null end,
        'requests', count(r.*),
        'success_pct',
          case when count(r.*) > 0
            then (count(*) filter (where r.success_bool) * 100.0 / count(r.*))
            else null end,
        'worst_provider_success_pct',
          (
            select min(pct)
            from (
              select
                case when count(*) > 0
                  then (count(*) filter (where r2.success_bool) * 100.0 / count(*))
                  else null end as pct
              from requests_last24 r2
              where r2.created_at >= s.bucket_start
                and r2.created_at <  s.bucket_start + interval '1 hour'
              group by r2.provider
            ) provider_stats
          )
      ) as bucket_json
    from (
      select generate_series(
        w.last24_start,
        w.now_hour - interval '1 hour',
        interval '1 hour'
      ) as bucket_start
      from windows w
    ) s
    left join requests_last24 r
      on r.created_at >= s.bucket_start
     and r.created_at <  s.bucket_start + interval '1 hour'
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
        'avg_throughput',
          case when count(*) filter (where r.throughput is not null) > 0
            then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
            else null end,
        'avg_latency_ms',
          case when count(*) filter (where r.latency_ms is not null) > 0
            then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
            else null end,
        'avg_generation_ms',
          case when count(*) filter (where r.generation_ms is not null) > 0
            then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
            else null end,
        'requests', count(*),
        'uptime_pct',
          case when count(*) > 0
            then (count(*) filter (where r.success_bool) * 100.0 / count(*))
            else null end,
        'uptime_buckets',
          (
            select coalesce(jsonb_agg(bucket_json order by bucket_end asc), '[]'::jsonb)
            from (
              select
                bucket_end,
                jsonb_build_object(
                  'start', bucket_end - interval '6 hours',
                  'end', bucket_end,
                  'success_pct',
                    case when count(pr.*) > 0
                      then (count(*) filter (where pr.success_bool) * 100.0 / count(pr.*))
                      else null end
                ) as bucket_json
              from (
                select generate_series(
                  w.last24_start + interval '6 hours',
                  w.now_hour,
                  interval '6 hours'
                ) as bucket_end
                from windows w
              ) buckets
              left join requests_last24 pr
                on pr.provider = r.provider
               and pr.created_at >  buckets.bucket_end - interval '6 hours'
               and pr.created_at <= buckets.bucket_end
              group by bucket_end
            ) per_bucket
          )
      ) as provider_json
    from requests_last24 r
    left join public.data_api_providers p on p.api_provider_id = r.provider
    group by r.provider, p.api_provider_name
  ) provider_rows
),

-- 5) 5d aggregates
hourly_5d as (
  select coalesce(jsonb_agg(bucket_json order by bucket_start), '[]'::jsonb) as value
  from (
    select
      s.bucket_start,
      jsonb_build_object(
        'bucket', s.bucket_start,
        'avg_throughput',
          case when count(r.*) filter (where r.throughput is not null) > 0
            then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
            else null end,
        'avg_latency_ms',
          case when count(r.*) filter (where r.latency_ms is not null) > 0
            then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
            else null end,
        'avg_generation_ms',
          case when count(r.*) filter (where r.generation_ms is not null) > 0
            then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
            else null end,
        'requests', count(r.*),
        'success_pct',
          case when count(r.*) > 0
            then (count(*) filter (where r.success_bool) * 100.0 / count(r.*))
            else null end
      ) as bucket_json
    from (
      select generate_series(
        w.last5d_start,
        w.now_hour - interval '1 hour',
        interval '1 hour'
      ) as bucket_start
      from windows w
    ) s
    left join requests_5d r
      on r.created_at >= s.bucket_start
     and r.created_at <  s.bucket_start + interval '1 hour'
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
        'avg_throughput',
          case when count(*) filter (where throughput is not null) > 0
            then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
            else null end,
        'avg_latency_ms',
          case when count(*) filter (where latency_ms is not null) > 0
            then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
            else null end,
        'avg_generation_ms',
          case when count(*) filter (where generation_ms is not null) > 0
            then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
            else null end,
        'sample_count', count(*)
      ) as hour_json
    from (
      select
        extract(hour from (created_at at time zone 'utc'))::int as hour,
        throughput,
        latency_ms,
        generation_ms
      from requests_5d
    ) r
    group by hour
  ) hours
),

-- 6) Cumulative token totals since release date (or from first seen request)
token_totals as (
  select
    coalesce(
      (select (release_date::timestamp at time zone 'utc') from anchors),
      min(gr.created_at)
    ) as release_at,
    coalesce(
      sum(
        coalesce(
          nullif((gr.usage ->> 'total_tokens')::numeric, 0),
          coalesce((gr.usage ->> 'input_tokens')::numeric, 0)
          + coalesce((gr.usage ->> 'output_tokens')::numeric, 0)
        )
      ),
      0
    ) as total_tokens
  from public.gateway_requests gr
  join model_ids mi on mi.model_id = gr.model_id
  where (select release_date from anchors) is null
     or gr.created_at >= (select (release_date::timestamp at time zone 'utc') from anchors)
)

select jsonb_build_object(
  'last_24h',              (select value from last_24h),
  'prev_24h',              (select value from prev_24h),
  'hourly_24h',            (select value from hourly_24h),
  'provider_uptime_24h',   (select value from provider_uptime_24h),
  'hourly_5d',             (select value from hourly_5d),
  'time_of_day_5d',        (select value from time_of_day_5d),
  'cumulative_tokens',     jsonb_build_object(
                             'release_date', (select release_date from anchors),
                             'total_tokens', (select total_tokens from token_totals)
                           )
);
