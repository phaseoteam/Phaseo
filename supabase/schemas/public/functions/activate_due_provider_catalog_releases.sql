CREATE OR REPLACE FUNCTION public.activate_due_provider_catalog_releases()
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  activated_count integer := 0;
  activated_route_ids text[] := '{}';
begin
  with due as (
    select route.provider_model_id,
      case when candidate.availability = 'ready' then 'active' else 'degraded' end as next_status
    from public.v2_model_provider_routes route
    join public.provider_catalog_route_candidates candidate
      on candidate.provider_slug = route.provider_slug
     and candidate.canonical_model_slug = route.model_slug
     and candidate.provider_model_slug = route.provider_model_slug
     and route.metadata ->> 'source_run_id' = candidate.run_id::text
    where candidate.status = 'promoted'
      and candidate.availability in ('ready', 'degraded')
      and route.metadata ->> 'managed_by' = 'provider_catalog'
      and route.metadata ->> 'release_scheduled' = 'true'
      and route.access_scope = 'internal'
      and route.effective_from is not null
      and route.effective_from <= now()
      and (route.effective_to is null or route.effective_to > now())
      and not route.is_stealth
      and route.phaseo_status not in ('blocked', 'unsupported')
      and jsonb_array_length(candidate.pricing) > 0
      and exists (select 1 from public.v2_models model where model.model_slug = route.model_slug
        and (not model.hidden or model.metadata ->> 'provider_catalog_owner' = route.provider_slug))
      and not exists (
        select 1 from public.v2_model_provider_routes stealth_route
        where stealth_route.model_slug = route.model_slug and stealth_route.is_stealth
      )
      and exists (
        select 1 from public.v2_providers provider
        where provider.provider_slug = route.provider_slug
          and (provider.status = 'not_ready' or (provider.status <> 'disabled' and provider.routable and provider.routing_enabled))
          and (not (coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve')
            or provider.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved')
          and coalesce((provider.metadata ->> 'adapter_ready')::boolean, false)
          and coalesce((provider.metadata ->> 'credentials_ready')::boolean, false)
          and nullif(trim(provider.base_url), '') is not null
      )
    for update of route skip locked
  ), activated as (
    update public.v2_model_provider_routes route
    set status = due.next_status,
        routing_enabled = true,
        provider_availability_status = case when due.next_status = 'active' then 'available' else 'preview' end,
        phaseo_status = 'enabled', access_scope = 'public',
        metadata = route.metadata || jsonb_build_object('release_scheduled', false, 'release_activated_at', now()),
        updated_at = now()
    from due where route.provider_model_id = due.provider_model_id
    returning route.provider_model_id
  ) select coalesce(array_agg(provider_model_id), '{}'::text[]) into activated_route_ids from activated;
  activated_count := cardinality(activated_route_ids);

  update public.v2_route_variants variant
  set status = route.status, routing_enabled = true, updated_at = now()
  from public.v2_model_provider_routes route
  where route.provider_model_id = variant.provider_model_id
    and route.provider_model_id = any(activated_route_ids)
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and route.metadata ->> 'release_scheduled' = 'false'
    and route.metadata ->> 'release_activated_at' is not null
    and variant.metadata ->> 'managed_by' = 'provider_catalog'
    and variant.metadata ->> 'source_run_id' = route.metadata ->> 'source_run_id';

  update public.v2_route_capabilities capability
  set status = case when route.status = 'active' then 'active' else 'degraded' end, updated_at = now()
  from public.v2_model_provider_routes route
  where route.provider_model_id = capability.provider_model_id
    and route.provider_model_id = any(activated_route_ids)
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and route.metadata ->> 'release_scheduled' = 'false'
    and route.metadata ->> 'release_activated_at' is not null
    and capability.metadata ->> 'managed_by' = 'provider_catalog'
    and capability.metadata ->> 'source_run_id' = route.metadata ->> 'source_run_id';

  update public.v2_providers provider
  set status = case
        when provider.status = 'not_ready'
          or (provider.status = 'disabled' and provider.metadata -> 'self_serve' ->> 'status' = 'submitted')
          then 'beta'
        else provider.status
      end,
      routable = true, routing_enabled = true, updated_at = now()
  where (not (coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve')
      or provider.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved')
    and provider.provider_slug in (
      select distinct route.provider_slug
      from public.v2_model_provider_routes route
      where route.metadata ->> 'managed_by' = 'provider_catalog'
        and route.provider_model_id = any(activated_route_ids)
        and route.metadata ->> 'release_scheduled' = 'false'
        and route.metadata ->> 'release_activated_at' is not null
    );

  update public.v2_models model
  set hidden = false, released_at = coalesce(model.released_at, route.effective_from, now()), updated_at = now()
  from public.v2_model_provider_routes route
  where route.model_slug = model.model_slug
    and route.provider_model_id = any(activated_route_ids)
    and model.metadata ->> 'provider_catalog_owner' = route.provider_slug
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and route.metadata ->> 'release_scheduled' = 'false'
    and route.metadata ->> 'release_activated_at' is not null;

  update public.v2_labs lab
  set status = case when lab.status = 'disabled' then 'active' else lab.status end, updated_at = now()
  where lab.lab_slug in (
    select distinct model.lab_slug
    from public.v2_models model
    join public.v2_model_provider_routes route on route.model_slug = model.model_slug
    where model.metadata ->> 'created_from_provider_proposal' = 'true'
      and route.provider_model_id = any(activated_route_ids)
      and route.metadata ->> 'managed_by' = 'provider_catalog'
      and route.metadata ->> 'release_scheduled' = 'false'
      and route.metadata ->> 'release_activated_at' is not null
  );

  return activated_count;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."activate_due_provider_catalog_releases"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."activate_due_provider_catalog_releases"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."activate_due_provider_catalog_releases"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."activate_due_provider_catalog_releases"() FROM PUBLIC, "anon", "authenticated";
