CREATE OR REPLACE FUNCTION public.normalize_gateway_request_usage()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."normalize_gateway_request_usage"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."normalize_gateway_request_usage"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."normalize_gateway_request_usage"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."normalize_gateway_request_usage"() FROM PUBLIC, "anon", "authenticated";
