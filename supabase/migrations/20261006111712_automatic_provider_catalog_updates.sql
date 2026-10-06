SET local check_function_bodies = off;

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
begin
  select case when p.metadata ? 'self_serve'
    then p.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved'
    else p.status <> 'disabled' end into provider_approved
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
    and route.metadata ->> 'managed_by' = 'provider_catalog' and route.status = 'retired';

  update public.v2_pricing_skus sku
  set status = case when sku.effective_from >= now() then 'disabled' else 'deprecated' end,
      effective_to = case when sku.effective_from < now() then now() else sku.effective_to end, updated_at = now()
  from public.v2_model_provider_routes route
  where sku.provider_model_id = route.provider_model_id and sku.status = 'active'
    and sku.sku_code = 'provider-catalog-standard' and route.provider_slug = p_provider_slug
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
