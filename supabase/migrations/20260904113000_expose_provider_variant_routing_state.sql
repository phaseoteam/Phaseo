-- The public pricing projection reads variant status and routing state when
-- determining gateway availability. Expose both fields from the variant
-- subquery so disabled variants remain visible without becoming routable.

do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)'::regprocedure
  ) into definition;

  if position('variant.status, variant.routing_enabled' in definition) = 0 then
    patched := replace(
      definition,
      'select variant.variant_id, variant.provider_model_id, variant.service_tier_slug,
      variant.execution_region, variant.data_region',
      'select variant.variant_id, variant.provider_model_id, variant.service_tier_slug,
      variant.execution_region, variant.data_region,
      variant.status, variant.routing_enabled'
    );

    if patched = definition
      or position('variant.status, variant.routing_enabled' in patched) = 0
    then
      raise exception 'get_v2_model_pricing_without_stealth_redaction has an unexpected definition';
    end if;

    execute patched;
  end if;
end;
$$;

revoke all on function public.get_v2_model_pricing_without_stealth_redaction(text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_v2_model_pricing_without_stealth_redaction(text, text, text)
  to service_role;
