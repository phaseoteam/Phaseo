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
        r.*, c.status as capability_status,c.params,c.max_input_tokens as cap_input,c.max_output_tokens as cap_output,
        coalesce(case when jsonb_typeof(r.metadata->'availability') = 'object' and (r.metadata->'availability'->>'mode') in ('allowlist','blocklist') and jsonb_typeof(r.metadata->'availability'->'countries') = 'array' then r.metadata->'availability' end,p.metadata->'availability') as availability,
        p.prompt_training_policy,p.data_policy_tier,p.data_policy_confidence,p.data_policy_contract_mode,p.data_policy_variant
      from public.v2_model_provider_routes r
      join public.v2_models m on m.model_slug=r.model_slug
      join public.v2_providers p on p.provider_slug=r.provider_slug
      join public.v2_route_capabilities c on c.provider_model_id=r.provider_model_id
      where r.model_slug=v_model and not coalesce(m.hidden,false)
        and (m.status is null or lower(m.status) in ('active','available','deprecated'))
        and (m.retired_at is null or m.retired_at>v_at)
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
    union all select retired_at from public.v2_models where model_slug=v_model
  ) boundaries where boundary>v_at;
  v_until := least(v_until,coalesce(v_boundary,v_until));
  return jsonb_build_object('version',1,'model',p_model,'resolvedModel',v_model,'endpoints',p_endpoints,
    'checkedAt',floor(extract(epoch from v_at)*1000),'expiresAt',floor(extract(epoch from v_until)*1000),
    'variants',v_variants,'providerRows',v_provider_rows,'routeModes',v_route_modes,
    'revision',public.gateway_catalogue_revision(),
    'boundaryAt',case when v_boundary is null then null else floor(extract(epoch from v_boundary)*1000) end);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_public_catalog_at"(text, text[], timestamp with time zone) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_fetch_public_catalog_at"(text, text[], timestamp with time zone) IS 'Returns a public catalog snapshot evaluated at p_at, with the catalogue revision and next scheduled boundary, for stale-while-revalidate gateway caching.';

REVOKE ALL ON FUNCTION "public"."gateway_fetch_public_catalog_at"(text, text[], timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_public_catalog_at"(text, text[], timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_public_catalog_at"(text, text[], timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
