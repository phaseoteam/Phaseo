-- Canonical API model-id resolution for public rankings and top-model RPCs.

create or replace function public.resolve_public_model_id(
  p_model_id text,
  p_provider text default null
)
returns text
language sql
stable
as $$
with direct_match as (
  select dm.model_id as canonical_model_id
  from public.data_models dm
  where dm.model_id = p_model_id
  limit 1
),
alias_match as (
  select a.api_model_id as canonical_model_id
  from public.data_api_model_aliases a
  where a.alias_slug = p_model_id
    and coalesce(a.is_enabled, true)
  limit 1
),
provider_match as (
  select coalesce(pm.model_id, pm.api_model_id) as canonical_model_id,
         pm.is_active_gateway,
         pm.updated_at
  from public.data_api_provider_models pm
  where (p_provider is null or pm.provider_id = p_provider)
    and (
      pm.model_id = p_model_id
      or pm.api_model_id = p_model_id
      or pm.provider_api_model_id = p_model_id
      or pm.provider_model_slug = p_model_id
      or pm.internal_model_id = p_model_id
    )
  order by pm.is_active_gateway desc, pm.updated_at desc nulls last
  limit 1
),
redirect_match as (
  select r.model_id as canonical_model_id
  from public.data_model_id_redirects r
  where r.legacy_model_id = p_model_id
  limit 1
)
select canonical_model_id
from (
  select 0 as ord, canonical_model_id from direct_match
  union all
  select 1 as ord, canonical_model_id from alias_match
  union all
  select 2 as ord, canonical_model_id from provider_match
  union all
  select 3 as ord, canonical_model_id from redirect_match
) candidates
where canonical_model_id is not null
  and btrim(canonical_model_id) <> ''
order by ord
limit 1;
$$;
comment on function public.resolve_public_model_id(text, text)
  is 'Resolves raw gateway model ids, aliases, provider slugs, and legacy internal ids to canonical API model ids.';
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
  v_start timestamptz;
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

  v_start := least(v_since, v_prev_since);

  return query
  with resolved as (
    select
      gr.created_at,
      gr.provider,
      gr.usage,
      gr.cost_nanos,
      gr.latency_ms,
      gr.throughput,
      gr.success,
      public.resolve_public_model_id(gr.model_id, gr.provider) as canonical_model_id
    from public.gateway_requests gr
    where gr.created_at >= v_start
  ),
  current_period as (
    select
      r.canonical_model_id as model_id,
      r.provider,
      count(*) as req_count,
      sum(public.gateway_usage_total_tokens(r.usage)) as total_tok,
      sum(coalesce((r.usage->>'input_tokens')::bigint, 0)) as input_tok,
      sum(coalesce((r.usage->>'output_tokens')::bigint, 0)) as output_tok,
      sum(coalesce(r.cost_nanos, 0)) as total_cost_nano,
      percentile_cont(0.5) within group (order by r.latency_ms) as p50_latency,
      percentile_cont(0.5) within group (order by r.throughput) as p50_throughput,
      avg(case when r.success then 1.0 else 0.0 end) as succ_rate
    from resolved r
    where r.created_at >= v_since
      and r.canonical_model_id is not null
      and r.provider is not null
      and r.provider <> ''
    group by r.canonical_model_id, r.provider
  ),
  previous_period as (
    select
      r.canonical_model_id as model_id,
      r.provider,
      count(*) as req_count
    from resolved r
    where r.created_at >= v_prev_since
      and r.created_at < v_prev_until
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
            when 'tokens' then cp.total_tok
            when 'requests' then cp.req_count
            when 'cost' then cp.total_cost_nano
            else cp.total_tok
          end desc
      ) as rk
    from current_period cp
  ),
  ranked_previous as (
    select
      pp.model_id,
      pp.provider,
      row_number() over (order by pp.req_count desc) as rk
    from previous_period pp
  )
  select
    rc.model_id,
    rc.provider,
    rc.req_count::bigint,
    rc.total_tok::bigint,
    rc.input_tok::bigint,
    rc.output_tok::bigint,
    round(rc.total_cost_nano / 1000000000.0, 2) as total_cost_usd,
    round(rc.p50_latency::numeric, 0) as median_latency_ms,
    round(rc.p50_throughput::numeric, 2) as median_throughput,
    round(rc.succ_rate::numeric, 4) as success_rate,
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
begin
  return query
  with resolved as (
    select
      gr.created_at,
      gr.provider,
      gr.usage,
      gr.cost_nanos,
      gr.latency_ms,
      gr.throughput,
      gr.success,
      public.resolve_public_model_id(gr.model_id, gr.provider) as canonical_model_id
    from public.gateway_requests gr
    where gr.created_at >= now() - (p_hours || ' hours')::interval
  )
  select
    r.canonical_model_id as model_id,
    r.provider,
    count(*)::bigint as requests,
    case
      when sum(public.gateway_usage_total_tokens(r.usage)) > 0 then
        round(
          (sum(coalesce(r.cost_nanos, 0)) / 1000000000.0) /
          (sum(public.gateway_usage_total_tokens(r.usage)) / 1000000.0),
          2
        )
      else 0
    end as cost_per_1m_tokens,
    round(percentile_cont(0.5) within group (order by r.latency_ms)::numeric, 0) as median_latency_ms,
    round(percentile_cont(0.95) within group (order by r.latency_ms)::numeric, 0) as p95_latency_ms,
    round(percentile_cont(0.5) within group (order by r.throughput)::numeric, 2) as median_throughput,
    round(avg(case when r.success then 1.0 else 0.0 end)::numeric, 4) as success_rate
  from resolved r
  where r.canonical_model_id is not null
    and r.provider is not null
    and r.provider <> ''
  group by r.canonical_model_id, r.provider
  having count(*) >= p_min_requests
  order by requests desc;
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
  with resolved as (
    select
      gr.created_at,
      gr.provider,
      public.resolve_public_model_id(gr.model_id, gr.provider) as canonical_model_id
    from public.gateway_requests gr
    where gr.created_at >= v_now - interval '21 days'
  ),
  weekly_stats as (
    select
      r.canonical_model_id as model_id,
      r.provider,
      count(*) filter (where r.created_at >= v_now - interval '7 days') as week_0,
      count(*) filter (
        where r.created_at >= v_now - interval '14 days'
          and r.created_at < v_now - interval '7 days'
      ) as week_1,
      count(*) filter (
        where r.created_at >= v_now - interval '21 days'
          and r.created_at < v_now - interval '14 days'
      ) as week_2
    from resolved r
    where r.canonical_model_id is not null
      and r.provider is not null
      and r.provider <> ''
    group by r.canonical_model_id, r.provider
    having count(*) filter (where r.created_at >= v_now - interval '7 days') >= p_min_requests
  )
  select
    ws.model_id,
    ws.provider,
    ws.week_0::bigint,
    ws.week_1::bigint,
    ws.week_2::bigint,
    ((ws.week_0 - ws.week_1) - (ws.week_1 - ws.week_2))::numeric as velocity,
    (((ws.week_0 - ws.week_1) - (ws.week_1 - ws.week_2)) * 2.0 + (ws.week_0 - ws.week_1))::numeric as momentum_score
  from weekly_stats ws
  where ws.week_0 > ws.week_1
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
    with resolved as (
      select
        gr.usage,
        public.resolve_public_model_id(gr.model_id, gr.provider) as canonical_model_id
      from public.gateway_requests gr
      where gr.created_at >= v_since
        and gr.success is true
    ),
    totals as (
      select
        count(*)::numeric as total_requests,
        sum(public.gateway_usage_total_tokens(r.usage))::numeric as total_tokens
      from resolved r
      where r.canonical_model_id is not null
    ),
    org_stats as (
      select
        coalesce(org.name, dm.organisation_id) as org_name,
        count(*) as req_count,
        sum(public.gateway_usage_total_tokens(r.usage)) as tok_count
      from resolved r
      join public.data_models dm
        on dm.model_id = r.canonical_model_id
      left join public.data_organisations org
        on dm.organisation_id = org.organisation_id
      where r.canonical_model_id is not null
        and dm.organisation_id is not null
      group by org.name, dm.organisation_id
    )
    select
      os.org_name,
      os.req_count::bigint,
      os.tok_count::bigint,
      round((os.req_count / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from org_stats os, totals t
    order by os.req_count desc;
  else
    return query
    with totals as (
      select
        count(*)::numeric as total_requests,
        sum(public.gateway_usage_total_tokens(gr.usage))::numeric as total_tokens
      from public.gateway_requests gr
      where gr.created_at >= v_since
        and gr.success is true
        and gr.provider is not null
        and gr.provider <> ''
    ),
    provider_stats as (
      select
        gr.provider as prov_name,
        count(*) as req_count,
        sum(public.gateway_usage_total_tokens(gr.usage)) as tok_count
      from public.gateway_requests gr
      where gr.created_at >= v_since
        and gr.success is true
        and gr.provider is not null
        and gr.provider <> ''
      group by gr.provider
    )
    select
      ps.prov_name,
      ps.req_count::bigint,
      ps.tok_count::bigint,
      round((ps.req_count / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from provider_stats ps, totals t
    order by ps.req_count desc;
  end if;
end;
$$ language plpgsql stable;
create or replace function public.get_public_top_models_with_metadata(
  p_time_range text default 'week',
  p_limit integer default 6
)
returns table (
  model_id text,
  model_name text,
  organisation_id text,
  organisation_name text,
  total_tokens bigint
) as $$
declare
  v_since timestamptz;
  v_now timestamptz := now();
begin
  case p_time_range
    when 'today' then
      v_since := date_trunc('day', v_now);
    when 'week' then
      v_since := v_now - interval '7 days';
    when 'month' then
      v_since := date_trunc('month', v_now);
    else
      v_since := v_now - interval '7 days';
  end case;

  return query
  with base_requests as (
    select
      gr.provider,
      gr.model_id as raw_model_id,
      public.gateway_usage_total_tokens(gr.usage) as tokens
    from public.gateway_requests gr
    where gr.created_at >= v_since
      and gr.model_id is not null
      and gr.provider is not null
      and gr.provider <> ''
  ),
  resolved as (
    select
      br.raw_model_id,
      br.tokens,
      public.resolve_public_model_id(br.raw_model_id, br.provider) as canonical_model_id
    from base_requests br
  ),
  enriched as (
    select
      coalesce(r.canonical_model_id, r.raw_model_id) as resolved_model_id,
      coalesce(dm.name, r.raw_model_id) as resolved_model_name,
      coalesce(dm.organisation_id, org_guess.organisation_id) as resolved_org_id,
      coalesce(org.name, org_guess.name) as resolved_org_name,
      r.tokens
    from resolved r
    left join public.data_models dm
      on dm.model_id = r.canonical_model_id
    left join public.data_organisations org
      on org.organisation_id = dm.organisation_id
    left join lateral (
      select o.organisation_id, o.name
      from public.data_organisations o
      where lower(o.organisation_id) = lower(split_part(r.raw_model_id, '/', 1))
         or lower(o.name) = lower(split_part(r.raw_model_id, '/', 1))
      order by
        case
          when lower(o.organisation_id) = lower(split_part(r.raw_model_id, '/', 1))
            then 0
          else 1
        end
      limit 1
    ) org_guess on true
  ),
  aggregated as (
    select
      e.resolved_model_id,
      max(e.resolved_model_name) as resolved_model_name,
      max(e.resolved_org_id) as resolved_org_id,
      max(e.resolved_org_name) as resolved_org_name,
      sum(e.tokens)::bigint as summed_tokens
    from enriched e
    where e.tokens >= 0
    group by e.resolved_model_id
  )
  select
    a.resolved_model_id as model_id,
    a.resolved_model_name as model_name,
    a.resolved_org_id as organisation_id,
    a.resolved_org_name as organisation_name,
    a.summed_tokens as total_tokens
  from aggregated a
  order by a.summed_tokens desc
  limit greatest(1, p_limit);
end;
$$ language plpgsql stable;
comment on function public.get_public_top_models_with_metadata(text, integer)
  is 'Public top models by token usage resolved to canonical API model ids with metadata enrichment.';
