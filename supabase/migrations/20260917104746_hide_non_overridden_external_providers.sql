-- phaseo:allow-production-history-backfill reason: Restore SQL already applied as production migration 20260917104746 so deployment history matches the repository.
-- External providers are catalogue metadata by default. They may appear in
-- public provider/model projections only when the provider row explicitly
-- opts into routing with both flags enabled.

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.get_public_provider_index()'::regprocedure
  ) into definition;

  if definition is null then
    raise exception 'get_public_provider_index is missing';
  end if;

  definition := replace(definition, chr(13) || chr(10), chr(10));
  if position('provider.status <> ''external'' or (provider.routable and provider.routing_enabled)' in definition) = 0 then
    patched := replace(
      definition,
      'where lower(provider.provider_slug) not in (''inception'', ''inceptron'', ''nextbit'')',
      'where lower(provider.provider_slug) not in (''inception'', ''inceptron'', ''nextbit'')
      and (provider.status <> ''external'' or (provider.routable and provider.routing_enabled))'
    );

    if patched = definition
      or position('provider.status <> ''external'' or (provider.routable and provider.routing_enabled)' in patched) = 0
    then
      raise exception 'get_public_provider_index has an unexpected definition';
    end if;

    execute patched;
  end if;
end
$migration$;

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)'::regprocedure
  ) into definition;

  if definition is null then
    raise exception 'get_v2_model_pricing_without_stealth_redaction is missing';
  end if;

  definition := replace(definition, chr(13) || chr(10), chr(10));
  if position('provider.status <> ''external'' or (provider.routable and provider.routing_enabled)' in definition) = 0 then
    patched := replace(
      definition,
      '      and provider.status <> ''disabled''',
      '      and provider.status <> ''disabled''
      and (provider.status <> ''external'' or (provider.routable and provider.routing_enabled))'
    );

    if patched = definition
      or position('provider.status <> ''external'' or (provider.routable and provider.routing_enabled)' in patched) = 0
    then
      raise exception 'get_v2_model_pricing_without_stealth_redaction has an unexpected definition';
    end if;

    execute patched;
  end if;
end
$migration$;

comment on function public.get_public_provider_index() is
  'Returns provider coverage for public provider pages; external providers require an explicit provider-level routing override to appear.';

comment on function public.get_v2_model_pricing_without_stealth_redaction(text, text, text) is
  'Returns public model pricing/provider rows while excluding external providers unless the provider-level routing override is enabled.';

notify pgrst, 'reload schema';
