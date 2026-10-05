create or replace function public.canonical_routing_capability_id(p_id text)
returns text language sql immutable strict parallel safe
set search_path = pg_catalog
as $$
  select case replace(lower(trim(p_id)), '/', '.')
    when 'image.generations' then 'image.generate'
    when 'image.edits' then 'image.edit'
    when 'decision.make' then 'decisions.make'
    when 'systemone' then 'decisions.make'
    when 'system.one' then 'decisions.make'
    when 'typed.decisions' then 'decisions.make'
    when 'audio.translation' then 'audio.translations'
    when 'batch.create' then 'batch'
    when 'document.parse' then 'parse'
    when 'videos' then 'video.generate'
    when 'audio.transcribe' then 'audio.transcription'
    when 'audio.transcriptions' then 'audio.transcription'
    when 'embeddings' then 'text.embed'
    when 'rerank' then 'text.rerank'
    when 'rerank.create' then 'text.rerank'
    when 'images.generations' then 'image.generate'
    when 'images.generate' then 'image.generate'
    when 'images.edits' then 'image.edit'
    when 'realtime' then 'audio.realtime'
    when 'chat.completions' then 'text.generate'
    when 'responses' then 'text.generate'
    when 'messages' then 'text.generate'
    when 'chat.generate' then 'text.generate'
    when 'moderations' then 'text.moderate'
    when 'moderations.create' then 'text.moderate'
    when 'moderation' then 'text.moderate'
    when 'audio.translate' then 'audio.translations'
    when 'video.generation' then 'video.generate'
    when 'video.generations' then 'video.generate'
    else case when replace(lower(trim(p_id)), '/', '.') = any(array[
      'text.generate','text.embed','text.rerank','text.moderate',
      'image.generate','image.edit','image.vary','video.generate','video.edit',
      'audio.speech','audio.transcription','audio.translations','audio.realtime',
      'music.generate','decisions.make','ocr','parse','batch',
      'tool.call','structured.output','voice.design'
    ]) then replace(lower(trim(p_id)), '/', '.') else null end
  end;
$$;

GRANT EXECUTE ON FUNCTION "public"."canonical_routing_capability_id"(text) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."canonical_routing_capability_id"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."canonical_routing_capability_id"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."canonical_routing_capability_id"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."canonical_routing_capability_id"(text) TO "postgres";
