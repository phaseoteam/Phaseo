CREATE OR REPLACE FUNCTION public.gateway_request_usage_rollup_rows (
  p_since timestamp with time zone,
  p_until timestamp with time zone DEFAULT now()
)
  RETURNS TABLE (
    day_bucket                  date,
    model_id                    text,
    provider_id                 text,
    endpoint                    text,
    requests                    bigint,
    success_requests            bigint,
    failed_requests             bigint,
    neutral_requests            bigint,
    rate_limited_requests       bigint,
    total_tokens                bigint,
    input_tokens                bigint,
    output_tokens               bigint,
    reasoning_tokens            bigint,
    input_text_tokens           bigint,
    output_text_tokens          bigint,
    input_image_tokens          bigint,
    output_image_tokens         bigint,
    input_audio_tokens          bigint,
    output_audio_tokens         bigint,
    input_video_tokens          bigint,
    output_video_tokens         bigint,
    image_inputs                bigint,
    image_outputs               bigint,
    audio_inputs                bigint,
    audio_outputs               bigint,
    video_inputs                bigint,
    video_outputs               bigint,
    cached_read_tokens          bigint,
    cached_write_tokens         bigint,
    cached_read_text_tokens     bigint,
    cached_write_text_tokens    bigint,
    cached_write_text_tokens_5m bigint,
    cached_write_text_tokens_1h bigint,
    cached_read_image_tokens    bigint,
    cached_write_image_tokens   bigint,
    cached_read_audio_tokens    bigint,
    cached_write_audio_tokens   bigint,
    cached_read_video_tokens    bigint,
    cached_write_video_tokens   bigint,
    input_quad_tokens           bigint,
    output_quad_tokens          bigint,
    total_quad_tokens           bigint,
    text_quad_tokens            bigint,
    rerank_quad_tokens          bigint,
    embedding_quad_tokens       bigint,
    moderation_quad_tokens      bigint,
    ocr_quad_tokens             bigint,
    image_megapixels            numeric,
    audio_seconds               numeric,
    video_pixel_seconds         numeric,
    input_characters            bigint,
    output_characters           bigint,
    total_characters            bigint,
    total_cost_nanos            bigint,
    latency_sum_ms              bigint,
    latency_samples             bigint,
    generation_sum_ms           bigint,
    generation_samples          bigint,
    throughput_sum              numeric,
    throughput_samples          bigint,
    last_request_at             timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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
    from private.v2_rpc_gateway_requests_compat gr
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_request_usage_rollup_rows"(timestamp WITH time zone, timestamp WITH time zone) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."gateway_request_usage_rollup_rows"(timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_request_usage_rollup_rows"(timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_request_usage_rollup_rows"(timestamp WITH time zone, timestamp WITH time zone) TO "postgres";
