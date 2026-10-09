CREATE OR REPLACE FUNCTION public.get_v2_model_pricing_without_stealth_redaction (
  p_model_slug   text,
  p_region       text DEFAULT NULL::text,
  p_service_tier text DEFAULT NULL::text
)
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with eligible_variants as (
    select variant.variant_id, variant.provider_model_id, variant.service_tier_slug,
      variant.execution_region, variant.data_region,
      variant.status, variant.routing_enabled, variant.metadata as variant_metadata
    from public.v2_route_variants variant
    where (p_region is null or lower(p_region) = lower(coalesce(variant.execution_region, ''))
        or lower(p_region) = lower(coalesce(variant.data_region, '')))
      and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
  ),
  provider_models as (
    select
      route.provider_slug,
      provider.name as provider_name,
      provider.status as provider_status,
      provider.routing_enabled as provider_routing_enabled,
      route.provider_model_id,
      route.model_slug,
      route.provider_model_slug,
      route.status as route_status,
      route.routing_enabled as route_routing_enabled,
      coalesce(nullif(variant.variant_metadata->>'availability_status', ''), route.provider_availability_status::text) as provider_availability_status,
      route.phaseo_status,
      route.access_scope,
      route.input_modalities,
      route.output_modalities,
      route.context_length,
      route.max_output_tokens,
      variant.variant_id,
      variant.service_tier_slug,
      variant.execution_region,
      variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      route.effective_from,
      route.effective_to,
      capability.capability_id,
      capability.status as capability_status,
      capability.params,
      capability.metadata->'data_policy' as data_policy,
      capability.max_input_tokens,
      capability.max_output_tokens as capability_max_output_tokens
    from public.v2_model_provider_routes route
    join public.v2_providers provider on provider.provider_slug = route.provider_slug
    join eligible_variants variant on variant.provider_model_id = route.provider_model_id
    left join public.v2_route_capabilities capability on capability.provider_model_id = route.provider_model_id
    where route.model_slug = lower(trim(p_model_slug))
      and provider.status <> 'disabled'
      and (
        provider.status <> 'external'
        or (
          route.routing_enabled = true
          and coalesce(route.metadata->>'external_routing_override', 'false') = 'true'
        )
      )
      and route.access_scope = 'public'
      and coalesce(capability.status, 'active') <> 'internal_testing'
  ),
  grouped as (
    select
      model.provider_slug,
      max(model.provider_name) as provider_name,
      max(model.provider_status) as provider_status,
      bool_or(model.provider_routing_enabled) as provider_routing_enabled,
      jsonb_agg(distinct jsonb_build_object(
        'id', model.provider_model_id,
        'api_provider_id', model.provider_slug,
        'provider_model_slug', model.provider_model_slug,
        'model_id', model.model_slug,
        'endpoint', coalesce(model.capability_id, 'unmapped'),
        'capability_status', model.capability_status,
        'routing_status', model.route_status,
        'is_active_gateway', model.route_status in ('active', 'degraded')
          and model.route_routing_enabled
          and model.variant_status in ('active', 'degraded')
          and model.variant_routing_enabled
          and model.provider_routing_enabled
          and model.phaseo_status = 'enabled'
          and (
          model.provider_availability_status in ('available', 'preview', 'limited_access')
          or (
            model.provider_availability_status = 'deprecated'
            and model.effective_to is not null
            and model.effective_to > now()
          )
        ),
        'provider_availability_status', model.provider_availability_status,
        'phaseo_status', model.phaseo_status,
        'access_scope', model.access_scope,
        'input_modalities', array_to_string(model.input_modalities, ','),
        'output_modalities', array_to_string(model.output_modalities, ','),
        'context_length', model.context_length,
        'max_input_tokens', model.max_input_tokens,
        'max_output_tokens', coalesce(model.capability_max_output_tokens, model.max_output_tokens),
        'params', model.params,
        'data_policy', coalesce(model.data_policy, '{}'::jsonb),
        'service_tier', model.service_tier_slug,
        'execution_region', model.execution_region,
        'data_region', model.data_region,
        'effective_from', model.effective_from,
        'effective_to', model.effective_to
      )) as provider_models,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sku.sku_id,
          'model_key', model.provider_slug || ':' || route.model_slug || ':' || sku.operation,
          'capability_id', sku.operation,
          'pricing_plan', sku.service_tier_slug,
          'meter', meter.meter_key,
          'rule_id', meter.sku_meter_id,
          'modality', meter.modality,
          'direction', meter.direction,
          'display_label', meter.display_label,
          'display_unit', meter.display_unit,
          'unit', meter.unit,
          'unit_size', meter.unit_quantity,
          'price_per_unit', meter.price_nanos / 1000000000.0,
          'included_quantity', coalesce(nullif(meter.metadata->>'included_quantity', '')::numeric, nullif(sku.metadata->>'included_quantity', '')::numeric, 0),
          'currency', sku.currency,
          'priority', coalesce(nullif(meter.metadata->>'priority', '')::integer, nullif(sku.metadata->>'priority', '')::integer, meter.meter_order, 100),
          'effective_from', sku.effective_from,
          'effective_to', sku.effective_to,
          'note', sku.description,
          'match', coalesce(sku.metadata->'match', '[]'::jsonb),
          'billing_timestamp_basis', coalesce(
            sku.metadata->>'billing_timestamp_basis',
            meter.metadata->>'billing_timestamp_basis',
            'request_start'
          ),
          'time_windows', coalesce(
            sku.metadata->'time_windows',
            meter.metadata->'time_windows',
            '[]'::jsonb
          )
        ) order by meter.meter_order, meter.meter_key)
        from public.v2_pricing_skus sku
        join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id and meter.billable
        join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id
        where route.model_slug = lower(trim(p_model_slug))
          and route.access_scope = 'public'
          and sku.provider_model_id in (
            select provider_model_id
            from provider_models
            where provider_slug = model.provider_slug
          )
          and sku.status <> 'disabled'
          and (
            sku.effective_from <= now()
            or (
              sku.status = 'active'
              and exists (
                select 1 from public.v2_pricing_skus current_sku
                where current_sku.provider_model_id = sku.provider_model_id
                  and current_sku.operation = sku.operation
                  and current_sku.service_tier_slug is not distinct from sku.service_tier_slug
                  and current_sku.status <> 'disabled'
                  and current_sku.effective_from <= now()
                  and (current_sku.effective_to is null or current_sku.effective_to > now())
              )
            )
          )
          and (sku.effective_to is null or sku.effective_to > now())
          and (p_service_tier is null or sku.service_tier_slug = lower(p_service_tier))
      ), '[]'::jsonb) as pricing_rules
    from provider_models model
    group by model.provider_slug
  )
  select jsonb_build_object(
    'provider', jsonb_build_object(
      'api_provider_id', grouped.provider_slug,
      'api_provider_name', grouped.provider_name,
      'provider_family_id', policy.provider_family_slug,
      'offer_label', policy.offer_label,
      'offer_scope', policy.offer_scope,
      'country_code', policy.country_code,
      'colour', policy.metadata->>'colour',
      'link', coalesce(policy.metadata->>'link', policy.base_url),
      'status', grouped.provider_status,
      'routing_status', case when grouped.provider_routing_enabled then 'active' else 'disabled' end,
      'residency_mode', policy.residency_mode,
      'default_execution_regions', policy.default_execution_regions,
      'default_data_regions', policy.default_data_regions,
      'zero_data_retention', policy.zero_data_retention,
      'residency_source_url', policy.metadata->>'residency_source_url',
      'residency_notes', policy.metadata->>'residency_notes',
      'prompt_training_policy', policy.prompt_training_policy,
      'prompt_training_notes', policy.metadata->>'prompt_training_notes',
      'prompt_training_source_url', policy.metadata->>'prompt_training_source_url',
      'data_policy_tier', policy.data_policy_tier,
      'data_policy_confidence', policy.data_policy_confidence,
      'data_policy_contract_mode', policy.data_policy_contract_mode,
      'data_policy_contract_notes', policy.metadata->>'data_policy_contract_notes',
      'user_identifier_policy', policy.metadata->>'user_identifier_policy',
      'user_identifier_notes', policy.metadata->>'user_identifier_notes',
      'privacy_policy_url', policy.metadata->>'privacy_policy_url',
      'service_tier_data_policies', coalesce(policy.metadata->'service_tier_data_policies', '{}'::jsonb),
      'terms_of_service_url', policy.metadata->>'terms_of_service_url'
    ),
    'provider_models', grouped.provider_models,
    'pricing_rules', grouped.pricing_rules
  )
  from grouped
  left join public.v2_providers policy on policy.provider_slug = grouped.provider_slug
  order by grouped.provider_name;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_pricing_without_stealth_redaction"(text, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_pricing_without_stealth_redaction"(text, text, text) IS 'Returns public model pricing/provider rows while excluding external providers unless the provider-level routing override is enabled.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_pricing_without_stealth_redaction"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_pricing_without_stealth_redaction"(text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_pricing_without_stealth_redaction"(text, text, text) FROM PUBLIC, "anon", "authenticated";
