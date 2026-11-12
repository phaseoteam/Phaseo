SET local check_function_bodies = off;

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
      and route.status = 'disabled'
      and route.provider_availability_status = 'coming_soon'
      and route.effective_from is not null
      and route.effective_from <= now()
      and (route.effective_to is null or route.effective_to > now())
      and not route.is_stealth
      and route.phaseo_status not in ('blocked', 'unsupported')
      and jsonb_array_length(candidate.pricing) > 0
      and exists (select 1 from public.v2_models model where model.model_slug = route.model_slug
        and (not model.hidden or (model.metadata ->> 'provider_catalog_owner' = route.provider_slug and model.released_at is null)))
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
    and capability.capability_id = public.canonical_routing_capability_id(capability.capability_id)
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

CREATE OR REPLACE FUNCTION public.apply_provider_catalog_snapshot (
  p_provider_slug text,
  p_run_id        uuid,
  p_models        jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  model jsonb;
  capability jsonb;
  applied_count integer := 0;
  model_slug_value text;
  capability_id_value text;
  canonical_slug text;
  canonical_hidden boolean;
  canonical_owner text;
  canonical_released_at timestamptz;
  match_type_value text;
  provider_approved boolean;
  provider_lab_slug text;
begin
  select case when p.metadata ? 'self_serve'
    then p.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved'
    else coalesce((select sub.provider_review_status = 'approved'
      from public.provider_onboarding_submissions sub join public.provider_catalog_sources source
        on source.provider_slug = sub.provider_slug and source.created_by = sub.submitted_by
      where source.provider_slug = p.provider_slug order by sub.created_at desc limit 1),
      p.status in ('active', 'beta', 'alpha', 'deprecated')) end, p.lab_slug into provider_approved, provider_lab_slug
  from public.v2_providers p where p.provider_slug = p_provider_slug for update;
  if not found then raise exception 'provider_catalog_provider_not_found'; end if;
  if not exists (select 1 from public.provider_catalog_sync_runs r where r.id = p_run_id and r.provider_slug = p_provider_slug) then
    raise exception 'provider_catalog_run_provider_mismatch';
  end if;
  if exists (select 1 from public.provider_catalog_sync_runs newer
    join public.provider_catalog_sync_runs current_run on current_run.id = p_run_id
    where newer.provider_slug = p_provider_slug and newer.status = 'applied' and newer.created_at > current_run.created_at) then
    raise exception 'provider_catalog_candidate_superseded';
  end if;
  -- Only this provider's feed-managed offers can be retired by its snapshot.
  -- Keep their history and canonical models intact.
  update public.v2_model_provider_routes route
  set status = 'retired', routing_enabled = false,
      provider_availability_status = 'removed',
      phaseo_status = case when route.phaseo_status in ('blocked', 'unsupported') then route.phaseo_status
        when route.access_scope = 'internal' then 'testing' else 'disabled' end,
      metadata = route.metadata || jsonb_build_object('release_scheduled', false), updated_at = now()
  where route.provider_slug = p_provider_slug
    and provider_approved
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and not exists (select 1 from jsonb_array_elements(p_models) incoming
      where coalesce(nullif(incoming ->> 'providerModelSlug', ''), incoming ->> 'id') = route.provider_model_slug
        and (lower(incoming ->> 'id') = route.model_slug or exists (
          select 1 from public.v2_model_aliases alias where alias.alias_slug = lower(incoming ->> 'id')
            and alias.model_slug = route.model_slug and alias.enabled
            and (alias.effective_from is null or alias.effective_from <= now())
            and (alias.effective_to is null or alias.effective_to > now()))));

  update public.v2_route_variants variant set status = 'disabled', routing_enabled = false, updated_at = now()
  from public.v2_model_provider_routes route
  where variant.provider_model_id = route.provider_model_id and route.provider_slug = p_provider_slug
    and route.metadata ->> 'managed_by' = 'provider_catalog' and route.status = 'retired';

  update public.v2_route_capabilities capability set status = 'disabled', updated_at = now()
  from public.v2_model_provider_routes route
  where capability.provider_model_id = route.provider_model_id and route.provider_slug = p_provider_slug
    and capability.capability_id = public.canonical_routing_capability_id(capability.capability_id)
    and route.metadata ->> 'managed_by' = 'provider_catalog' and route.status = 'retired';

  update public.v2_pricing_skus sku
  set status = case when sku.effective_from >= now() then 'disabled' else 'deprecated' end,
      effective_to = case when sku.effective_from < now() then now() else sku.effective_to end, updated_at = now()
  from public.v2_model_provider_routes route
  where sku.provider_model_id = route.provider_model_id and sku.status = 'active'
    and sku.metadata ->> 'managed_by' = 'provider_catalog' and route.provider_slug = p_provider_slug
    and route.metadata ->> 'managed_by' = 'provider_catalog' and route.status = 'retired';

  update public.provider_catalog_models
  set status = 'removed', updated_at = now(), source_run_id = p_run_id
  where provider_slug = p_provider_slug
    and status = 'active'
    and not exists (
      select 1
      from jsonb_array_elements(p_models) as incoming(value)
      where incoming.value ->> 'id' = provider_catalog_models.model_slug
    );

  update public.provider_catalog_model_capabilities
  set status = 'removed', source_run_id = p_run_id, observed_at = now()
  where provider_slug = p_provider_slug;

  for model in select value from jsonb_array_elements(p_models)
  loop
    model_slug_value := model ->> 'id';

    insert into public.provider_catalog_sync_models (
      run_id, provider_slug, model_slug, provider_model_slug, name, description,
      input_modalities, output_modalities, context_length, max_output_tokens,
      availability, available_from, deprecated_at, shutdown_at, metadata
    ) values (
      p_run_id,
      p_provider_slug,
      model_slug_value,
      coalesce(nullif(model ->> 'providerModelSlug', ''), model_slug_value),
      coalesce(nullif(model ->> 'name', ''), model_slug_value),
      nullif(model ->> 'description', ''),
      coalesce(array(select jsonb_array_elements_text(model -> 'inputModalities')), '{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(model -> 'outputModalities')), '{}'::text[]),
      nullif(model ->> 'contextLength', '')::integer,
      nullif(model ->> 'maxOutputTokens', '')::integer,
      coalesce(nullif(model ->> 'availability', ''), 'ready'),
      nullif(model ->> 'availableFrom', '')::timestamptz,
      nullif(model ->> 'deprecatedAt', '')::timestamptz,
      nullif(model ->> 'shutdownAt', '')::timestamptz,
      jsonb_build_object('pricing', coalesce(model -> 'pricing', '[]'::jsonb))
    )
    on conflict (run_id, model_slug) do update set
      provider_model_slug = excluded.provider_model_slug,
      name = excluded.name,
      description = excluded.description,
      input_modalities = excluded.input_modalities,
      output_modalities = excluded.output_modalities,
      context_length = excluded.context_length,
      max_output_tokens = excluded.max_output_tokens,
      availability = excluded.availability,
      available_from = excluded.available_from,
      deprecated_at = excluded.deprecated_at,
      shutdown_at = excluded.shutdown_at,
      metadata = excluded.metadata;

    insert into public.provider_catalog_models (
      provider_slug, model_slug, provider_model_slug, name, description,
      input_modalities, output_modalities, context_length, max_output_tokens,
      availability, available_from, deprecated_at, shutdown_at,
      status, last_seen_at, source_run_id, metadata, updated_at
    ) values (
      p_provider_slug,
      model_slug_value,
      coalesce(nullif(model ->> 'providerModelSlug', ''), model_slug_value),
      coalesce(nullif(model ->> 'name', ''), model_slug_value),
      nullif(model ->> 'description', ''),
      coalesce(array(select jsonb_array_elements_text(model -> 'inputModalities')), '{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(model -> 'outputModalities')), '{}'::text[]),
      nullif(model ->> 'contextLength', '')::integer,
      nullif(model ->> 'maxOutputTokens', '')::integer,
      coalesce(nullif(model ->> 'availability', ''), 'ready'),
      nullif(model ->> 'availableFrom', '')::timestamptz,
      nullif(model ->> 'deprecatedAt', '')::timestamptz,
      nullif(model ->> 'shutdownAt', '')::timestamptz,
      'active', now(), p_run_id,
      jsonb_build_object('pricing', coalesce(model -> 'pricing', '[]'::jsonb)),
      now()
    )
    on conflict (provider_slug, model_slug) do update set
      provider_model_slug = excluded.provider_model_slug,
      name = excluded.name,
      description = excluded.description,
      input_modalities = excluded.input_modalities,
      output_modalities = excluded.output_modalities,
      context_length = excluded.context_length,
      max_output_tokens = excluded.max_output_tokens,
      availability = excluded.availability,
      available_from = excluded.available_from,
      deprecated_at = excluded.deprecated_at,
      shutdown_at = excluded.shutdown_at,
      status = 'active',
      last_seen_at = now(),
      source_run_id = excluded.source_run_id,
      metadata = excluded.metadata,
      updated_at = now();

    for capability in select value from jsonb_array_elements(coalesce(model -> 'capabilities', '[]'::jsonb))
    loop
      capability_id_value := capability ->> 'id';

      insert into public.provider_catalog_sync_model_capabilities (
        run_id, model_slug, capability_id, parameters
      ) values (
        p_run_id,
        model_slug_value,
        capability_id_value,
        coalesce(array(select jsonb_array_elements_text(capability -> 'parameters')), '{}'::text[])
      )
      on conflict (run_id, model_slug, capability_id) do update set
        parameters = excluded.parameters;

      insert into public.provider_catalog_model_capabilities (
        provider_slug, model_slug, capability_id, parameters, status, source_run_id, observed_at
      ) values (
        p_provider_slug,
        model_slug_value,
        capability_id_value,
        coalesce(array(select jsonb_array_elements_text(capability -> 'parameters')), '{}'::text[]),
        'active', p_run_id, now()
      )
      on conflict (provider_slug, model_slug, capability_id) do update set
        parameters = excluded.parameters,
        status = 'active',
        source_run_id = excluded.source_run_id,
        observed_at = now();
    end loop;

    if provider_approved then
      canonical_slug := null;
      select m.model_slug into canonical_slug from public.v2_models m where m.model_slug = lower(model_slug_value);
      match_type_value := 'exact';
      if canonical_slug is null then
        select a.model_slug into canonical_slug from public.v2_model_aliases a
        where a.alias_slug = lower(model_slug_value) and a.enabled
          and (a.effective_from is null or a.effective_from <= now())
          and (a.effective_to is null or a.effective_to > now());
        match_type_value := 'alias';
      end if;
      if canonical_slug is null then
        canonical_slug := lower(model_slug_value);
        match_type_value := 'new_model';
        if split_part(canonical_slug, '/', 1) <> p_provider_slug
          and split_part(canonical_slug, '/', 1) is distinct from provider_lab_slug then
          raise exception 'provider_catalog_namespace_not_owned: %', model_slug_value;
        end if;
        insert into public.v2_labs (lab_slug, name, status, routable, metadata)
        values (split_part(canonical_slug, '/', 1), split_part(canonical_slug, '/', 1), 'disabled', false,
          jsonb_build_object('created_from_provider_proposal', true)) on conflict (lab_slug) do nothing;
        insert into public.v2_models (model_slug, lab_slug, name, description, status, hidden, input_modalities, output_modalities, variant_kind, metadata)
        values (canonical_slug, split_part(canonical_slug, '/', 1), coalesce(nullif(model ->> 'name', ''), canonical_slug),
          nullif(model ->> 'description', ''), 'active', true,
          array(select jsonb_array_elements_text(model -> 'inputModalities')),
          array(select jsonb_array_elements_text(model -> 'outputModalities')),
          case when canonical_slug like '%:free' then 'free' else 'standard' end,
          jsonb_build_object('created_from_provider_proposal', true, 'provider_catalog_owner', p_provider_slug))
        on conflict (model_slug) do nothing;
      end if;
      select m.hidden, m.metadata ->> 'provider_catalog_owner', m.released_at into canonical_hidden, canonical_owner, canonical_released_at
      from public.v2_models m where m.model_slug = canonical_slug for update;
      if (canonical_hidden and (canonical_owner is distinct from p_provider_slug or canonical_released_at is not null))
        or exists (select 1 from public.v2_model_provider_routes r where r.model_slug = canonical_slug and r.is_stealth) then
        raise exception 'provider_catalog_model_unavailable: %', model_slug_value;
      end if;
      update public.v2_models
      set name = coalesce(nullif(model ->> 'name', ''), canonical_slug), description = nullif(model ->> 'description', ''),
          input_modalities = array(select jsonb_array_elements_text(model -> 'inputModalities')),
          output_modalities = array(select jsonb_array_elements_text(model -> 'outputModalities')), updated_at = now()
      where model_slug = canonical_slug and metadata ->> 'provider_catalog_owner' = p_provider_slug;
      insert into public.provider_catalog_route_candidates (
        run_id, provider_slug, submitted_model_slug, canonical_model_slug, provider_model_slug,
        availability, input_modalities, output_modalities, context_length, max_output_tokens,
        available_from, deprecated_at, shutdown_at, capabilities, pricing
      ) values (
        p_run_id, p_provider_slug, model_slug_value, canonical_slug,
        coalesce(nullif(model ->> 'providerModelSlug', ''), model_slug_value),
        coalesce(model ->> 'availability', 'ready'),
        array(select jsonb_array_elements_text(model -> 'inputModalities')),
        array(select jsonb_array_elements_text(model -> 'outputModalities')),
        nullif(model ->> 'contextLength', '')::integer, nullif(model ->> 'maxOutputTokens', '')::integer,
        nullif(model ->> 'availableFrom', '')::timestamptz, nullif(model ->> 'deprecatedAt', '')::timestamptz,
        nullif(model ->> 'shutdownAt', '')::timestamptz,
        coalesce(model -> 'capabilities', '[]'::jsonb), coalesce(model -> 'pricing', '[]'::jsonb)
      ) on conflict (run_id, submitted_model_slug) do nothing;
      perform public.promote_provider_catalog_candidate(p_run_id, model_slug_value);
      update public.provider_catalog_sync_models
      set canonical_model_slug = canonical_slug, match_type = match_type_value, decision = 'approved',
          decision_reason = 'Automatically applied for an approved provider.', reviewed_at = now()
      where run_id = p_run_id and model_slug = model_slug_value;
      update public.provider_catalog_models set canonical_model_slug = canonical_slug
      where provider_slug = p_provider_slug and model_slug = model_slug_value;
    end if;

    applied_count := applied_count + 1;
  end loop;

  update public.provider_catalog_sync_runs
  set review_status = case when provider_approved then 'approved' else 'pending' end,
      review_summary = jsonb_build_object('approved', case when provider_approved then applied_count else 0 end,
        'pending', case when provider_approved then 0 else applied_count end)
  where id = p_run_id;

  return applied_count;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.review_provider_application (
  p_provider_slug text,
  p_decision      text,
  p_reason        text,
  p_reviewed_by   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  latest_submission public.provider_onboarding_submissions%rowtype;
  source_row public.provider_catalog_sources%rowtype;
  reviewed_at_value timestamptz := now();
  review_message_value text;
  source_created_value boolean := false;
  claim_workspace_id uuid;
  claim_previously_approved boolean := false;
begin
  if p_decision not in ('approved', 'paused', 'rejected', 'needs_changes') then
    raise exception 'invalid_provider_review_decision';
  end if;
  if p_decision <> 'approved' and nullif(btrim(p_reason), '') is null then
    raise exception 'provider_review_reason_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_provider_slug, 0));
  select * into latest_submission
  from public.provider_onboarding_submissions
  where provider_slug = p_provider_slug
  order by created_at desc
  limit 1
  for update;
  if not found then
    return public.set_self_serve_provider_review(p_provider_slug, p_decision, p_reason, p_reviewed_by);
  end if;
  select exists (
    select 1
    from public.provider_account_links link
    where link.provider_slug = p_provider_slug
      and link.linked_by = latest_submission.submitted_by
      and link.role = 'owner'
      and link.proof_method = 'domain_file'
      and link.status = 'active'
  ) into claim_previously_approved;

  perform 1 from public.v2_providers where provider_slug = p_provider_slug for update;
  if not found then raise exception 'self_serve_provider_not_found'; end if;

  if latest_submission.application_type <> 'claim' then
    update public.provider_onboarding_submissions
    set provider_review_status = p_decision,
        provider_review_reason = case when p_decision = 'approved' then null else btrim(p_reason) end,
        provider_reviewed_by = p_reviewed_by,
        provider_reviewed_at = reviewed_at_value,
        pending_webhook_secret_ciphertext = null,
        pending_webhook_secret_iv = null,
        pending_webhook_secret_hash = null,
      updated_at = reviewed_at_value
    where id = latest_submission.id;
    return public.set_self_serve_provider_review(p_provider_slug, p_decision, p_reason, p_reviewed_by)
      || jsonb_build_object('applicationType', latest_submission.application_type);
  end if;

  update public.provider_onboarding_submissions
  set provider_review_status = p_decision,
      provider_review_reason = case when p_decision = 'approved' then null else btrim(p_reason) end,
      provider_reviewed_by = p_reviewed_by,
      provider_reviewed_at = reviewed_at_value,
      updated_at = reviewed_at_value
  where id = latest_submission.id;

  if p_decision = 'approved' then
    select workspace_id into claim_workspace_id
    from public.provider_account_links
    where provider_slug = p_provider_slug
      and linked_by = latest_submission.submitted_by
      and role = 'owner'
      and status = 'pending'
      and proof_method = 'domain_file'
    order by verified_at desc nulls last, created_at desc
    limit 1
    for update;
    if found then
      update public.provider_account_links
      set status = 'revoked', updated_at = reviewed_at_value
      where provider_slug = p_provider_slug
        and role = 'owner'
        and status = 'active'
        and workspace_id <> claim_workspace_id;
      update public.provider_account_links
      set status = 'active',
          verified_at = coalesce(verified_at, reviewed_at_value),
          updated_at = reviewed_at_value
      where provider_slug = p_provider_slug
        and workspace_id = claim_workspace_id
        and linked_by = latest_submission.submitted_by
        and status = 'pending';
    end if;

    update public.v2_providers provider
    set name = latest_submission.provider_name,
        metadata = (coalesce(provider.metadata, '{}'::jsonb) - 'self_serve')
          || jsonb_build_object(
            'website_url', latest_submission.website_url,
            'logo_url', latest_submission.logo_url,
            'catalog_url', latest_submission.catalog_url,
            'catalog_sha256', latest_submission.catalog_sha256,
            'last_submitted_by', latest_submission.submitted_by,
            'last_submitted_at', latest_submission.submitted_at
          ),
        updated_at = reviewed_at_value
    where provider.provider_slug = p_provider_slug;

    select * into source_row
    from public.provider_catalog_sources
    where provider_slug = p_provider_slug
    for update;
    if found then
      update public.provider_catalog_sources source
      set catalog_url = case when latest_submission.catalog_mode = 'remote' then latest_submission.catalog_url else null end,
          management_mode = latest_submission.catalog_mode,
          managed_catalog = case
            when latest_submission.catalog_mode = 'remote' then null
            when source.management_mode = 'managed' and source.managed_catalog is not null then source.managed_catalog
            else '{"data":[]}'::jsonb
          end,
          managed_updated_by = case when latest_submission.catalog_mode = 'managed' then latest_submission.submitted_by else null end,
          managed_updated_at = case
            when latest_submission.catalog_mode = 'managed' then coalesce(source.managed_updated_at, reviewed_at_value)
            else null
          end,
          status = 'active',
          etag = null,
          last_modified = null,
          last_error = null,
          consecutive_failures = 0,
          refresh_requested = true,
          next_poll_at = case when latest_submission.catalog_mode = 'remote' then reviewed_at_value else null end,
          updated_at = reviewed_at_value
      where source.provider_slug = p_provider_slug;
    else
      insert into public.provider_catalog_sources (
        provider_slug, catalog_url, management_mode, managed_catalog,
        managed_updated_by, managed_updated_at, status, delivery_mode, created_by,
        webhook_secret_ciphertext, webhook_secret_iv, webhook_secret_hash, next_poll_at,
        refresh_requested, updated_at
      ) values (
        p_provider_slug,
        case when latest_submission.catalog_mode = 'remote' then latest_submission.catalog_url else null end,
        latest_submission.catalog_mode,
        case when latest_submission.catalog_mode = 'managed' then '{"data":[]}'::jsonb else null end,
        case when latest_submission.catalog_mode = 'managed' then latest_submission.submitted_by else null end,
        case when latest_submission.catalog_mode = 'managed' then reviewed_at_value else null end,
        'active', 'webhook_and_polling', latest_submission.submitted_by,
        latest_submission.pending_webhook_secret_ciphertext,
        latest_submission.pending_webhook_secret_iv,
        latest_submission.pending_webhook_secret_hash,
        case when latest_submission.catalog_mode = 'remote' then reviewed_at_value else null end,
        true, reviewed_at_value
      );
      source_created_value := true;
    end if;
  elsif p_decision = 'paused' and claim_previously_approved then
    -- A pause after ownership approval is an explicit provider-level action.
    -- Keep the catalog rows intact so they can be reviewed or re-enabled later.
    update public.v2_providers
    set status = 'not_ready', routable = false, routing_enabled = false,
        updated_at = reviewed_at_value
    where provider_slug = p_provider_slug;
    update public.provider_catalog_sources
    set status = 'paused', refresh_requested = false, next_poll_at = null, updated_at = reviewed_at_value
    where provider_slug = p_provider_slug;
  end if;

  update public.provider_onboarding_submissions
  set pending_webhook_secret_ciphertext = null,
      pending_webhook_secret_iv = null,
      pending_webhook_secret_hash = null
  where id = latest_submission.id;

  select case p_decision
    when 'approved' then 'Your provider claim is approved. Validated catalog updates now apply automatically. Public routing requires configured endpoints, adapters, credentials, and prices.'
    when 'needs_changes' then 'Phaseo requested changes to your provider claim: ' || btrim(p_reason)
    when 'rejected' then 'Phaseo rejected your provider claim: ' || btrim(p_reason)
    else 'Phaseo paused your provider claim: ' || btrim(p_reason)
  end into review_message_value;

  insert into public.provider_catalog_events (
    provider_slug, account_user_id, workspace_id, event_type, title, message, payload
  )
  select p_provider_slug, latest_submission.submitted_by, link.workspace_id, 'provider_application_reviewed',
    'Provider claim ' || replace(p_decision, '_', ' '), review_message_value,
    jsonb_build_object('decision', p_decision, 'reason', case when p_decision = 'approved' then null else p_reason end)
  from public.provider_account_links link
  where link.provider_slug = p_provider_slug
    and link.linked_by = latest_submission.submitted_by
    and link.role = 'owner'
    and link.status in ('pending', 'active');

  if p_decision = 'rejected' and not claim_previously_approved then
    update public.provider_account_links
    set status = 'revoked', updated_at = reviewed_at_value
    where provider_slug = p_provider_slug
      and linked_by = latest_submission.submitted_by
      and role = 'owner'
      and proof_method = 'domain_file'
      and status = 'pending';
  end if;

  return jsonb_build_object(
    'providerSlug', p_provider_slug,
    'decision', p_decision,
    'applicationType', 'claim',
    'sourceCreated', source_created_value,
    'providerWorkspaceId', claim_workspace_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_self_serve_provider_review (
  p_provider_slug text,
  p_decision      text,
  p_reason        text,
  p_reviewed_by   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  reviewed_at_value timestamptz := now();
  activated_ids text[] := '{}';
  submitted_by_value uuid;
  review_message_value text;
begin
  if p_decision not in ('approved', 'paused', 'rejected', 'needs_changes') then
    raise exception 'invalid_provider_review_decision';
  end if;
  if p_decision <> 'approved' and nullif(btrim(p_reason), '') is null then
    raise exception 'provider_review_reason_required';
  end if;

  update public.v2_providers provider
  set metadata = jsonb_set(
        coalesce(provider.metadata, '{}'::jsonb),
        '{self_serve}',
        coalesce(provider.metadata -> 'self_serve', '{}'::jsonb) || jsonb_build_object(
          'provider_review_status', p_decision,
          'provider_review_reason', case when p_decision = 'approved' then null else p_reason end,
          'provider_reviewed_by', p_reviewed_by,
          'provider_reviewed_at', reviewed_at_value
        ),
        true
      ),
      status = 'not_ready',
      routable = false,
      routing_enabled = false,
      updated_at = reviewed_at_value
  where provider.provider_slug = p_provider_slug
    and provider.metadata ? 'self_serve';
  if not found then raise exception 'self_serve_provider_not_found'; end if;

  update public.provider_catalog_sources
  set status = case when p_decision = 'approved' then 'active' else 'paused' end,
      refresh_requested = p_decision = 'approved',
      next_poll_at = case when p_decision = 'approved' then reviewed_at_value else null end,
      updated_at = reviewed_at_value
  where provider_slug = p_provider_slug;

  if p_decision <> 'approved' then
    update public.v2_model_provider_routes set status = case when status = 'retired' then 'retired' else 'disabled' end, routing_enabled = false,
      access_scope = case when phaseo_status in ('blocked', 'unsupported') then access_scope else 'internal' end,
      phaseo_status = case when phaseo_status in ('blocked', 'unsupported') then phaseo_status else 'testing' end,
      provider_availability_status = case when provider_availability_status = 'removed' then 'removed' else 'coming_soon' end, updated_at = reviewed_at_value
    where provider_slug = p_provider_slug and metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_variants variant set status = 'disabled', routing_enabled = false, updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug and variant.provider_model_id = route.provider_model_id
      and variant.metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_capabilities capability set status = 'internal_testing', updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug and capability.provider_model_id = route.provider_model_id
      and capability.capability_id = public.canonical_routing_capability_id(capability.capability_id)
      and capability.metadata ->> 'managed_by' = 'provider_catalog';
  end if;

  select submitted_by into submitted_by_value
  from public.provider_onboarding_submissions
  where provider_slug = p_provider_slug and submitted_by is not null
  order by created_at desc limit 1;

  review_message_value := case p_decision
    when 'approved' then 'Your provider application is approved. Validated catalog updates now apply automatically. Public routing requires configured endpoints, adapters, credentials, and prices.'
    when 'needs_changes' then 'Phaseo requested changes to your provider application: ' || btrim(p_reason)
    when 'rejected' then 'Phaseo rejected your provider application: ' || btrim(p_reason)
    else 'Phaseo paused your provider application: ' || btrim(p_reason)
  end;

  insert into public.provider_catalog_events (
    provider_slug, account_user_id, workspace_id, event_type, title, message, payload
  )
  select p_provider_slug, submitted_by_value, link.workspace_id, 'provider_application_reviewed',
    'Provider application ' || replace(p_decision, '_', ' '), review_message_value,
    jsonb_build_object('decision', p_decision, 'reason', case when p_decision = 'approved' then null else p_reason end)
  from public.provider_account_links link
  where link.provider_slug = p_provider_slug and link.status in ('pending', 'active');

  return jsonb_build_object('providerSlug', p_provider_slug, 'decision', p_decision, 'activatedRouteIds', activated_ids);
end;
$function$;
