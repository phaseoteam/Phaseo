CREATE OR REPLACE FUNCTION public.get_public_provider_index()
  RETURNS TABLE (
    provider_slug               text,
    provider_name               text,
    colour                      text,
    country_code                text,
    subdivision_code            text,
    default_execution_regions   text[],
    default_data_regions        text[],
    provider_family_id          text,
    offer_label                 text,
    offer_scope                 text,
    is_gateway_provider         boolean,
    provider_status             text,
    byok_available              boolean,
    prompt_training_policy      text,
    data_policy_tier            text,
    zero_data_retention         text,
    data_retention_days         integer,
    privacy_policy_url          text,
    terms_of_service_url        text,
    total_model_ids             text[],
    active_model_ids            text[],
    free_model_ids              text[],
    requests_24h                bigint,
    tokens_24h                  numeric,
    tokens_30d                  numeric,
    last_updated_at             timestamp with time zone,
    text_input_model_ids        text[],
    text_output_model_ids       text[],
    image_input_model_ids       text[],
    image_output_model_ids      text[],
    video_input_model_ids       text[],
    video_output_model_ids      text[],
    audio_input_model_ids       text[],
    audio_output_model_ids      text[],
    moderation_input_model_ids  text[],
    moderation_output_model_ids text[],
    embedding_input_model_ids   text[],
    embedding_output_model_ids  text[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with providers as (
    select
      provider.provider_slug,
      provider.name,
      provider.country_code,
      provider.subdivision_code,
      provider.default_execution_regions,
      provider.default_data_regions,
      provider.lab_slug,
      provider.metadata,
      provider.routable,
      provider.routing_enabled,
      provider.status,
      provider.byok_available,
      provider.prompt_training_policy,
      provider.data_policy_tier,
      provider.zero_data_retention,
      provider.data_retention_days
    from public.v2_providers provider
    where lower(provider.provider_slug) not in ('inception', 'inceptron', 'nextbit')
      and (
        provider.status <> 'external'
        or exists (
          select 1
          from public.v2_model_provider_routes route_override
          where route_override.provider_slug = provider.provider_slug
            and route_override.routing_enabled = true
            and coalesce(route_override.metadata->>'external_routing_override', 'false') = 'true'
        )
      )
  ),
  eligible_routes as (
    select
      route.provider_slug,
      route.model_slug,
      route.routing_enabled,
      route.status,
      route.effective_from,
      route.effective_to,
      route.updated_at,
      model.variant_kind,
      case
        when cardinality(route.input_modalities) > 0 then route.input_modalities
        else model.input_modalities
      end as input_modalities,
      case
        when cardinality(route.output_modalities) > 0 then route.output_modalities
        else model.output_modalities
      end as output_modalities
    from public.v2_model_provider_routes route
    join providers provider using (provider_slug)
    join public.v2_models model using (model_slug)
    where not model.hidden
      and (
        provider.status <> 'external'
        or coalesce(route.metadata->>'external_routing_override', 'false') = 'true'
      )
  ),
  coverage as (
    select
      route.provider_slug,
      array_agg(distinct route.model_slug order by route.model_slug) as total_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (
        where route.routing_enabled
          and route.status in ('active', 'degraded')
          and (route.effective_from is null or route.effective_from <= now())
          and (route.effective_to is null or route.effective_to > now())
      ) as active_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (
        where route.variant_kind = 'free' or lower(route.model_slug) like '%:free'
      ) as free_model_ids,
      max(route.updated_at) as last_updated_at,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'text' = any(route.input_modalities)) as text_input_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'text' = any(route.output_modalities)) as text_output_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'image' = any(route.input_modalities)) as image_input_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'image' = any(route.output_modalities)) as image_output_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'video' = any(route.input_modalities)) as video_input_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'video' = any(route.output_modalities)) as video_output_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'audio' = any(route.input_modalities) or 'music' = any(route.input_modalities)) as audio_input_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'audio' = any(route.output_modalities) or 'music' = any(route.output_modalities)) as audio_output_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'moderation' = any(route.input_modalities)) as moderation_input_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'moderation' = any(route.output_modalities)) as moderation_output_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'embedding' = any(route.input_modalities) or 'embeddings' = any(route.input_modalities)) as embedding_input_model_ids,
      array_agg(distinct route.model_slug order by route.model_slug) filter (where 'embedding' = any(route.output_modalities) or 'embeddings' = any(route.output_modalities)) as embedding_output_model_ids
    from eligible_routes route
    group by route.provider_slug
  ),
  usage as (
    select
      summary.provider as provider_slug,
      summary.requests_24h,
      summary.tokens_24h,
      summary.tokens_30d
    from public.get_public_provider_usage_summary() summary
  )
  select
    provider.provider_slug,
    provider.name,
    nullif(provider.metadata->>'colour', ''),
    coalesce(provider.country_code, ''),
    provider.subdivision_code,
    provider.default_execution_regions,
    provider.default_data_regions,
    coalesce(nullif(provider.metadata->>'provider_family_id', ''), provider.lab_slug),
    nullif(provider.metadata->>'offer_label', ''),
    nullif(provider.metadata->>'offer_scope', ''),
    provider.routable
      and provider.routing_enabled
      and provider.status in ('active', 'degraded'),
    provider.status,
    provider.byok_available,
    provider.prompt_training_policy,
    provider.data_policy_tier,
    case when provider.zero_data_retention then 'default' else 'unsupported' end,
    provider.data_retention_days,
    nullif(provider.metadata->>'privacy_policy_url', ''),
    nullif(provider.metadata->>'terms_of_service_url', ''),
    coverage.total_model_ids,
    coalesce(coverage.active_model_ids, array[]::text[]),
    coalesce(coverage.free_model_ids, array[]::text[]),
    coalesce(usage.requests_24h, 0),
    coalesce(usage.tokens_24h, 0),
    coalesce(usage.tokens_30d, 0),
    coverage.last_updated_at,
    coalesce(coverage.text_input_model_ids, array[]::text[]),
    coalesce(coverage.text_output_model_ids, array[]::text[]),
    coalesce(coverage.image_input_model_ids, array[]::text[]),
    coalesce(coverage.image_output_model_ids, array[]::text[]),
    coalesce(coverage.video_input_model_ids, array[]::text[]),
    coalesce(coverage.video_output_model_ids, array[]::text[]),
    coalesce(coverage.audio_input_model_ids, array[]::text[]),
    coalesce(coverage.audio_output_model_ids, array[]::text[]),
    coalesce(coverage.moderation_input_model_ids, array[]::text[]),
    coalesce(coverage.moderation_output_model_ids, array[]::text[]),
    coalesce(coverage.embedding_input_model_ids, array[]::text[]),
    coalesce(coverage.embedding_output_model_ids, array[]::text[])
  from providers provider
  join coverage using (provider_slug)
  left join usage using (provider_slug)
  order by provider.name, provider.provider_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_provider_index"() TO "service_role";

COMMENT ON FUNCTION "public"."get_public_provider_index"() IS 'Returns provider coverage for public provider pages; external providers require an explicit provider-level routing override to appear.';

REVOKE ALL ON FUNCTION "public"."get_public_provider_index"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_provider_index"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_provider_index"() FROM PUBLIC, "anon", "authenticated";
