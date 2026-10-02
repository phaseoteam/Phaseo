-- Route metadata also carries model lifecycle availability. Only a geographic
-- rule may override the provider's geographic availability policy.
do $migration$
declare
  definition text;
  old_projection text := $old$coalesce((select route.metadata -> 'availability' from public.v2_model_provider_routes route where route.provider_model_id = m.provider_api_model_id), p.metadata -> 'availability')$old$;
  new_projection text := $new$coalesce((select route.metadata -> 'availability' from public.v2_model_provider_routes route where route.provider_model_id = m.provider_api_model_id and jsonb_typeof(route.metadata -> 'availability') = 'object' and (route.metadata -> 'availability' ->> 'mode') in ('allowlist', 'blocklist') and jsonb_typeof(route.metadata -> 'availability' -> 'countries') = 'array'), p.metadata -> 'availability')$new$;
begin
  select pg_get_functiondef(
    'public.gateway_fetch_request_context_without_workspace_budget(uuid,text,text,uuid)'::regprocedure
  ) into definition;

  if position(new_projection in definition) > 0 then
    return;
  end if;

  if (length(definition) - length(replace(definition, old_projection, '')))
       / length(old_projection) <> 1 then
    raise exception 'Unexpected gateway geographic availability projection';
  end if;

  execute replace(definition, old_projection, new_projection);
end
$migration$;

-- Text requests normally use the bundled public catalog instead of the
-- legacy provider rows above. Apply the same policy selection there.
do $migration$
declare
  definition text;
  old_projection text := $old$coalesce(r.metadata->'availability',p.metadata->'availability')$old$;
  new_projection text := $new$coalesce(case when jsonb_typeof(r.metadata->'availability') = 'object' and (r.metadata->'availability'->>'mode') in ('allowlist','blocklist') and jsonb_typeof(r.metadata->'availability'->'countries') = 'array' then r.metadata->'availability' end,p.metadata->'availability')$new$;
begin
  select pg_get_functiondef(
    'public.gateway_fetch_public_catalog(text,text[])'::regprocedure
  ) into definition;

  if position(new_projection in definition) > 0 then
    return;
  end if;

  if (length(definition) - length(replace(definition, old_projection, '')))
       / length(old_projection) <> 1 then
    raise exception 'Unexpected bundled catalog geographic availability projection';
  end if;

  execute replace(definition, old_projection, new_projection);
end
$migration$;
