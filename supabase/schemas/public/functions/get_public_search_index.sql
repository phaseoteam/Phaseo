CREATE OR REPLACE FUNCTION public.get_public_search_index()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with visible_models as (
    select
      model.model_id,
      model.name,
      model.organisation_id,
      organisation.name as organisation_name,
      coalesce(model.release_date, model.announcement_date) as primary_date
    from private.v2_rpc_models_compat model
    left join private.v2_rpc_labs_compat organisation
      on organisation.organisation_id = model.organisation_id
    where model.hidden = false
  ),
  active_provider_counts as (
    select
      provider_model.provider_id,
      count(distinct coalesce(
        nullif(btrim(provider_model.api_model_id), ''),
        nullif(btrim(provider_model.provider_api_model_id), ''),
        nullif(btrim(provider_model.model_id), '')
      )) filter (
        where provider_model.is_active_gateway = true
          and (provider_model.effective_from is null or provider_model.effective_from <= now())
          and (provider_model.effective_to is null or provider_model.effective_to > now())
      )::bigint as active_models
    from private.v2_rpc_routes_compat provider_model
    group by provider_model.provider_id
  )
  select jsonb_build_object(
    'm', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          model.model_id,
          model.name,
          model.organisation_name,
          '/models/' || model.model_id,
          model.organisation_id,
          case
            when model.primary_date is null then null
            else to_char(model.primary_date, 'FMMonth YYYY')
          end
        )
        order by model.primary_date desc nulls last, model.name, model.model_id
      )
      from visible_models model
    ), '[]'::jsonb),
    'o', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          organisation.organisation_id,
          coalesce(nullif(organisation.name, ''), organisation.organisation_id),
          null,
          '/organisations/' || organisation.organisation_id,
          organisation.organisation_id
        )
        order by coalesce(nullif(organisation.name, ''), organisation.organisation_id), organisation.organisation_id
      )
      from private.v2_rpc_labs_compat organisation
    ), '[]'::jsonb),
    'b', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          benchmark.id,
          benchmark.name,
          coalesce(benchmark.total_models, 0)::text || ' models',
          '/benchmarks/' || benchmark.id
        )
        order by benchmark.name, benchmark.id
      )
      from private.v2_rpc_benchmarks_compat benchmark
    ), '[]'::jsonb),
    'p', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          provider.api_provider_id,
          provider.api_provider_name,
          coalesce(provider_counts.active_models, 0)::text || ' active models',
          '/api-providers/' || provider.api_provider_id,
          provider.api_provider_id
        )
        order by provider.api_provider_name, provider.api_provider_id
      )
      from private.v2_rpc_providers_compat provider
      left join active_provider_counts provider_counts
        on provider_counts.provider_id = provider.api_provider_id
    ), '[]'::jsonb),
    's', '[]'::jsonb,
    'c', '[]'::jsonb,
    'v', coalesce((
      select generation
      from public.web_cache_generations
      where scope = 'search'
    ), 1)
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_search_index"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_search_index"() TO "service_role";

COMMENT ON FUNCTION "public"."get_public_search_index"() IS 'Returns the complete compact global-search payload as one JSON value so PostgREST row limits cannot truncate the index.';

REVOKE ALL ON FUNCTION "public"."get_public_search_index"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_search_index"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_search_index"() FROM PUBLIC, "anon";
