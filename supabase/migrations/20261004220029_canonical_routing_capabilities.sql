-- Routing capability IDs are operations, not public endpoint spellings.
-- Keep historical aliases intact; current records and future writes use one ID.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.canonical_routing_capability_id(p_id text)
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
      'tool.call','structured.output','voice.design',
      -- These existing operations are ambiguous and are NOT synonyms for speech.
      'audio','audio.generate'
    ]) then lower(trim(p_id)) else null end
  end;
$$;
revoke all on function public.canonical_routing_capability_id(text) from public;
grant execute on function public.canonical_routing_capability_id(text) to anon, authenticated, service_role;

-- Abort rather than silently merging simultaneously current configurations.
do $$
begin
  if exists (
    select 1 from public.v2_route_capabilities old
    join public.v2_route_capabilities target on target.provider_model_id = old.provider_model_id
      and target.capability_id = public.canonical_routing_capability_id(old.capability_id)
    where old.capability_id <> target.capability_id
      and (old.effective_to is null or old.effective_to > now())
      and (target.effective_to is null or target.effective_to > now())
  ) then raise exception 'Conflicting current capability aliases require manual review'; end if;
  if exists (
    select 1 from public.v2_route_capabilities old
    where old.capability_id <> public.canonical_routing_capability_id(old.capability_id)
      and (old.effective_to is null or old.effective_to > now())
      and (exists (select 1 from public.v2_execution_plans p
        where p.provider_model_id=old.provider_model_id and p.capability_id=old.capability_id)
        or exists (select 1 from public.v2_route_parameter_support p
        where p.provider_model_id=old.provider_model_id and p.capability_id=old.capability_id))
  ) then raise exception 'Capability aliases with dependent routing records require manual migration'; end if;
end $$;

-- Copy current aliases into the canonical key, retaining status, windows,
-- parameters and limits. Replaced historical values remain in row history.
insert into public.v2_route_capabilities (
  provider_model_id,capability_id,status,max_input_tokens,max_output_tokens,
  params,effective_from,effective_to,metadata
)
select provider_model_id,public.canonical_routing_capability_id(capability_id),
  status,max_input_tokens,max_output_tokens,params,effective_from,effective_to,metadata
from public.v2_route_capabilities
where capability_id <> public.canonical_routing_capability_id(capability_id)
  and (effective_to is null or effective_to > now())
on conflict (provider_model_id,capability_id) do update set
  status=excluded.status,max_input_tokens=excluded.max_input_tokens,
  max_output_tokens=excluded.max_output_tokens,params=excluded.params,
  effective_from=excluded.effective_from,effective_to=excluded.effective_to,
  metadata=excluded.metadata;

update public.v2_route_capabilities
set status='disabled',effective_to=greatest(now(),effective_from + interval '1 microsecond')
where capability_id <> public.canonical_routing_capability_id(capability_id)
  and (effective_to is null or effective_to > now());

create function public.enforce_canonical_routing_capability()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare canonical text;
begin
  -- Existing historical aliases are read-only records of the old identity.
  if tg_table_name = 'v2_route_capabilities' and tg_op = 'UPDATE' then
    if old.status = 'disabled' and old.effective_to is not null
      and old.effective_to <= now() and new.capability_id = old.capability_id
      and new.status = old.status and new.effective_to = old.effective_to
    then return new; end if;
  end if;
  canonical := public.canonical_routing_capability_id(new.capability_id);
  if canonical is null then
    raise exception 'Unsupported routing capability: %', new.capability_id using errcode='23514';
  end if;
  new.capability_id := canonical;
  return new;
end $$;
revoke all on function public.enforce_canonical_routing_capability() from public, anon, authenticated;
grant execute on function public.enforce_canonical_routing_capability() to service_role;

-- Apply the same vocabulary to every routing/control-plane capability field.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'v2_route_capabilities','v2_capability_adapters','v2_capability_constraints',
    'v2_capability_evidence','v2_capability_parameters','v2_execution_plans',
    'v2_provider_capability_adapters','v2_provider_endpoints','v2_route_parameter_support'
  ] loop
    execute format('create trigger canonical_routing_capability before insert or update on public.%I for each row execute function public.enforce_canonical_routing_capability()',table_name);
    if table_name = 'v2_route_capabilities' then
      execute format('alter table public.%I add constraint canonical_capability_id check ((public.canonical_routing_capability_id(capability_id) is not null and capability_id = public.canonical_routing_capability_id(capability_id)) or (status = ''disabled'' and effective_to is not null and public.canonical_routing_capability_id(capability_id) is not null))',table_name);
    else
      execute format('alter table public.%I add constraint canonical_capability_id check (public.canonical_routing_capability_id(capability_id) is not null and capability_id = public.canonical_routing_capability_id(capability_id))',table_name);
    end if;
  end loop;
end $$;
