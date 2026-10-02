-- Expose variant availability without changing route-wide routing controls or grants.
do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)'::regprocedure
  ) into definition;
  if position('variant.metadata as variant_metadata' in definition) > 0 then return; end if;
  patched := replace(definition,
    'variant.status, variant.routing_enabled',
    'variant.status, variant.routing_enabled, variant.metadata as variant_metadata');
  patched := replace(patched,
    'route.provider_availability_status,',
    'coalesce(nullif(variant.variant_metadata->>''availability_status'', ''''), route.provider_availability_status::text) as provider_availability_status,');
  if patched = definition or position('variant.variant_metadata' in patched) = 0 then
    raise exception 'Unexpected model pricing variant projection';
  end if;
  execute patched;
end
$migration$;

