-- Restore the public percentile series privacy threshold after the end-to-end
-- latency migration accidentally lowered it from 20 requests to 1.
begin;

create or replace function public.get_v2_model_provider_percentile_series_v2(
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
  and series.requests >= 20;
$$;

comment on function public.get_v2_model_provider_percentile_series_v2(text, text, text, text) is
  'Returns daily single-provider performance percentiles, including end-to-end latency and cached-input share, for cohorts with at least 20 requests.';

revoke execute on function public.get_v2_model_provider_percentile_series_v2(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_percentile_series_v2(text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
