-- Optimize model/provider recent runtime queries for model pages.

create index if not exists gateway_requests_model_created_provider_idx
  on public.gateway_requests (model_id, created_at desc, provider)
  where model_id is not null;
create index if not exists gateway_requests_provider_model_created_idx
  on public.gateway_requests (provider, model_id, created_at desc)
  where provider is not null and model_id is not null;
create or replace function public.get_model_provider_runtime_stats(
  p_model_ids text[],
  p_provider_ids text[] default null
)
returns table (
  provider text,
  latency_ms_30m numeric,
  throughput_30m numeric,
  latency_ms_3d numeric,
  throughput_3d numeric,
  requests_30m bigint,
  requests_3d bigint,
  successful_3d bigint,
  day0_requests bigint,
  day0_successful bigint,
  day1_requests bigint,
  day1_successful bigint,
  day2_requests bigint,
  day2_successful bigint
)
language sql
stable
as $$
  with anchors as (
    select
      now() as now_ts,
      now() - interval '30 minutes' as min_30m,
      now() - interval '72 hours' as min_3d,
      (date_trunc('day', now() at time zone 'utc') at time zone 'utc') as day0_start
  ),
  base as (
    select
      gr.provider,
      gr.created_at,
      gr.latency_ms,
      gr.throughput,
      gr.success,
      gr.status_code,
      lower(coalesce(gr.error_code, '')) as error_code
    from public.gateway_requests gr
    join anchors a on true
    where gr.created_at >= a.min_3d
      and gr.model_id = any(p_model_ids)
      and gr.provider is not null
      and gr.provider <> ''
      and (p_provider_ids is null or gr.provider = any(p_provider_ids))
  ),
  classified as (
    select
      b.*,
      case
        when b.success is true then 'count_success'
        when b.status_code is not null and b.status_code > 0 and b.status_code < 400 then 'count_success'
        when split_part(b.error_code, ':', 1) = 'user'
          or b.error_code like '%invalid_json%'
          or b.error_code like '%validation%'
          or b.error_code like '%unsupported_param%'
          or b.error_code like '%unsupported_model_or_endpoint%'
          or b.error_code like '%unsupported_modalities%'
          or b.error_code like '%bad_request%'
          or b.error_code like '%missing_required%'
        then 'exclude'
        when split_part(b.error_code, ':', 1) = 'gateway'
          or (
            split_part(b.error_code, ':', 1) = 'system' and (
              b.error_code like '%gateway%'
              or b.error_code like '%routing%'
              or b.error_code like '%breaker%'
              or b.error_code like '%provider_status_not_ready%'
              or b.error_code like '%no_key%'
              or b.error_code like '%missing_api_key%'
              or b.error_code like '%provider_key%'
              or b.error_code like '%pricing_not_configured%'
              or b.error_code like '%no_provider_pricing%'
              or b.error_code like '%all_candidates_failed%'
              or b.error_code like '%executor%'
              or b.error_code like '%internal%'
            )
          )
          or b.error_code like '%gateway%'
          or b.error_code like '%routing%'
          or b.error_code like '%breaker%'
          or b.error_code like '%provider_status_not_ready%'
          or b.error_code like '%no_key%'
          or b.error_code like '%missing_api_key%'
          or b.error_code like '%provider_key%'
          or b.error_code like '%pricing_not_configured%'
          or b.error_code like '%no_provider_pricing%'
          or b.error_code like '%all_candidates_failed%'
          or b.error_code like '%executor%'
          or b.error_code like '%internal%'
        then 'exclude'
        when b.status_code in (408, 429) or b.status_code >= 500 then 'count_failure'
        when b.status_code between 400 and 499 then 'exclude'
        else 'count_failure'
      end as uptime_outcome
    from base b
  ),
  aggregated as (
    select
      c.provider,
      percentile_cont(0.5) within group (order by c.latency_ms)
        filter (where c.created_at >= a.min_30m and c.latency_ms is not null) as latency_ms_30m,
      percentile_cont(0.5) within group (order by c.throughput)
        filter (where c.created_at >= a.min_30m and c.throughput is not null) as throughput_30m,
      percentile_cont(0.5) within group (order by c.latency_ms)
        filter (where c.latency_ms is not null) as latency_ms_3d,
      percentile_cont(0.5) within group (order by c.throughput)
        filter (where c.throughput is not null) as throughput_3d,
      count(*) filter (where c.created_at >= a.min_30m) as requests_30m,
      count(*) filter (where c.uptime_outcome <> 'exclude') as requests_3d,
      count(*) filter (where c.uptime_outcome = 'count_success') as successful_3d,
      count(*) filter (
        where c.uptime_outcome <> 'exclude'
          and c.created_at >= a.day0_start
          and c.created_at < a.day0_start + interval '1 day'
      ) as day0_requests,
      count(*) filter (
        where c.uptime_outcome = 'count_success'
          and c.created_at >= a.day0_start
          and c.created_at < a.day0_start + interval '1 day'
      ) as day0_successful,
      count(*) filter (
        where c.uptime_outcome <> 'exclude'
          and c.created_at >= a.day0_start - interval '1 day'
          and c.created_at < a.day0_start
      ) as day1_requests,
      count(*) filter (
        where c.uptime_outcome = 'count_success'
          and c.created_at >= a.day0_start - interval '1 day'
          and c.created_at < a.day0_start
      ) as day1_successful,
      count(*) filter (
        where c.uptime_outcome <> 'exclude'
          and c.created_at >= a.day0_start - interval '2 day'
          and c.created_at < a.day0_start - interval '1 day'
      ) as day2_requests,
      count(*) filter (
        where c.uptime_outcome = 'count_success'
          and c.created_at >= a.day0_start - interval '2 day'
          and c.created_at < a.day0_start - interval '1 day'
      ) as day2_successful
    from classified c
    join anchors a on true
    group by c.provider
  ),
  provider_filter as (
    select unnest(p_provider_ids) as provider
    where p_provider_ids is not null
  )
  select
    coalesce(pf.provider, ag.provider) as provider,
    ag.latency_ms_30m,
    ag.throughput_30m,
    ag.latency_ms_3d,
    ag.throughput_3d,
    coalesce(ag.requests_30m, 0)::bigint as requests_30m,
    coalesce(ag.requests_3d, 0)::bigint as requests_3d,
    coalesce(ag.successful_3d, 0)::bigint as successful_3d,
    coalesce(ag.day0_requests, 0)::bigint as day0_requests,
    coalesce(ag.day0_successful, 0)::bigint as day0_successful,
    coalesce(ag.day1_requests, 0)::bigint as day1_requests,
    coalesce(ag.day1_successful, 0)::bigint as day1_successful,
    coalesce(ag.day2_requests, 0)::bigint as day2_requests,
    coalesce(ag.day2_successful, 0)::bigint as day2_successful
  from aggregated ag
  full join provider_filter pf on pf.provider = ag.provider
  where p_provider_ids is null or pf.provider is not null
  order by coalesce(pf.provider, ag.provider);
$$;
grant execute on function public.get_model_provider_runtime_stats(text[], text[])
  to authenticated, service_role;
comment on function public.get_model_provider_runtime_stats(text[], text[])
  is 'Aggregated provider runtime stats for model pages (30m latency/throughput + 3d uptime windows) without returning raw gateway_requests rows.';
