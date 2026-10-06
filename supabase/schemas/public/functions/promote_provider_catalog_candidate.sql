CREATE OR REPLACE FUNCTION public.promote_provider_catalog_candidate (
  p_run_id               uuid,
  p_submitted_model_slug text
)
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
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
  provider_approved boolean;
  provider_ready boolean;
  route_blocked boolean := false;
  pricing_changed boolean := true;
  pricing_hash text;
  pricing_operation text;
  sku_code_value text;
begin
  select * into candidate from public.provider_catalog_route_candidates
  where run_id = p_run_id and submitted_model_slug = p_submitted_model_slug for update;
  if not found then raise exception 'provider_catalog_candidate_not_found'; end if;
  select case when p.metadata ? 'self_serve'
    then p.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved'
    else coalesce((select sub.provider_review_status = 'approved'
      from public.provider_onboarding_submissions sub join public.provider_catalog_sources source
        on source.provider_slug = sub.provider_slug and source.created_by = sub.submitted_by
      where source.provider_slug = p.provider_slug order by sub.created_at desc limit 1),
      p.status in ('active', 'beta', 'alpha', 'deprecated')) end,
    coalesce((p.metadata ->> 'adapter_ready')::boolean, false)
      and coalesce((p.metadata ->> 'credentials_ready')::boolean, false)
      and nullif(btrim(p.base_url), '') is not null
    into provider_approved, provider_ready
  from public.v2_providers p where p.provider_slug = candidate.provider_slug for update;
  if not coalesce(provider_approved, false) then raise exception 'provider_catalog_provider_not_approved'; end if;
  if not exists (select 1 from public.provider_catalog_sources s where s.provider_slug = candidate.provider_slug and s.status = 'active') then raise exception 'provider_catalog_source_inactive'; end if;
  if not exists (select 1 from public.v2_models m where m.model_slug = candidate.canonical_model_slug
    and (not m.hidden or (m.metadata ->> 'provider_catalog_owner' = candidate.provider_slug and m.released_at is null))) then raise exception 'provider_catalog_model_unavailable'; end if;
  if candidate.status = 'promoted' then
    select provider_model_id into provider_model_id_value from public.v2_model_provider_routes
    where provider_slug = candidate.provider_slug and model_slug = candidate.canonical_model_slug
      and provider_model_slug = candidate.provider_model_slug order by created_at limit 1;
    return provider_model_id_value;
  end if;
  if candidate.status not in ('pending_probe', 'probe_passed') then raise exception 'provider_catalog_candidate_invalid'; end if;
  if jsonb_array_length(candidate.capabilities) = 0 then raise exception 'provider_catalog_capability_required'; end if;
  if exists (
    select 1 from public.provider_catalog_sync_runs newer
    join public.provider_catalog_sync_runs current_run on current_run.id = candidate.run_id
    where newer.provider_slug = candidate.provider_slug and newer.status = 'applied'
      and newer.created_at > current_run.created_at
  ) then raise exception 'provider_catalog_candidate_superseded'; end if;
  if exists (select 1 from jsonb_array_elements(candidate.pricing) p where jsonb_array_length(coalesce(p -> 'conditions', '[]'::jsonb)) > 0) then
    raise exception 'provider_catalog_conditional_pricing_not_supported';
  end if;

  pricing_hash := md5(candidate.pricing::text || coalesce(candidate.available_from::text, '') ||
    coalesce((select string_agg(operation, ',' order by operation) from
      (select distinct public.canonical_routing_capability_id(value ->> 'id') as operation
        from jsonb_array_elements(candidate.capabilities)) operations), ''));
  select route.provider_model_id, route.phaseo_status in ('blocked', 'unsupported'),
      route.metadata ->> 'catalog_pricing_hash' is distinct from pricing_hash
        or exists (select 1 from jsonb_array_elements(candidate.capabilities) cap where not exists (
          select 1 from public.v2_pricing_skus sku where sku.provider_model_id = route.provider_model_id
            and sku.metadata ->> 'managed_by' = 'provider_catalog' and sku.status = 'active'
            and sku.operation = public.canonical_routing_capability_id(cap ->> 'id')))
    into provider_model_id_value, route_blocked, pricing_changed
  from public.v2_model_provider_routes route
  where route.provider_slug = candidate.provider_slug
    and route.model_slug = candidate.canonical_model_slug
    and route.provider_model_slug = candidate.provider_model_slug
  order by route.created_at limit 1;
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
  route_enabled := candidate.availability in ('ready', 'degraded') and release_due and provider_ready and not coalesce(route_blocked, false)
    and jsonb_array_length(candidate.pricing) > 0
    and exists (select 1 from public.v2_models m where m.model_slug = candidate.canonical_model_slug
      and (not m.hidden or (m.metadata ->> 'provider_catalog_owner' = candidate.provider_slug and m.released_at is null)))
    and exists (
      select 1 from public.v2_providers p
      where p.provider_slug = candidate.provider_slug
        and (
          (
            p.metadata ? 'self_serve'
            and p.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved'
            and (p.status = 'not_ready' or (p.status <> 'disabled' and p.routable and p.routing_enabled))
          )
          or (
            not (p.metadata ? 'self_serve')
            and (p.status = 'not_ready' or (p.status <> 'disabled' and p.routable and p.routing_enabled))
          )
        )
    )
    and not exists (select 1 from public.v2_model_provider_routes r
      where r.model_slug = candidate.canonical_model_slug and r.is_stealth);
  if not route_enabled then
    phaseo_status_value := case when route_blocked then 'blocked' when candidate.available_from > now() then 'testing' else 'planned' end;
    access_scope_value := case when candidate.available_from > now() then 'internal' else 'public' end;
    if route_blocked then route_status := 'disabled'; end if;
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
      'catalog_pricing_hash', pricing_hash,
      'deprecated_at', candidate.deprecated_at,
      'release_scheduled', candidate.available_from > now() and candidate.availability in ('ready', 'degraded') and not coalesce(route_blocked, false),
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
  where provider_model_id = provider_model_id_value
    and capability_id = public.canonical_routing_capability_id(capability_id);

  for capability in
    select jsonb_build_object('id', public.canonical_routing_capability_id(cap.value ->> 'id'),
      'parameters', coalesce(jsonb_agg(distinct param.value) filter (where param.value is not null), '[]'::jsonb))
    from jsonb_array_elements(candidate.capabilities) cap
    left join lateral jsonb_array_elements_text(coalesce(cap.value -> 'parameters', '[]'::jsonb)) param on true
    group by public.canonical_routing_capability_id(cap.value ->> 'id')
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

  if coalesce(pricing_changed, true) then
  update public.v2_pricing_skus
  set status = case when effective_from >= now() then 'disabled' else 'deprecated' end,
      effective_to = case when effective_from < now() then now() else effective_to end, updated_at = now()
  where provider_model_id = provider_model_id_value
    and status = 'active' and (
      metadata ->> 'managed_by' = 'provider_catalog'
      or (coalesce(service_tier_slug, 'standard') = 'standard' and region is null
        and (operation = 'inference' or operation in (select public.canonical_routing_capability_id(value ->> 'id') from jsonb_array_elements(candidate.capabilities))))
    );
  if jsonb_array_length(candidate.pricing) > 0 then
  for pricing_operation in select distinct public.canonical_routing_capability_id(value ->> 'id') from jsonb_array_elements(candidate.capabilities)
  loop
  sku_code_value := 'provider-catalog-' || pricing_operation;
  select coalesce(max(version), 0) + 1 into sku_version_value
  from public.v2_pricing_skus where provider_model_id = provider_model_id_value and sku_code = sku_code_value;
  insert into public.v2_pricing_skus (
    provider_model_id, route_variant_id, service_tier_slug, sku_code, version, operation, status, display_name,
    currency, effective_from, metadata
  ) values (
    provider_model_id_value, variant_id_value, 'standard', sku_code_value, sku_version_value,
    pricing_operation, 'active', 'Provider catalog pricing', 'USD', greatest(coalesce(candidate.available_from, now()), now()),
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
  end loop;
  end if;
  end if;

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

  if candidate.availability in ('ready', 'degraded') and release_due then
    update public.v2_models
    set hidden = false,
        released_at = coalesce(released_at, coalesce(candidate.available_from, now())),
        updated_at = now()
    where model_slug = candidate.canonical_model_slug
      and metadata ->> 'provider_catalog_owner' = candidate.provider_slug
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."promote_provider_catalog_candidate"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."promote_provider_catalog_candidate"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."promote_provider_catalog_candidate"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."promote_provider_catalog_candidate"(uuid, text) FROM PUBLIC, "anon", "authenticated";
