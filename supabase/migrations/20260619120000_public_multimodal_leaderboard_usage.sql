-- Broaden the public multimodal rankings contract to match gateway usage logging.
--
-- The rankings page needs modality-specific counters rather than the legacy
-- JSON-key scan that only exposed text/audio/video/cache/image totals.

alter table public.gateway_requests
  add column if not exists usage_video_seconds numeric not null default 0;

comment on column public.gateway_requests.usage_video_seconds is
  'Normalized generated/processed video seconds derived from gateway usage metadata or request duration.';

create or replace function public.normalize_gateway_request_video_seconds()
returns trigger
language plpgsql
as $$
begin
  new.usage_video_seconds := greatest(
    coalesce(
      public.gateway_usage_numeric_field(
        new.usage,
        'video_seconds',
        'input_video_seconds',
        'output_video_seconds'
      ),
      new.usage_video_seconds,
      0
    ),
    0
  );
  return new;
end;
$$;

drop trigger if exists normalize_gateway_request_video_seconds_trigger
  on public.gateway_requests;

create trigger normalize_gateway_request_video_seconds_trigger
  before insert or update of usage on public.gateway_requests
  for each row
  execute function public.normalize_gateway_request_video_seconds();

update public.gateway_requests
set usage_video_seconds = greatest(
  coalesce(
    public.gateway_usage_numeric_field(
      usage,
      'video_seconds',
      'input_video_seconds',
      'output_video_seconds'
    ),
    usage_video_seconds,
    0
  ),
  0
)
where usage_video_seconds = 0
  and usage is not null;

drop function if exists public.get_public_multimodal_breakdown(text);

create or replace function public.get_public_multimodal_breakdown(
  p_time_range text default 'week'
)
returns table (
  model_id text,
  text_tokens bigint,
  audio_tokens bigint,
  video_tokens bigint,
  cached_tokens bigint,
  image_count bigint,
  input_text_tokens bigint,
  output_text_tokens bigint,
  input_image_tokens bigint,
  output_image_tokens bigint,
  image_inputs bigint,
  image_outputs bigint,
  image_megapixels numeric,
  input_audio_tokens bigint,
  output_audio_tokens bigint,
  audio_inputs bigint,
  audio_outputs bigint,
  audio_seconds numeric,
  input_video_tokens bigint,
  output_video_tokens bigint,
  video_inputs bigint,
  video_outputs bigint,
  video_seconds numeric,
  video_pixel_seconds numeric,
  cached_read_tokens bigint,
  cached_write_tokens bigint,
  cached_read_text_tokens bigint,
  cached_write_text_tokens bigint,
  cached_read_image_tokens bigint,
  cached_write_image_tokens bigint,
  cached_read_audio_tokens bigint,
  cached_write_audio_tokens bigint,
  cached_read_video_tokens bigint,
  cached_write_video_tokens bigint,
  input_quad_tokens bigint,
  output_quad_tokens bigint,
  total_quad_tokens bigint,
  text_quad_tokens bigint,
  rerank_quad_tokens bigint,
  embedding_quad_tokens bigint,
  total_requests bigint,
  total_cost_nanos bigint,
  avg_latency_ms numeric,
  avg_generation_ms numeric,
  avg_throughput numeric
)
language plpgsql
stable
as $$
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
  with base as (
    select
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.routed_model_id, ''),
        nullif(gr.requested_model_id, ''),
        nullif(gr.model_id, '')
      ) as public_model_id,
      gr.*
    from public.gateway_requests gr
    where gr.created_at >= v_since
      and coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.routed_model_id, ''),
        nullif(gr.requested_model_id, ''),
        nullif(gr.model_id, '')
      ) is not null
  )
  select
    b.public_model_id as model_id,
    sum(b.usage_input_text_tokens + b.usage_output_text_tokens)::bigint as text_tokens,
    sum(b.usage_input_audio_tokens + b.usage_output_audio_tokens)::bigint as audio_tokens,
    sum(b.usage_input_video_tokens + b.usage_output_video_tokens)::bigint as video_tokens,
    sum(b.usage_cached_read_tokens + b.usage_cached_write_tokens)::bigint as cached_tokens,
    sum(b.usage_image_inputs + b.usage_image_outputs)::bigint as image_count,
    sum(b.usage_input_text_tokens)::bigint as input_text_tokens,
    sum(b.usage_output_text_tokens)::bigint as output_text_tokens,
    sum(b.usage_input_image_tokens)::bigint as input_image_tokens,
    sum(b.usage_output_image_tokens)::bigint as output_image_tokens,
    sum(b.usage_image_inputs)::bigint as image_inputs,
    sum(b.usage_image_outputs)::bigint as image_outputs,
    sum(b.usage_image_megapixels)::numeric as image_megapixels,
    sum(b.usage_input_audio_tokens)::bigint as input_audio_tokens,
    sum(b.usage_output_audio_tokens)::bigint as output_audio_tokens,
    sum(b.usage_audio_inputs)::bigint as audio_inputs,
    sum(b.usage_audio_outputs)::bigint as audio_outputs,
    sum(b.usage_audio_seconds)::numeric as audio_seconds,
    sum(b.usage_input_video_tokens)::bigint as input_video_tokens,
    sum(b.usage_output_video_tokens)::bigint as output_video_tokens,
    sum(b.usage_video_inputs)::bigint as video_inputs,
    sum(b.usage_video_outputs)::bigint as video_outputs,
    sum(b.usage_video_seconds)::numeric as video_seconds,
    sum(b.usage_video_pixel_seconds)::numeric as video_pixel_seconds,
    sum(b.usage_cached_read_tokens)::bigint as cached_read_tokens,
    sum(b.usage_cached_write_tokens)::bigint as cached_write_tokens,
    sum(b.usage_cached_read_text_tokens)::bigint as cached_read_text_tokens,
    sum(b.usage_cached_write_text_tokens)::bigint as cached_write_text_tokens,
    sum(b.usage_cached_read_image_tokens)::bigint as cached_read_image_tokens,
    sum(b.usage_cached_write_image_tokens)::bigint as cached_write_image_tokens,
    sum(b.usage_cached_read_audio_tokens)::bigint as cached_read_audio_tokens,
    sum(b.usage_cached_write_audio_tokens)::bigint as cached_write_audio_tokens,
    sum(b.usage_cached_read_video_tokens)::bigint as cached_read_video_tokens,
    sum(b.usage_cached_write_video_tokens)::bigint as cached_write_video_tokens,
    sum(b.usage_input_quad_tokens)::bigint as input_quad_tokens,
    sum(b.usage_output_quad_tokens)::bigint as output_quad_tokens,
    sum(b.usage_total_quad_tokens)::bigint as total_quad_tokens,
    sum(b.usage_text_quad_tokens)::bigint as text_quad_tokens,
    sum(b.usage_rerank_quad_tokens)::bigint as rerank_quad_tokens,
    sum(b.usage_embedding_quad_tokens)::bigint as embedding_quad_tokens,
    count(*)::bigint as total_requests,
    sum(coalesce(b.cost_nanos, 0))::bigint as total_cost_nanos,
    case
      when count(b.latency_ms) > 0
      then round(avg(b.latency_ms)::numeric, 2)
      else null
    end as avg_latency_ms,
    case
      when count(b.generation_ms) > 0
      then round(avg(b.generation_ms)::numeric, 2)
      else null
    end as avg_generation_ms,
    case
      when count(b.throughput) > 0
      then round(avg(b.throughput)::numeric, 2)
      else null
    end as avg_throughput
  from base b
  group by b.public_model_id
  having count(*) >= 5
    and (
      sum(b.usage_input_text_tokens + b.usage_output_text_tokens) > 0
      or sum(b.usage_input_image_tokens + b.usage_output_image_tokens) > 0
      or sum(b.usage_image_inputs + b.usage_image_outputs) > 0
      or sum(b.usage_input_audio_tokens + b.usage_output_audio_tokens) > 0
      or sum(b.usage_audio_seconds) > 0
      or sum(b.usage_input_video_tokens + b.usage_output_video_tokens) > 0
      or sum(b.usage_video_seconds) > 0
      or sum(b.usage_rerank_quad_tokens + b.usage_embedding_quad_tokens) > 0
    )
  order by (
    sum(b.usage_input_text_tokens + b.usage_output_text_tokens)
    + sum(b.usage_input_image_tokens + b.usage_output_image_tokens)
    + sum(b.usage_input_audio_tokens + b.usage_output_audio_tokens)
    + sum(b.usage_input_video_tokens + b.usage_output_video_tokens)
  ) desc;
end;
$$;

grant execute on function public.get_public_multimodal_breakdown(text)
  to anon, authenticated, service_role;

comment on function public.get_public_multimodal_breakdown(text) is
  'Public model-level multimodal usage leaderboard counters sourced from normalized gateway request usage columns.';
