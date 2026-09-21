-- Include end-to-end latency in the existing single-provider percentile series.
-- PostgreSQL cannot change a table-returning function's result type in place.
begin;

drop function if exists public.get_v2_model_provider_percentile_series_v2(text, text, text, text);
drop function if exists public.get_v2_model_provider_percentile_series_v2_unsuppressed(text, text, text, text);

create function public.get_v2_model_provider_percentile_series_v2_unsuppressed(
  p_model_slug text,
  p_cloudflare_colo text default null,
  p_stream_mode text default 'all',
  p_context_bucket text default 'all'
)
returns table (
  usage_day date,
  provider_id text,
  provider_name text,
  requests bigint,
  percentile integer,
  gateway_ttft_ms numeric,
  gateway_e2e_ms numeric,
  provider_duration_ms numeric,
  effective_throughput_tps numeric,
  output_speed_tps numeric,
  phaseo_overhead_ms numeric,
  tpot_ms numeric,
  itl_ms numeric,
  cached_input_pct numeric
)
language sql
stable
security invoker
set search_path = public
as $$
with percentile_values(percentile) as (
  values (1), (5), (10), (25), (50), (75), (90), (95), (99)
),
scoped_facts as (
  select fact.request_event_id
  from public.v2_request_facts fact
  where coalesce(fact.routed_model_slug, fact.requested_model_slug) = lower(trim(p_model_slug))
    and fact.occurred_at >= now() - interval '7 days'
),
usage_tokens as (
  select
    usage.request_event_id,
    sum(usage.quantity) filter (
      where usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
    )::numeric input_tokens,
    sum(usage.quantity) filter (
      where usage.meter_key = 'cached_input_tokens'
    )::numeric cached_input_tokens,
    bool_or(usage.meter_key = 'cached_input_tokens') cache_telemetry_observed
  from public.v2_request_usage usage
  join scoped_facts on scoped_facts.request_event_id = usage.request_event_id
  where usage.meter_key in (
    'input_tokens',
    'input_text_tokens',
    'prompt_tokens',
    'cached_input_tokens'
  )
  group by usage.request_event_id
),
base as (
  select
    fact.occurred_at::date usage_day,
    provider.provider_slug provider_id,
    provider.name provider_name,
    fact.success,
    fact.stream,
    tokens.input_tokens,
    fact.gateway_ttft_ms,
    fact.gateway_total_ms gateway_e2e_ms,
    fact.generation_ms provider_duration_ms,
    fact.throughput effective_throughput_tps,
    fact.output_speed_tps,
    fact.phaseo_overhead_ms,
    fact.tpot_ms,
    fact.itl_ms,
    case
      when not coalesce(tokens.cache_telemetry_observed, false)
        or tokens.input_tokens is null
        or tokens.input_tokens <= 0
        then null
      else least(
        100,
        coalesce(tokens.cached_input_tokens, 0) * 100.0 /
          case
            when coalesce(
              (fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean,
              true
            ) then tokens.input_tokens
            else tokens.input_tokens + coalesce(tokens.cached_input_tokens, 0)
          end
      )
    end cached_input_pct
  from public.v2_request_facts fact
  join public.v2_model_provider_routes route
    on route.provider_model_id = fact.provider_model_id
  join public.v2_providers provider
    on provider.provider_slug = route.provider_slug
  left join usage_tokens tokens
    on tokens.request_event_id = fact.request_event_id
  where coalesce(fact.routed_model_slug, fact.requested_model_slug) = lower(trim(p_model_slug))
    and fact.occurred_at >= now() - interval '7 days'
    and (
      nullif(upper(trim(p_cloudflare_colo)), '') is null
      or upper(trim(fact.cloudflare_colo)) = upper(trim(p_cloudflare_colo))
    )
    and (
      lower(p_stream_mode) not in ('stream', 'non_stream')
      or fact.stream = (lower(p_stream_mode) = 'stream')
    )
    and (
      lower(p_context_bucket) not in ('lte_4k', '4k_16k', '16k_64k', 'gt_64k')
      or (lower(p_context_bucket) = 'lte_4k' and tokens.input_tokens <= 4096)
      or (lower(p_context_bucket) = '4k_16k' and tokens.input_tokens > 4096 and tokens.input_tokens <= 16384)
      or (lower(p_context_bucket) = '16k_64k' and tokens.input_tokens > 16384 and tokens.input_tokens <= 65536)
      or (lower(p_context_bucket) = 'gt_64k' and tokens.input_tokens > 65536)
    )
)
select
  base.usage_day,
  base.provider_id,
  base.provider_name,
  count(*)::bigint requests,
  p.percentile,
  percentile_cont(p.percentile / 100.0) within group (order by base.gateway_ttft_ms)
    filter (where base.success and base.gateway_ttft_ms is not null)::numeric,
  percentile_cont(p.percentile / 100.0) within group (order by base.gateway_e2e_ms)
    filter (where base.success and base.gateway_e2e_ms is not null)::numeric,
  percentile_cont(p.percentile / 100.0) within group (order by base.provider_duration_ms)
    filter (where base.success and base.provider_duration_ms is not null)::numeric,
  percentile_cont(p.percentile / 100.0) within group (order by base.effective_throughput_tps)
    filter (where base.success and base.effective_throughput_tps is not null)::numeric,
  percentile_cont(p.percentile / 100.0) within group (order by base.output_speed_tps)
    filter (where base.success and base.output_speed_tps is not null)::numeric,
  percentile_cont(p.percentile / 100.0) within group (order by base.phaseo_overhead_ms)
    filter (where base.success and base.phaseo_overhead_ms is not null)::numeric,
  percentile_cont(p.percentile / 100.0) within group (order by base.tpot_ms)
    filter (where base.success and base.tpot_ms is not null)::numeric,
  percentile_cont(p.percentile / 100.0) within group (order by base.itl_ms)
    filter (where base.success and base.itl_ms is not null)::numeric,
  case
    when count(base.cached_input_pct) >= 20 then
      percentile_cont(p.percentile / 100.0) within group (order by base.cached_input_pct)
        filter (where base.cached_input_pct is not null)::numeric
    else null
  end
from base
cross join percentile_values p
group by base.usage_day, base.provider_id, base.provider_name, p.percentile
order by base.usage_day, base.provider_id, p.percentile;
$$;

create function public.get_v2_model_provider_percentile_series_v2(
  p_model_slug text,
  p_cloudflare_colo text default null,
  p_stream_mode text default 'all',
  p_context_bucket text default 'all'
)
returns table (
  usage_day date,
  provider_id text,
  provider_name text,
  requests bigint,
  percentile integer,
  gateway_ttft_ms numeric,
  gateway_e2e_ms numeric,
  provider_duration_ms numeric,
  effective_throughput_tps numeric,
  output_speed_tps numeric,
  phaseo_overhead_ms numeric,
  tpot_ms numeric,
  itl_ms numeric,
  cached_input_pct numeric
)
language sql
stable
security definer
set search_path = ''
as $$
select series.*
from public.v2_models model
cross join lateral public.get_v2_model_provider_percentile_series_v2_unsuppressed(
  model.model_slug,
  p_cloudflare_colo,
  p_stream_mode,
  p_context_bucket
) series
where model.model_slug = lower(trim(p_model_slug))
  and model.hidden = false
  and model.status <> 'disabled'
  and series.requests >= 1;
$$;

comment on function public.get_v2_model_provider_percentile_series_v2(text, text, text, text) is
  'Returns daily single-provider performance percentiles, including end-to-end latency and cached-input share.';

revoke execute on function public.get_v2_model_provider_percentile_series_v2_unsuppressed(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_percentile_series_v2_unsuppressed(text, text, text, text)
  to service_role;

revoke execute on function public.get_v2_model_provider_percentile_series_v2(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_percentile_series_v2(text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
