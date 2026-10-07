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

GRANT EXECUTE ON FUNCTION "public"."apply_provider_catalog_snapshot"(text, uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_provider_catalog_snapshot"(text, uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_provider_catalog_snapshot"(text, uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_provider_catalog_snapshot"(text, uuid, jsonb) FROM PUBLIC, "anon", "authenticated";
