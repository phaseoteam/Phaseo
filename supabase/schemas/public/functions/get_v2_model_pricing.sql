CREATE OR REPLACE FUNCTION public.get_v2_model_pricing (
  p_model_slug   text,
  p_region       text DEFAULT NULL::text,
  p_service_tier text DEFAULT NULL::text
)
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
  with payloads as (
    select pricing.payload
    from public.get_v2_model_pricing_without_stealth_redaction(
      p_model_slug,
      p_region,
      p_service_tier
    ) as pricing(payload)
  ), marked as (
    select
      payloads.payload,
      exists (
        select 1
        from jsonb_array_elements(
          coalesce(payloads.payload->'provider_models', '[]'::jsonb)
        ) as provider_model(item)
        join public.v2_model_provider_routes route
          on route.provider_model_id = provider_model.item->>'id'
        where route.is_stealth = true
      ) as contains_stealth
    from payloads
  )
  select case when marked.contains_stealth then
    marked.payload || jsonb_build_object(
      'provider', (marked.payload->'provider') || jsonb_build_object(
        'api_provider_id', 'stealth',
        'api_provider_name', 'stealth',
        'provider_family_id', 'stealth',
        'offer_label', null,
        'offer_scope', null,
        'country_code', null,
        'colour', null,
        'link', null,
        'residency_mode', null,
        'default_execution_regions', null,
        'default_data_regions', null,
        'zero_data_retention', null,
        'residency_source_url', null,
        'residency_notes', null,
        'prompt_training_policy', null,
        'prompt_training_notes', null,
        'prompt_training_source_url', null,
        'data_policy_tier', null,
        'data_policy_confidence', null,
        'data_policy_contract_mode', null,
        'data_policy_contract_notes', null,
        'service_tier_data_policies', null,
        'user_identifier_policy', null,
        'user_identifier_notes', null,
        'privacy_policy_url', null,
        'terms_of_service_url', null
      ),
      'provider_models', coalesce((
        select jsonb_agg(case when route.is_stealth = true then
          provider_model.item || jsonb_build_object(
            'id', 'stealth:' || coalesce(provider_model.item->>'model_id', p_model_slug),
            'api_provider_id', 'stealth',
            'provider_model_slug', coalesce(provider_model.item->>'model_id', p_model_slug),
            'execution_region', null,
            'data_region', null,
            'data_policy', '{}'::jsonb
          )
          else provider_model.item end)
        from jsonb_array_elements(
          coalesce(marked.payload->'provider_models', '[]'::jsonb)
        ) as provider_model(item)
        left join public.v2_model_provider_routes route
          on route.provider_model_id = provider_model.item->>'id'
      ), '[]'::jsonb),
      'pricing_rules', coalesce((
        select jsonb_agg(case when route.is_stealth = true then
          pricing_rule.item || jsonb_build_object(
            'model_key', regexp_replace(
              coalesce(pricing_rule.item->>'model_key', ''),
              '^[^:]+:',
              'stealth:'
            )
          )
          else pricing_rule.item end
        )
        from jsonb_array_elements(
          coalesce(marked.payload->'pricing_rules', '[]'::jsonb)
        ) as pricing_rule(item)
        left join public.v2_pricing_skus sku
          on sku.sku_id::text = pricing_rule.item->>'id'
        left join public.v2_model_provider_routes route
          on route.provider_model_id = sku.provider_model_id
      ), '[]'::jsonb)
    )
  else marked.payload end
  from marked;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_pricing"(text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_pricing"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_pricing"(text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_pricing"(text, text, text) FROM PUBLIC, "anon", "authenticated";
