-- Include the provider-level external routing override in the catalog snapshot
-- used by the gateway context bundle. Without this field, an external provider
-- can be enabled in the database but is treated as non-overridden by bundled
-- gateway context.

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.gateway_fetch_public_catalog(text,text[])'::regprocedure
  ) into definition;

  if definition is null then
    raise exception 'gateway_fetch_public_catalog is missing';
  end if;

  definition := replace(definition, chr(13) || chr(10), chr(10));
  if position('provider_slug,status,routing_enabled,routable,credential_mode' in definition) = 0 then
    patched := replace(
      definition,
      'select provider_slug,status,routing_enabled,credential_mode,provider_family_slug',
      'select provider_slug,status,routing_enabled,routable,credential_mode,provider_family_slug'
    );

    if patched = definition
      or position('provider_slug,status,routing_enabled,routable,credential_mode' in patched) = 0
    then
      raise exception 'gateway_fetch_public_catalog has an unexpected definition';
    end if;

    execute patched;
  end if;
end
$migration$;

comment on function public.gateway_fetch_public_catalog(text,text[]) is
  'Returns public catalog snapshots including provider-level routing override metadata for gateway context enrichment.';

notify pgrst, 'reload schema';
