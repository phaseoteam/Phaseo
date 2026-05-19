-- Align "month" range semantics with a rolling 30-day window.
-- This updates public ranking functions so month-based views no longer use
-- calendar month boundaries.

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
      v_since := v_now - interval '30 days';
      v_prev_since := v_now - interval '60 days';
      v_prev_until := v_now - interval '30 days';
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
    when 'month' then v_since := v_now - interval '30 days';
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
    when 'month' then v_since := v_now - interval '30 days';
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
