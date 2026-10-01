-- Provider pages need to distinguish "known upstream availability" from
-- "currently routable through Phaseo". Keep public disabled routes in the
-- pricing projection; the existing is_active_gateway expression remains false
-- for those rows, so this does not enable routing.

do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)'::regprocedure
  ) into definition;

  patched := replace(
    definition,
    'where variant.status <> ''disabled''
      and (p_region is null',
    'where (p_region is null'
  );
  patched := replace(
    patched,
    'and route.status <> ''disabled''
      and provider.status <> ''disabled''',
    'and provider.status <> ''disabled'''
  );
  patched := replace(
    patched,
    'variant.data_region,
      capability.capability_id,',
    'variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      capability.capability_id,'
  );
  patched := replace(
    patched,
    'and model.route_routing_enabled
          and model.provider_routing_enabled',
    'and model.route_routing_enabled
          and model.variant_status in (''active'', ''degraded'')
          and model.variant_routing_enabled
          and model.provider_routing_enabled'
  );

  if patched = definition
    or position('where variant.status <> ''disabled''' in patched) > 0
    or position('and route.status <> ''disabled''' in patched) > 0
    or position('variant.status as variant_status' in patched) = 0
    or position('and model.variant_routing_enabled' in patched) = 0
  then
    raise exception 'get_v2_model_pricing_without_stealth_redaction has an unexpected definition';
  end if;

  execute patched;
end;
$$;

revoke all on function public.get_v2_model_pricing_without_stealth_redaction(text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_v2_model_pricing_without_stealth_redaction(text, text, text)
  to service_role;
