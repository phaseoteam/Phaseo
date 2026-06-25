-- Persist normalized usage dimensions on each gateway request.
--
-- Rollups make charts fast, but request logs/details also need first-class
-- request-level fields for text/image/audio/video/reasoning/cache usage.

alter table public.gateway_requests
  add column if not exists usage_total_tokens bigint not null default 0,
  add column if not exists usage_input_tokens bigint not null default 0,
  add column if not exists usage_output_tokens bigint not null default 0,
  add column if not exists usage_reasoning_tokens bigint not null default 0,
  add column if not exists usage_input_text_tokens bigint not null default 0,
  add column if not exists usage_output_text_tokens bigint not null default 0,
  add column if not exists usage_input_image_tokens bigint not null default 0,
  add column if not exists usage_output_image_tokens bigint not null default 0,
  add column if not exists usage_input_audio_tokens bigint not null default 0,
  add column if not exists usage_output_audio_tokens bigint not null default 0,
  add column if not exists usage_input_video_tokens bigint not null default 0,
  add column if not exists usage_output_video_tokens bigint not null default 0,
  add column if not exists usage_image_inputs bigint not null default 0,
  add column if not exists usage_image_outputs bigint not null default 0,
  add column if not exists usage_audio_inputs bigint not null default 0,
  add column if not exists usage_audio_outputs bigint not null default 0,
  add column if not exists usage_video_inputs bigint not null default 0,
  add column if not exists usage_video_outputs bigint not null default 0,
  add column if not exists usage_cached_read_tokens bigint not null default 0,
  add column if not exists usage_cached_write_tokens bigint not null default 0,
  add column if not exists usage_cached_read_text_tokens bigint not null default 0,
  add column if not exists usage_cached_write_text_tokens bigint not null default 0,
  add column if not exists usage_cached_write_text_tokens_5m bigint not null default 0,
  add column if not exists usage_cached_write_text_tokens_1h bigint not null default 0,
  add column if not exists usage_cached_read_image_tokens bigint not null default 0,
  add column if not exists usage_cached_write_image_tokens bigint not null default 0,
  add column if not exists usage_cached_read_audio_tokens bigint not null default 0,
  add column if not exists usage_cached_write_audio_tokens bigint not null default 0,
  add column if not exists usage_cached_read_video_tokens bigint not null default 0,
  add column if not exists usage_cached_write_video_tokens bigint not null default 0,
  add column if not exists usage_input_quad_tokens bigint not null default 0,
  add column if not exists usage_output_quad_tokens bigint not null default 0,
  add column if not exists usage_total_quad_tokens bigint not null default 0,
  add column if not exists usage_text_quad_tokens bigint not null default 0,
  add column if not exists usage_rerank_quad_tokens bigint not null default 0,
  add column if not exists usage_embedding_quad_tokens bigint not null default 0,
  add column if not exists usage_moderation_quad_tokens bigint not null default 0,
  add column if not exists usage_ocr_quad_tokens bigint not null default 0,
  add column if not exists usage_image_megapixels numeric not null default 0,
  add column if not exists usage_audio_seconds numeric not null default 0,
  add column if not exists usage_video_pixel_seconds numeric not null default 0,
  add column if not exists usage_input_characters bigint not null default 0,
  add column if not exists usage_output_characters bigint not null default 0,
  add column if not exists usage_total_characters bigint not null default 0,
  add column if not exists usage_normalized_at timestamptz null;

comment on column public.gateway_requests.usage_total_tokens is
  'Normalized per-request total tokens derived from usage JSON at write time.';
comment on column public.gateway_requests.usage_input_tokens is
  'Normalized per-request input tokens across modalities.';
comment on column public.gateway_requests.usage_output_tokens is
  'Normalized per-request output tokens across modalities.';
comment on column public.gateway_requests.usage_reasoning_tokens is
  'Normalized per-request reasoning/thinking tokens.';
comment on column public.gateway_requests.usage_input_image_tokens is
  'Normalized per-request image input tokens.';
comment on column public.gateway_requests.usage_output_image_tokens is
  'Normalized per-request image output tokens.';
comment on column public.gateway_requests.usage_image_inputs is
  'Normalized per-request count of image inputs when providers expose a count.';
comment on column public.gateway_requests.usage_image_outputs is
  'Normalized per-request count of image outputs when providers expose a count.';
comment on column public.gateway_requests.usage_input_quad_tokens is
  'Provider-independent input quadtokens, calculated as ceil(input text characters / 4).';
comment on column public.gateway_requests.usage_output_quad_tokens is
  'Provider-independent output quadtokens, calculated as ceil(output text characters / 4).';
comment on column public.gateway_requests.usage_text_quad_tokens is
  'Provider-independent text-like workload quadtokens across text, rerank, embeddings, moderation, and OCR text.';
comment on column public.gateway_requests.usage_image_megapixels is
  'Provider-independent image workload in megapixels when dimensions are known.';
comment on column public.gateway_requests.usage_audio_seconds is
  'Provider-independent audio workload in seconds.';
comment on column public.gateway_requests.usage_video_pixel_seconds is
  'Provider-independent video workload in pixel-seconds when dimensions and duration are known.';

create or replace function public.gateway_usage_nonnegative_bigint(p_value numeric)
returns bigint
language sql
immutable
as $$
  select greatest(coalesce(floor(p_value), 0), 0)::bigint;
$$;

create or replace function public.normalize_gateway_request_usage()
returns trigger
language plpgsql
as $$
declare
  v_usage jsonb := coalesce(new.usage, '{}'::jsonb);
  v_input_tokens bigint;
  v_output_tokens bigint;
  v_total_tokens bigint;
  v_reasoning_tokens bigint;
  v_input_image_tokens bigint;
  v_output_image_tokens bigint;
  v_input_audio_tokens bigint;
  v_output_audio_tokens bigint;
  v_input_video_tokens bigint;
  v_output_video_tokens bigint;
begin
  v_total_tokens := public.gateway_usage_total_tokens(v_usage);

  v_input_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'input_tokens',
      'prompt_tokens',
      'inputTokens',
      'promptTokens',
      'promptTokenCount',
      'total_input_tokens',
      'totalInputTokens'
    ), 0)
  );
  v_output_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'output_tokens',
      'completion_tokens',
      'outputTokens',
      'completionTokens',
      'candidatesTokenCount',
      'total_output_tokens',
      'totalOutputTokens'
    ), 0)
  );
  v_reasoning_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'reasoning_tokens',
      'reasoning_output_tokens',
      'output_reasoning_tokens',
      'completion_tokens_details.reasoning_tokens',
      'output_tokens_details.reasoning_tokens'
    ), 0)
  );
  v_input_image_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'input_image_tokens',
      'image_input_tokens',
      'prompt_image_tokens',
      'input_tokens_details.image_tokens',
      'prompt_tokens_details.image_tokens'
    ), 0)
  );
  v_output_image_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'output_image_tokens',
      'image_output_tokens',
      'generated_image_tokens',
      'completion_tokens_details.image_tokens',
      'output_tokens_details.image_tokens'
    ), 0)
  );
  v_input_audio_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'input_audio_tokens',
      'audio_input_tokens',
      'prompt_audio_tokens',
      'input_tokens_details.audio_tokens',
      'prompt_tokens_details.audio_tokens'
    ), 0)
  );
  v_output_audio_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'output_audio_tokens',
      'audio_output_tokens',
      'completion_tokens_details.audio_tokens',
      'output_tokens_details.audio_tokens'
    ), 0)
  );
  v_input_video_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'input_video_tokens',
      'video_input_tokens',
      'input_tokens_details.video_tokens',
      'prompt_tokens_details.video_tokens'
    ), 0)
  );
  v_output_video_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'output_video_tokens',
      'video_output_tokens',
      'completion_tokens_details.video_tokens',
      'output_tokens_details.video_tokens'
    ), 0)
  );

  if v_total_tokens < v_input_tokens + v_output_tokens + v_reasoning_tokens then
    v_total_tokens := v_input_tokens + v_output_tokens + v_reasoning_tokens;
  end if;

  new.usage_total_tokens := coalesce(v_total_tokens, 0);
  new.usage_input_tokens := v_input_tokens;
  new.usage_output_tokens := v_output_tokens;
  new.usage_reasoning_tokens := v_reasoning_tokens;
  new.usage_input_image_tokens := v_input_image_tokens;
  new.usage_output_image_tokens := v_output_image_tokens;
  new.usage_input_audio_tokens := v_input_audio_tokens;
  new.usage_output_audio_tokens := v_output_audio_tokens;
  new.usage_input_video_tokens := v_input_video_tokens;
  new.usage_output_video_tokens := v_output_video_tokens;
  new.usage_input_text_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(
      public.gateway_usage_numeric_field(v_usage, 'input_text_tokens', 'text_input_tokens'),
      greatest(v_input_tokens - v_input_image_tokens - v_input_audio_tokens - v_input_video_tokens, 0)
    )
  );
  new.usage_output_text_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(
      public.gateway_usage_numeric_field(v_usage, 'output_text_tokens', 'text_output_tokens'),
      greatest(v_output_tokens - v_output_image_tokens - v_output_audio_tokens - v_output_video_tokens - v_reasoning_tokens, 0)
    )
  );

  new.usage_image_inputs := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'input_image_count',
      'image_input_count',
      'image_inputs',
      'input_images'
    ), 0)
  );
  new.usage_image_outputs := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'output_image_count',
      'image_output_count',
      'image_outputs',
      'output_images',
      'generated_images',
      'image_count'
    ), 0)
  );
  new.usage_audio_inputs := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'input_audio_count',
      'audio_input_count',
      'audio_inputs',
      'input_audio'
    ), 0)
  );
  new.usage_audio_outputs := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'output_audio_count',
      'audio_output_count',
      'audio_outputs',
      'output_audio'
    ), 0)
  );
  new.usage_video_inputs := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'input_video_count',
      'video_input_count',
      'video_inputs',
      'input_videos'
    ), 0)
  );
  new.usage_video_outputs := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'output_video_count',
      'video_output_count',
      'video_outputs',
      'output_videos',
      'video_count'
    ), 0)
  );

  new.usage_cached_read_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'cached_read_tokens',
      'cache_read_input_tokens',
      'input_tokens_details.cached_tokens',
      'prompt_tokens_details.cached_tokens'
    ), 0)
  );
  new.usage_cached_write_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(
      v_usage,
      'cached_write_tokens',
      'cache_creation_input_tokens',
      'output_tokens_details.cached_tokens'
    ), 0)
  );
  new.usage_cached_read_text_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_read_text_tokens'), 0)
  );
  new.usage_cached_write_text_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(
      public.gateway_usage_numeric_field(v_usage, 'cached_write_text_tokens'),
      coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_write_text_tokens_5m', 'cache_creation.ephemeral_5m_input_tokens'), 0) +
        coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_write_text_tokens_1h', 'cache_creation.ephemeral_1h_input_tokens'), 0)
    )
  );
  new.usage_cached_write_text_tokens_5m := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_write_text_tokens_5m', 'cache_creation.ephemeral_5m_input_tokens'), 0)
  );
  new.usage_cached_write_text_tokens_1h := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_write_text_tokens_1h', 'cache_creation.ephemeral_1h_input_tokens'), 0)
  );
  new.usage_cached_read_image_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_read_image_tokens'), 0)
  );
  new.usage_cached_write_image_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_write_image_tokens'), 0)
  );
  new.usage_cached_read_audio_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_read_audio_tokens'), 0)
  );
  new.usage_cached_write_audio_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_write_audio_tokens'), 0)
  );
  new.usage_cached_read_video_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_read_video_tokens'), 0)
  );
  new.usage_cached_write_video_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'cached_write_video_tokens'), 0)
  );
  new.usage_input_quad_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'input_quad_tokens', 'quad_input_tokens'), new.usage_input_quad_tokens)
  );
  new.usage_output_quad_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'output_quad_tokens', 'quad_output_tokens'), new.usage_output_quad_tokens)
  );
  new.usage_total_quad_tokens := public.gateway_usage_nonnegative_bigint(
    greatest(
      coalesce(public.gateway_usage_numeric_field(v_usage, 'total_quad_tokens', 'quad_total_tokens'), new.usage_total_quad_tokens),
      new.usage_input_quad_tokens + new.usage_output_quad_tokens
    )
  );
  new.usage_text_quad_tokens := public.gateway_usage_nonnegative_bigint(
    greatest(
      coalesce(public.gateway_usage_numeric_field(v_usage, 'text_quad_tokens'), new.usage_text_quad_tokens),
      new.usage_total_quad_tokens
    )
  );
  new.usage_rerank_quad_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'rerank_quad_tokens'), new.usage_rerank_quad_tokens)
  );
  new.usage_embedding_quad_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'embedding_quad_tokens'), new.usage_embedding_quad_tokens)
  );
  new.usage_moderation_quad_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'moderation_quad_tokens'), new.usage_moderation_quad_tokens)
  );
  new.usage_ocr_quad_tokens := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'ocr_quad_tokens'), new.usage_ocr_quad_tokens)
  );
  new.usage_image_megapixels := greatest(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'image_megapixels'), new.usage_image_megapixels),
    0
  );
  new.usage_audio_seconds := greatest(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'audio_seconds'), new.usage_audio_seconds),
    0
  );
  new.usage_video_pixel_seconds := greatest(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'video_pixel_seconds'), new.usage_video_pixel_seconds),
    0
  );
  new.usage_input_characters := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'input_characters', 'input_chars'), new.usage_input_characters)
  );
  new.usage_output_characters := public.gateway_usage_nonnegative_bigint(
    coalesce(public.gateway_usage_numeric_field(v_usage, 'output_characters', 'output_chars'), new.usage_output_characters)
  );
  new.usage_total_characters := public.gateway_usage_nonnegative_bigint(
    greatest(
      coalesce(public.gateway_usage_numeric_field(v_usage, 'total_characters', 'total_chars'), new.usage_total_characters),
      new.usage_input_characters + new.usage_output_characters
    )
  );
  new.usage_normalized_at := now();

  return new;
end;
$$;

drop trigger if exists trg_gateway_requests_normalize_usage on public.gateway_requests;
create trigger trg_gateway_requests_normalize_usage
  before insert or update of usage
  on public.gateway_requests
  for each row
  execute function public.normalize_gateway_request_usage();

create index if not exists gateway_requests_usage_tokens_model_created_idx
  on public.gateway_requests (canonical_model_id, created_at desc)
  where usage_total_tokens > 0;

create index if not exists gateway_requests_usage_image_model_created_idx
  on public.gateway_requests (canonical_model_id, created_at desc)
  where usage_input_image_tokens > 0
     or usage_output_image_tokens > 0
     or usage_image_inputs > 0
     or usage_image_outputs > 0;

create index if not exists gateway_requests_usage_audio_model_created_idx
  on public.gateway_requests (canonical_model_id, created_at desc)
  where usage_input_audio_tokens > 0
     or usage_output_audio_tokens > 0
     or usage_audio_inputs > 0
     or usage_audio_outputs > 0;

create index if not exists gateway_requests_usage_reasoning_model_created_idx
  on public.gateway_requests (canonical_model_id, created_at desc)
  where usage_reasoning_tokens > 0;

create index if not exists gateway_requests_usage_quad_model_created_idx
  on public.gateway_requests (canonical_model_id, created_at desc)
  where usage_total_quad_tokens > 0;

create index if not exists gateway_requests_usage_workload_model_created_idx
  on public.gateway_requests (canonical_model_id, created_at desc)
  where usage_text_quad_tokens > 0
     or usage_image_megapixels > 0
     or usage_audio_seconds > 0
     or usage_video_pixel_seconds > 0;

create or replace function public.backfill_gateway_request_normalized_usage(
  p_since timestamptz default now() - interval '90 days',
  p_until timestamptz default now()
)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  update public.gateway_requests
  set usage = usage
  where created_at >= p_since
    and created_at < p_until;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function if exists public.gateway_request_usage_rollup_rows(timestamptz, timestamptz) cascade;

alter table public.gateway_model_usage_daily
  add column if not exists input_quad_tokens bigint not null default 0,
  add column if not exists output_quad_tokens bigint not null default 0,
  add column if not exists total_quad_tokens bigint not null default 0,
  add column if not exists cached_write_text_tokens_5m bigint not null default 0,
  add column if not exists cached_write_text_tokens_1h bigint not null default 0,
  add column if not exists text_quad_tokens bigint not null default 0,
  add column if not exists rerank_quad_tokens bigint not null default 0,
  add column if not exists embedding_quad_tokens bigint not null default 0,
  add column if not exists moderation_quad_tokens bigint not null default 0,
  add column if not exists ocr_quad_tokens bigint not null default 0,
  add column if not exists image_megapixels numeric not null default 0,
  add column if not exists audio_seconds numeric not null default 0,
  add column if not exists video_pixel_seconds numeric not null default 0,
  add column if not exists input_characters bigint not null default 0,
  add column if not exists output_characters bigint not null default 0,
  add column if not exists total_characters bigint not null default 0;

create or replace function public.gateway_request_usage_rollup_rows(
  p_since timestamptz,
  p_until timestamptz default now()
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
  total_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  input_text_tokens bigint,
  output_text_tokens bigint,
  input_image_tokens bigint,
  output_image_tokens bigint,
  input_audio_tokens bigint,
  output_audio_tokens bigint,
  input_video_tokens bigint,
  output_video_tokens bigint,
  image_inputs bigint,
  image_outputs bigint,
  audio_inputs bigint,
  audio_outputs bigint,
  video_inputs bigint,
  video_outputs bigint,
  cached_read_tokens bigint,
  cached_write_tokens bigint,
  cached_read_text_tokens bigint,
  cached_write_text_tokens bigint,
  cached_write_text_tokens_5m bigint,
  cached_write_text_tokens_1h bigint,
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
  moderation_quad_tokens bigint,
  ocr_quad_tokens bigint,
  image_megapixels numeric,
  audio_seconds numeric,
  video_pixel_seconds numeric,
  input_characters bigint,
  output_characters bigint,
  total_characters bigint,
  total_cost_nanos bigint,
  latency_sum_ms bigint,
  latency_samples bigint,
  generation_sum_ms bigint,
  generation_samples bigint,
  throughput_sum numeric,
  throughput_samples bigint,
  last_request_at timestamptz
)
language sql
stable
as $$
  with base as (
    select
      date_trunc('day', gr.created_at at time zone 'utc')::date as day_bucket,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.routed_model_id, ''),
        nullif(gr.requested_model_id, ''),
        nullif(gr.model_id, ''),
        'unknown'
      ) as model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      coalesce(nullif(gr.endpoint, ''), 'unknown') as endpoint,
      gr.created_at,
      gr.success,
      gr.status_code,
      lower(coalesce(gr.error_code, '')) as error_code,
      gr.cost_nanos,
      gr.latency_ms,
      gr.generation_ms,
      gr.throughput,
      gr.usage_total_tokens,
      gr.usage_input_tokens,
      gr.usage_output_tokens,
      gr.usage_reasoning_tokens,
      gr.usage_input_text_tokens,
      gr.usage_output_text_tokens,
      gr.usage_input_image_tokens,
      gr.usage_output_image_tokens,
      gr.usage_input_audio_tokens,
      gr.usage_output_audio_tokens,
      gr.usage_input_video_tokens,
      gr.usage_output_video_tokens,
      gr.usage_image_inputs,
      gr.usage_image_outputs,
      gr.usage_audio_inputs,
      gr.usage_audio_outputs,
      gr.usage_video_inputs,
      gr.usage_video_outputs,
      gr.usage_cached_read_tokens,
      gr.usage_cached_write_tokens,
      gr.usage_cached_read_text_tokens,
      gr.usage_cached_write_text_tokens,
      gr.usage_cached_write_text_tokens_5m,
      gr.usage_cached_write_text_tokens_1h,
      gr.usage_cached_read_image_tokens,
      gr.usage_cached_write_image_tokens,
      gr.usage_cached_read_audio_tokens,
      gr.usage_cached_write_audio_tokens,
      gr.usage_cached_read_video_tokens,
      gr.usage_cached_write_video_tokens,
      gr.usage_input_quad_tokens,
      gr.usage_output_quad_tokens,
      gr.usage_total_quad_tokens,
      gr.usage_text_quad_tokens,
      gr.usage_rerank_quad_tokens,
      gr.usage_embedding_quad_tokens,
      gr.usage_moderation_quad_tokens,
      gr.usage_ocr_quad_tokens,
      gr.usage_image_megapixels,
      gr.usage_audio_seconds,
      gr.usage_video_pixel_seconds,
      gr.usage_input_characters,
      gr.usage_output_characters,
      gr.usage_total_characters
    from public.gateway_requests gr
    where gr.created_at >= p_since
      and gr.created_at < p_until
  ),
  classified as (
    select
      b.*,
      case
        when b.success is true then 'success'
        when b.status_code = 429
          or b.error_code like '%rate limit%'
          or b.error_code like '%rate_limit%'
          or b.error_code like '%ratelimit%'
          or b.error_code like '%too many requests%'
          or b.error_code like '%quota exceeded%'
          or b.error_code like '%abort%'
          or b.error_code like '%cancel%'
          or b.error_code like '%client_closed%'
        then 'neutral'
        else 'failure'
      end as health_outcome,
      case
        when b.status_code = 429
          or b.error_code like '%rate limit%'
          or b.error_code like '%rate_limit%'
          or b.error_code like '%ratelimit%'
          or b.error_code like '%too many requests%'
          or b.error_code like '%quota exceeded%'
        then true
        else false
      end as is_rate_limited
    from base b
  )
  select
    c.day_bucket,
    c.model_id,
    c.provider_id,
    c.endpoint,
    count(*)::bigint as requests,
    count(*) filter (where c.success is true)::bigint as success_requests,
    count(*) filter (where c.health_outcome = 'failure')::bigint as failed_requests,
    count(*) filter (where c.health_outcome = 'neutral')::bigint as neutral_requests,
    count(*) filter (where c.is_rate_limited)::bigint as rate_limited_requests,
    sum(c.usage_total_tokens)::bigint as total_tokens,
    sum(c.usage_input_tokens)::bigint as input_tokens,
    sum(c.usage_output_tokens)::bigint as output_tokens,
    sum(c.usage_reasoning_tokens)::bigint as reasoning_tokens,
    sum(c.usage_input_text_tokens)::bigint as input_text_tokens,
    sum(c.usage_output_text_tokens)::bigint as output_text_tokens,
    sum(c.usage_input_image_tokens)::bigint as input_image_tokens,
    sum(c.usage_output_image_tokens)::bigint as output_image_tokens,
    sum(c.usage_input_audio_tokens)::bigint as input_audio_tokens,
    sum(c.usage_output_audio_tokens)::bigint as output_audio_tokens,
    sum(c.usage_input_video_tokens)::bigint as input_video_tokens,
    sum(c.usage_output_video_tokens)::bigint as output_video_tokens,
    sum(c.usage_image_inputs)::bigint as image_inputs,
    sum(c.usage_image_outputs)::bigint as image_outputs,
    sum(c.usage_audio_inputs)::bigint as audio_inputs,
    sum(c.usage_audio_outputs)::bigint as audio_outputs,
    sum(c.usage_video_inputs)::bigint as video_inputs,
    sum(c.usage_video_outputs)::bigint as video_outputs,
    sum(c.usage_cached_read_tokens)::bigint as cached_read_tokens,
    sum(c.usage_cached_write_tokens)::bigint as cached_write_tokens,
    sum(c.usage_cached_read_text_tokens)::bigint as cached_read_text_tokens,
    sum(c.usage_cached_write_text_tokens)::bigint as cached_write_text_tokens,
    sum(c.usage_cached_write_text_tokens_5m)::bigint as cached_write_text_tokens_5m,
    sum(c.usage_cached_write_text_tokens_1h)::bigint as cached_write_text_tokens_1h,
    sum(c.usage_cached_read_image_tokens)::bigint as cached_read_image_tokens,
    sum(c.usage_cached_write_image_tokens)::bigint as cached_write_image_tokens,
    sum(c.usage_cached_read_audio_tokens)::bigint as cached_read_audio_tokens,
    sum(c.usage_cached_write_audio_tokens)::bigint as cached_write_audio_tokens,
    sum(c.usage_cached_read_video_tokens)::bigint as cached_read_video_tokens,
    sum(c.usage_cached_write_video_tokens)::bigint as cached_write_video_tokens,
    sum(c.usage_input_quad_tokens)::bigint as input_quad_tokens,
    sum(c.usage_output_quad_tokens)::bigint as output_quad_tokens,
    sum(c.usage_total_quad_tokens)::bigint as total_quad_tokens,
    sum(c.usage_text_quad_tokens)::bigint as text_quad_tokens,
    sum(c.usage_rerank_quad_tokens)::bigint as rerank_quad_tokens,
    sum(c.usage_embedding_quad_tokens)::bigint as embedding_quad_tokens,
    sum(c.usage_moderation_quad_tokens)::bigint as moderation_quad_tokens,
    sum(c.usage_ocr_quad_tokens)::bigint as ocr_quad_tokens,
    sum(c.usage_image_megapixels)::numeric as image_megapixels,
    sum(c.usage_audio_seconds)::numeric as audio_seconds,
    sum(c.usage_video_pixel_seconds)::numeric as video_pixel_seconds,
    sum(c.usage_input_characters)::bigint as input_characters,
    sum(c.usage_output_characters)::bigint as output_characters,
    sum(c.usage_total_characters)::bigint as total_characters,
    sum(coalesce(c.cost_nanos, 0))::bigint as total_cost_nanos,
    sum(coalesce(c.latency_ms, 0)) filter (where c.latency_ms is not null)::bigint as latency_sum_ms,
    count(c.latency_ms)::bigint as latency_samples,
    sum(coalesce(c.generation_ms, 0)) filter (where c.generation_ms is not null)::bigint as generation_sum_ms,
    count(c.generation_ms)::bigint as generation_samples,
    sum(coalesce(c.throughput, 0)) filter (where c.throughput is not null)::numeric as throughput_sum,
    count(c.throughput)::bigint as throughput_samples,
    max(c.created_at) as last_request_at
  from classified c
  where c.model_id is not null
    and c.model_id <> ''
  group by c.day_bucket, c.model_id, c.provider_id, c.endpoint;
$$;

create or replace function public.refresh_gateway_model_usage_daily(
  p_since timestamptz default now() - interval '90 days',
  p_until timestamptz default now()
)
returns void
language plpgsql
as $$
declare
  v_since_date date := date_trunc('day', p_since at time zone 'utc')::date;
  v_until_date date := date_trunc('day', p_until at time zone 'utc')::date;
begin
  delete from public.gateway_model_usage_daily d
  where d.day_bucket >= v_since_date
    and d.day_bucket <= v_until_date;

  insert into public.gateway_model_usage_daily (
    day_bucket,
    model_id,
    provider_id,
    endpoint,
    requests,
    success_requests,
    failed_requests,
    neutral_requests,
    rate_limited_requests,
    total_tokens,
    input_tokens,
    output_tokens,
    reasoning_tokens,
    input_text_tokens,
    output_text_tokens,
    input_image_tokens,
    output_image_tokens,
    input_audio_tokens,
    output_audio_tokens,
    input_video_tokens,
    output_video_tokens,
    image_inputs,
    image_outputs,
    audio_inputs,
    audio_outputs,
    video_inputs,
    video_outputs,
    cached_read_tokens,
    cached_write_tokens,
    cached_read_text_tokens,
    cached_write_text_tokens,
    cached_write_text_tokens_5m,
    cached_write_text_tokens_1h,
    cached_read_image_tokens,
    cached_write_image_tokens,
    cached_read_audio_tokens,
    cached_write_audio_tokens,
    cached_read_video_tokens,
    cached_write_video_tokens,
    input_quad_tokens,
    output_quad_tokens,
    total_quad_tokens,
    text_quad_tokens,
    rerank_quad_tokens,
    embedding_quad_tokens,
    moderation_quad_tokens,
    ocr_quad_tokens,
    image_megapixels,
    audio_seconds,
    video_pixel_seconds,
    input_characters,
    output_characters,
    total_characters,
    total_cost_nanos,
    latency_sum_ms,
    latency_samples,
    generation_sum_ms,
    generation_samples,
    throughput_sum,
    throughput_samples,
    last_request_at,
    refreshed_at
  )
  select
    r.day_bucket,
    r.model_id,
    r.provider_id,
    r.endpoint,
    r.requests,
    r.success_requests,
    r.failed_requests,
    r.neutral_requests,
    r.rate_limited_requests,
    r.total_tokens,
    r.input_tokens,
    r.output_tokens,
    r.reasoning_tokens,
    r.input_text_tokens,
    r.output_text_tokens,
    r.input_image_tokens,
    r.output_image_tokens,
    r.input_audio_tokens,
    r.output_audio_tokens,
    r.input_video_tokens,
    r.output_video_tokens,
    r.image_inputs,
    r.image_outputs,
    r.audio_inputs,
    r.audio_outputs,
    r.video_inputs,
    r.video_outputs,
    r.cached_read_tokens,
    r.cached_write_tokens,
    r.cached_read_text_tokens,
    r.cached_write_text_tokens,
    r.cached_write_text_tokens_5m,
    r.cached_write_text_tokens_1h,
    r.cached_read_image_tokens,
    r.cached_write_image_tokens,
    r.cached_read_audio_tokens,
    r.cached_write_audio_tokens,
    r.cached_read_video_tokens,
    r.cached_write_video_tokens,
    r.input_quad_tokens,
    r.output_quad_tokens,
    r.total_quad_tokens,
    r.text_quad_tokens,
    r.rerank_quad_tokens,
    r.embedding_quad_tokens,
    r.moderation_quad_tokens,
    r.ocr_quad_tokens,
    r.image_megapixels,
    r.audio_seconds,
    r.video_pixel_seconds,
    r.input_characters,
    r.output_characters,
    r.total_characters,
    r.total_cost_nanos,
    r.latency_sum_ms,
    r.latency_samples,
    r.generation_sum_ms,
    r.generation_samples,
    r.throughput_sum,
    r.throughput_samples,
    r.last_request_at,
    now()
  from public.gateway_request_usage_rollup_rows(p_since, p_until) r;
end;
$$;

drop function if exists public.get_model_usage_daily_breakdown(text[], text[], date, date);

create or replace function public.get_model_usage_daily_breakdown(
  p_model_ids text[],
  p_provider_ids text[] default null,
  p_since date default (current_date - 30),
  p_until date default current_date
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
  total_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  input_text_tokens bigint,
  output_text_tokens bigint,
  input_image_tokens bigint,
  output_image_tokens bigint,
  input_audio_tokens bigint,
  output_audio_tokens bigint,
  input_video_tokens bigint,
  output_video_tokens bigint,
  image_inputs bigint,
  image_outputs bigint,
  audio_inputs bigint,
  audio_outputs bigint,
  video_inputs bigint,
  video_outputs bigint,
  cached_read_tokens bigint,
  cached_write_tokens bigint,
  cached_read_text_tokens bigint,
  cached_write_text_tokens bigint,
  cached_write_text_tokens_5m bigint,
  cached_write_text_tokens_1h bigint,
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
  moderation_quad_tokens bigint,
  ocr_quad_tokens bigint,
  image_megapixels numeric,
  audio_seconds numeric,
  video_pixel_seconds numeric,
  input_characters bigint,
  output_characters bigint,
  total_characters bigint,
  total_cost_nanos bigint,
  avg_latency_ms numeric,
  avg_generation_ms numeric,
  avg_throughput numeric
)
language sql
stable
as $$
  with model_filter as (
    select distinct nullif(btrim(input.model_id), '') as model_id
    from unnest(coalesce(p_model_ids, array[]::text[])) as input(model_id)
    where nullif(btrim(input.model_id), '') is not null
  ),
  provider_filter as (
    select distinct nullif(btrim(input.provider_id), '') as provider_id
    from unnest(coalesce(p_provider_ids, array[]::text[])) as input(provider_id)
    where nullif(btrim(input.provider_id), '') is not null
  )
  select
    d.day_bucket,
    d.model_id,
    d.provider_id,
    d.endpoint,
    d.requests,
    d.success_requests,
    d.failed_requests,
    d.neutral_requests,
    d.rate_limited_requests,
    d.total_tokens,
    d.input_tokens,
    d.output_tokens,
    d.reasoning_tokens,
    d.input_text_tokens,
    d.output_text_tokens,
    d.input_image_tokens,
    d.output_image_tokens,
    d.input_audio_tokens,
    d.output_audio_tokens,
    d.input_video_tokens,
    d.output_video_tokens,
    d.image_inputs,
    d.image_outputs,
    d.audio_inputs,
    d.audio_outputs,
    d.video_inputs,
    d.video_outputs,
    d.cached_read_tokens,
    d.cached_write_tokens,
    d.cached_read_text_tokens,
    d.cached_write_text_tokens,
    d.cached_write_text_tokens_5m,
    d.cached_write_text_tokens_1h,
    d.cached_read_image_tokens,
    d.cached_write_image_tokens,
    d.cached_read_audio_tokens,
    d.cached_write_audio_tokens,
    d.cached_read_video_tokens,
    d.cached_write_video_tokens,
    d.input_quad_tokens,
    d.output_quad_tokens,
    d.total_quad_tokens,
    d.text_quad_tokens,
    d.rerank_quad_tokens,
    d.embedding_quad_tokens,
    d.moderation_quad_tokens,
    d.ocr_quad_tokens,
    d.image_megapixels,
    d.audio_seconds,
    d.video_pixel_seconds,
    d.input_characters,
    d.output_characters,
    d.total_characters,
    d.total_cost_nanos,
    case when d.latency_samples > 0 then round(d.latency_sum_ms::numeric / d.latency_samples::numeric, 2) else null end as avg_latency_ms,
    case when d.generation_samples > 0 then round(d.generation_sum_ms::numeric / d.generation_samples::numeric, 2) else null end as avg_generation_ms,
    case when d.throughput_samples > 0 then round(d.throughput_sum::numeric / d.throughput_samples::numeric, 2) else null end as avg_throughput
  from public.gateway_model_usage_daily d
  where d.day_bucket >= p_since
    and d.day_bucket <= p_until
    and exists (
      select 1 from model_filter mf where mf.model_id = d.model_id
    )
    and (
      p_provider_ids is null
      or array_length(p_provider_ids, 1) is null
      or exists (
        select 1 from provider_filter pf where pf.provider_id = d.provider_id
      )
    )
  order by d.day_bucket asc, d.provider_id asc, d.endpoint asc;
$$;

grant execute on function public.gateway_usage_nonnegative_bigint(numeric)
  to authenticated, service_role;
grant execute on function public.normalize_gateway_request_usage()
  to service_role;
grant execute on function public.backfill_gateway_request_normalized_usage(timestamptz, timestamptz)
  to service_role;
grant execute on function public.refresh_gateway_model_usage_daily(timestamptz, timestamptz)
  to service_role;
grant execute on function public.get_model_usage_daily_breakdown(text[], text[], date, date)
  to authenticated, service_role;

comment on function public.backfill_gateway_request_normalized_usage(timestamptz, timestamptz) is
  'Recomputes normalized per-request usage columns for gateway_requests in a bounded created_at window.';
comment on function public.get_model_usage_daily_breakdown(text[], text[], date, date) is
  'Returns daily model/provider/endpoint usage, including provider tokens, modality counters, and quadtokens.';
