-- Standalone concurrent build: gateway usage ingestion must remain writable.
CREATE INDEX CONCURRENTLY v2_request_usage_public_tokens_idx ON public.v2_request_usage USING btree (request_event_id, meter_key) INCLUDE (quantity)
  WHERE (meter_key = ANY (ARRAY['input_tokens'::text, 'output_tokens'::text, 'prompt_tokens'::text, 'input_text_tokens'::text, 'output_text_tokens'::text, 'input_image_tokens'::text, 'output_image_tokens'::text, 'input_audio_tokens'::text, 'output_audio_tokens'::text, 'input_video_tokens'::text, 'output_video_tokens'::text]));
