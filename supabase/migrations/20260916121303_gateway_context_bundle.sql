-- Additive rollout: established RPCs remain available to older Workers.
-- Filename matches the version returned by the production migration ledger.
-- Reuse the deployed access checks verbatim, without repeating catalog work for
-- every wire protocol. This follows the existing context-function split pattern.
do $migration$
declare
  definition text;
  first_catalog integer;
  final_return integer;
begin
  definition := pg_get_functiondef('public.gateway_fetch_request_context_without_workspace_budget(uuid,text,text,uuid)'::regprocedure);
  first_catalog := strpos(definition, '  -- provider candidates (BYOK) + pricing');
  final_return := strpos(definition, '  return jsonb_build_object(');
  if first_catalog = 0 or final_return <= first_catalog then
    raise exception 'Unexpected gateway context definition; review access split before migrating';
  end if;
  definition := left(definition, first_catalog - 1)
    || E'  providers := ''[]''::jsonb;\n  pricing := ''{}''::jsonb;\n\n'
    || substring(definition from final_return);
  definition := replace(definition, 'public.gateway_fetch_request_context_without_workspace_budget(', 'private.gateway_context_access(');
  definition := replace(definition, 'gateway_fetch_request_context_without_workspace_budget.', 'gateway_context_access.');
  definition := replace(definition, 'SECURITY DEFINER', 'SECURITY INVOKER');
  definition := replace(definition, 'calculate_tier_with_grace(', 'public.calculate_tier_with_grace(');
  definition := replace(definition, 'SET search_path TO ''public''', 'SET search_path TO ''''');
  execute definition;
end
$migration$;
revoke all on function private.gateway_context_access(uuid,text,text,uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.gateway_context_access(uuid,text,text,uuid) to service_role;

-- No workspace/key arguments, BYOK metadata, credentials or private routes.
create or replace function public.gateway_fetch_public_catalog(p_model text, p_endpoints text[])
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_endpoint text;
  v_model text;
  v_providers jsonb;
  v_pricing jsonb;
  v_variants jsonb := '[]'::jsonb;
  v_provider_rows jsonb;
  v_route_modes jsonb;
  v_until timestamptz := now() + interval '5 minutes';
  v_boundary timestamptz;
begin
  if p_model is null or length(p_model) > 512 or p_model like '@%'
    or cardinality(p_endpoints) not between 1 and 2
    or not (p_endpoints <@ array['text.generate','responses','chat.completions','messages']::text[]) then
    raise exception 'invalid_public_catalog_request' using errcode = '22023';
  end if;
  v_model := coalesce(
    (select a.model_slug from public.v2_model_aliases a where a.alias_slug=p_model and a.enabled limit 1),
    (select r.model_slug from public.v2_model_provider_routes r
      where position('/' in p_model)>0 and r.provider_slug=split_part(p_model,'/',1)
        and r.provider_model_slug=regexp_replace(p_model,'^[^/]+/','') and r.routing_enabled
        and (r.effective_from is null or r.effective_from<=now()) and (r.effective_to is null or now()<r.effective_to)
      order by coalesce(r.effective_from,to_timestamp(0)) desc,r.provider_model_id limit 1), p_model);

  foreach v_endpoint in array p_endpoints loop
    with provider_rows as (
      select distinct on (r.provider_model_id)
        r.*, c.status as capability_status,c.params,c.max_input_tokens as cap_input,c.max_output_tokens as cap_output,
        coalesce(r.metadata->'availability',p.metadata->'availability') as availability,
        p.prompt_training_policy,p.data_policy_tier,p.data_policy_confidence,p.data_policy_contract_mode,p.data_policy_variant
      from public.v2_model_provider_routes r
      join public.v2_models m on m.model_slug=r.model_slug
      join public.v2_providers p on p.provider_slug=r.provider_slug
      join public.v2_route_capabilities c on c.provider_model_id=r.provider_model_id
      where r.model_slug=v_model and not coalesce(m.hidden,false)
        and (m.status is null or lower(m.status) in ('active','available','deprecated'))
        and (m.retired_at is null or m.retired_at>now())
        and c.capability_id=v_endpoint and c.status in ('active','deranked','deranked_lvl1','deranked_lvl2','deranked_lvl3')
        and r.routing_enabled and (r.effective_from is null or r.effective_from<=now())
        and (r.effective_to is null or now()<r.effective_to)
        and (c.effective_from is null or c.effective_from<=now())
        and (c.effective_to is null or now()<c.effective_to)
      order by r.provider_model_id,coalesce(c.updated_at,c.created_at) desc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'provider_id',r.provider_slug,'api_model_id',r.model_slug,'pricing_key',r.provider_slug,
      'provider_model_slug',r.provider_model_slug,'availability',r.availability,'model_status',r.status,
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
        ) order by pr.priority desc,coalesce(pr.effective_from,now()) desc),'[]'::jsonb))
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
        and (pr.effective_from is null or pr.effective_from<=now()) and (pr.effective_to is null or now()<pr.effective_to)
    )),'{}'::jsonb) into v_providers,v_pricing from provider_rows r;
    v_variants := v_variants || jsonb_build_array(jsonb_build_object('endpoint',v_endpoint,'providers',v_providers,'pricing',v_pricing));
  end loop;

  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into v_provider_rows from (
    select provider_slug,status,routing_enabled,credential_mode,provider_family_slug,offer_scope,offer_label,
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

  -- Absolute deadlines also cover future route/capability/price activation, not
  -- only currently selected price cards. KV's physical TTL is not freshness.
  select min(boundary) into v_boundary from (
    select effective_from as boundary from public.v2_model_provider_routes where model_slug=v_model
    union all select effective_to from public.v2_model_provider_routes where model_slug=v_model
    union all select c.effective_from from public.v2_route_capabilities c join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model
    union all select c.effective_to from public.v2_route_capabilities c join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model
    union all select s.effective_from from public.v2_pricing_skus s join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model and s.status='active'
    union all select s.effective_to from public.v2_pricing_skus s join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model and s.status='active'
    union all select retired_at from public.v2_models where model_slug=v_model
  ) boundaries where boundary>now();
  v_until := least(v_until,coalesce(v_boundary,v_until));
  return jsonb_build_object('version',1,'model',p_model,'resolvedModel',v_model,'endpoints',p_endpoints,
    'checkedAt',floor(extract(epoch from now())*1000),'expiresAt',floor(extract(epoch from v_until)*1000),
    'variants',v_variants,'providerRows',v_provider_rows,'routeModes',v_route_modes);
end;
$function$;
revoke all on function public.gateway_fetch_public_catalog(text,text[]) from public,anon,authenticated;
grant execute on function public.gateway_fetch_public_catalog(text,text[]) to service_role;

create or replace function public.gateway_fetch_request_context_bundle(
  workspace_id uuid,model text,endpoint text,api_key_id uuid,include_catalog boolean default true
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_context jsonb;
  v_budget jsonb;
  v_byok jsonb;
  v_settings jsonb;
  v_billing text;
  v_catalog jsonb;
  v_endpoints text[];
begin
  if model like '@%' or endpoint not in ('responses','chat.completions','messages','text.generate') then
    raise exception 'unsupported_context_bundle' using errcode='22023';
  end if;
  v_context := private.gateway_context_access(workspace_id,model,endpoint,api_key_id);
  v_budget := public.gateway_workspace_budget_status(workspace_id,0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean,true) and not coalesce((v_budget->>'ok')::boolean,true) then
    v_context := jsonb_set(v_context,'{key_limit_ok}',v_budget,true);
  end if;
  -- Return configured workspace budgets even when below their limit, so Workers
  -- never reuse an admission snapshot for a workspace with a spending cap.
  if jsonb_array_length(coalesce(v_budget->'budgets','[]'::jsonb))>0 then
    v_context := jsonb_set(v_context,'{key_limit_ok,budgets}',v_budget->'budgets',true);
  end if;
  select coalesce(jsonb_object_agg(provider_id,items),'{}'::jsonb) into v_byok from (
    select bk.provider_id,jsonb_agg(jsonb_build_object('provider_id',bk.provider_id,'id',bk.id,
      'fingerprint_sha256',bk.fingerprint_sha256,'key_version',bk.key_version,'always_use',bk.always_use)) as items
    from public.byok_keys bk where bk.workspace_id=gateway_fetch_request_context_bundle.workspace_id and bk.enabled
    group by bk.provider_id
  ) byok;
  select jsonb_build_object(
    'routing_mode',s.routing_mode,'byok_fallback_enabled',s.byok_fallback_enabled,'beta_channel_enabled',s.beta_channel_enabled,
    'alpha_channel_enabled',s.alpha_channel_enabled,'cache_aware_routing_enabled',s.cache_aware_routing_enabled,
    'privacy_zdr_only',s.privacy_zdr_only,'privacy_enable_paid_may_train',s.privacy_enable_paid_may_train,
    'privacy_enable_free_may_train',s.privacy_enable_free_may_train,'privacy_enable_input_output_logging',s.privacy_enable_input_output_logging,
    'io_logging_enabled',s.io_logging_enabled,'io_logging_include_provider_payloads',s.io_logging_include_provider_payloads,
    'data_contribution_enabled',s.data_contribution_enabled,'data_contribution_policy_version',s.data_contribution_policy_version,
    'data_contribution_sample_rate_bps',s.data_contribution_sample_rate_bps,'data_contribution_classifier_sample_rate_bps',s.data_contribution_classifier_sample_rate_bps,
    'data_contribution_discount_bps',s.data_contribution_discount_bps,'response_healing_enabled',s.response_healing_enabled,
    'response_healing_locked',s.response_healing_locked,'response_healing_mode',s.response_healing_mode
  ) into v_settings from public.workspace_settings s where s.workspace_id=gateway_fetch_request_context_bundle.workspace_id;
  select billing_mode into v_billing from public.workspaces where id=workspace_id;
  if v_settings is null or v_billing is null or v_billing not in ('wallet','invoice') then
    raise exception 'workspace_context_enrichment_missing';
  end if;
  v_endpoints := case when endpoint='text.generate' then array['text.generate'] else array['text.generate',endpoint] end;
  if include_catalog then v_catalog := public.gateway_fetch_public_catalog(model,v_endpoints); end if;
  return jsonb_build_object('context',v_context,'byok',v_byok,'settings',v_settings,'billingMode',v_billing,'catalog',v_catalog);
end;
$function$;
revoke all on function public.gateway_fetch_request_context_bundle(uuid,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.gateway_fetch_request_context_bundle(uuid,text,text,uuid,boolean) to service_role;
notify pgrst, 'reload schema';
