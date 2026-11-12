CREATE OR REPLACE FUNCTION public.get_public_free_router_overview()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with active_free_rules as (
    select distinct
      split_part(rule.model_key, ':', 1) as provider_id,
      regexp_replace(regexp_replace(rule.model_key, '^[^:]+:', ''), ':[^:]+$', '') as api_model_id
    from private.v2_rpc_pricing_compat rule
    where rule.model_key ilike '%:free:%'
      and now() >= coalesce(rule.effective_from, '-infinity'::timestamptz)
      and now() < coalesce(rule.effective_to, 'infinity'::timestamptz)
  ),
  eligible as (
    select
      coalesce(nullif(provider_model.model_id, ''), provider_model.api_model_id) as model_id,
      provider_model.api_model_id,
      provider_model.provider_id,
      provider_model.input_modalities,
      provider_model.output_modalities
    from private.v2_rpc_routes_compat provider_model
    join active_free_rules rule
      on rule.provider_id = provider_model.provider_id
      and rule.api_model_id = provider_model.api_model_id
    where provider_model.is_active_gateway = true
      and now() >= coalesce(provider_model.effective_from, '-infinity'::timestamptz)
      and now() < coalesce(provider_model.effective_to, 'infinity'::timestamptz)
  ),
  eligible_models as (
    select
      eligible.model_id,
      case when count(distinct eligible.api_model_id) = 1 then min(eligible.api_model_id) else eligible.model_id end as display_api_model_id,
      count(distinct eligible.provider_id)::bigint as provider_count,
      coalesce((select array_agg(distinct value order by value) from eligible input_row cross join lateral unnest(coalesce(input_row.input_modalities, array[]::text[])) value where input_row.model_id = eligible.model_id and btrim(value) <> ''), array[]::text[]) as input_modalities,
      coalesce((select array_agg(distinct value order by value) from eligible output_row cross join lateral unnest(coalesce(output_row.output_modalities, array[]::text[])) value where output_row.model_id = eligible.model_id and btrim(value) <> ''), array[]::text[]) as output_modalities
    from eligible
    group by eligible.model_id
  ),
  usage as (
    select
      request.routed_model_id as model_id,
      count(*)::bigint as requests_30d,
      coalesce(sum(greatest(coalesce(request.cost_nanos, 0), 0)), 0)::numeric as total_cost_nanos_30d,
      max(request.created_at) as last_routed_at
    from private.v2_rpc_gateway_requests_compat request
    join eligible_models eligible on eligible.model_id = request.routed_model_id
    where request.requested_model_id = 'phaseo/free'
      and request.created_at >= now() - interval '30 days'
    group by request.routed_model_id
  ),
  model_rows as (
    select
      eligible.model_id,
      eligible.provider_count,
      coalesce(usage.requests_30d, 0)::bigint as requests_30d,
      coalesce(usage.total_cost_nanos_30d, 0)::numeric as total_cost_nanos_30d,
      jsonb_build_object(
        'modelId', eligible.model_id,
        'displayApiModelId', eligible.display_api_model_id,
        'name', coalesce(nullif(model.name, ''), eligible.model_id),
        'organisationId', coalesce(model.organisation_id, ''),
        'organisationName', coalesce(nullif(organisation.name, ''), model.organisation_id, 'Unknown'),
        'providerCount', eligible.provider_count,
        'inputModalities', case when cardinality(eligible.input_modalities) > 0 then eligible.input_modalities else coalesce(regexp_split_to_array(nullif(btrim(model.input_types), ''), '\\s*,\\s*'), array[]::text[]) end,
        'outputModalities', case when cardinality(eligible.output_modalities) > 0 then eligible.output_modalities else coalesce(regexp_split_to_array(nullif(btrim(model.output_types), ''), '\\s*,\\s*'), array[]::text[]) end,
        'usage', jsonb_build_object(
          'requests30d', coalesce(usage.requests_30d, 0),
          'totalCostNanos30d', coalesce(usage.total_cost_nanos_30d, 0),
          'lastRoutedAt', usage.last_routed_at
        )
      ) as payload
    from eligible_models eligible
    join private.v2_rpc_models_compat model on model.model_id = eligible.model_id and model.hidden = false
    left join private.v2_rpc_labs_compat organisation on organisation.organisation_id = model.organisation_id
    left join usage on usage.model_id = eligible.model_id
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'eligibleModels', count(*),
      'eligibleProviders', (select count(distinct provider_id) from eligible),
      'routedRequests30d', coalesce(sum(requests_30d), 0),
      'totalCostNanos30d', coalesce(sum(total_cost_nanos_30d), 0)
    ),
    'models', coalesce(jsonb_agg(payload order by requests_30d desc, model_id), '[]'::jsonb)
  )
  from model_rows;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_free_router_overview"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_free_router_overview"() TO "service_role";

COMMENT ON FUNCTION "public"."get_public_free_router_overview"() IS 'Builds the free-router eligibility, modality, and 30-day usage summary in PostgreSQL so /models does not scan gateway requests in the Worker.';

REVOKE ALL ON FUNCTION "public"."get_public_free_router_overview"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_free_router_overview"() TO "postgres";
