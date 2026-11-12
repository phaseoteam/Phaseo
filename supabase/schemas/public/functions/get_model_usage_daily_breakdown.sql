CREATE OR REPLACE FUNCTION public.get_model_usage_daily_breakdown (
  p_model_ids    text[],
  p_provider_ids text[] DEFAULT NULL::text[],
  p_since        date   DEFAULT (CURRENT_DATE - 30),
  p_until        date   DEFAULT CURRENT_DATE
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
    avg_latency_ms              numeric,
    avg_generation_ms           numeric,
    avg_throughput              numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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
  from public.v2_rpc_gateway_model_usage_daily d
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_model_usage_daily_breakdown"(text[], text[], date, date) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_model_usage_daily_breakdown"(text[], text[], date, date) TO "service_role";

COMMENT ON FUNCTION "public"."get_model_usage_daily_breakdown"(text[], text[], date, date) IS 'Returns daily model/provider/endpoint usage, including provider tokens, modality counters, and quadtokens.';

REVOKE ALL ON FUNCTION "public"."get_model_usage_daily_breakdown"(text[], text[], date, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_usage_daily_breakdown"(text[], text[], date, date) TO "postgres";
