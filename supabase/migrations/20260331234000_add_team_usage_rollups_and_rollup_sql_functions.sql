-- Team-scoped rollups for usage charts and provider top-models.
-- Goal: eliminate long-range gateway_requests scans in charting/rendering paths.

create table if not exists public.gateway_usage_rollup_15m_team_provider_model (
  bucket_15m timestamptz not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  key_id uuid null references public.keys (id) on delete set null,
  provider text not null,
  canonical_model_id text not null,
  requests bigint not null,
  success_requests bigint not null,
  total_tokens bigint not null,
  total_cost_nanos bigint not null,
  latency_sum_ms numeric not null,
  latency_samples bigint not null,
  throughput_sum numeric not null,
  throughput_samples bigint not null
);

create unique index if not exists gateway_usage_rollup_15m_team_provider_model_uniq
  on public.gateway_usage_rollup_15m_team_provider_model (
    bucket_15m,
    team_id,
    coalesce(key_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    canonical_model_id
  );

create index if not exists gateway_usage_rollup_15m_team_bucket_idx
  on public.gateway_usage_rollup_15m_team_provider_model (team_id, bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_team_key_bucket_idx
  on public.gateway_usage_rollup_15m_team_provider_model (team_id, key_id, bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_team_provider_bucket_idx
  on public.gateway_usage_rollup_15m_team_provider_model (team_id, provider, bucket_15m desc);
create index if not exists gateway_usage_rollup_15m_team_model_bucket_idx
  on public.gateway_usage_rollup_15m_team_provider_model (team_id, canonical_model_id, bucket_15m desc);

create or replace function public.refresh_gateway_usage_rollups_team_scope(
  p_since timestamptz default now() - interval '3 hours'
)
returns void
language plpgsql
as $$
declare
  v_since_15m timestamptz;
begin
  v_since_15m := date_trunc('minute', p_since)
    - make_interval(mins => (extract(minute from p_since)::int % 15));

  delete from public.gateway_usage_rollup_15m_team_provider_model
  where bucket_15m >= v_since_15m;

  with normalized_15m as (
    select
      (
        date_trunc('minute', gr.created_at)
        - make_interval(mins => (extract(minute from gr.created_at)::int % 15))
      ) as bucket_15m,
      gr.team_id,
      gr.key_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, ''),
        'unknown'
      ) as canonical_model_id,
      gr.success,
      public.gateway_usage_total_tokens(gr.usage) as total_tokens,
      coalesce(gr.cost_nanos, 0)::bigint as cost_nanos,
      gr.latency_ms,
      gr.throughput
    from public.gateway_requests gr
    where gr.created_at >= v_since_15m
      and gr.team_id is not null
  )
  insert into public.gateway_usage_rollup_15m_team_provider_model (
    bucket_15m,
    team_id,
    key_id,
    provider,
    canonical_model_id,
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
    n15.team_id,
    n15.key_id,
    n15.provider,
    n15.canonical_model_id,
    count(*)::bigint as requests,
    count(*) filter (where n15.success)::bigint as success_requests,
    coalesce(sum(n15.total_tokens), 0)::bigint as total_tokens,
    coalesce(sum(n15.cost_nanos), 0)::bigint as total_cost_nanos,
    coalesce(sum(n15.latency_ms), 0)::numeric as latency_sum_ms,
    count(n15.latency_ms)::bigint as latency_samples,
    coalesce(sum(n15.throughput), 0)::numeric as throughput_sum,
    count(n15.throughput)::bigint as throughput_samples
  from normalized_15m n15
  group by
    n15.bucket_15m,
    n15.team_id,
    n15.key_id,
    n15.provider,
    n15.canonical_model_id;
end;
$$;

comment on function public.refresh_gateway_usage_rollups_team_scope(timestamptz) is
  'Incrementally refreshes team/key/provider/model 15-minute usage rollups from gateway_requests.';

select public.refresh_gateway_usage_rollups_team_scope(now() - interval '90 days');

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job_id int;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-gateway-usage-rollups-team-15m'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-gateway-usage-rollups-team-nightly-catchup'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
exception
  when others then
    null;
end $$;

select cron.schedule(
  'refresh-gateway-usage-rollups-team-15m',
  '*/15 * * * *',
  $$select public.refresh_gateway_usage_rollups_team_scope(now() - interval '3 hours');$$
);

select cron.schedule(
  'refresh-gateway-usage-rollups-team-nightly-catchup',
  '16 3 * * *',
  $$select public.refresh_gateway_usage_rollups_team_scope(now() - interval '2 days');$$
);

create or replace function public.get_usage_chart_rollup(
    p_team uuid,
    p_from timestamp with time zone,
    p_to timestamp with time zone,
    p_bucket text,
    p_key_id uuid default null
)
returns table(
    bucket timestamp with time zone,
    provider text,
    model_id text,
    requests bigint,
    tokens bigint,
    cost numeric
) as $$
with base as (
    select
        r.bucket_15m as created_at,
        r.provider,
        r.canonical_model_id as model_id,
        r.requests,
        r.total_tokens,
        r.total_cost_nanos
    from public.gateway_usage_rollup_15m_team_provider_model r
    where r.team_id = p_team
      and r.bucket_15m >= p_from
      and r.bucket_15m <= p_to
      and (p_key_id is null or r.key_id = p_key_id)
),
bucketed as (
    select
        case
            when p_bucket = '5min' then
                date_trunc('minute', created_at)
                - make_interval(mins => (extract(minute from created_at)::int % 5))
            when p_bucket = 'hour' then date_trunc('hour', created_at)
            when p_bucket = 'day' then date_trunc('day', created_at)
            when p_bucket = 'month' then date_trunc('month', created_at)
            else date_trunc('day', created_at)
        end as bucket,
        coalesce(provider, 'unknown') as provider,
        coalesce(model_id, 'unknown') as model_id,
        coalesce(requests, 0)::bigint as requests,
        coalesce(total_tokens, 0)::bigint as tokens,
        coalesce(total_cost_nanos, 0)::numeric / 1e9 as cost
    from base
)
select
    bucket,
    provider,
    model_id,
    sum(requests)::bigint as requests,
    sum(tokens)::bigint as tokens,
    sum(cost)::numeric as cost
from bucketed
group by bucket, provider, model_id
order by bucket asc;
$$ language sql stable;

drop function if exists public.get_top_models_stats_tokens(text, timestamptz, int);
create or replace function public.get_top_models_stats_tokens(
    p_provider text,
    p_since timestamp with time zone,
    p_limit int
)
returns table(
    model_id text,
    model_name text,
    provider_model_slug text,
    request_count bigint,
    median_latency_ms numeric,
    median_throughput numeric,
    total_tokens bigint
) as $$
begin
  return query
  with grouped as (
    select
      r.canonical_model_id as model_id,
      sum(r.requests)::bigint as request_count,
      sum(r.total_tokens)::bigint as total_tokens,
      sum(r.latency_sum_ms) as latency_sum_ms,
      sum(r.latency_samples)::bigint as latency_samples,
      sum(r.throughput_sum) as throughput_sum,
      sum(r.throughput_samples)::bigint as throughput_samples
    from public.gateway_usage_rollup_15m_model_provider r
    where r.provider = p_provider
      and r.bucket_15m >= p_since
      and r.canonical_model_id is not null
    group by r.canonical_model_id
  )
  select
    g.model_id,
    coalesce(dm.name, g.model_id) as model_name,
    max(dapm.provider_model_slug) as provider_model_slug,
    g.request_count,
    case
      when g.latency_samples > 0 then g.latency_sum_ms / g.latency_samples
      else null
    end as median_latency_ms,
    case
      when g.throughput_samples > 0 then g.throughput_sum / g.throughput_samples
      else null
    end as median_throughput,
    g.total_tokens
  from grouped g
  left join public.data_models dm on dm.model_id = g.model_id
  left join public.data_api_provider_models dapm
    on dapm.provider_id = p_provider
   and (dapm.model_id = g.model_id or dapm.api_model_id = g.model_id)
  group by
    g.model_id,
    coalesce(dm.name, g.model_id),
    g.request_count,
    g.total_tokens,
    g.latency_sum_ms,
    g.latency_samples,
    g.throughput_sum,
    g.throughput_samples
  order by g.request_count desc
  limit p_limit;
end;
$$ language plpgsql stable;

grant execute on function public.refresh_gateway_usage_rollups_team_scope(timestamptz) to service_role;
grant execute on function public.get_usage_chart_rollup(uuid, timestamptz, timestamptz, text, uuid) to authenticated, service_role;
grant execute on function public.get_top_models_stats_tokens(text, timestamptz, int) to authenticated, service_role;
