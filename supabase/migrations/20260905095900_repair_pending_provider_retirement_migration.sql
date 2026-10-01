-- Repair the pricing projection before the immutable provider-retirement
-- migration at 10:00. Production has not applied that migration because its
-- patch expected a trailing comma after the final data_region JSON field.
-- phaseo:allow-production-history-backfill reason: Repair the pending provider-retirement migration before immutable production history applies.
do $$
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

  if position('route.effective_from' in definition) = 0
    or position('model.provider_availability_status = ''deprecated''' in definition) = 0
    or position('''effective_to'', model.effective_to' in definition) = 0
  then
    patched := replace(
      definition,
      'variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      capability.capability_id,',
      'variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      route.effective_from,
      route.effective_to,
      capability.capability_id,'
    );
    patched := replace(
      patched,
      'and model.provider_availability_status in (''available'', ''preview'', ''limited_access''),',
      'and (
          model.provider_availability_status in (''available'', ''preview'', ''limited_access'')
          or (
            model.provider_availability_status = ''deprecated''
            and model.effective_to is not null
            and model.effective_to > now()
          )
        ),'
    );
    patched := replace(
      patched,
      '        ''data_region'', model.data_region',
      '        ''data_region'', model.data_region,
        ''effective_from'', model.effective_from,
        ''effective_to'', model.effective_to'
    );

    if patched = definition
      or position('route.effective_from' in patched) = 0
      or position('model.provider_availability_status = ''deprecated''' in patched) = 0
      or position('''effective_to'', model.effective_to' in patched) = 0
    then
      raise exception 'get_v2_model_pricing_without_stealth_redaction has an unexpected definition';
    end if;

    execute patched;
  end if;
end;
$$;
