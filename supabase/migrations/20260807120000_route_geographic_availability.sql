-- Project provider-route geographic availability metadata into gateway routing
-- context. Route policies override the provider's default policy.
update public.v2_model_provider_routes as route
set metadata = jsonb_set(
  coalesce(route.metadata, '{}'::jsonb),
  '{availability}',
  provider.metadata -> 'availability',
  true
)
from public.v2_providers as provider
where provider.provider_slug = route.provider_slug
  and route.metadata -> 'availability' is null
  and provider.metadata -> 'availability' is not null;

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.gateway_fetch_request_context(uuid,text,text,uuid)'::regprocedure
  ) into definition;

  patched := replace(
    definition,
    'm.provider_model_slug,',
    'm.provider_model_slug, coalesce((select route.metadata -> ''availability'' from public.v2_model_provider_routes route where route.provider_model_id = m.provider_api_model_id), p.metadata -> ''availability'') as availability,'
  );
  patched := replace(
    patched,
    '''provider_model_slug'', pr.provider_model_slug,',
    '''provider_model_slug'', pr.provider_model_slug, ''availability'', pr.availability,'
  );

  if patched = definition
     or position('route.provider_model_id = m.provider_api_model_id' in patched) = 0
     or position('p.metadata -> ''availability''' in patched) = 0
     or position('''availability'', pr.availability' in patched) = 0 then
    raise exception 'could not add route geographic availability to gateway context';
  end if;

  execute patched;
end
$migration$;

comment on function public.gateway_fetch_request_context(uuid, text, text, uuid)
  is 'V2 gateway request context with route-overridable provider geographic availability metadata.';
