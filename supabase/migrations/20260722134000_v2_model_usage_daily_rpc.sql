create or replace function public.get_v2_model_usage_daily(
  p_model_slug text,
  p_provider_ids text[] default null,
  p_since date default null,
  p_until date default null
)
returns table (
  day_bucket date,
  model_id text,
  provider_id text,
  endpoint text,
  requests bigint,
  success_requests bigint,
  failed_requests bigint,
  neutral_requests bigint,
  rate_limited_requests bigint,
  total_tokens numeric,
  input_tokens numeric,
  output_tokens numeric,
  reasoning_tokens numeric,
  cached_read_tokens numeric,
  input_characters numeric,
  output_characters numeric,
  total_characters numeric,
  image_inputs numeric,
  image_outputs numeric,
  audio_inputs numeric,
  audio_outputs numeric,
  video_inputs numeric,
  video_outputs numeric,
  total_cost_nanos numeric,
  avg_latency_ms numeric,
  avg_generation_ms numeric,
  avg_throughput numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      usage.usage_date as day_bucket,
      usage.model_slug as model_id,
      coalesce(route.provider_slug, usage.provider_model_id, '') as provider_id,
      usage.requests,
      usage.successful_requests as success_requests,
      usage.failed_requests,
      greatest(usage.requests - usage.successful_requests - usage.failed_requests, 0) as neutral_requests,
      usage.rate_limited_requests,
      0::numeric as total_cost_nanos,
      case when usage.latency_count > 0 then usage.latency_sum_ms::numeric / usage.latency_count else null end as avg_latency_ms,
      case when usage.generation_count > 0 then usage.generation_sum_ms::numeric / usage.generation_count else null end as avg_generation_ms,
      case when usage.throughput_count > 0 then usage.throughput_sum::numeric / usage.throughput_count else null end as avg_throughput,
      usage.rollup_id
    from public.v2_public_usage_daily usage
    left join public.v2_model_provider_routes route on route.provider_model_id = usage.provider_model_id
    where usage.model_slug = lower(trim(p_model_slug))
      and (p_since is null or usage.usage_date >= p_since)
      and (p_until is null or usage.usage_date <= p_until)
      and (p_provider_ids is null or coalesce(route.provider_slug, usage.provider_model_id, '') = any(p_provider_ids))
  ),
  meters as (
    select rollup_id,
      sum(quantity) filter (where meter_key = 'input_tokens') as input_tokens,
      sum(quantity) filter (where meter_key = 'output_tokens') as output_tokens,
      sum(quantity) filter (where meter_key = 'reasoning_tokens') as reasoning_tokens,
      sum(quantity) filter (where meter_key = 'cached_input_tokens') as cached_read_tokens,
      sum(quantity) filter (where meter_key = 'input_characters') as input_characters,
      sum(quantity) filter (where meter_key = 'output_characters') as output_characters,
      sum(quantity) filter (where meter_key = 'image_inputs') as image_inputs,
      sum(quantity) filter (where meter_key = 'image_outputs') as image_outputs,
      sum(quantity) filter (where meter_key = 'audio_inputs') as audio_inputs,
      sum(quantity) filter (where meter_key = 'audio_outputs') as audio_outputs,
      sum(quantity) filter (where meter_key = 'video_inputs') as video_inputs,
      sum(quantity) filter (where meter_key = 'video_outputs') as video_outputs
    from public.v2_public_usage_daily_meters group by rollup_id
  )
  select b.day_bucket, b.model_id, b.provider_id, ''::text as endpoint,
    sum(b.requests)::bigint, sum(b.success_requests)::bigint, sum(b.failed_requests)::bigint,
    sum(b.neutral_requests)::bigint, sum(b.rate_limited_requests)::bigint,
    sum(coalesce(m.input_tokens, 0) + coalesce(m.output_tokens, 0) + coalesce(m.reasoning_tokens, 0)) as total_tokens,
    sum(coalesce(m.input_tokens, 0)), sum(coalesce(m.output_tokens, 0)), sum(coalesce(m.reasoning_tokens, 0)),
    sum(coalesce(m.cached_read_tokens, 0)), sum(coalesce(m.input_characters, 0)), sum(coalesce(m.output_characters, 0)),
    sum(coalesce(m.input_characters, 0) + coalesce(m.output_characters, 0)),
    sum(coalesce(m.image_inputs, 0)), sum(coalesce(m.image_outputs, 0)), sum(coalesce(m.audio_inputs, 0)), sum(coalesce(m.audio_outputs, 0)),
    sum(coalesce(m.video_inputs, 0)), sum(coalesce(m.video_outputs, 0)), sum(b.total_cost_nanos),
    case when sum(b.requests) > 0 then sum(b.avg_latency_ms * b.requests) / sum(b.requests) else null end,
    case when sum(b.requests) > 0 then sum(b.avg_generation_ms * b.requests) / sum(b.requests) else null end,
    case when sum(b.requests) > 0 then sum(b.avg_throughput * b.requests) / sum(b.requests) else null end
  from base b left join meters m on m.rollup_id = b.rollup_id
  group by b.day_bucket, b.model_id, b.provider_id
  order by b.day_bucket, b.provider_id;
$$;

grant execute on function public.get_v2_model_usage_daily(text, text[], date, date) to anon, authenticated, service_role;
