create or replace function public.public_ranking_metric_value(p_metric text, meters jsonb)
returns numeric
language sql immutable security invoker set search_path = ''
as $$
  select case p_metric
    when 'tokens' then coalesce((meters->>'total_tokens')::numeric,
      case when meters ? 'input_tokens' or meters ? 'output_tokens'
        then coalesce((meters->>'input_tokens')::numeric, 0) + coalesce((meters->>'output_tokens')::numeric, 0)
        else coalesce((meters->>'input_text_tokens')::numeric, 0) + coalesce((meters->>'output_text_tokens')::numeric, 0) end)
    when 'text_tokens' then coalesce((meters->>'input_text_tokens')::numeric, 0) + coalesce((meters->>'output_text_tokens')::numeric, 0)
    when 'image_inputs' then coalesce((meters->>'image_inputs')::numeric, (meters->>'input_images')::numeric, 0)
    when 'image_outputs' then coalesce((meters->>'image_outputs')::numeric, (meters->>'output_images')::numeric, 0)
    when 'audio_tokens' then coalesce((meters->>'input_audio_tokens')::numeric, 0) + coalesce((meters->>'output_audio_tokens')::numeric, 0)
    when 'audio_seconds' then coalesce((meters->>'audio_seconds')::numeric, 0)
    when 'speech_seconds' then coalesce((meters->>'speech_seconds')::numeric, 0)
    when 'transcription_seconds' then coalesce((meters->>'transcription_seconds')::numeric, 0)
    when 'video_tokens' then coalesce((meters->>'input_video_tokens')::numeric, 0) + coalesce((meters->>'output_video_tokens')::numeric, 0)
    when 'video_seconds' then coalesce((meters->>'video_seconds')::numeric, (meters->>'output_video_seconds')::numeric, 0)
    when 'cached_tokens' then coalesce((meters->>'cached_read_tokens')::numeric, (meters->>'cached_input_tokens')::numeric, 0) + coalesce((meters->>'cached_write_tokens')::numeric, (meters->>'cache_write_tokens')::numeric, 0)
    when 'embedding_tokens' then coalesce((meters->>'embedding_tokens')::numeric, 0)
    when 'rerank_quad_tokens' then coalesce((meters->>'rerank_quad_tokens')::numeric, 0)
    else 0
  end;
$$;
revoke all on function public.public_ranking_metric_value(text, jsonb) from public;
grant execute on function public.public_ranking_metric_value(text, jsonb) to service_role;
