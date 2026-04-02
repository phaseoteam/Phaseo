-- Incremental rollups for high-traffic public rankings and usage analytics.
-- Goal: avoid scanning raw gateway_requests on every public page load.

alter table public.gateway_requests
  add column if not exists canonical_model_id text;

create index if not exists gateway_requests_canonical_model_created_provider_idx
  on public.gateway_requests (canonical_model_id, created_at desc, provider)
  where canonical_model_id is not null;

create table if not exists public.gateway_usage_rollup_15m_model_provider (
  bucket_15m timestamptz not null,
  canonical_model_id text not null,
  provider text not null,
  requests bigint not null,
  success_requests bigint not null,
  total_tokens bigint not null,
  success_tokens bigint not null,
  input_tokens bigint not null,
  output_tokens bigint not null,
  total_cost_nanos bigint not null,
  latency_sum_ms numeric not null,
  latency_samples bigint not null,
  throughput_sum numeric not null,
  throughput_samples bigint not null,
  primary key (bucket_15m, canonical_model_id, provider)
);

create index if not exists gateway_usage_rollup_15m_bucket_idx
  on public.gateway_usage_rollup_15m_model_provider (bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_model_provider_idx
  on public.gateway_usage_rollup_15m_model_provider (canonical_model_id, provider, bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_provider_bucket_idx
  on public.gateway_usage_rollup_15m_model_provider (provider, bucket_15m desc);

create table if not exists public.gateway_usage_rollup_15m_app_model (
  bucket_15m timestamptz not null,
  app_id uuid not null references public.api_apps (id) on delete cascade,
  canonical_model_id text not null,
  requests bigint not null,
  success_requests bigint not null,
  total_tokens bigint not null,
  total_cost_nanos bigint not null,
  primary key (bucket_15m, app_id, canonical_model_id)
);

create index if not exists gateway_usage_rollup_15m_app_model_bucket_idx
  on public.gateway_usage_rollup_15m_app_model (bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_app_model_app_bucket_idx
  on public.gateway_usage_rollup_15m_app_model (app_id, bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_app_model_model_bucket_idx
  on public.gateway_usage_rollup_15m_app_model (canonical_model_id, bucket_15m desc);

create table if not exists public.gateway_usage_rollup_15m_provider_app (
  bucket_15m timestamptz not null,
  provider text not null,
  app_id uuid not null references public.api_apps (id) on delete cascade,
  requests bigint not null,
  success_requests bigint not null,
  total_tokens bigint not null,
  total_cost_nanos bigint not null,
  latency_sum_ms numeric not null,
  latency_samples bigint not null,
  throughput_sum numeric not null,
  throughput_samples bigint not null,
  primary key (bucket_15m, provider, app_id)
);

create index if not exists gateway_usage_rollup_15m_provider_app_bucket_idx
  on public.gateway_usage_rollup_15m_provider_app (bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_provider_app_provider_bucket_idx
  on public.gateway_usage_rollup_15m_provider_app (provider, bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_provider_app_app_bucket_idx
  on public.gateway_usage_rollup_15m_provider_app (app_id, bucket_15m desc);

create table if not exists public.gateway_usage_rollup_daily_app_model (
  day_bucket timestamptz not null,
  app_id uuid not null references public.api_apps (id) on delete cascade,
  canonical_model_id text not null,
  requests bigint not null,
  success_requests bigint not null,
  total_tokens bigint not null,
  total_cost_nanos bigint not null,
  primary key (day_bucket, app_id, canonical_model_id)
);

create index if not exists gateway_usage_rollup_daily_app_model_day_idx
  on public.gateway_usage_rollup_daily_app_model (day_bucket desc);
create index if not exists gateway_usage_rollup_daily_app_model_app_day_idx
  on public.gateway_usage_rollup_daily_app_model (app_id, day_bucket desc);
create index if not exists gateway_usage_rollup_daily_app_model_model_day_idx
  on public.gateway_usage_rollup_daily_app_model (canonical_model_id, day_bucket desc);

create table if not exists public.gateway_usage_rollup_daily_app (
  day_bucket timestamptz not null,
  app_id uuid not null references public.api_apps (id) on delete cascade,
  requests bigint not null,
  success_requests bigint not null,
  total_tokens bigint not null,
  total_cost_nanos bigint not null,
  unique_models integer not null,
  primary key (day_bucket, app_id)
);

create index if not exists gateway_usage_rollup_daily_app_day_idx
  on public.gateway_usage_rollup_daily_app (day_bucket desc);
create index if not exists gateway_usage_rollup_daily_app_app_day_idx
  on public.gateway_usage_rollup_daily_app (app_id, day_bucket desc);

create or replace function public.refresh_gateway_usage_rollups(
  p_since timestamptz default now() - interval '3 hours'
)
returns void
language plpgsql
as $$
declare
  v_since_15m timestamptz;
  v_since_day timestamptz;
begin
  v_since_15m := date_trunc('minute', p_since)
    - make_interval(mins => (extract(minute from p_since)::int % 15));
  v_since_day := (date_trunc('day', v_since_15m at time zone 'utc') at time zone 'utc');

  delete from public.gateway_usage_rollup_15m_model_provider
  where bucket_15m >= v_since_15m;

  delete from public.gateway_usage_rollup_15m_app_model
  where bucket_15m >= v_since_15m;

  delete from public.gateway_usage_rollup_15m_provider_app
  where bucket_15m >= v_since_15m;

  with normalized_15m as (
    select
      (
        date_trunc('minute', gr.created_at)
        - make_interval(mins => (extract(minute from gr.created_at)::int % 15))
      ) as bucket_15m,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, ''),
        'unknown'
      ) as canonical_model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider,
      gr.app_id,
      gr.success,
      public.gateway_usage_total_tokens(gr.usage) as total_tokens,
      coalesce(
        case
          when coalesce(gr.usage->>'input_tokens', '') ~ '^\d+$'
            then (gr.usage->>'input_tokens')::bigint
          else null
        end,
        case
          when coalesce(gr.usage->>'input_text_tokens', '') ~ '^\d+$'
            then (gr.usage->>'input_text_tokens')::bigint
          else 0
        end
      ) as input_tokens,
      coalesce(
        case
          when coalesce(gr.usage->>'output_tokens', '') ~ '^\d+$'
            then (gr.usage->>'output_tokens')::bigint
          else null
        end,
        case
          when coalesce(gr.usage->>'output_text_tokens', '') ~ '^\d+$'
            then (gr.usage->>'output_text_tokens')::bigint
          else 0
        end
      ) as output_tokens,
      coalesce(gr.cost_nanos, 0)::bigint as cost_nanos,
      gr.latency_ms,
      gr.throughput
    from public.gateway_requests gr
    where gr.created_at >= v_since_15m
  )
  insert into public.gateway_usage_rollup_15m_model_provider (
    bucket_15m,
    canonical_model_id,
    provider,
    requests,
    success_requests,
    total_tokens,
    success_tokens,
    input_tokens,
    output_tokens,
    total_cost_nanos,
    latency_sum_ms,
    latency_samples,
    throughput_sum,
    throughput_samples
  )
  select
    n15.bucket_15m,
    n15.canonical_model_id,
    n15.provider,
    count(*)::bigint as requests,
    count(*) filter (where n15.success)::bigint as success_requests,
    coalesce(sum(n15.total_tokens), 0)::bigint as total_tokens,
    coalesce(sum(case when n15.success then n15.total_tokens else 0 end), 0)::bigint as success_tokens,
    coalesce(sum(n15.input_tokens), 0)::bigint as input_tokens,
    coalesce(sum(n15.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(n15.cost_nanos), 0)::bigint as total_cost_nanos,
    coalesce(sum(n15.latency_ms), 0)::numeric as latency_sum_ms,
    count(n15.latency_ms)::bigint as latency_samples,
    coalesce(sum(n15.throughput), 0)::numeric as throughput_sum,
    count(n15.throughput)::bigint as throughput_samples
  from normalized_15m n15
  where n15.canonical_model_id is not null
    and n15.provider is not null
  group by n15.bucket_15m, n15.canonical_model_id, n15.provider;

  with normalized_15m as (
    select
      (
        date_trunc('minute', gr.created_at)
        - make_interval(mins => (extract(minute from gr.created_at)::int % 15))
      ) as bucket_15m,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, ''),
        'unknown'
      ) as canonical_model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider,
      gr.app_id,
      gr.success,
      public.gateway_usage_total_tokens(gr.usage) as total_tokens,
      coalesce(gr.cost_nanos, 0)::bigint as cost_nanos,
      gr.latency_ms,
      gr.throughput
    from public.gateway_requests gr
    where gr.created_at >= v_since_15m
  )
  insert into public.gateway_usage_rollup_15m_app_model (
    bucket_15m,
    app_id,
    canonical_model_id,
    requests,
    success_requests,
    total_tokens,
    total_cost_nanos
  )
  select
    n15.bucket_15m,
    n15.app_id,
    n15.canonical_model_id,
    count(*)::bigint as requests,
    count(*) filter (where n15.success)::bigint as success_requests,
    coalesce(sum(n15.total_tokens), 0)::bigint as total_tokens,
    coalesce(sum(n15.cost_nanos), 0)::bigint as total_cost_nanos
  from normalized_15m n15
  where n15.app_id is not null
    and n15.canonical_model_id is not null
  group by n15.bucket_15m, n15.app_id, n15.canonical_model_id;

  with normalized_15m as (
    select
      (
        date_trunc('minute', gr.created_at)
        - make_interval(mins => (extract(minute from gr.created_at)::int % 15))
      ) as bucket_15m,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, ''),
        'unknown'
      ) as canonical_model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider,
      gr.app_id,
      gr.success,
      public.gateway_usage_total_tokens(gr.usage) as total_tokens,
      coalesce(gr.cost_nanos, 0)::bigint as cost_nanos,
      gr.latency_ms,
      gr.throughput
    from public.gateway_requests gr
    where gr.created_at >= v_since_15m
  )
  insert into public.gateway_usage_rollup_15m_provider_app (
    bucket_15m,
    provider,
    app_id,
    requests,
    success_requests,
    total_tokens,
    total_cost_nanos,
    latency_sum_ms,
    latency_samples,
    throughput_sum,
    throughput_samples
  )
  select
    n15.bucket_15m,
    n15.provider,
    n15.app_id,
    count(*)::bigint as requests,
    count(*) filter (where n15.success)::bigint as success_requests,
    coalesce(sum(n15.total_tokens), 0)::bigint as total_tokens,
    coalesce(sum(n15.cost_nanos), 0)::bigint as total_cost_nanos,
    coalesce(sum(n15.latency_ms), 0)::numeric as latency_sum_ms,
    count(n15.latency_ms)::bigint as latency_samples,
    coalesce(sum(n15.throughput), 0)::numeric as throughput_sum,
    count(n15.throughput)::bigint as throughput_samples
  from normalized_15m n15
  where n15.app_id is not null
    and n15.provider is not null
    and n15.provider <> ''
  group by n15.bucket_15m, n15.provider, n15.app_id;

  delete from public.gateway_usage_rollup_daily_app_model
  where day_bucket in (
    select distinct (date_trunc('day', r.bucket_15m at time zone 'utc') at time zone 'utc')
    from public.gateway_usage_rollup_15m_app_model r
    where r.bucket_15m >= v_since_15m
  );

  insert into public.gateway_usage_rollup_daily_app_model (
    day_bucket,
    app_id,
    canonical_model_id,
    requests,
    success_requests,
    total_tokens,
    total_cost_nanos
  )
  select
    (date_trunc('day', r.bucket_15m at time zone 'utc') at time zone 'utc') as day_bucket,
    r.app_id,
    r.canonical_model_id,
    sum(r.requests)::bigint as requests,
    sum(r.success_requests)::bigint as success_requests,
    sum(r.total_tokens)::bigint as total_tokens,
    sum(r.total_cost_nanos)::bigint as total_cost_nanos
  from public.gateway_usage_rollup_15m_app_model r
  where r.bucket_15m >= v_since_day
  group by
    (date_trunc('day', r.bucket_15m at time zone 'utc') at time zone 'utc'),
    r.app_id,
    r.canonical_model_id;

  delete from public.gateway_usage_rollup_daily_app
  where day_bucket in (
    select distinct d.day_bucket
    from public.gateway_usage_rollup_daily_app_model d
    where d.day_bucket >= v_since_day
  );

  insert into public.gateway_usage_rollup_daily_app (
    day_bucket,
    app_id,
    requests,
    success_requests,
    total_tokens,
    total_cost_nanos,
    unique_models
  )
  select
    d.day_bucket,
    d.app_id,
    sum(d.requests)::bigint as requests,
    sum(d.success_requests)::bigint as success_requests,
    sum(d.total_tokens)::bigint as total_tokens,
    sum(d.total_cost_nanos)::bigint as total_cost_nanos,
    count(*)::integer as unique_models
  from public.gateway_usage_rollup_daily_app_model d
  where d.day_bucket >= v_since_day
  group by d.day_bucket, d.app_id;
end;
$$;

comment on function public.refresh_gateway_usage_rollups(timestamptz) is
  'Incrementally refreshes 15-minute model/provider and app/model rollups from gateway_requests, then derives daily app aggregates.';

-- Backfill recent history once.
select public.refresh_gateway_usage_rollups(now() - interval '90 days');

create extension if not exists pg_cron with schema extensions;

-- Replace older rollup schedule (hourly) with 15-minute incremental refresh.
do $$
declare
  v_job_id int;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-public-usage-rollups'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-gateway-usage-rollups-15m'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-gateway-usage-rollups-nightly-catchup'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
exception
  when others then
    null;
end $$;

select cron.schedule(
  'refresh-gateway-usage-rollups-15m',
  '*/15 * * * *',
  $$select public.refresh_gateway_usage_rollups(now() - interval '3 hours');$$
);

select cron.schedule(
  'refresh-gateway-usage-rollups-nightly-catchup',
  '12 3 * * *',
  $$select public.refresh_gateway_usage_rollups(now() - interval '2 days');$$
);

create or replace function public.get_public_model_rankings(
  p_time_range text default 'week',
  p_metric text default 'tokens',
  p_limit integer default 50
)
returns table (
  model_id text,
  provider text,
  requests bigint,
  total_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_cost_usd numeric,
  median_latency_ms numeric,
  median_throughput numeric,
  success_rate numeric,
  rank integer,
  prev_rank integer,
  trend text
) as $$
declare
  v_since timestamptz;
  v_prev_since timestamptz;
  v_prev_until timestamptz;
  v_now timestamptz := now();
begin
  case p_time_range
    when 'today' then
      v_since := date_trunc('day', v_now);
      v_prev_since := v_since - interval '1 day';
      v_prev_until := v_since;
    when 'week' then
      v_since := v_now - interval '7 days';
      v_prev_since := v_now - interval '14 days';
      v_prev_until := v_now - interval '7 days';
    when 'month' then
      v_since := date_trunc('month', v_now);
      v_prev_since := v_since - interval '1 month';
      v_prev_until := v_since;
    else
      v_since := '2020-01-01'::timestamptz;
      v_prev_since := v_since;
      v_prev_until := v_since;
  end case;

  return query
  with current_period as (
    select
      r.canonical_model_id as model_id,
      r.provider,
      sum(r.requests)::bigint as req_count,
      sum(r.total_tokens)::bigint as total_tok,
      sum(r.input_tokens)::bigint as input_tok,
      sum(r.output_tokens)::bigint as output_tok,
      sum(r.total_cost_nanos)::bigint as total_cost_nano,
      sum(r.success_requests)::bigint as success_req_count,
      sum(r.latency_sum_ms) as latency_sum,
      sum(r.latency_samples)::bigint as latency_samples,
      sum(r.throughput_sum) as throughput_sum,
      sum(r.throughput_samples)::bigint as throughput_samples
    from public.gateway_usage_rollup_15m_model_provider r
    where r.bucket_15m >= v_since
      and r.bucket_15m < v_now
      and r.canonical_model_id is not null
      and r.provider is not null
      and r.provider <> ''
    group by r.canonical_model_id, r.provider
  ),
  previous_period as (
    select
      r.canonical_model_id as model_id,
      r.provider,
      sum(r.requests)::bigint as req_count,
      sum(r.total_tokens)::bigint as total_tok,
      sum(r.total_cost_nanos)::bigint as total_cost_nano
    from public.gateway_usage_rollup_15m_model_provider r
    where r.bucket_15m >= v_prev_since
      and r.bucket_15m < v_prev_until
      and r.canonical_model_id is not null
      and r.provider is not null
      and r.provider <> ''
    group by r.canonical_model_id, r.provider
  ),
  ranked_current as (
    select
      cp.*,
      row_number() over (
        order by
          case p_metric
            when 'tokens' then cp.total_tok::numeric
            when 'requests' then cp.req_count::numeric
            when 'cost' then cp.total_cost_nano::numeric
            else cp.total_tok::numeric
          end desc
      ) as rk
    from current_period cp
  ),
  ranked_previous as (
    select
      pp.model_id,
      pp.provider,
      row_number() over (
        order by
          case p_metric
            when 'tokens' then pp.total_tok::numeric
            when 'requests' then pp.req_count::numeric
            when 'cost' then pp.total_cost_nano::numeric
            else pp.total_tok::numeric
          end desc
      ) as rk
    from previous_period pp
  )
  select
    rc.model_id,
    rc.provider,
    rc.req_count::bigint as requests,
    rc.total_tok::bigint as total_tokens,
    rc.input_tok::bigint as input_tokens,
    rc.output_tok::bigint as output_tokens,
    round(rc.total_cost_nano / 1000000000.0, 2) as total_cost_usd,
    round(
      case when rc.latency_samples > 0
        then (rc.latency_sum / rc.latency_samples)
        else null
      end::numeric,
      0
    ) as median_latency_ms,
    round(
      case when rc.throughput_samples > 0
        then (rc.throughput_sum / rc.throughput_samples)
        else null
      end::numeric,
      2
    ) as median_throughput,
    round(
      case when rc.req_count > 0
        then (rc.success_req_count::numeric / rc.req_count::numeric)
        else null
      end,
      4
    ) as success_rate,
    rc.rk::integer as rank,
    coalesce(rp.rk, 9999)::integer as prev_rank,
    case
      when rp.rk is null then 'new'
      when rp.rk > rc.rk then 'up'
      when rp.rk < rc.rk then 'down'
      else 'same'
    end as trend
  from ranked_current rc
  left join ranked_previous rp
    on rc.model_id = rp.model_id
   and rc.provider = rp.provider
  where rc.rk <= p_limit
  order by rc.rk;
end;
$$ language plpgsql stable;

create or replace function public.get_public_model_performance(
  p_hours integer default 24,
  p_min_requests integer default 0
)
returns table (
  model_id text,
  provider text,
  requests bigint,
  cost_per_1m_tokens numeric,
  median_latency_ms numeric,
  p95_latency_ms numeric,
  median_throughput numeric,
  success_rate numeric
) as $$
declare
  v_since timestamptz := now() - (p_hours || ' hours')::interval;
begin
  return query
  with grouped as (
    select
      r.canonical_model_id as model_id,
      r.provider,
      sum(r.requests)::bigint as req_count,
      sum(r.total_tokens)::bigint as total_tok,
      sum(r.total_cost_nanos)::bigint as total_cost_nano,
      sum(r.success_requests)::bigint as success_req_count,
      sum(r.latency_sum_ms) as latency_sum,
      sum(r.latency_samples)::bigint as latency_samples,
      sum(r.throughput_sum) as throughput_sum,
      sum(r.throughput_samples)::bigint as throughput_samples
    from public.gateway_usage_rollup_15m_model_provider r
    where r.bucket_15m >= v_since
      and r.canonical_model_id is not null
      and r.provider is not null
      and r.provider <> ''
    group by r.canonical_model_id, r.provider
  )
  select
    g.model_id,
    g.provider,
    g.req_count::bigint as requests,
    case
      when g.total_tok > 0 then
        round((g.total_cost_nano / 1000000000.0) / (g.total_tok / 1000000.0), 2)
      else 0
    end as cost_per_1m_tokens,
    round(
      case when g.latency_samples > 0
        then (g.latency_sum / g.latency_samples)
        else null
      end::numeric,
      0
    ) as median_latency_ms,
    round(
      case when g.latency_samples > 0
        then (g.latency_sum / g.latency_samples)
        else null
      end::numeric,
      0
    ) as p95_latency_ms,
    round(
      case when g.throughput_samples > 0
        then (g.throughput_sum / g.throughput_samples)
        else null
      end::numeric,
      2
    ) as median_throughput,
    round(
      case when g.req_count > 0
        then (g.success_req_count::numeric / g.req_count::numeric)
        else null
      end,
      4
    ) as success_rate
  from grouped g
  where g.req_count >= p_min_requests
  order by g.req_count desc;
end;
$$ language plpgsql stable;

create or replace function public.get_public_trending_models(
  p_limit integer default 20,
  p_min_requests integer default 0
)
returns table (
  model_id text,
  provider text,
  current_week_requests bigint,
  previous_week_requests bigint,
  two_weeks_ago_requests bigint,
  velocity numeric,
  momentum_score numeric
) as $$
declare
  v_now timestamptz := now();
begin
  return query
  with weekly_stats as (
    select
      r.canonical_model_id as model_id,
      r.provider,
      sum(r.requests) filter (where r.bucket_15m >= v_now - interval '7 days')::bigint as week_0,
      sum(r.requests) filter (
        where r.bucket_15m >= v_now - interval '14 days'
          and r.bucket_15m < v_now - interval '7 days'
      )::bigint as week_1,
      sum(r.requests) filter (
        where r.bucket_15m >= v_now - interval '21 days'
          and r.bucket_15m < v_now - interval '14 days'
      )::bigint as week_2
    from public.gateway_usage_rollup_15m_model_provider r
    where r.bucket_15m >= v_now - interval '21 days'
      and r.canonical_model_id is not null
      and r.provider is not null
      and r.provider <> ''
    group by r.canonical_model_id, r.provider
    having sum(r.requests) filter (where r.bucket_15m >= v_now - interval '7 days') >= p_min_requests
  )
  select
    ws.model_id,
    ws.provider,
    coalesce(ws.week_0, 0)::bigint as current_week_requests,
    coalesce(ws.week_1, 0)::bigint as previous_week_requests,
    coalesce(ws.week_2, 0)::bigint as two_weeks_ago_requests,
    ((coalesce(ws.week_0, 0) - coalesce(ws.week_1, 0)) - (coalesce(ws.week_1, 0) - coalesce(ws.week_2, 0)))::numeric as velocity,
    (((coalesce(ws.week_0, 0) - coalesce(ws.week_1, 0)) - (coalesce(ws.week_1, 0) - coalesce(ws.week_2, 0))) * 2.0 + (coalesce(ws.week_0, 0) - coalesce(ws.week_1, 0)))::numeric as momentum_score
  from weekly_stats ws
  where coalesce(ws.week_0, 0) > coalesce(ws.week_1, 0)
  order by momentum_score desc
  limit p_limit;
end;
$$ language plpgsql stable;

create or replace function public.get_public_market_share(
  p_dimension text default 'organization',
  p_time_range text default 'week'
)
returns table (
  name text,
  requests bigint,
  tokens bigint,
  share_pct numeric
) as $$
declare
  v_since timestamptz;
  v_now timestamptz := now();
begin
  case p_time_range
    when 'today' then v_since := date_trunc('day', v_now);
    when 'week' then v_since := v_now - interval '7 days';
    when 'month' then v_since := date_trunc('month', v_now);
    else v_since := v_now - interval '7 days';
  end case;

  if p_dimension = 'organization' then
    return query
    with base as (
      select
        r.canonical_model_id,
        sum(r.success_requests)::bigint as requests,
        sum(r.success_tokens)::bigint as tokens
      from public.gateway_usage_rollup_15m_model_provider r
      where r.bucket_15m >= v_since
      group by r.canonical_model_id
    ),
    grouped as (
      select
        coalesce(org.name, dm.organisation_id) as org_name,
        sum(b.requests)::bigint as req_count,
        sum(b.tokens)::bigint as tok_count
      from base b
      join public.data_models dm on dm.model_id = b.canonical_model_id
      left join public.data_organisations org on dm.organisation_id = org.organisation_id
      where dm.organisation_id is not null
      group by org.name, dm.organisation_id
    ),
    totals as (
      select
        sum(g.req_count)::numeric as total_requests
      from grouped g
    )
    select
      g.org_name as name,
      g.req_count::bigint as requests,
      g.tok_count::bigint as tokens,
      round((g.req_count / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from grouped g
    cross join totals t
    order by g.req_count desc;
  else
    return query
    with grouped as (
      select
        r.provider,
        sum(r.success_requests)::bigint as req_count,
        sum(r.success_tokens)::bigint as tok_count
      from public.gateway_usage_rollup_15m_model_provider r
      where r.bucket_15m >= v_since
        and r.provider is not null
        and r.provider <> ''
      group by r.provider
    ),
    totals as (
      select
        sum(g.req_count)::numeric as total_requests
      from grouped g
    )
    select
      g.provider as name,
      g.req_count::bigint as requests,
      g.tok_count::bigint as tokens,
      round((g.req_count / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from grouped g
    cross join totals t
    order by g.req_count desc;
  end if;
end;
$$ language plpgsql stable;

drop function if exists public.get_public_top_apps(integer, text);
create or replace function public.get_public_top_apps(
  p_limit integer default 20,
  p_time_range text default 'week'
)
returns table (
  app_id text,
  app_name text,
  requests bigint,
  tokens bigint,
  unique_models integer
) as $$
declare
  v_since timestamptz;
  v_now timestamptz := now();
begin
  case p_time_range
    when 'today' then v_since := date_trunc('day', v_now);
    when 'week' then v_since := v_now - interval '7 days';
    when 'month' then v_since := date_trunc('month', v_now);
    else v_since := v_now - interval '7 days';
  end case;

  return query
  with app_totals as (
    select
      d.app_id,
      sum(d.requests)::bigint as req_count,
      sum(d.total_tokens)::bigint as tok_count
    from public.gateway_usage_rollup_daily_app d
    where d.day_bucket >= (date_trunc('day', v_since at time zone 'utc') at time zone 'utc')
    group by d.app_id
  ),
  app_models as (
    select
      m.app_id,
      count(distinct m.canonical_model_id)::integer as uniq_models
    from public.gateway_usage_rollup_daily_app_model m
    where m.day_bucket >= (date_trunc('day', v_since at time zone 'utc') at time zone 'utc')
    group by m.app_id
  )
  select
    app_tot.app_id::text as app_id,
    coalesce(aa.title, 'App-' || substring(md5(app_tot.app_id::text), 1, 8)) as app_name,
    app_tot.req_count::bigint as requests,
    app_tot.tok_count::bigint as tokens,
    coalesce(am.uniq_models, 0)::integer as unique_models
  from app_totals app_tot
  left join app_models am on am.app_id = app_tot.app_id
  left join public.api_apps aa on aa.id = app_tot.app_id
  order by app_tot.req_count desc, app_tot.tok_count desc
  limit p_limit;
end;
$$ language plpgsql stable;

create or replace function public.get_public_trending_apps(
  p_limit integer default 20,
  p_min_week_tokens bigint default 0
)
returns table (
  app_id text,
  app_name text,
  current_week_tokens bigint,
  previous_week_tokens bigint,
  growth_tokens bigint,
  growth_pct numeric
)
language plpgsql
stable
as $$
declare
  v_now timestamptz := now();
  v_week_start timestamptz := (date_trunc('day', (v_now - interval '7 days') at time zone 'utc') at time zone 'utc');
  v_prev_week_start timestamptz := (date_trunc('day', (v_now - interval '14 days') at time zone 'utc') at time zone 'utc');
begin
  return query
  with weekly as (
    select
      d.app_id,
      sum(d.total_tokens) filter (where d.day_bucket >= v_week_start)::bigint as week_0_tokens,
      sum(d.total_tokens) filter (
        where d.day_bucket >= v_prev_week_start
          and d.day_bucket < v_week_start
      )::bigint as week_1_tokens
    from public.gateway_usage_rollup_daily_app d
    where d.day_bucket >= v_prev_week_start
    group by d.app_id
  )
  select
    w.app_id::text as app_id,
    coalesce(aa.title, 'App-' || substring(md5(w.app_id::text), 1, 8)) as app_name,
    coalesce(w.week_0_tokens, 0)::bigint as current_week_tokens,
    coalesce(w.week_1_tokens, 0)::bigint as previous_week_tokens,
    (coalesce(w.week_0_tokens, 0) - coalesce(w.week_1_tokens, 0))::bigint as growth_tokens,
    case
      when coalesce(w.week_1_tokens, 0) > 0
        then round(((coalesce(w.week_0_tokens, 0) - coalesce(w.week_1_tokens, 0))::numeric / w.week_1_tokens::numeric) * 100, 2)
      else null
    end as growth_pct
  from weekly w
  left join public.api_apps aa on aa.id = w.app_id
  where coalesce(w.week_0_tokens, 0) >= p_min_week_tokens
  order by growth_tokens desc
  limit p_limit;
end;
$$;

create or replace function public.get_public_summary_stats()
returns table (
  total_requests_24h bigint,
  total_tokens_24h bigint,
  total_models integer,
  total_providers integer,
  avg_latency_ms numeric,
  success_rate_24h numeric
)
language sql
stable
as $$
  with grouped as (
    select
      sum(r.requests)::bigint as req_count,
      sum(r.total_tokens)::bigint as tok_count,
      count(distinct r.canonical_model_id)::integer as model_count,
      count(distinct r.provider)::integer as provider_count,
      sum(r.latency_sum_ms) as latency_sum,
      sum(r.latency_samples)::bigint as latency_samples,
      sum(r.success_requests)::bigint as success_count
    from public.gateway_usage_rollup_15m_model_provider r
    where r.bucket_15m >= now() - interval '24 hours'
  )
  select
    coalesce(g.req_count, 0)::bigint as total_requests_24h,
    coalesce(g.tok_count, 0)::bigint as total_tokens_24h,
    coalesce(g.model_count, 0)::integer as total_models,
    coalesce(g.provider_count, 0)::integer as total_providers,
    round(
      case when coalesce(g.latency_samples, 0) > 0
        then (g.latency_sum / g.latency_samples)
        else null
      end::numeric,
      0
    ) as avg_latency_ms,
    round(
      case when coalesce(g.req_count, 0) > 0
        then (g.success_count::numeric / g.req_count::numeric)
        else null
      end,
      4
    ) as success_rate_24h
  from grouped g;
$$;

create or replace function public.get_usage_tokens_weekly_model_provider(
  p_since timestamptz default now() - interval '8 weeks'
)
returns table (
  week_bucket timestamptz,
  model_id text,
  provider text,
  requests bigint,
  total_tokens bigint,
  total_cost_usd numeric,
  success_rate numeric
)
language sql
stable
as $$
  with grouped as (
    select
      date_trunc('week', r.bucket_15m) as week_bucket,
      r.canonical_model_id as model_id,
      r.provider,
      sum(r.requests)::bigint as req_count,
      sum(r.total_tokens)::bigint as tok_count,
      sum(r.total_cost_nanos)::bigint as cost_nano,
      sum(r.success_requests)::bigint as succ_count
    from public.gateway_usage_rollup_15m_model_provider r
    where r.bucket_15m >= p_since
    group by date_trunc('week', r.bucket_15m), r.canonical_model_id, r.provider
  )
  select
    g.week_bucket,
    g.model_id,
    g.provider,
    g.req_count as requests,
    g.tok_count as total_tokens,
    round(g.cost_nano / 1000000000.0, 4) as total_cost_usd,
    round(
      case when g.req_count > 0
        then (g.succ_count::numeric / g.req_count::numeric)
        else null
      end,
      4
    ) as success_rate
  from grouped g
  order by g.week_bucket desc, g.tok_count desc;
$$;

create or replace function public.get_usage_daily_app(
  p_since timestamptz default now() - interval '30 days'
)
returns table (
  day_bucket timestamptz,
  app_id uuid,
  requests bigint,
  total_tokens bigint,
  total_cost_usd numeric,
  unique_models integer,
  success_rate numeric
)
language sql
stable
as $$
  select
    d.day_bucket,
    d.app_id,
    d.requests::bigint as requests,
    d.total_tokens::bigint as total_tokens,
    round(d.total_cost_nanos / 1000000000.0, 4) as total_cost_usd,
    d.unique_models::integer as unique_models,
    round(
      case when d.requests > 0
        then (d.success_requests::numeric / d.requests::numeric)
        else null
      end,
      4
    ) as success_rate
  from public.gateway_usage_rollup_daily_app d
  where d.day_bucket >= (date_trunc('day', p_since at time zone 'utc') at time zone 'utc')
  order by d.day_bucket desc, d.requests desc;
$$;

create or replace function public.get_gateway_marketing_rollup(
  p_hours integer default 24
)
returns table (
  bucket_hour timestamptz,
  requests bigint,
  success_requests bigint,
  total_tokens bigint,
  latency_sum_ms numeric,
  latency_samples bigint
)
language sql
stable
as $$
  select
    date_trunc('hour', r.bucket_15m) as bucket_hour,
    sum(r.requests)::bigint as requests,
    sum(r.success_requests)::bigint as success_requests,
    sum(r.total_tokens)::bigint as total_tokens,
    sum(r.latency_sum_ms)::numeric as latency_sum_ms,
    sum(r.latency_samples)::bigint as latency_samples
  from public.gateway_usage_rollup_15m_model_provider r
  where r.bucket_15m >= now() - make_interval(hours => greatest(1, p_hours))
  group by date_trunc('hour', r.bucket_15m)
  order by date_trunc('hour', r.bucket_15m);
$$;

grant execute on function public.refresh_gateway_usage_rollups(timestamptz) to service_role;
grant execute on function public.get_usage_tokens_weekly_model_provider(timestamptz) to authenticated, service_role;
grant execute on function public.get_usage_daily_app(timestamptz) to authenticated, service_role;
grant execute on function public.get_gateway_marketing_rollup(integer) to authenticated, service_role;
