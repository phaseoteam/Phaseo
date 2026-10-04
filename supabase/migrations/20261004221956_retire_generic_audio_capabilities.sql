-- Apply after the reviewed catalog repair has retired current generic rows.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin
  if exists (select 1 from public.v2_route_capabilities
    where capability_id in ('audio','audio.generate')
      and (status <> 'disabled' or effective_to is null or effective_to > now()))
  then raise exception 'Review and retire current generic audio capabilities before restricting writes'; end if;
end $$;

-- Drop and revalidate constraints around the immutable vocabulary change.
do $$ declare t text; begin
  foreach t in array array[
    'v2_route_capabilities','v2_capability_adapters','v2_capability_constraints',
    'v2_capability_evidence','v2_capability_parameters','v2_execution_plans',
    'v2_provider_capability_adapters','v2_provider_endpoints','v2_route_parameter_support'
  ] loop execute format('alter table public.%I drop constraint canonical_capability_id',t); end loop;
end $$;

create or replace function public.canonical_routing_capability_id(p_id text)
returns text language sql immutable strict parallel safe
set search_path = pg_catalog
as $$
  select case lower(trim(p_id))
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
    else case when lower(trim(p_id)) = any(array[
      'text.generate','text.embed','text.rerank','text.moderate',
      'image.generate','image.edit','image.vary','video.generate','video.edit',
      'audio.speech','audio.transcription','audio.translations','audio.realtime',
      'music.generate','decisions.make','ocr','parse','batch',
      'tool.call','structured.output','voice.design'
    ]) then lower(trim(p_id)) else null end
  end;
$$;

do $$ declare t text; begin
  foreach t in array array[
    'v2_route_capabilities','v2_capability_adapters','v2_capability_constraints',
    'v2_capability_evidence','v2_capability_parameters','v2_execution_plans',
    'v2_provider_capability_adapters','v2_provider_endpoints','v2_route_parameter_support'
  ] loop
    if t = 'v2_route_capabilities' then
      execute format('alter table public.%I add constraint canonical_capability_id check ((public.canonical_routing_capability_id(capability_id) is not null and capability_id = public.canonical_routing_capability_id(capability_id)) or (status = ''disabled'' and effective_to is not null and (public.canonical_routing_capability_id(capability_id) is not null or capability_id in (''audio'',''audio.generate''))))',t);
    else
      execute format('alter table public.%I add constraint canonical_capability_id check (public.canonical_routing_capability_id(capability_id) is not null and capability_id = public.canonical_routing_capability_id(capability_id))',t);
    end if;
  end loop;
end $$;
