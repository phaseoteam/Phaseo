-- Restore the seven-day usage and performance fields consumed by /models.
-- The optimized catalogue RPC intentionally stopped scanning raw requests, but
-- left these fields null. Read the compact v2 daily rollups instead.

create or replace function public.get_v2_public_model_weekly_metrics()
returns table (
  model_slug text,
  popularity_tokens_week numeric,
  weekly_usage_metric text,
  weekly_usage_quantity numeric,
  weekly_usage_unit text,
  throughput_week numeric,
  latency_week numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with recent_rollups as materialized (
    select
      rollup.rollup_id,
      rollup.model_slug,
      rollup.requests,
      rollup.latency_sum_ms,
      rollup.latency_count,
      rollup.throughput_sum,
      rollup.throughput_count
    from public.v2_public_usage_daily rollup
    where rollup.usage_date >= current_date - 6
      and rollup.usage_date <= current_date
  ),
  meter_totals as (
    select
      rollup.model_slug,
      sum(meter.quantity) filter (
        where meter.meter_key in ('input_tokens', 'output_tokens')
          and meter.unit in ('token', 'tokens')
      ) as total_tokens,
      sum(meter.quantity) filter (
        where meter.meter_key in ('output_images', 'output_image')
          and meter.unit in ('image', 'images')
      ) as output_images,
      sum(meter.quantity) filter (
        where meter.meter_key in ('output_video_seconds', 'video_seconds')
          and meter.unit in ('second', 'seconds')
      ) as video_seconds,
      sum(meter.quantity) filter (
        where meter.meter_key in ('audio_seconds', 'input_audio_seconds', 'output_audio_seconds')
          and meter.unit in ('second', 'seconds')
      ) as audio_seconds,
      sum(meter.quantity) filter (
        where meter.meter_key in ('input_characters', 'output_characters', 'total_characters')
          and meter.unit in ('character', 'characters')
      ) as characters
    from public.v2_public_usage_daily_meters meter
    join recent_rollups rollup on rollup.rollup_id = meter.rollup_id
    group by rollup.model_slug
  ),
  model_totals as (
    select
      rollup.model_slug,
      sum(rollup.requests)::numeric as requests,
      sum(rollup.latency_sum_ms)::numeric as latency_sum_ms,
      sum(rollup.latency_count)::numeric as latency_count,
      sum(rollup.throughput_sum)::numeric as throughput_sum,
      sum(rollup.throughput_count)::numeric as throughput_count,
      coalesce(meter.total_tokens, 0)::numeric as total_tokens,
      coalesce(meter.output_images, 0)::numeric as output_images,
      coalesce(meter.video_seconds, 0)::numeric as video_seconds,
      coalesce(meter.audio_seconds, 0)::numeric as audio_seconds,
      coalesce(meter.characters, 0)::numeric as characters
    from recent_rollups rollup
    left join meter_totals meter on meter.model_slug = rollup.model_slug
    group by
      rollup.model_slug,
      meter.total_tokens,
      meter.output_images,
      meter.video_seconds,
      meter.audio_seconds,
      meter.characters
  ),
  classified as (
    select
      totals.*,
      lower(coalesce(model.metadata->>'model_type', '')) as model_type,
      array_to_string(model.input_modalities, ',') as input_modalities,
      array_to_string(model.output_modalities, ',') as output_modalities
    from model_totals totals
    join public.v2_models model on model.model_slug = totals.model_slug
  )
  select
    totals.model_slug,
    totals.total_tokens as popularity_tokens_week,
    case
      when (totals.model_type = 'video' or totals.output_modalities ~ 'video') and totals.video_seconds > 0 then 'video_seconds'
      when (totals.model_type = 'image' or totals.output_modalities ~ 'image') and totals.output_images > 0 then 'images'
      when (totals.input_modalities ~ 'audio' or totals.output_modalities ~ 'audio') and totals.audio_seconds > 0 then 'audio_seconds'
      when totals.model_type in ('embedding', 'rerank', 'moderation') then 'requests'
      when totals.total_tokens > 0 then 'tokens'
      when totals.characters > 0 then 'characters'
      else 'requests'
    end as weekly_usage_metric,
    case
      when (totals.model_type = 'video' or totals.output_modalities ~ 'video') and totals.video_seconds > 0 then totals.video_seconds
      when (totals.model_type = 'image' or totals.output_modalities ~ 'image') and totals.output_images > 0 then totals.output_images
      when (totals.input_modalities ~ 'audio' or totals.output_modalities ~ 'audio') and totals.audio_seconds > 0 then totals.audio_seconds
      when totals.model_type in ('embedding', 'rerank', 'moderation') then totals.requests
      when totals.total_tokens > 0 then totals.total_tokens
      when totals.characters > 0 then totals.characters
      else totals.requests
    end as weekly_usage_quantity,
    case
      when (totals.model_type = 'video' or totals.output_modalities ~ 'video') and totals.video_seconds > 0 then 'seconds'
      when (totals.model_type = 'image' or totals.output_modalities ~ 'image') and totals.output_images > 0 then 'images'
      when (totals.input_modalities ~ 'audio' or totals.output_modalities ~ 'audio') and totals.audio_seconds > 0 then 'seconds'
      when totals.model_type in ('embedding', 'rerank', 'moderation') then 'requests'
      when totals.total_tokens > 0 then 'tokens'
      when totals.characters > 0 then 'characters'
      else 'requests'
    end as weekly_usage_unit,
    round(
      totals.throughput_sum / nullif(totals.throughput_count, 0),
      2
    ) as throughput_week,
    round(
      totals.latency_sum_ms / nullif(totals.latency_count, 0),
      2
    ) as latency_week
  from classified totals
  order by weekly_usage_quantity desc, totals.model_slug;
$$;

grant execute on function public.get_v2_public_model_weekly_metrics()
  to anon, authenticated, service_role;

comment on function public.get_v2_public_model_weekly_metrics() is
  'Returns seven-day primary usage, token totals, and sample-weighted performance from v2 public daily rollups.';
