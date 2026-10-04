CREATE OR REPLACE FUNCTION public.get_public_multimodal_breakdown (
  p_time_range text DEFAULT 'week'::text
)
  RETURNS TABLE (
    model_id                  text,
    text_tokens               bigint,
    audio_tokens              bigint,
    video_tokens              bigint,
    cached_tokens             bigint,
    image_count               bigint,
    input_text_tokens         bigint,
    output_text_tokens        bigint,
    input_image_tokens        bigint,
    output_image_tokens       bigint,
    image_inputs              bigint,
    image_outputs             bigint,
    image_megapixels          numeric,
    input_audio_tokens        bigint,
    output_audio_tokens       bigint,
    audio_inputs              bigint,
    audio_outputs             bigint,
    audio_seconds             numeric,
    input_video_tokens        bigint,
    output_video_tokens       bigint,
    video_inputs              bigint,
    video_outputs             bigint,
    video_seconds             numeric,
    video_pixel_seconds       numeric,
    cached_read_tokens        bigint,
    cached_write_tokens       bigint,
    cached_read_text_tokens   bigint,
    cached_write_text_tokens  bigint,
    cached_read_image_tokens  bigint,
    cached_write_image_tokens bigint,
    cached_read_audio_tokens  bigint,
    cached_write_audio_tokens bigint,
    cached_read_video_tokens  bigint,
    cached_write_video_tokens bigint,
    input_quad_tokens         bigint,
    output_quad_tokens        bigint,
    total_quad_tokens         bigint,
    text_quad_tokens          bigint,
    rerank_quad_tokens        bigint,
    embedding_tokens          bigint,
    embedding_quad_tokens     bigint,
    total_requests            bigint,
    total_cost_nanos          bigint,
    avg_latency_ms            numeric,
    avg_generation_ms         numeric,
    avg_throughput            numeric
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_since date;
begin
  case p_time_range
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    else v_since := (now() at time zone 'utc')::date - 7;
  end case;

  return query
  select
    d.model_id,
    sum(d.input_text_tokens + d.output_text_tokens)::bigint as text_tokens,
    sum(d.input_audio_tokens + d.output_audio_tokens)::bigint as audio_tokens,
    sum(d.input_video_tokens + d.output_video_tokens)::bigint as video_tokens,
    sum(d.cached_read_tokens + d.cached_write_tokens)::bigint as cached_tokens,
    sum(d.image_inputs + d.image_outputs)::bigint as image_count,
    sum(d.input_text_tokens)::bigint as input_text_tokens,
    sum(d.output_text_tokens)::bigint as output_text_tokens,
    sum(d.input_image_tokens)::bigint as input_image_tokens,
    sum(d.output_image_tokens)::bigint as output_image_tokens,
    sum(d.image_inputs)::bigint as image_inputs,
    sum(d.image_outputs)::bigint as image_outputs,
    sum(d.image_megapixels)::numeric as image_megapixels,
    sum(d.input_audio_tokens)::bigint as input_audio_tokens,
    sum(d.output_audio_tokens)::bigint as output_audio_tokens,
    sum(d.audio_inputs)::bigint as audio_inputs,
    sum(d.audio_outputs)::bigint as audio_outputs,
    sum(d.audio_seconds)::numeric as audio_seconds,
    sum(d.input_video_tokens)::bigint as input_video_tokens,
    sum(d.output_video_tokens)::bigint as output_video_tokens,
    sum(d.video_inputs)::bigint as video_inputs,
    sum(d.video_outputs)::bigint as video_outputs,
    sum(d.video_seconds)::numeric as video_seconds,
    sum(d.video_pixel_seconds)::numeric as video_pixel_seconds,
    sum(d.cached_read_tokens)::bigint as cached_read_tokens,
    sum(d.cached_write_tokens)::bigint as cached_write_tokens,
    sum(d.cached_read_text_tokens)::bigint as cached_read_text_tokens,
    sum(d.cached_write_text_tokens)::bigint as cached_write_text_tokens,
    sum(d.cached_read_image_tokens)::bigint as cached_read_image_tokens,
    sum(d.cached_write_image_tokens)::bigint as cached_write_image_tokens,
    sum(d.cached_read_audio_tokens)::bigint as cached_read_audio_tokens,
    sum(d.cached_write_audio_tokens)::bigint as cached_write_audio_tokens,
    sum(d.cached_read_video_tokens)::bigint as cached_read_video_tokens,
    sum(d.cached_write_video_tokens)::bigint as cached_write_video_tokens,
    sum(d.input_quad_tokens)::bigint as input_quad_tokens,
    sum(d.output_quad_tokens)::bigint as output_quad_tokens,
    sum(d.total_quad_tokens)::bigint as total_quad_tokens,
    sum(d.text_quad_tokens)::bigint as text_quad_tokens,
    sum(d.rerank_quad_tokens)::bigint as rerank_quad_tokens,
    sum(d.embedding_tokens)::bigint as embedding_tokens,
    sum(d.embedding_quad_tokens)::bigint as embedding_quad_tokens,
    sum(d.requests)::bigint as total_requests,
    sum(d.total_cost_nanos)::bigint as total_cost_nanos,
    case
      when sum(d.latency_samples) > 0
      then round(sum(d.latency_sum_ms)::numeric / sum(d.latency_samples)::numeric, 2)
      else null
    end as avg_latency_ms,
    case
      when sum(d.generation_samples) > 0
      then round(sum(d.generation_sum_ms)::numeric / sum(d.generation_samples)::numeric, 2)
      else null
    end as avg_generation_ms,
    case
      when sum(d.throughput_samples) > 0
      then round(sum(d.throughput_sum)::numeric / sum(d.throughput_samples)::numeric, 2)
      else null
    end as avg_throughput
  from public.v2_rpc_gateway_model_usage_daily d
  where d.day_bucket >= v_since
    and lower(d.model_id) not in ('unknown', 'other')
  group by d.model_id
  having
    sum(d.input_text_tokens + d.output_text_tokens) > 0
    or sum(d.input_image_tokens + d.output_image_tokens) > 0
    or sum(d.image_inputs + d.image_outputs) > 0
    or sum(d.input_audio_tokens + d.output_audio_tokens) > 0
    or sum(d.audio_seconds) > 0
    or sum(d.input_video_tokens + d.output_video_tokens) > 0
    or sum(d.video_seconds) > 0
    or sum(d.rerank_quad_tokens) > 0
    or sum(d.embedding_tokens) > 0
  order by (
    sum(d.input_text_tokens + d.output_text_tokens)
    + sum(d.input_image_tokens + d.output_image_tokens)
    + sum(d.input_audio_tokens + d.output_audio_tokens)
    + sum(d.input_video_tokens + d.output_video_tokens)
    + sum(d.embedding_tokens)
    + sum(d.rerank_quad_tokens)
  ) desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_multimodal_breakdown"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_multimodal_breakdown"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_multimodal_breakdown"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_multimodal_breakdown"(text) TO "postgres";
