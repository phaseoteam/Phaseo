-- Keep provider catalogue promotions private until the provider/model is ready
-- for public routing. Internal testing still needs a real endpoint, credentials,
-- and an adapter, which the promotion function already validates.

create or replace function public.promote_provider_catalog_candidate(
  p_run_id uuid,
  p_submitted_model_slug text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  candidate public.provider_catalog_route_candidates%rowtype;
  provider_model_id_value text;
  capability jsonb;
  price jsonb;
  sku_id_value uuid;
  sku_version_value integer;
  variant_id_value uuid;
  route_status text;
  provider_availability text;
  phaseo_status_value text;
  access_scope_value text;
  route_enabled boolean;
  release_due boolean;
begin
  select * into candidate from public.provider_catalog_route_candidates
  where run_id = p_run_id and submitted_model_slug = p_submitted_model_slug for update;
  if not found then raise exception 'provider_catalog_candidate_not_found'; end if;
  if candidate.status <> 'probe_passed' then raise exception 'provider_catalog_probe_required'; end if;
  if exists (
    select 1 from public.provider_catalog_sync_runs newer
    join public.provider_catalog_sync_runs current_run on current_run.id = candidate.run_id
    where newer.provider_slug = candidate.provider_slug and newer.status = 'applied'
      and newer.created_at > current_run.created_at
  ) then raise exception 'provider_catalog_candidate_superseded'; end if;
  if jsonb_array_length(candidate.pricing) = 0 then raise exception 'provider_catalog_pricing_required'; end if;
  if not coalesce((select (metadata ->> 'adapter_ready')::boolean from public.v2_providers where provider_slug = candidate.provider_slug), false) then raise exception 'provider_catalog_adapter_required'; end if;
  if not coalesce((select (metadata ->> 'credentials_ready')::boolean from public.v2_providers where provider_slug = candidate.provider_slug), false) then raise exception 'provider_catalog_credentials_required'; end if;
  if not exists (select 1 from public.v2_providers where provider_slug = candidate.provider_slug and nullif(trim(base_url), '') is not null) then raise exception 'provider_catalog_endpoint_required'; end if;

  select provider_model_id into provider_model_id_value
  from public.v2_model_provider_routes
  where provider_slug = candidate.provider_slug
    and model_slug = candidate.canonical_model_slug
    and provider_model_slug = candidate.provider_model_slug
  order by created_at limit 1;
  if provider_model_id_value is null then
    provider_model_id_value := candidate.provider_slug || ':' || candidate.canonical_model_slug || ':' || candidate.provider_model_slug;
  end if;

  release_due := (candidate.available_from is null or candidate.available_from <= now())
    and (candidate.shutdown_at is null or candidate.shutdown_at > now());

  route_status := case
    when not release_due and candidate.availability in ('ready', 'degraded') then 'disabled'
    when candidate.availability = 'ready' then 'active'
    when candidate.availability = 'degraded' then 'degraded'
    when candidate.availability = 'retired' then 'disabled'
    else 'disabled'
  end;
  provider_availability := case
    when candidate.availability = 'ready' and release_due then 'available'
    when candidate.availability = 'degraded' and release_due then 'preview'
    when candidate.availability = 'deprecated' then 'deprecated'
    when candidate.availability = 'retired' then 'removed'
    else 'coming_soon'
  end;
  phaseo_status_value := case
    when candidate.availability in ('ready', 'degraded') and release_due then 'enabled'
    when candidate.availability = 'deprecated' then 'disabled'
    when candidate.availability = 'retired' then 'disabled'
    else 'testing'
  end;
  access_scope_value := case when candidate.availability in ('ready', 'degraded') and release_due then 'public' else 'internal' end;
  route_enabled := candidate.availability in ('ready', 'degraded') and release_due
    and exists (select 1 from public.v2_providers p where p.provider_slug = candidate.provider_slug
      and (p.status = 'not_ready' or (p.status <> 'disabled' and p.routable and p.routing_enabled)))
    and not exists (select 1 from public.v2_model_provider_routes r
      where r.model_slug = candidate.canonical_model_slug and r.is_stealth);
  if not route_enabled then
    route_status := 'disabled';
    phaseo_status_value := 'testing';
    access_scope_value := 'internal';
  end if;

  insert into public.v2_model_provider_routes (
    provider_model_id, model_slug, provider_slug, provider_model_slug, status,
    routing_enabled, provider_availability_status, phaseo_status, access_scope,
    input_modalities, output_modalities, context_length, max_output_tokens,
    effective_from, effective_to, metadata, updated_at
  ) values (
    provider_model_id_value, candidate.canonical_model_slug, candidate.provider_slug,
    candidate.provider_model_slug, route_status, route_enabled,
    provider_availability, phaseo_status_value, access_scope_value,
    candidate.input_modalities, candidate.output_modalities, candidate.context_length,
    candidate.max_output_tokens, candidate.available_from, candidate.shutdown_at,
    jsonb_build_object(
      'managed_by', 'provider_catalog',
      'source_run_id', candidate.run_id,
      'deprecated_at', candidate.deprecated_at,
      'release_scheduled', not release_due and candidate.availability in ('ready', 'degraded'),
      'release_at', candidate.available_from
    ), now()
  )
  on conflict (provider_model_id) do update set
    provider_model_slug = excluded.provider_model_slug, status = excluded.status,
    routing_enabled = excluded.routing_enabled,
    provider_availability_status = excluded.provider_availability_status,
    phaseo_status = excluded.phaseo_status, access_scope = excluded.access_scope,
    input_modalities = excluded.input_modalities, output_modalities = excluded.output_modalities,
    context_length = excluded.context_length, max_output_tokens = excluded.max_output_tokens,
    effective_from = excluded.effective_from, effective_to = excluded.effective_to,
    metadata = public.v2_model_provider_routes.metadata || excluded.metadata, updated_at = now();

  update public.v2_route_capabilities set status = 'disabled', updated_at = now()
  where provider_model_id = provider_model_id_value;

  for capability in select value from jsonb_array_elements(candidate.capabilities)
  loop
    insert into public.v2_route_capabilities (
      provider_model_id, capability_id, status, max_output_tokens, params,
      effective_from, effective_to, metadata, updated_at
    ) values (
      provider_model_id_value, capability ->> 'id',
      case when route_enabled and candidate.availability = 'ready' then 'active'
           when route_enabled and candidate.availability = 'degraded' then 'degraded'
           when candidate.availability in ('deprecated', 'retired') then 'disabled'
           else 'internal_testing' end,
      candidate.max_output_tokens,
      coalesce((select jsonb_object_agg(p.value, true) from jsonb_array_elements_text(coalesce(capability -> 'parameters', '[]'::jsonb)) as p(value)), '{}'::jsonb),
      candidate.available_from, candidate.shutdown_at,
      jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id), now()
    )
    on conflict (provider_model_id, capability_id) do update set
      status = excluded.status, max_output_tokens = excluded.max_output_tokens,
      params = excluded.params, effective_from = excluded.effective_from,
      effective_to = excluded.effective_to,
      metadata = public.v2_route_capabilities.metadata || excluded.metadata, updated_at = now();
  end loop;

  insert into public.v2_route_variants (
    provider_model_id, variant_key, service_tier_slug, status,
    routing_enabled, endpoint_label, metadata, updated_at
  ) values (
    provider_model_id_value, 'global:standard', 'standard',
    case when route_enabled then route_status else 'disabled' end,
    route_enabled, 'Standard',
    jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id), now()
  )
  on conflict (provider_model_id, variant_key) do update set
    service_tier_slug = excluded.service_tier_slug,
    status = excluded.status,
    routing_enabled = excluded.routing_enabled,
    endpoint_label = excluded.endpoint_label,
    metadata = public.v2_route_variants.metadata || excluded.metadata,
    updated_at = now()
  returning variant_id into variant_id_value;

  update public.v2_pricing_skus
  set status = 'deprecated', effective_to = now(), updated_at = now()
  where provider_model_id = provider_model_id_value
    and sku_code = 'provider-catalog-standard' and status = 'active';
  select coalesce(max(version), 0) + 1 into sku_version_value
  from public.v2_pricing_skus
  where provider_model_id = provider_model_id_value and sku_code = 'provider-catalog-standard';
  insert into public.v2_pricing_skus (
    provider_model_id, route_variant_id, service_tier_slug, sku_code, version, operation, status, display_name,
    currency, effective_from, metadata
  ) values (
    provider_model_id_value, variant_id_value, 'standard', 'provider-catalog-standard', sku_version_value,
    'inference', 'active', 'Provider catalog pricing', 'USD', coalesce(candidate.available_from, now()),
    jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id, 'release_scheduled', not release_due)
  ) returning sku_id into sku_id_value;
  for price in select value from jsonb_array_elements(candidate.pricing)
  loop
    insert into public.v2_pricing_sku_meters (
      sku_id, meter_key, modality, direction, unit, unit_quantity,
      price_nanos, display_label, display_unit, metadata
    ) values (
      sku_id_value, price ->> 'meterKey', price ->> 'modality', nullif(price ->> 'direction', ''),
      price ->> 'unit', (price ->> 'unitQuantity')::numeric,
      (price ->> 'priceNanos')::numeric, price ->> 'displayLabel', price ->> 'displayUnit',
      jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id)
    );
  end loop;

  update public.v2_providers
  set status = case
        when route_enabled
          and (status = 'not_ready' or (status = 'disabled' and metadata -> 'self_serve' ->> 'status' = 'submitted'))
          then 'beta'
        else status
      end,
      routable = case when route_enabled then true else routable end,
      routing_enabled = case when route_enabled then true else routing_enabled end,
      updated_at = now()
  where provider_slug = candidate.provider_slug;

  if route_enabled then
    update public.v2_models
    set hidden = false,
        released_at = coalesce(released_at, coalesce(candidate.available_from, now())),
        updated_at = now()
    where model_slug = candidate.canonical_model_slug
      and metadata ->> 'created_from_provider_proposal' = 'true'
      and not exists (select 1 from public.v2_model_provider_routes r where r.model_slug = candidate.canonical_model_slug and r.is_stealth);

    update public.v2_labs lab
    set status = case when lab.status = 'disabled' then 'active' else lab.status end,
        updated_at = now()
    where lab.lab_slug = (select model.lab_slug from public.v2_models model where model.model_slug = candidate.canonical_model_slug)
      and lab.metadata ->> 'created_from_provider_proposal' = 'true';
  end if;

  update public.provider_catalog_route_candidates
  set status = 'promoted', promoted_at = now(), updated_at = now()
  where run_id = p_run_id and submitted_model_slug = p_submitted_model_slug;

  update public.provider_catalog_sync_models
  set route_projection_status = case when route_enabled then 'enabled' else 'staged' end,
      route_projection_error = null
  where run_id = p_run_id and model_slug = p_submitted_model_slug;

  return provider_model_id_value;
end;
$$;

revoke all on function public.promote_provider_catalog_candidate(uuid, text) from public;
grant execute on function public.promote_provider_catalog_candidate(uuid, text) to service_role;

-- Scheduled releases are activated by the provider-catalog worker. Keeping the
-- transition in a service-only database function makes the release timestamp
-- authoritative and prevents a client from making an internal route public.
create or replace function public.activate_due_provider_catalog_releases()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  activated_count integer := 0;
  activated_route_ids text[] := '{}';
begin
  with due as (
    select
      route.provider_model_id,
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
      and not exists (select 1 from public.v2_model_provider_routes s where s.model_slug = route.model_slug and s.is_stealth)
      and exists (select 1 from public.v2_providers p where p.provider_slug = route.provider_slug
        and (p.status = 'not_ready' or (p.status <> 'disabled' and p.routable and p.routing_enabled)))
    for update of route skip locked
  ), activated as (
  update public.v2_model_provider_routes route
  set status = due.next_status,
      routing_enabled = true,
      provider_availability_status = case when due.next_status = 'active' then 'available' else 'preview' end,
      phaseo_status = 'enabled',
      access_scope = 'public',
      metadata = route.metadata || jsonb_build_object(
        'release_scheduled', false,
        'release_activated_at', now()
      ),
      updated_at = now()
  from due
  where route.provider_model_id = due.provider_model_id
  returning route.provider_model_id
  ) select coalesce(array_agg(provider_model_id), '{}'::text[]) into activated_route_ids from activated;
  activated_count := cardinality(activated_route_ids);

  update public.v2_route_variants variant
  set status = route.status,
      routing_enabled = true,
      updated_at = now()
  from public.v2_model_provider_routes route
  where route.provider_model_id = variant.provider_model_id
    and route.provider_model_id = any(activated_route_ids)
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and route.metadata ->> 'release_scheduled' = 'false'
    and route.metadata ->> 'release_activated_at' is not null
    and variant.metadata ->> 'managed_by' = 'provider_catalog'
    and variant.metadata ->> 'source_run_id' = route.metadata ->> 'source_run_id';

  update public.v2_route_capabilities capability
  set status = case when route.status = 'active' then 'active' else 'degraded' end,
      updated_at = now()
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
      routable = true,
      routing_enabled = true,
      updated_at = now()
  where provider.provider_slug in (
    select distinct route.provider_slug
    from public.v2_model_provider_routes route
    where route.metadata ->> 'managed_by' = 'provider_catalog'
      and route.provider_model_id = any(activated_route_ids)
      and route.metadata ->> 'release_scheduled' = 'false'
      and route.metadata ->> 'release_activated_at' is not null
  );

  update public.v2_models model
  set hidden = false,
      released_at = coalesce(model.released_at, route.effective_from, now()),
      updated_at = now()
  from public.v2_model_provider_routes route
  where route.model_slug = model.model_slug
    and route.provider_model_id = any(activated_route_ids)
    and model.metadata ->> 'created_from_provider_proposal' = 'true'
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and route.metadata ->> 'release_scheduled' = 'false'
    and route.metadata ->> 'release_activated_at' is not null;

  update public.v2_labs lab
  set status = case when lab.status = 'disabled' then 'active' else lab.status end,
      updated_at = now()
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
$$;

revoke all on function public.activate_due_provider_catalog_releases() from public;
grant execute on function public.activate_due_provider_catalog_releases() to service_role;
