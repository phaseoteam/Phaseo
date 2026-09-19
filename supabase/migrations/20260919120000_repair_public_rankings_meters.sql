-- Match public ranking projections to canonical gateway meters.
-- Meter aliases are alternatives, never additive.

create or replace view public.v2_rpc_gateway_model_usage_daily
with (security_invoker = true) as
select
  usage.usage_date as day_bucket,
  usage.model_slug as model_id,
  route.provider_slug as provider_id,
  'unknown'::text as endpoint,
  usage.requests,
  usage.successful_requests as success_requests,
  usage.failed_requests,
  0::bigint as neutral_requests,
  usage.rate_limited_requests,
  coalesce(
    (meters.values->>'total_tokens')::numeric,
    (meters.values->>'input_tokens')::numeric + (meters.values->>'output_tokens')::numeric,
    (meters.values->>'input_text_tokens')::numeric + (meters.values->>'output_text_tokens')::numeric,
    0
  )::bigint as total_tokens,
  coalesce((meters.values->>'input_tokens')::numeric, (meters.values->>'input_text_tokens')::numeric, 0)::bigint as input_tokens,
  coalesce((meters.values->>'output_tokens')::numeric, (meters.values->>'output_text_tokens')::numeric, 0)::bigint as output_tokens,
  coalesce((meters.values->>'reasoning_tokens')::numeric, 0)::bigint as reasoning_tokens,
  coalesce((meters.values->>'input_text_tokens')::numeric, 0)::bigint as input_text_tokens,
  coalesce((meters.values->>'output_text_tokens')::numeric, 0)::bigint as output_text_tokens,
  coalesce((meters.values->>'input_image_tokens')::numeric, 0)::bigint as input_image_tokens,
  coalesce((meters.values->>'output_image_tokens')::numeric, 0)::bigint as output_image_tokens,
  coalesce((meters.values->>'input_audio_tokens')::numeric, 0)::bigint as input_audio_tokens,
  coalesce((meters.values->>'output_audio_tokens')::numeric, 0)::bigint as output_audio_tokens,
  coalesce((meters.values->>'input_video_tokens')::numeric, 0)::bigint as input_video_tokens,
  coalesce((meters.values->>'output_video_tokens')::numeric, 0)::bigint as output_video_tokens,
  coalesce((meters.values->>'image_inputs')::numeric, (meters.values->>'input_images')::numeric, 0)::bigint as image_inputs,
  coalesce((meters.values->>'image_outputs')::numeric, (meters.values->>'output_images')::numeric, 0)::bigint as image_outputs,
  coalesce((meters.values->>'audio_inputs')::numeric, (meters.values->>'input_audio')::numeric, 0)::bigint as audio_inputs,
  coalesce((meters.values->>'audio_outputs')::numeric, (meters.values->>'output_audio')::numeric, 0)::bigint as audio_outputs,
  coalesce((meters.values->>'video_inputs')::numeric, (meters.values->>'input_video')::numeric, 0)::bigint as video_inputs,
  coalesce((meters.values->>'video_outputs')::numeric, (meters.values->>'output_video')::numeric, 0)::bigint as video_outputs,
  coalesce((meters.values->>'cached_read_tokens')::numeric, (meters.values->>'cached_input_tokens')::numeric, 0)::bigint as cached_read_tokens,
  coalesce((meters.values->>'cached_write_tokens')::numeric, (meters.values->>'cache_write_tokens')::numeric, 0)::bigint as cached_write_tokens,
  coalesce((meters.values->>'cached_read_text_tokens')::numeric, 0)::bigint as cached_read_text_tokens,
  coalesce((meters.values->>'cached_write_text_tokens')::numeric, 0)::bigint as cached_write_text_tokens,
  coalesce((meters.values->>'cached_read_image_tokens')::numeric, 0)::bigint as cached_read_image_tokens,
  coalesce((meters.values->>'cached_write_image_tokens')::numeric, 0)::bigint as cached_write_image_tokens,
  coalesce((meters.values->>'cached_read_audio_tokens')::numeric, 0)::bigint as cached_read_audio_tokens,
  coalesce((meters.values->>'cached_write_audio_tokens')::numeric, 0)::bigint as cached_write_audio_tokens,
  coalesce((meters.values->>'cached_read_video_tokens')::numeric, 0)::bigint as cached_read_video_tokens,
  coalesce((meters.values->>'cached_write_video_tokens')::numeric, 0)::bigint as cached_write_video_tokens,
  0::bigint as total_cost_nanos,
  usage.latency_sum_ms,
  usage.latency_count as latency_samples,
  usage.generation_sum_ms,
  usage.generation_count as generation_samples,
  usage.throughput_sum,
  usage.throughput_count as throughput_samples,
  usage.updated_at as last_request_at,
  usage.updated_at as refreshed_at,
  coalesce((meters.values->>'input_quad_tokens')::numeric, 0)::bigint as input_quad_tokens,
  coalesce((meters.values->>'output_quad_tokens')::numeric, 0)::bigint as output_quad_tokens,
  coalesce((meters.values->>'total_quad_tokens')::numeric, 0)::bigint as total_quad_tokens,
  coalesce((meters.values->>'cached_write_text_tokens_5m')::numeric, 0)::bigint as cached_write_text_tokens_5m,
  coalesce((meters.values->>'cached_write_text_tokens_1h')::numeric, 0)::bigint as cached_write_text_tokens_1h,
  coalesce((meters.values->>'text_quad_tokens')::numeric, 0)::bigint as text_quad_tokens,
  coalesce((meters.values->>'rerank_quad_tokens')::numeric, 0)::bigint as rerank_quad_tokens,
  coalesce((meters.values->>'embedding_quad_tokens')::numeric, 0)::bigint as embedding_quad_tokens,
  coalesce((meters.values->>'moderation_quad_tokens')::numeric, 0)::bigint as moderation_quad_tokens,
  coalesce((meters.values->>'ocr_quad_tokens')::numeric, 0)::bigint as ocr_quad_tokens,
  coalesce((meters.values->>'image_megapixels')::numeric, 0) as image_megapixels,
  coalesce((meters.values->>'audio_seconds')::numeric, 0) as audio_seconds,
  coalesce((meters.values->>'video_pixel_seconds')::numeric, 0) as video_pixel_seconds,
  coalesce((meters.values->>'input_characters')::numeric, 0)::bigint as input_characters,
  coalesce((meters.values->>'output_characters')::numeric, 0)::bigint as output_characters,
  coalesce((meters.values->>'total_characters')::numeric, 0)::bigint as total_characters,
  coalesce((meters.values->>'embedding_tokens')::numeric, 0)::bigint as embedding_tokens,
  coalesce((meters.values->>'video_seconds')::numeric, (meters.values->>'output_video_seconds')::numeric, 0) as video_seconds,
  coalesce((meters.values->>'speech_seconds')::numeric, 0) as speech_seconds,
  coalesce((meters.values->>'transcription_seconds')::numeric, 0) as transcription_seconds
from public.v2_public_usage_daily usage
join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
  and coalesce(route.is_stealth, false) = false
  and route.routing_enabled = true
  and route.status in ('active', 'degraded')
  and (route.effective_from is null or route.effective_from <= now())
  and (route.effective_to is null or route.effective_to > now())
join public.v2_models model
  on model.model_slug = usage.model_slug
  and model.hidden = false
  and model.status <> 'disabled'
left join lateral (
  select jsonb_object_agg(meter.meter_key, meter.quantity) as values
  from (
    select meter_key, sum(quantity) as quantity
    from public.v2_public_usage_daily_meters
    where rollup_id = usage.rollup_id
    group by meter_key
  ) meter
) meters on true;

create or replace function public.get_public_modality_usage_timeseries(
  p_metric text,
  p_time_range text default 'year',
  p_top_n integer default 20
)
returns table (
  bucket timestamp with time zone,
  model_id text,
  requests bigint,
  tokens numeric,
  colour text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_since date;
begin
  case p_time_range
    when '24h' then v_since := (now() at time zone 'utc')::date - 1;
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    when 'year' then v_since := (now() at time zone 'utc')::date - 365;
    else v_since := (now() at time zone 'utc')::date - 365;
  end case;

  return query
  with daily as (
    select
      (date_trunc('week', d.day_bucket::timestamp) at time zone 'UTC') as time_bucket,
      d.model_id,
      sum(d.requests)::bigint as req_count,
      sum(
        case p_metric
          when 'text_tokens' then d.input_text_tokens + d.output_text_tokens
          when 'image_inputs' then d.image_inputs
          when 'image_outputs' then d.image_outputs
          when 'audio_tokens' then d.input_audio_tokens + d.output_audio_tokens
          when 'audio_seconds' then d.audio_seconds
          when 'speech_seconds' then d.speech_seconds
          when 'transcription_seconds' then d.transcription_seconds
          when 'video_tokens' then d.input_video_tokens + d.output_video_tokens
          when 'video_seconds' then d.video_seconds
          when 'cached_tokens' then d.cached_read_tokens + d.cached_write_tokens
          when 'embedding_tokens' then d.embedding_tokens
          when 'rerank_quad_tokens' then d.rerank_quad_tokens
          else 0
        end
      )::numeric as metric_value
    from public.v2_rpc_gateway_model_usage_daily d
    where d.day_bucket >= v_since
    group by 1, 2
  ),
  ranked_daily as (
    select
      d.*,
      row_number() over (
        partition by d.time_bucket
        order by d.metric_value desc, d.req_count desc, d.model_id
      ) as bucket_rank
    from daily d
    where lower(d.model_id) not in ('unknown', 'other')
      and d.metric_value > 0
  ),
  bucketed as (
    select
      d.time_bucket,
      case
        when rd.bucket_rank <= greatest(1, least(coalesce(p_top_n, 20), 100)) then d.model_id
        else 'Other'
      end as model_group,
      sum(d.req_count)::bigint as req_count,
      sum(d.metric_value)::numeric as metric_value
    from daily d
    left join ranked_daily rd
      on rd.time_bucket = d.time_bucket
      and rd.model_id = d.model_id
    where d.metric_value > 0
      and lower(d.model_id) <> 'unknown'
    group by d.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.metric_value as tokens,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join public.v2_models dm on dm.model_slug = b.model_group
  left join public.v2_labs org on dm.lab_slug = org.lab_slug
  order by b.time_bucket, b.metric_value desc;
end;
$$;

grant execute on function public.get_public_modality_usage_timeseries(text, text, integer)
  to anon, authenticated, service_role;


-- Retention is SECURITY INVOKER; only the trusted backend may read cohorts.
-- Keep RLS enabled and direct client access revoked.
grant select on public.public_model_workspace_usage_weekly to service_role;
notify pgrst, 'reload schema';
