SET local check_function_bodies = off;

CREATE TABLE "public"."provider_catalog_policy_approval_events" (
  "id"                bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "provider_slug"     text                     NOT NULL,
  "previous_approval" jsonb,
  "current_approval"  jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_catalog_policy_approval_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."provider_catalog_policy_approval_events"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."provider_catalog_policy_approval_events" FROM "anon", "authenticated";

CREATE TABLE "public"."provider_catalog_policy_approvals" (
  "provider_slug"      text                     NOT NULL,
  "enabled"            boolean                  NOT NULL DEFAULT false,
  "catalog_url"        text,
  "management_mode"    text                     NOT NULL,
  "privacy_policy_url" text                     NOT NULL,
  "approved_by"        uuid                     NOT NULL,
  "approved_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_catalog_policy_approvals_management_mode_check" CHECK ((management_mode = ANY (ARRAY['remote'::text, 'managed'::text]))),
  CONSTRAINT "provider_catalog_policy_approvals_pkey" PRIMARY KEY (provider_slug),
  CONSTRAINT "provider_catalog_policy_approvals_privacy_policy_url_check" CHECK ((privacy_policy_url ~~ 'https://%'::text))
);

ALTER TABLE "public"."provider_catalog_policy_approvals"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."provider_catalog_policy_approvals" FROM "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."provider_catalog_policy_approval_events_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."provider_catalog_policy_approval_events_id_seq" FROM "authenticated";

REVOKE ALL ON SEQUENCE "public"."provider_catalog_policy_approval_events_id_seq" FROM "service_role";

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
      jsonb_build_object('pricing', coalesce(model -> 'pricing', '[]'::jsonb), 'serviceTiers', coalesce(model->'serviceTiers','[]'::jsonb), 'declarations', model->'declarations')
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
      jsonb_build_object('pricing', coalesce(model -> 'pricing', '[]'::jsonb), 'serviceTiers', coalesce(model->'serviceTiers','[]'::jsonb), 'declarations', model->'declarations'),
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

CREATE OR REPLACE FUNCTION public.audit_catalog_policy_approval()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  INSERT INTO public.provider_catalog_policy_approval_events(provider_slug, previous_approval, current_approval)
  VALUES (coalesce(NEW.provider_slug, OLD.provider_slug), CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION "public"."audit_catalog_policy_approval"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.gateway_fetch_public_catalog_at (
  p_model     text,
  p_endpoints text[],
  p_at        timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_at timestamptz := p_at;
  v_endpoint text;
  v_model text;
  v_providers jsonb;
  v_pricing jsonb;
  v_variants jsonb := '[]'::jsonb;
  v_provider_rows jsonb;
  v_route_modes jsonb;
  v_until timestamptz;
  v_boundary timestamptz;
begin
  if p_model is null or length(p_model) > 512 or p_model like '@%'
    or cardinality(p_endpoints) not between 1 and 2
    or not (p_endpoints <@ array['text.generate','responses','chat.completions','messages']::text[]) then
    raise exception 'invalid_public_catalog_request' using errcode = '22023';
  end if;
  -- Snapshots are evaluated now or at an upcoming boundary so the gateway can
  -- switch to the next catalogue state exactly on time without a database read.
  if v_at is null or v_at < now() - interval '1 minute' or v_at > now() + interval '1 day' then
    raise exception 'invalid_public_catalog_time' using errcode = '22023';
  end if;
  v_until := v_at + interval '5 minutes';
  v_model := coalesce(
    (select a.model_slug from public.v2_model_aliases a where a.alias_slug=p_model and a.enabled limit 1),
    (select r.model_slug from public.v2_model_provider_routes r
      where position('/' in p_model)>0 and r.provider_slug=split_part(p_model,'/',1)
        and r.provider_model_slug=regexp_replace(p_model,'^[^/]+/','') and r.routing_enabled
        and (r.effective_from is null or r.effective_from<=v_at) and (r.effective_to is null or v_at<r.effective_to)
      order by coalesce(r.effective_from,to_timestamp(0)) desc,r.provider_model_id limit 1), p_model);

  foreach v_endpoint in array p_endpoints loop
    with provider_rows as (
      select distinct on (r.provider_model_id)
        r.*, c.status as capability_status,coalesce(c.params,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('data_policy',public.resolve_catalog_data_policy(r.provider_model_id,c.capability_id))) as params,c.max_input_tokens as cap_input,c.max_output_tokens as cap_output,
        coalesce(case when jsonb_typeof(r.metadata->'availability') = 'object' and (r.metadata->'availability'->>'mode') in ('allowlist','blocklist') and jsonb_typeof(r.metadata->'availability'->'countries') = 'array' then r.metadata->'availability' end,p.metadata->'availability') as availability,
        p.prompt_training_policy,p.data_policy_tier,p.data_policy_confidence,p.data_policy_contract_mode,p.data_policy_variant
      from public.v2_model_provider_routes r
      join public.v2_models m on m.model_slug=r.model_slug
      join public.v2_providers p on p.provider_slug=r.provider_slug
      join public.v2_route_capabilities c on c.provider_model_id=r.provider_model_id
      where r.model_slug=v_model and not coalesce(m.hidden,false)
        -- Retirement is informational: a retired model is served while any
        -- provider route stays enabled. Disable routes to stop traffic.
        and (m.status is null or lower(m.status) in ('active','available','deprecated','retired'))
        and c.capability_id=v_endpoint and c.status in ('active','deranked','deranked_lvl1','deranked_lvl2','deranked_lvl3')
        and r.routing_enabled
        and (p.status <> 'external' or coalesce(r.metadata->>'external_routing_override', 'false') = 'true')
        and (r.effective_from is null or r.effective_from<=v_at)
        and (r.effective_to is null or v_at<r.effective_to)
        and (c.effective_from is null or c.effective_from<=v_at)
        and (c.effective_to is null or v_at<c.effective_to)
      order by r.provider_model_id,coalesce(c.updated_at,c.created_at) desc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'provider_id',r.provider_slug,'api_model_id',r.model_slug,'pricing_key',r.provider_slug,
      'provider_model_slug',r.provider_model_slug,'availability',r.availability,'model_status',r.status,
      'external_routing_override',coalesce((r.metadata->>'external_routing_override')::boolean,false),
      'input_modalities',r.input_modalities,'output_modalities',r.output_modalities,
      'prompt_training_policy',coalesce(r.prompt_training_policy,'unknown'),
      'data_policy_tier',coalesce(r.data_policy_tier,'unknown'),'data_policy_confidence',coalesce(r.data_policy_confidence,'unknown'),
      'data_policy_contract_mode',coalesce(r.data_policy_contract_mode,'none'),'data_policy_variant',coalesce(r.data_policy_variant,'standard'),
      'capability_status',r.capability_status,'capability_params',coalesce(r.params,'{}'::jsonb),
      'max_input_tokens',r.cap_input,'max_output_tokens',r.cap_output,'supports_endpoint',true,'base_weight',1,'byok_meta','[]'::jsonb
    ) order by r.provider_model_id),'[]'::jsonb),
    coalesce(jsonb_object_agg(r.provider_slug,(
      select jsonb_build_object('provider',r.provider_slug,'model',v_model,'endpoint',v_endpoint,
        'effective_from',min(pr.effective_from),'effective_to',min(pr.effective_to),'currency','USD','version',max(pr.updated_at),
        'rules',coalesce(jsonb_agg(jsonb_build_object(
          'id',pr.rule_id,'pricing_plan',pr.pricing_plan,'meter',pr.meter,'unit',pr.unit,'unit_size',pr.unit_size,
          'price_per_unit',pr.price_per_unit,'included_quantity',pr.included_quantity,'currency',pr.currency,
          'match',pr.match,'priority',pr.priority,'billing_timestamp_basis',coalesce(pr.billing_timestamp_basis,'request_start'),
          'time_windows',coalesce(pr.time_windows,'[]'::jsonb)
        ) order by pr.priority desc,coalesce(pr.effective_from,v_at) desc),'[]'::jsonb))
      from (
        select meter.sku_meter_id::text as rule_id,route.provider_slug||':'||route.model_slug||':'||sku.operation as model_key,
          sku.operation as capability_id,coalesce(sku.service_tier_slug,'standard') as pricing_plan,meter.meter_key as meter,
          meter.unit,meter.unit_quantity as unit_size,meter.price_nanos/1000000000.0 as price_per_unit,
          coalesce(nullif(meter.metadata->>'included_quantity','')::numeric,nullif(sku.metadata->>'included_quantity','')::numeric,0) as included_quantity,
          sku.currency,coalesce(nullif(meter.metadata->>'priority','')::integer,meter.meter_order,100) as priority,
          sku.effective_from,sku.effective_to,coalesce(sku.metadata->'match',meter.metadata->'match','[]'::jsonb) as match,
          coalesce(sku.metadata->>'billing_timestamp_basis','request_start') as billing_timestamp_basis,
          coalesce(sku.metadata->'time_windows','[]'::jsonb) as time_windows,greatest(sku.updated_at,meter.updated_at) as updated_at
        from public.v2_pricing_skus sku join public.v2_model_provider_routes route using(provider_model_id)
          join public.v2_pricing_sku_meters meter using(sku_id) where sku.status='active' and meter.billable
      ) pr
      where pr.model_key=r.provider_slug||':'||v_model||':'||v_endpoint and pr.capability_id=v_endpoint
        and (pr.effective_from is null or pr.effective_from<=v_at) and (pr.effective_to is null or v_at<pr.effective_to)
    )),'{}'::jsonb) into v_providers,v_pricing from provider_rows r;
    v_variants := v_variants || jsonb_build_array(jsonb_build_object('endpoint',v_endpoint,'providers',v_providers,'pricing',v_pricing));
  end loop;

  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into v_provider_rows from (
    select provider_slug,status,routing_enabled,routable,credential_mode,provider_family_slug,offer_scope,offer_label,
      residency_mode,default_execution_regions,default_data_regions,zero_data_retention,prompt_training_policy,
      data_policy_tier,data_policy_confidence,data_policy_contract_mode,data_policy_variant,stream_cancellation_support,
      stream_cancellation_stops_provider_billing,stream_cancellation_usage_recovery,stream_cancellation_evidence_kind,
      stream_cancellation_source_url,jsonb_build_object('availability',metadata->'availability') as metadata
    from public.v2_providers where provider_slug in (
      select item->>'provider_id' from jsonb_array_elements(v_variants) variant,
        lateral jsonb_array_elements(variant->'providers') item)
  ) p;
  select coalesce(jsonb_agg(jsonb_build_object('provider_slug',provider_slug,'credential_mode',credential_mode)),'[]'::jsonb)
    into v_route_modes from public.v2_model_provider_routes where model_slug=v_model and routing_enabled and status in ('active','degraded');

  -- The next scheduled change covers future route/capability/price activation,
  -- not only currently selected price cards. KV's physical TTL is not freshness.
  select min(boundary) into v_boundary from (
    select effective_from as boundary from public.v2_model_provider_routes where model_slug=v_model
    union all select effective_to from public.v2_model_provider_routes where model_slug=v_model
    union all select c.effective_from from public.v2_route_capabilities c join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model
    union all select c.effective_to from public.v2_route_capabilities c join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model
    union all select s.effective_from from public.v2_pricing_skus s join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model and s.status='active'
    union all select s.effective_to from public.v2_pricing_skus s join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model and s.status='active'
  ) boundaries where boundary>v_at;
  v_until := least(v_until,coalesce(v_boundary,v_until));
  return jsonb_build_object('version',1,'model',p_model,'resolvedModel',v_model,'endpoints',p_endpoints,
    'checkedAt',floor(extract(epoch from v_at)*1000),'expiresAt',floor(extract(epoch from v_until)*1000),
    'variants',v_variants,'providerRows',v_provider_rows,'routeModes',v_route_modes,
    'revision',public.gateway_catalogue_revision(),
    'boundaryAt',case when v_boundary is null then null else floor(extract(epoch from v_boundary)*1000) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_without_workspace_budget (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  credit_status       jsonb;
  key_status          jsonb;
  key_limit_status    jsonb;
  min_balance_nanos bigint := case when endpoint like 'video.%' or endpoint like 'batch%' then 1000000000 else 100000000 end; -- 1.00 USD

  providers           jsonb;
  pricing             jsonb;
  preset_data         jsonb := null;

  -- key row fields
  v_key_active        boolean;
  v_key_team_ok       boolean;
  v_soft_blocked      boolean;

  v_day_req_limit     bigint;
  v_wk_req_limit      bigint;
  v_mo_req_limit      bigint;
  v_day_cost_limit    bigint;
  v_wk_cost_limit     bigint;
  v_mo_cost_limit     bigint;

  now_utc             timestamptz := (now() at time zone 'utc');
  day_start           timestamptz := date_trunc('day',  now_utc);
  week_start          timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start         timestamptz := date_trunc('month', now_utc);

  used_day_reqs       bigint;
  used_wk_reqs        bigint;
  used_mo_reqs        bigint;
  used_day_cost       bigint;
  used_wk_cost        bigint;
  used_mo_cost        bigint;

  within_limits       boolean := true;
  limit_reason        text := null;
  limit_window        text := null;
  limit_metric        text := null;
  current_value       bigint := null;
  limit_value         bigint := null;
  limit_reset_at      timestamptz := null;

  -- Preset handling
  is_preset           boolean := false;
  preset_name         text := null;
  preset_publisher    text := null;

  -- Resolve model from alias if exists
  resolved_model      text := gateway_fetch_request_context_without_workspace_budget.model;
  base_model          text;

  team_enrichment     jsonb;
  key_enrichment      jsonb;

  -- Team aggregates
  team_total_requests bigint;
  team_total_spend_nanos bigint;
  team_spend_24h_nanos bigint;
  team_spend_7d_nanos bigint;
  team_spend_30d_nanos bigint;
  team_requests_1h bigint;
  team_requests_24h bigint;
  team_created_at timestamptz;
  team_tier text;
  team_balance_nanos bigint;
  team_reserved_nanos bigint;

  -- Key aggregates
  key_name text;
  key_created_at timestamptz;
  key_total_requests bigint;
  key_total_spend_nanos bigint;
begin
  base_model := gateway_fetch_request_context_without_workspace_budget.model;
  -- hard requirement: key must be provided
  if gateway_fetch_request_context_without_workspace_budget.api_key_id is null then
    raise exception using errcode = '22023', message = 'missing_api_key', detail = 'api_key_id is required';
  end if;

  -- Check if model is a preset (starts with @)
  if base_model like '@%' then
    is_preset := true;
    preset_name := substring(base_model from 2); -- Remove @ prefix

    -- Fetch preset configuration. Qualified references resolve a
    -- public publisher globally; unqualified references remain workspace-local.
    if position('/' in preset_name) > 0 then
      preset_publisher := split_part(preset_name, '/', 1);
      preset_name := substring(preset_name from position('/' in preset_name) + 1);
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'config', p.config, 'visibility', p.visibility, 'publisher', w.publisher_handle
      ) into preset_data
      from public.presets p
      join public.workspaces w on w.id = p.workspace_id
      where p.archived_at is null and lower(p.slug) = lower(preset_name)
        and p.visibility = 'public'
        and true
        and (lower(w.publisher_handle) = lower(preset_publisher) or exists (select 1 from public.workspace_publisher_handle_aliases alias where alias.workspace_id = w.id and alias.handle = lower(preset_publisher)))
      limit 1;
    else
      select jsonb_build_object(
        'id', p.id, 'name', p.name,
        'slug', coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', '')),
        'description', p.description, 'config', p.config, 'visibility', p.visibility
      ) into preset_data
      from public.presets p
      where p.archived_at is null and lower(coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', ''))) = lower(preset_name)
        and p.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
        and (
          p.visibility in ('public', 'team')
          or p.created_by = (
            select ak.created_by from public.keys ak
            where ak.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
              and ak.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and ak.status = 'active'
          )
        )
      limit 1;
    end if;

    if preset_data is null then
      raise exception using
        errcode = '22023',
        message = 'preset_not_found',
        detail = format('Preset "%s" not found or not accessible', preset_name);
    end if;

    -- Extract model from preset config (fallback to default/default_model/model/first models entry)
    base_model := coalesce(
      preset_data->'config'->>'defaultModel',
      preset_data->'config'->>'default_model',
      preset_data->'config'->>'model',
      preset_data->'config'->'models'->>0,
      preset_data->'config'->'allowedModels'->>0,
      preset_data->'config'->'allowed_models'->>0
    );

    if base_model is null then
      raise exception using
        errcode = '22023',
        message = 'preset_no_model',
        detail = format('Preset "%s" has no model configured', preset_name);
    end if;
  end if;

  -- Resolve alias/model indirection:
  -- 1) explicit alias table (`v2_model_aliases`)
  -- 2) provider-scoped slug form (`provider/provider_model_slug`)
  resolved_model := coalesce(
    (
      select a.api_model_id
      from (select alias_slug, model_slug as api_model_id, enabled as is_enabled from public.v2_model_aliases) a
      where a.alias_slug = base_model
        and a.is_enabled = true
        and a.api_model_id is not null
      limit 1
    ),
    (
      select m.api_model_id
      from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at, metadata from public.v2_model_provider_routes) m
      where position('/' in base_model) > 0
        and m.provider_id = split_part(base_model, '/', 1)
        and m.provider_model_slug = regexp_replace(base_model, '^[^/]+/', '')
        and m.is_active_gateway
        and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
        and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
      order by coalesce(m.effective_from, to_timestamp(0)) desc, m.provider_api_model_id
      limit 1
    ),
    base_model
  );

  -- validate key row, status, and team
  select
    (k.status = 'active'),
    (k.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id),
    k.soft_blocked,
    k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
    k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
  into
    v_key_active,
    v_key_team_ok,
    v_soft_blocked,
    v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
    v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit
  from public.keys k
  where k.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
  limit 1;

  if v_key_active is null then
    raise exception using errcode = '22023', message = 'api_key_not_found', detail = 'key id does not exist';
  end if;
  if not v_key_team_ok then
    raise exception using errcode = '22023', message = 'api_key_wrong_team', detail = 'key does not belong to provided workspace_id';
  end if;
  if not v_key_active then
    raise exception using errcode = '22023', message = 'api_key_inactive', detail = 'key status is not active';
  end if;

  key_status := jsonb_build_object('ok', true, 'mode', 'first_party');

  -- credit check
  credit_status :=
    coalesce((
      select case
        when greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0) >= min_balance_nanos then
          jsonb_build_object(
            'ok', true,
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
        else
          jsonb_build_object(
            'ok', false,
            'reason', 'insufficient_funds',
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
      end
      from public.wallets w
      where w.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
      limit 1
    ), jsonb_build_object('ok', false, 'reason', 'wallet_missing'));

  -- per-key limits (requests + cost)
  -- Unlimited keys need no history read. Unknown telemetry stays NULL.
  if greatest(v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
      v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit) > 0 then
  select
    count(*) filter (where gr.created_at >= day_start)                                  as used_day_reqs,
    count(*) filter (where gr.created_at >= week_start)                                 as used_wk_reqs,
    count(*) filter (where gr.created_at >= month_start)                                as used_mo_reqs,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= day_start), 0)::bigint   as used_day_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= week_start), 0)::bigint  as used_wk_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= month_start), 0)::bigint as used_mo_cost
  into
    used_day_reqs, used_wk_reqs, used_mo_reqs,
    used_day_cost, used_wk_cost, used_mo_cost
  from public.gateway_requests gr
  where gr.key_id  = gateway_fetch_request_context_without_workspace_budget.api_key_id
    and gr.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
    and gr.success is true
    and gr.created_at >= least(week_start, month_start);
  end if;

  if v_soft_blocked then
    within_limits := false;
    limit_reason := 'key_limit_soft_blocked';
    limit_metric := 'soft_blocked';
  end if;
  if within_limits and v_day_req_limit > 0 and used_day_reqs >= v_day_req_limit then
    within_limits := false;
    limit_reason := 'daily_request_limit_reached';
    limit_window := 'daily';
    limit_metric := 'requests';
    current_value := used_day_reqs;
    limit_value := v_day_req_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_req_limit > 0 and used_wk_reqs >= v_wk_req_limit then
    within_limits := false;
    limit_reason := 'weekly_request_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'requests';
    current_value := used_wk_reqs;
    limit_value := v_wk_req_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_req_limit > 0 and used_mo_reqs >= v_mo_req_limit then
    within_limits := false;
    limit_reason := 'monthly_request_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'requests';
    current_value := used_mo_reqs;
    limit_value := v_mo_req_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;
  if within_limits and v_day_cost_limit > 0 and used_day_cost >= v_day_cost_limit then
    within_limits := false;
    limit_reason := 'daily_cost_limit_reached';
    limit_window := 'daily';
    limit_metric := 'cost';
    current_value := used_day_cost;
    limit_value := v_day_cost_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_cost_limit > 0 and used_wk_cost >= v_wk_cost_limit then
    within_limits := false;
    limit_reason := 'weekly_cost_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'cost';
    current_value := used_wk_cost;
    limit_value := v_wk_cost_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_cost_limit > 0 and used_mo_cost >= v_mo_cost_limit then
    within_limits := false;
    limit_reason := 'monthly_cost_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'cost';
    current_value := used_mo_cost;
    limit_value := v_mo_cost_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;

  key_limit_status :=
    jsonb_build_object(
      'ok', within_limits,
      'reason', limit_reason,
      'limit_window', limit_window,
      'limit_metric', limit_metric,
      'current_value', current_value,
      'limit_value', limit_value,
      'reset_at', to_jsonb(limit_reset_at),
      'now', to_jsonb(now_utc),
      'buckets', jsonb_build_object(
        'daily', jsonb_build_object(
          'window_start', to_jsonb(day_start),
          'requests_used', used_day_reqs,
          'requests_limit', v_day_req_limit,
          'cost_used_nanos', used_day_cost,
          'cost_limit_nanos', v_day_cost_limit
        ),
        'weekly', jsonb_build_object(
          'window_start', to_jsonb(week_start),
          'requests_used', used_wk_reqs,
          'requests_limit', v_wk_req_limit,
          'cost_used_nanos', used_wk_cost,
          'cost_limit_nanos', v_wk_cost_limit
        ),
        'monthly', jsonb_build_object(
          'window_start', to_jsonb(month_start),
          'requests_used', used_mo_reqs,
          'requests_limit', v_mo_req_limit,
          'cost_used_nanos', used_mo_cost,
          'cost_limit_nanos', v_mo_cost_limit
        )
      )
    );

  -- ============================================================================
  -- TEAM & KEY ENRICHMENT (Wide Event Context for Observability)
  -- Purpose: Gather user/team context for comprehensive logging (loggingsucks.com pattern)
  -- ============================================================================
  -- Team metadata & wallet
  select
    t.created_at,
    coalesce(t.tier, 'basic'),
    greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
    coalesce(w.reserved_nanos, 0)::bigint
  into
    team_created_at,
    team_tier,
    team_balance_nanos,
    team_reserved_nanos
  from public.workspaces t
  left join public.wallets w on w.workspace_id = t.id
  where t.id = gateway_fetch_request_context_without_workspace_budget.workspace_id
  limit 1;

  -- Historical analytics belong in reporting, not request admission.
  -- Leave their enrichment fields NULL instead of scanning lifetime logs.

  -- Calculate tier using calendar-month qualification + lock-window grace.
  -- Function maintains team tier/counters in database when state changes.
  team_tier := calculate_tier_with_grace(gateway_fetch_request_context_without_workspace_budget.workspace_id, team_spend_30d_nanos);

  team_enrichment := jsonb_build_object(
    'tier', team_tier,
    'created_at', to_jsonb(team_created_at),
    'account_age_days', extract(epoch from (now_utc - team_created_at)) / 86400,
    'balance_nanos', team_balance_nanos,
    'available_nanos', team_balance_nanos,
    'reserved_nanos', team_reserved_nanos,
    'balance_usd', round((team_balance_nanos::numeric / 1000000000.0)::numeric, 2),
    'balance_is_low', team_balance_nanos < min_balance_nanos,
    'total_requests', team_total_requests,
    'total_spend_nanos', team_total_spend_nanos,
    'total_spend_usd', round((team_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_24h_nanos', team_spend_24h_nanos,
    'spend_24h_usd', round((team_spend_24h_nanos::numeric / 1000000000.0)::numeric, 4),
    'spend_7d_nanos', team_spend_7d_nanos,
    'spend_7d_usd', round((team_spend_7d_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_30d_nanos', team_spend_30d_nanos,
    'spend_30d_usd', round((team_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_1h', team_requests_1h,
    'requests_24h', team_requests_24h
  );

  -- Key metadata & aggregates
  select
    k.name,
    k.created_at
  into
    key_name,
    key_created_at
  from public.keys k
  where k.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
  limit 1;

  -- Lifetime key analytics are not required to authenticate or enforce limits.

  key_enrichment := jsonb_build_object(
    'name', key_name,
    'created_at', to_jsonb(key_created_at),
    'key_age_days', extract(epoch from (now_utc - key_created_at)) / 86400,
    'total_requests', key_total_requests,
    'total_spend_nanos', key_total_spend_nanos,
    'total_spend_usd', round((key_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_today', used_day_reqs,
    'spend_today_nanos', used_day_cost,
    'spend_today_usd', round((used_day_cost::numeric / 1000000000.0)::numeric, 4),
    'daily_limit_pct', case
      when v_day_req_limit > 0 then round((used_day_reqs::numeric / v_day_req_limit::numeric * 100)::numeric, 1)
      else null
    end
  );

  -- provider candidates (BYOK) + pricing, fully qualifying params
  with provider_rows as (
    select distinct on (m.provider_api_model_id)
      m.provider_api_model_id,
      m.provider_id,
      m.api_model_id,
      m.provider_model_slug, coalesce((select route.metadata -> 'availability' from public.v2_model_provider_routes route where route.provider_model_id = m.provider_api_model_id and jsonb_typeof(route.metadata -> 'availability') = 'object' and (route.metadata -> 'availability' ->> 'mode') in ('allowlist', 'blocklist') and jsonb_typeof(route.metadata -> 'availability' -> 'countries') = 'array'), p.metadata -> 'availability') as availability,
      m.routing_status as model_status,
      coalesce((m.metadata->>'external_routing_override')::boolean, false) as external_routing_override,
      m.input_modalities,
      m.output_modalities,
      p.prompt_training_policy,
      p.data_policy_tier,
      p.data_policy_confidence,
      p.data_policy_contract_mode,
	  p.data_policy_variant,
      c.status as capability_status,
      coalesce(c.params,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('data_policy',public.resolve_catalog_data_policy(m.provider_api_model_id,c.capability_id))) as capability_params,
      c.max_input_tokens,
      c.max_output_tokens
    from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at, metadata from public.v2_model_provider_routes) m
    join (select model_slug as model_id, lab_slug as organisation_id, name, description, status, hidden, announced_at as announcement_date, released_at as release_date, deprecated_at as deprecation_date, retired_at as retirement_date, previous_model_slug as previous_model_id, input_modalities as input_types, output_modalities as output_types, metadata, created_at, updated_at from public.v2_models) dm
      on dm.model_id = coalesce(m.model_id, m.api_model_id)
    join public.v2_providers p
      on p.provider_slug = m.provider_id
    join (select provider_model_id as provider_api_model_id, capability_id, status, params, max_input_tokens, max_output_tokens, effective_from, effective_to, created_at, updated_at from public.v2_route_capabilities) c
      on c.provider_api_model_id = m.provider_api_model_id
    where m.api_model_id = resolved_model
      and coalesce(dm.hidden, false) = false
      and (dm.status is null or lower(dm.status) in ('active', 'available', 'deprecated', 'retired'))
      and c.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
      and c.status in ('active', 'deranked', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3')
      and m.is_active_gateway
      and (
        p.status <> 'external'
        or coalesce((m.metadata->>'external_routing_override')::boolean, false)
      )
      and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
      and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
    order by m.provider_api_model_id, coalesce(c.updated_at, c.created_at) desc
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'provider_id', pr.provider_id,
          'api_model_id', pr.api_model_id,
          'pricing_key', pr.provider_id,
          'provider_model_slug', pr.provider_model_slug, 'availability', pr.availability,
          'model_status', pr.model_status,
          'external_routing_override', pr.external_routing_override,
          'input_modalities', pr.input_modalities,
          'output_modalities', pr.output_modalities,
          'prompt_training_policy', coalesce(pr.prompt_training_policy, 'unknown'),
          'data_policy_tier', coalesce(pr.data_policy_tier, 'unknown'),
          'data_policy_confidence', coalesce(pr.data_policy_confidence, 'unknown'),
          'data_policy_contract_mode', coalesce(pr.data_policy_contract_mode, 'none'),
		  'data_policy_variant', coalesce(pr.data_policy_variant, 'standard'),
          'capability_status', pr.capability_status,
          'capability_params', coalesce(pr.capability_params, '{}'::jsonb),
          'max_input_tokens', pr.max_input_tokens,
          'max_output_tokens', pr.max_output_tokens,
          'supports_endpoint', true,
          'base_weight', 1,
          'byok_meta', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'provider_id', bk.provider_id,
                'id', bk.id,
                'name', bk.name,
                'fingerprint_sha256', bk.fingerprint_sha256,
                'key_version', bk.key_version,
                'always_use', bk.always_use
              )
            )
            from public.byok_keys bk
            where bk.workspace_id    = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and bk.provider_id = pr.provider_id
              and bk.enabled     = true
          ), '[]'::jsonb)
        )
      ), '[]'::jsonb
    ) as provider_payload,
    coalesce(
      jsonb_object_agg(
        pr.provider_id,
        (
          with rules as (
            select r.*
            from (select meter.sku_meter_id::text as rule_id, route.provider_slug as provider_id, route.model_slug as api_model_id, route.provider_slug || ':' || route.model_slug || ':' || sku.operation as model_key, sku.operation as capability_id, coalesce(sku.service_tier_slug, 'standard') as pricing_plan, meter.meter_key as meter, meter.unit, meter.unit_quantity as unit_size, meter.price_nanos / 1000000000.0 as price_per_unit, coalesce(nullif(meter.metadata->>'included_quantity', '')::numeric, nullif(sku.metadata->>'included_quantity', '')::numeric, 0) as included_quantity, sku.currency, coalesce(nullif(meter.metadata->>'priority', '')::integer, meter.meter_order, 100) as priority, sku.effective_from, sku.effective_to, coalesce(sku.metadata->'match', meter.metadata->'match', '[]'::jsonb) as match, coalesce(sku.metadata->>'billing_timestamp_basis', 'request_start') as billing_timestamp_basis, coalesce(sku.metadata->'time_windows', '[]'::jsonb) as time_windows, greatest(sku.updated_at, meter.updated_at) as updated_at from public.v2_pricing_skus sku join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id where sku.status = 'active' and meter.billable) r
            -- TODO: Redesign pricing selection to key on provider_api_model_id or
            -- explicit variant metadata so provider-only SKUs (for example CrofAI
            -- precision tiers) can share a parent internal model without forcing
            -- distinct api_model_id values just to preserve pricing separation.
            where r.model_key =
              pr.provider_id || ':' || resolved_model || ':' || gateway_fetch_request_context_without_workspace_budget.endpoint
              and r.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
              and (r.effective_from is null or r.effective_from <= now() at time zone 'utc')
              and (r.effective_to   is null or (now() at time zone 'utc') < r.effective_to)
          ),
          ordered_rules as (
            select
              jsonb_agg(
                jsonb_build_object(
                  'id', r.rule_id,
                  'pricing_plan', r.pricing_plan,
                  'meter', r.meter,
                  'unit', r.unit,
                  'unit_size', r.unit_size,
                  'price_per_unit', r.price_per_unit,
                  'included_quantity', r.included_quantity,
                  'currency', r.currency,
                  'match', r.match,
                  'priority', r.priority,
                  'billing_timestamp_basis', coalesce(r.billing_timestamp_basis, 'request_start'),
                  'time_windows', coalesce(r.time_windows, '[]'::jsonb)
                )
                order by r.priority desc, coalesce(r.effective_from, now() at time zone 'utc') desc
              ) as items,
              max(r.updated_at) as version_ts,
              min(r.effective_from) as effective_from,
              min(r.effective_to) as effective_to
            from rules r
          )
          select jsonb_build_object(
            'provider', pr.provider_id,
            'model', resolved_model,
            'endpoint', gateway_fetch_request_context_without_workspace_budget.endpoint,
            'effective_from', to_jsonb(o.effective_from),
            'effective_to',   to_jsonb(o.effective_to),
            'currency', 'USD',
            'version', to_jsonb(o.version_ts),
            'rules', coalesce(o.items, '[]'::jsonb)
          )
          from ordered_rules o
        )
      ),
      '{}'::jsonb
    ) as pricing_payload
  into providers, pricing
  from provider_rows pr;

  return jsonb_build_object(
    'workspace_id', gateway_fetch_request_context_without_workspace_budget.workspace_id,
    'resolved_model', resolved_model,
    'preset', preset_data,
    'key_ok', key_status,
    'key_limit_ok', key_limit_status,
    'credit_ok', credit_status,
    'providers', providers,
    'pricing', pricing,
    'team_enrichment', team_enrichment,
    'key_enrichment', key_enrichment
  );
end;

$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_pricing_without_stealth_redaction (
  p_model_slug   text,
  p_region       text DEFAULT NULL::text,
  p_service_tier text DEFAULT NULL::text
)
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with eligible_variants as (
    select variant.variant_id, variant.provider_model_id, variant.service_tier_slug,
      variant.execution_region, variant.data_region,
      variant.status, variant.routing_enabled, variant.metadata as variant_metadata
    from public.v2_route_variants variant
    where (p_region is null or lower(p_region) = lower(coalesce(variant.execution_region, ''))
        or lower(p_region) = lower(coalesce(variant.data_region, '')))
      and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
  ),
  provider_models as (
    select
      route.provider_slug,
      provider.name as provider_name,
      provider.status as provider_status,
      provider.routing_enabled as provider_routing_enabled,
      route.provider_model_id,
      route.model_slug,
      route.provider_model_slug,
      route.status as route_status,
      route.routing_enabled as route_routing_enabled,
      coalesce(nullif(variant.variant_metadata->>'availability_status', ''), route.provider_availability_status::text) as provider_availability_status,
      route.phaseo_status,
      route.access_scope,
      route.input_modalities,
      route.output_modalities,
      route.context_length,
      route.max_output_tokens,
      variant.variant_id,
      variant.service_tier_slug,
      variant.execution_region,
      variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      route.effective_from,
      route.effective_to,
      capability.capability_id,
      capability.status as capability_status,
      capability.params,
      public.resolve_catalog_data_policy(route.provider_model_id, capability.capability_id) as data_policy,
      capability.max_input_tokens,
      capability.max_output_tokens as capability_max_output_tokens
    from public.v2_model_provider_routes route
    join public.v2_providers provider on provider.provider_slug = route.provider_slug
    join eligible_variants variant on variant.provider_model_id = route.provider_model_id
    left join public.v2_route_capabilities capability on capability.provider_model_id = route.provider_model_id
    where route.model_slug = lower(trim(p_model_slug))
      and provider.status <> 'disabled'
      and (
        provider.status <> 'external'
        or (
          route.routing_enabled = true
          and coalesce(route.metadata->>'external_routing_override', 'false') = 'true'
        )
      )
      and route.access_scope = 'public'
      and coalesce(capability.status, 'active') <> 'internal_testing'
  ),
  grouped as (
    select
      model.provider_slug,
      max(model.provider_name) as provider_name,
      max(model.provider_status) as provider_status,
      bool_or(model.provider_routing_enabled) as provider_routing_enabled,
      jsonb_agg(distinct jsonb_build_object(
        'id', model.provider_model_id,
        'api_provider_id', model.provider_slug,
        'provider_model_slug', model.provider_model_slug,
        'model_id', model.model_slug,
        'endpoint', coalesce(model.capability_id, 'unmapped'),
        'capability_status', model.capability_status,
        'routing_status', model.route_status,
        'is_active_gateway', model.route_status in ('active', 'degraded')
          and model.route_routing_enabled
          and model.variant_status in ('active', 'degraded')
          and model.variant_routing_enabled
          and model.provider_routing_enabled
          and model.phaseo_status = 'enabled'
          and (
          model.provider_availability_status in ('available', 'preview', 'limited_access')
          or (
            model.provider_availability_status = 'deprecated'
            and model.effective_to is not null
            and model.effective_to > now()
          )
        ),
        'provider_availability_status', model.provider_availability_status,
        'phaseo_status', model.phaseo_status,
        'access_scope', model.access_scope,
        'input_modalities', array_to_string(model.input_modalities, ','),
        'output_modalities', array_to_string(model.output_modalities, ','),
        'context_length', model.context_length,
        'max_input_tokens', model.max_input_tokens,
        'max_output_tokens', coalesce(model.capability_max_output_tokens, model.max_output_tokens),
        'params', model.params,
        'data_policy', coalesce(model.data_policy, '{}'::jsonb),
        'service_tier', model.service_tier_slug,
        'execution_region', model.execution_region,
        'data_region', model.data_region,
        'effective_from', model.effective_from,
        'effective_to', model.effective_to
      )) as provider_models,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sku.sku_id,
          'model_key', model.provider_slug || ':' || route.model_slug || ':' || sku.operation,
          'capability_id', sku.operation,
          'pricing_plan', sku.service_tier_slug,
          'meter', meter.meter_key,
          'rule_id', meter.sku_meter_id,
          'modality', meter.modality,
          'direction', meter.direction,
          'display_label', meter.display_label,
          'display_unit', meter.display_unit,
          'unit', meter.unit,
          'unit_size', meter.unit_quantity,
          'price_per_unit', meter.price_nanos / 1000000000.0,
          'included_quantity', coalesce(nullif(meter.metadata->>'included_quantity', '')::numeric, nullif(sku.metadata->>'included_quantity', '')::numeric, 0),
          'currency', sku.currency,
          'priority', coalesce(nullif(meter.metadata->>'priority', '')::integer, nullif(sku.metadata->>'priority', '')::integer, meter.meter_order, 100),
          'effective_from', sku.effective_from,
          'effective_to', sku.effective_to,
          'note', sku.description,
          'match', coalesce(sku.metadata->'match', '[]'::jsonb),
          'billing_timestamp_basis', coalesce(
            sku.metadata->>'billing_timestamp_basis',
            meter.metadata->>'billing_timestamp_basis',
            'request_start'
          ),
          'time_windows', coalesce(
            sku.metadata->'time_windows',
            meter.metadata->'time_windows',
            '[]'::jsonb
          )
        ) order by meter.meter_order, meter.meter_key)
        from public.v2_pricing_skus sku
        join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id and meter.billable
        join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id
        where route.model_slug = lower(trim(p_model_slug))
          and route.access_scope = 'public'
          and sku.provider_model_id in (
            select provider_model_id
            from provider_models
            where provider_slug = model.provider_slug
          )
          and sku.status <> 'disabled'
          and (
            sku.effective_from <= now()
            or (
              sku.status = 'active'
              and exists (
                select 1 from public.v2_pricing_skus current_sku
                where current_sku.provider_model_id = sku.provider_model_id
                  and current_sku.operation = sku.operation
                  and current_sku.service_tier_slug is not distinct from sku.service_tier_slug
                  and current_sku.status <> 'disabled'
                  and current_sku.effective_from <= now()
                  and (current_sku.effective_to is null or current_sku.effective_to > now())
              )
            )
          )
          and (sku.effective_to is null or sku.effective_to > now())
          and (p_service_tier is null or sku.service_tier_slug = lower(p_service_tier))
      ), '[]'::jsonb) as pricing_rules
    from provider_models model
    group by model.provider_slug
  )
  select jsonb_build_object(
    'provider', jsonb_build_object(
      'api_provider_id', grouped.provider_slug,
      'api_provider_name', grouped.provider_name,
      'provider_family_id', policy.provider_family_slug,
      'offer_label', policy.offer_label,
      'offer_scope', policy.offer_scope,
      'country_code', policy.country_code,
      'colour', policy.metadata->>'colour',
      'link', coalesce(policy.metadata->>'link', policy.base_url),
      'status', grouped.provider_status,
      'routing_status', case when grouped.provider_routing_enabled then 'active' else 'disabled' end,
      'residency_mode', policy.residency_mode,
      'default_execution_regions', policy.default_execution_regions,
      'default_data_regions', policy.default_data_regions,
      'zero_data_retention', policy.zero_data_retention,
      'residency_source_url', policy.metadata->>'residency_source_url',
      'residency_notes', policy.metadata->>'residency_notes',
      'prompt_training_policy', policy.prompt_training_policy,
      'prompt_training_notes', policy.metadata->>'prompt_training_notes',
      'prompt_training_source_url', policy.metadata->>'prompt_training_source_url',
      'data_policy_tier', policy.data_policy_tier,
      'data_policy_confidence', policy.data_policy_confidence,
      'data_policy_contract_mode', policy.data_policy_contract_mode,
      'data_policy_contract_notes', policy.metadata->>'data_policy_contract_notes',
      'user_identifier_policy', policy.metadata->>'user_identifier_policy',
      'user_identifier_notes', policy.metadata->>'user_identifier_notes',
      'privacy_policy_url', policy.metadata->>'privacy_policy_url',
      'service_tier_data_policies', coalesce(policy.metadata->'service_tier_data_policies', '{}'::jsonb),
      'terms_of_service_url', policy.metadata->>'terms_of_service_url'
    ),
    'provider_models', grouped.provider_models,
    'pricing_rules', grouped.pricing_rules
  )
  from grouped
  left join public.v2_providers policy on policy.provider_slug = grouped.provider_slug
  order by grouped.provider_name;
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
  order by route.created_at limit 1 for update of route;
  if provider_model_id_value is null then
    provider_model_id_value := candidate.provider_slug || ':catalog:' || gen_random_uuid()::text;
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
    metadata = public.v2_model_provider_routes.metadata || excluded.metadata, updated_at = now()
  where public.v2_model_provider_routes.provider_slug = excluded.provider_slug
    and public.v2_model_provider_routes.model_slug = excluded.model_slug
    and public.v2_model_provider_routes.provider_model_slug = excluded.provider_model_slug
    and coalesce(public.v2_model_provider_routes.metadata->>'catalog_service_tier','standard') = tier_name
  returning provider_model_id into provider_model_id_value;
  if provider_model_id_value is null then raise exception 'provider_catalog_route_identity_conflict'; end if;

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
          then jsonb_build_object('service_tier', jsonb_build_object('type','string','enum',
            case when tier_name='fast' then '["fast","priority"]'::jsonb
              when tier_name='standard' then '["standard","default"]'::jsonb else jsonb_build_array(tier_name) end,
            'provider_catalog',jsonb_build_object('name',tier_name,'upstream',tier_offer->>'upstreamServiceTier')))
          else '{}'::jsonb end,
      candidate.available_from, candidate.shutdown_at,
      jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id), now()
    )
    on conflict (provider_model_id, capability_id) do update set
      status = excluded.status, max_output_tokens = excluded.max_output_tokens,
      params = excluded.params || case
        when jsonb_typeof(public.v2_route_capabilities.metadata->'data_policy') = 'object'
          then jsonb_build_object('data_policy', public.v2_route_capabilities.metadata->'data_policy')
        else '{}'::jsonb end, effective_from = excluded.effective_from,
      effective_to = excluded.effective_to,
      metadata = public.v2_route_capabilities.metadata || excluded.metadata, updated_at = now();
  end loop;

  -- Rich provider claims are retained separately; never enable execution or billing from them.
  update public.v2_model_provider_routes route set metadata=route.metadata || jsonb_build_object(
    'catalog_declarations',jsonb_build_object('status','stored_for_review',
      'model',(select snapshot.metadata->'declarations' from public.provider_catalog_sync_models snapshot
        where snapshot.run_id=candidate.run_id and snapshot.model_slug=candidate.submitted_model_slug),
      'offer',tier_offer->'declarations','sourceRunId',candidate.run_id))
  where route.provider_model_id=provider_model_id_value;

  -- Feed-owned declarations are replaceable, including omission and version downgrade.
  -- Keep the management marker after withdrawal to prevent provider-default Yes fallback.
  update public.v2_route_capabilities cap set metadata = cap.metadata || jsonb_build_object(
    'catalog_data_policy', jsonb_build_object('declaration', (
      select value from jsonb_array_elements(coalesce(nullif(tier_offer->'dataPolicy','null'::jsonb)->'capabilities','[]'::jsonb))
      where value->>'id'=cap.capability_id limit 1),
      'sourceRunId',candidate.run_id,'catalogUrl',source.catalog_url,'managementMode',source.management_mode))
  from public.provider_catalog_sources source
  where cap.provider_model_id=provider_model_id_value and source.provider_slug=candidate.provider_slug
    and (tier_offer ? 'dataPolicy' or cap.metadata ? 'catalog_data_policy');

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

CREATE OR REPLACE FUNCTION public.resolve_catalog_data_policy (
  p_provider_model_id text,
  p_capability_id     text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public'
  AS $function$
DECLARE
  cap public.v2_route_capabilities%rowtype;
  route public.v2_model_provider_routes%rowtype;
  source public.provider_catalog_sources%rowtype;
  approval public.provider_catalog_policy_approvals%rowtype;
  declaration jsonb;
  valid_until timestamptz;
  accepted boolean := false;
  guaranteed boolean := false;
  result jsonb;
BEGIN
  SELECT * INTO cap FROM public.v2_route_capabilities WHERE provider_model_id=p_provider_model_id AND capability_id=p_capability_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Existing pins remain admin-owned. Never overwrite them with a feed claim.
  IF jsonb_typeof(cap.metadata->'data_policy')='object' THEN RETURN cap.metadata->'data_policy'; END IF;
  IF NOT coalesce(cap.metadata ? 'catalog_data_policy',false) THEN RETURN NULL; END IF;
  SELECT * INTO route FROM public.v2_model_provider_routes WHERE provider_model_id=p_provider_model_id;
  SELECT * INTO source FROM public.provider_catalog_sources WHERE provider_slug=route.provider_slug;
  SELECT * INTO approval FROM public.provider_catalog_policy_approvals WHERE provider_slug=route.provider_slug;
  declaration := cap.metadata->'catalog_data_policy'->'declaration';
  valid_until := source.last_success_at + interval '24 hours';
  accepted := coalesce(approval.enabled AND source.status='active'
    AND approval.catalog_url IS NOT DISTINCT FROM source.catalog_url
    AND approval.management_mode=source.management_mode
    AND cap.metadata->'catalog_data_policy'->>'catalogUrl' IS NOT DISTINCT FROM source.catalog_url
    AND cap.metadata->'catalog_data_policy'->>'managementMode'=source.management_mode
    AND declaration->>'privacy_policy_url'=approval.privacy_policy_url
    AND declaration->'requirements'->>'contract_mode'='none'
    AND declaration->'requirements'->'account_settings'='[]'::jsonb
    AND declaration->>'training_policy' not in ('opt_out_available','enterprise_no_train')
    AND declaration->>'zdr_eligibility'<>'conditional'
    AND valid_until > now(), false);
  guaranteed := accepted AND p_capability_id='text.generate'
    AND coalesce(route.metadata->>'catalog_service_tier','standard')<>'batch'
    AND declaration->'zero_data_retention'='true'::jsonb
    AND declaration->>'training_policy'='no_train'
    AND declaration->>'retention_mode'='none' AND declaration->'retention_days'='0'::jsonb
    AND declaration->>'zdr_eligibility'='eligible'
    AND declaration->'requirements'->>'contract_mode'='none'
    AND declaration->'requirements'->'account_settings'='[]'::jsonb;
  result := jsonb_build_object('tier',CASE WHEN accepted THEN
      CASE WHEN declaration->>'training_policy'='unknown' THEN 'unknown'
        WHEN declaration->>'training_policy' in ('may_train','opt_out_available','enterprise_no_train') THEN 'trains'
        WHEN guaranteed THEN 'private' ELSE 'logs' END ELSE 'unknown' END,
    'confidence',CASE WHEN accepted THEN 'confirmed' ELSE 'unknown' END,
    'zeroDataRetention',coalesce(guaranteed,false),
    'zdrEligibility',CASE WHEN guaranteed THEN 'eligible' ELSE 'ineligible' END,
    'retentionMode',CASE WHEN accepted THEN declaration->>'retention_mode' ELSE 'unknown' END,
    'retentionDays',CASE WHEN accepted THEN declaration->'retention_days' ELSE 'null'::jsonb END,
    'trainingPolicy',CASE WHEN accepted THEN declaration->>'training_policy' ELSE 'unknown' END,
    'evidenceUrl',declaration->>'privacy_policy_url', 'termsOfServiceUrl',declaration->>'terms_of_service_url',
    'requirements',declaration->'requirements', 'reason',coalesce(declaration->>'notes','Provider catalog declaration.'),
    'validUntil',valid_until, 'catalogManaged',true);
  RETURN result;
END $function$;

REVOKE ALL ON FUNCTION "public"."resolve_catalog_data_policy"(text, text) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "public"."provider_catalog_policy_approvals"
  ADD CONSTRAINT "provider_catalog_policy_approvals_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE "public"."provider_catalog_policy_approvals"
  ADD CONSTRAINT "provider_catalog_policy_approvals_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE;

CREATE VIEW "public"."v2_effective_route_capabilities" WITH (security_invoker=true) AS  SELECT provider_model_id,
    capability_id,
    status,
    max_output_tokens,
    max_input_tokens,
    (COALESCE(params, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('data_policy', public.resolve_catalog_data_policy(provider_model_id, capability_id)))) AS params,
    effective_from,
    effective_to,
    created_at,
    updated_at,
    (metadata || jsonb_strip_nulls(jsonb_build_object('data_policy', public.resolve_catalog_data_policy(provider_model_id, capability_id)))) AS metadata
   FROM public.v2_route_capabilities cap;

REVOKE ALL ON TABLE "public"."v2_effective_route_capabilities" FROM "anon", "authenticated";

CREATE INDEX provider_catalog_policy_approval_events_provider_idx ON public.provider_catalog_policy_approval_events USING btree (provider_slug, created_at DESC);

CREATE INDEX provider_catalog_policy_approvals_approved_by_idx ON public.provider_catalog_policy_approvals USING btree (approved_by);

CREATE TRIGGER catalog_policy_approval_audit
  AFTER INSERT OR DELETE OR UPDATE ON public.provider_catalog_policy_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_catalog_policy_approval();

CREATE TRIGGER invalidate_catalog_policy_approval
  AFTER INSERT OR DELETE OR UPDATE ON public.provider_catalog_policy_approvals
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE TRIGGER invalidate_catalog_policy_source
  AFTER UPDATE OF catalog_url, management_mode, status, last_success_at ON public.provider_catalog_sources
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

REVOKE ALL ON FUNCTION "public"."audit_catalog_policy_approval"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."audit_catalog_policy_approval"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."resolve_catalog_data_policy"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_catalog_data_policy"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_catalog_data_policy"(text, text) TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_policy_approval_events" FROM "service_role";

GRANT SELECT ON TABLE "public"."provider_catalog_policy_approval_events" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_policy_approvals" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_policy_approvals" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_effective_route_capabilities" FROM "service_role";

GRANT SELECT ON TABLE "public"."v2_effective_route_capabilities" TO "service_role";
