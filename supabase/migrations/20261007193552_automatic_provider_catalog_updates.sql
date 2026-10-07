SET local check_function_bodies = off;

ALTER TABLE "public"."provider_catalog_route_candidates"
  ADD COLUMN "service_tiers" jsonb NOT NULL DEFAULT '[]'::jsonb;

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
  pending_count integer := 0;
  rejected_count integer := 0;
  changes_count integer := 0;
  request_status text;
  request_reason text;
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
      where (coalesce(nullif(incoming ->> 'providerModelSlug', ''), incoming ->> 'id') = route.provider_model_slug
          and coalesce(route.metadata->>'catalog_service_tier','standard')='standard'
        or exists (select 1 from jsonb_array_elements(coalesce(incoming->'serviceTiers','[]'::jsonb)) tier
          where tier->>'providerModelSlug'=route.provider_model_slug
            and tier->>'serviceTier'=coalesce(route.metadata->>'catalog_service_tier','standard')))
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
      jsonb_build_object('pricing', coalesce(model -> 'pricing', '[]'::jsonb), 'serviceTiers', coalesce(model->'serviceTiers','[]'::jsonb))
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
      jsonb_build_object('pricing', coalesce(model -> 'pricing', '[]'::jsonb), 'serviceTiers', coalesce(model->'serviceTiers','[]'::jsonb)),
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
          update public.provider_catalog_sync_models
          set decision = 'needs_changes', match_type = 'new_model',
            decision_reason = 'Unknown canonical model ID outside your provider namespace. Use a public canonical model ID or submit a new model in your own namespace.',
            route_projection_status = 'failed', reviewed_at = now()
          where run_id = p_run_id and model_slug = model_slug_value;
          changes_count := changes_count + 1;
          applied_count := applied_count + 1;
          continue;
        end if;
        insert into public.provider_catalog_model_requests(provider_slug,model_slug,source_run_id,model)
        values(p_provider_slug,model_slug_value,p_run_id,model)
        on conflict(provider_slug,model_slug) do update set
          source_run_id=excluded.source_run_id,model=excluded.model,
          updated_at=case when provider_catalog_model_requests.model is distinct from excluded.model or provider_catalog_model_requests.status in ('withdrawn','approved') then now() else provider_catalog_model_requests.updated_at end,
          status=case when provider_catalog_model_requests.status in ('withdrawn','approved') or (provider_catalog_model_requests.status in ('rejected','needs_changes') and provider_catalog_model_requests.model is distinct from excluded.model) then 'pending' else provider_catalog_model_requests.status end,
          notification_sent_at=case when provider_catalog_model_requests.status in ('withdrawn','approved') or (provider_catalog_model_requests.status in ('rejected','needs_changes') and provider_catalog_model_requests.model is distinct from excluded.model) then null else provider_catalog_model_requests.notification_sent_at end
        returning status,reason into request_status,request_reason;
        update public.provider_catalog_sync_models set decision=case when request_status in ('rejected','needs_changes') then request_status else 'pending' end,
          match_type='new_model',decision_reason=coalesce(request_reason,'New canonical model requires administrator approval.')
        where run_id=p_run_id and model_slug=model_slug_value;
        if request_status='rejected' then rejected_count := rejected_count + 1;
        elsif request_status='needs_changes' then changes_count := changes_count + 1;
        else pending_count := pending_count + 1;
        end if;
        applied_count := applied_count + 1;
        continue;
      end if;
      select m.hidden, m.metadata ->> 'provider_catalog_owner', m.released_at into canonical_hidden, canonical_owner, canonical_released_at
      from public.v2_models m where m.model_slug = canonical_slug for update;
      if (canonical_hidden and (canonical_owner is distinct from p_provider_slug or canonical_released_at is not null))
        or exists (select 1 from public.v2_model_provider_routes r where r.model_slug = canonical_slug and r.is_stealth) then
        update public.provider_catalog_sync_models
        set decision = 'needs_changes', match_type = match_type_value,
          decision_reason = 'This canonical model is unavailable for public catalog listings. Use a public canonical model ID or contact Phaseo to review the mapping.',
          route_projection_status = 'failed', reviewed_at = now()
        where run_id = p_run_id and model_slug = model_slug_value;
        changes_count := changes_count + 1;
        applied_count := applied_count + 1;
        continue;
      end if;
      update public.provider_catalog_model_requests set status='approved',updated_at=now()
      where provider_slug=p_provider_slug and model_slug=model_slug_value and status<>'approved';
      update public.v2_models
      set name = coalesce(nullif(model ->> 'name', ''), canonical_slug), description = nullif(model ->> 'description', ''),
          input_modalities = array(select jsonb_array_elements_text(model -> 'inputModalities')),
          output_modalities = array(select jsonb_array_elements_text(model -> 'outputModalities')), updated_at = now()
      where model_slug = canonical_slug and metadata ->> 'provider_catalog_owner' = p_provider_slug;
      insert into public.provider_catalog_route_candidates (
        run_id, provider_slug, submitted_model_slug, canonical_model_slug, provider_model_slug,
        availability, input_modalities, output_modalities, context_length, max_output_tokens,
        available_from, deprecated_at, shutdown_at, capabilities, pricing, service_tiers
      ) values (
        p_run_id, p_provider_slug, model_slug_value, canonical_slug,
        coalesce(nullif(model ->> 'providerModelSlug', ''), model_slug_value),
        coalesce(model ->> 'availability', 'ready'),
        array(select jsonb_array_elements_text(model -> 'inputModalities')),
        array(select jsonb_array_elements_text(model -> 'outputModalities')),
        nullif(model ->> 'contextLength', '')::integer, nullif(model ->> 'maxOutputTokens', '')::integer,
        nullif(model ->> 'availableFrom', '')::timestamptz, nullif(model ->> 'deprecatedAt', '')::timestamptz,
        nullif(model ->> 'shutdownAt', '')::timestamptz,
        coalesce(model -> 'capabilities', '[]'::jsonb), coalesce(model -> 'pricing', '[]'::jsonb), coalesce(model->'serviceTiers','[]'::jsonb)
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

  update public.provider_catalog_model_requests set status='withdrawn',updated_at=now()
  where provider_slug=p_provider_slug and status in ('pending','needs_changes')
    and not exists(select 1 from jsonb_array_elements(p_models) submitted where submitted->>'id'=model_slug);
  update public.provider_catalog_sync_runs
  set review_status = case
        when provider_approved is not true then 'pending'
        when pending_count>0 then case when applied_count>pending_count+rejected_count+changes_count then 'partially_approved' else 'pending' end
        when changes_count>0 then case when applied_count>pending_count+rejected_count+changes_count then 'partially_approved' else 'needs_changes' end
        when rejected_count>0 then case when applied_count>rejected_count then 'partially_approved' else 'rejected' end
        else 'approved' end,
      review_summary = jsonb_build_object('approved', case when provider_approved then applied_count-pending_count-rejected_count-changes_count else 0 end,
        'pending', case when provider_approved then pending_count else applied_count end,'rejected',rejected_count,'needs_changes',changes_count)
  where id = p_run_id;

  -- Re-evaluate blocked mappings even when the remote document is unchanged.
  -- Preserve refreshes already requested by a concurrent edit or review.
  if changes_count > 0 then
    update public.provider_catalog_sources
    set refresh_requested = true,
      next_poll_at = now() + make_interval(secs => poll_interval_seconds)
    where provider_slug = p_provider_slug and management_mode = 'remote'
      and status = 'active' and refresh_requested = false;
  end if;

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
  base_candidate public.provider_catalog_route_candidates%rowtype;
  tier_offer jsonb;
  tier_name text;
  any_route_enabled boolean := false;
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
  base_candidate := candidate;
  for tier_offer in select value from jsonb_array_elements(case when jsonb_array_length(candidate.service_tiers)>0
    then candidate.service_tiers else jsonb_build_array(jsonb_build_object('serviceTier','standard','providerModelSlug',candidate.provider_model_slug,'pricing',candidate.pricing,'availability',candidate.availability)) end)
  loop
  candidate := base_candidate;
  tier_name := tier_offer->>'serviceTier';
  if tier_name not in ('standard','fast','ultrafast','flex','batch') or tier_name is null then raise exception 'provider_catalog_service_tier_invalid'; end if;
  candidate.provider_model_slug := tier_offer->>'providerModelSlug';
  candidate.pricing := coalesce(tier_offer->'pricing','[]'::jsonb);
  candidate.availability := coalesce(tier_offer->>'availability',candidate.availability);
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
    and coalesce(route.metadata->>'catalog_service_tier','standard')=tier_name
  order by route.created_at limit 1;
  if provider_model_id_value is null then
    provider_model_id_value := candidate.provider_slug || ':' || candidate.canonical_model_slug || ':' || candidate.provider_model_slug;
    if tier_name <> 'standard' then provider_model_id_value := provider_model_id_value || ':tier:' || tier_name; end if;
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
  any_route_enabled := any_route_enabled or coalesce(route_enabled,false);
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
      'catalog_service_tier', tier_name,
      'catalog_upstream_service_tier', tier_offer->>'upstreamServiceTier',
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
      coalesce((select jsonb_object_agg(p.value, true) from jsonb_array_elements_text(coalesce(capability -> 'parameters', '[]'::jsonb)) as p(value)), '{}'::jsonb)
        || case when tier_offer->>'upstreamServiceTier' is not null then '{"service_tier":true}'::jsonb else '{}'::jsonb end
        || case when jsonb_array_length(base_candidate.service_tiers)>0
          then jsonb_build_object('__provider_catalog_tier', jsonb_build_object('name',tier_name,'upstream',tier_offer->>'upstreamServiceTier'))
          else '{}'::jsonb end,
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
    provider_model_id_value, 'global:' || tier_name, tier_name,
    case when route_enabled then route_status else 'disabled' end,
    route_enabled, initcap(tier_name),
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
    provider_model_id_value, variant_id_value, tier_name, sku_code_value, sku_version_value,
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

  end loop;

  update public.provider_catalog_sync_models
  set route_projection_status = case when any_route_enabled then 'enabled' else 'staged' end
  where run_id=p_run_id and model_slug=p_submitted_model_slug;
  return provider_model_id_value;
end;
$function$;
