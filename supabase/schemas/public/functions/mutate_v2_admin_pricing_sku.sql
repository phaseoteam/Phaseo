CREATE OR REPLACE FUNCTION public.mutate_v2_admin_pricing_sku (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_action        text,
  p_sku           jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  v_sku_id uuid;
  v_provider_model_id text;
  v_existing public.v2_pricing_skus%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_meter jsonb;
  v_resource_id text;
  v_starts timestamptz;
  v_version integer;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required';
  end if;
  if coalesce(trim(p_model_slug), '') = '' then
    raise exception 'model_slug is required';
  end if;
  if p_action not in ('save', 'end_date') then
    raise exception 'unsupported pricing mutation action';
  end if;
  if not exists (
    select 1 from public.users
    where user_id = p_actor_user_id
      and lower(coalesce(role::text, '')) = 'admin'
  ) then
    raise exception 'actor must have the admin role';
  end if;

  if nullif(p_sku->>'sku_id', '') is not null then
    begin
      v_sku_id := (p_sku->>'sku_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'sku_id must be a UUID';
    end;
  end if;

  if v_sku_id is not null then
    select * into v_existing
    from public.v2_pricing_skus
    where sku_id = v_sku_id for update;

    if found then
      select jsonb_build_object(
        'sku', to_jsonb(v_existing),
        'meters', coalesce((
          select jsonb_agg(to_jsonb(meter) order by meter.meter_order, meter.meter_key)
          from public.v2_pricing_sku_meters meter
          where meter.sku_id = v_sku_id
        ), '[]'::jsonb)
      ) into v_before;

      if not exists (
        select 1
        from public.v2_model_provider_routes route
        where route.provider_model_id = v_existing.provider_model_id
          and route.model_slug = p_model_slug
      ) then
        raise exception 'pricing SKU does not belong to the requested model';
      end if;
    end if;
  end if;

  if v_sku_id is not null and v_before is null then
    raise exception 'pricing SKU not found';
  end if;
  perform set_config('phaseo.catalogue_actor', p_actor_user_id::text, true);
  if p_action = 'end_date' then
    if v_before is null then raise exception 'pricing SKU not found'; end if;
    v_starts := nullif(p_sku->>'effective_to','')::timestamptz;
    if v_starts is null or v_starts <= v_existing.effective_from then
      raise exception 'end date must be after the start date';
    end if;
    if v_existing.effective_to is not null and v_existing.effective_to <= now() then
      raise exception 'historical prices cannot be changed';
    end if;
    if exists(select 1 from public.v2_pricing_skus where provider_model_id=v_existing.provider_model_id and sku_code=v_existing.sku_code and version>v_existing.version) then
      raise exception 'a superseded version cannot be changed';
    end if;
    update public.v2_pricing_skus set effective_to=v_starts,updated_at=now() where sku_id=v_sku_id;
    select jsonb_build_object('sku',to_jsonb(t),'meters',v_before->'meters') into v_after
      from public.v2_pricing_skus t where sku_id=v_sku_id;
    insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
      values(p_actor_user_id,'pricing_sku',v_sku_id::text,'update',v_before,v_after);
    if nullif(v_existing.metadata->>'source_key','') is not null then
      insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
        values('pricing_rule',v_existing.metadata->>'source_key','database_managed',p_actor_user_id,v_sku_id::text,now())
        on conflict(source_type,source_key) do update set disposition=excluded.disposition,actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
    end if;
    return v_after;
  end if;

  v_provider_model_id := nullif(trim(p_sku->>'provider_model_id'), '');
  if v_provider_model_id is null then
    raise exception 'provider_model_id is required';
  end if;
  if not exists (
    select 1
    from public.v2_model_provider_routes route
    where route.provider_model_id = v_provider_model_id
      and route.model_slug = p_model_slug
  ) then
    raise exception 'provider route does not belong to the requested model';
  end if;
  if jsonb_typeof(coalesce(p_sku->'meters', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_sku->'meters', '[]'::jsonb)) = 0 then
    raise exception 'at least one pricing meter is required';
  end if;

  -- Serialize versions of a price family, including concurrent new prices.
  perform pg_advisory_xact_lock(hashtextextended(v_provider_model_id||':'||lower(trim(p_sku->>'sku_code')),0));
  v_starts := coalesce(nullif(p_sku->>'effective_from','')::timestamptz,now());
  if v_before is not null then
    if v_existing.provider_model_id <> v_provider_model_id or v_existing.sku_code <> lower(trim(p_sku->>'sku_code')) then
      raise exception 'a price revision must keep its provider route and price code';
    end if;
    if v_existing.effective_to is not null then raise exception 'end-dated prices cannot be revised; add a new price group'; end if;
    if v_starts <= v_existing.effective_from then raise exception 'revision must start after the previous version'; end if;
    update public.v2_pricing_skus set effective_to=v_starts,updated_at=now() where sku_id=v_sku_id;
  elsif exists(select 1 from public.v2_pricing_skus where provider_model_id=v_provider_model_id and sku_code=lower(trim(p_sku->>'sku_code'))) then
    raise exception 'price group already exists; reload and create a revision';
  end if;
  select coalesce(max(version),0)+1 into v_version from public.v2_pricing_skus
    where provider_model_id=v_provider_model_id and sku_code=lower(trim(p_sku->>'sku_code'));
  v_sku_id := gen_random_uuid();
  insert into public.v2_pricing_skus (
    sku_id,
    provider_model_id,
    sku_code,
    version,
    operation,
    status,
    region,
    service_tier_slug,
    display_name,
    description,
    currency,
    effective_from,
    effective_to,
    metadata,
    updated_at
  ) values (
    v_sku_id,
    v_provider_model_id,
    lower(trim(p_sku->>'sku_code')),
    v_version,
    coalesce(nullif(trim(p_sku->>'operation'), ''), 'inference'),
    coalesce(nullif(trim(p_sku->>'status'), ''), 'active'),
    nullif(trim(p_sku->>'region'), ''),
    coalesce(nullif(trim(p_sku->>'service_tier_slug'), ''), 'standard'),
    trim(p_sku->>'display_name'),
    nullif(trim(p_sku->>'description'), ''),
    upper(coalesce(nullif(trim(p_sku->>'currency'), ''), 'USD')),
    v_starts,
    nullif(p_sku->>'effective_to', '')::timestamptz,
    coalesce(p_sku->'metadata', '{}'::jsonb) || jsonb_build_object(
      'source', 'admin',
      'authored_by', p_actor_user_id,
      'authored_at', now()
    ),
    now()
  )
  ;

  for v_meter in select value from jsonb_array_elements(p_sku->'meters')
  loop
    insert into public.v2_pricing_sku_meters (
      sku_id,
      meter_key,
      modality,
      direction,
      unit,
      unit_quantity,
      price_nanos,
      display_label,
      display_unit,
      billable,
      meter_order,
      metadata
    ) values (
      v_sku_id,
      lower(trim(v_meter->>'meter_key')),
      lower(trim(v_meter->>'modality')),
      nullif(lower(trim(v_meter->>'direction')), ''),
      lower(trim(v_meter->>'unit')),
      (v_meter->>'unit_quantity')::numeric,
      (v_meter->>'price_nanos')::numeric,
      trim(v_meter->>'display_label'),
      trim(v_meter->>'display_unit'),
      coalesce((v_meter->>'billable')::boolean, true),
      coalesce((v_meter->>'meter_order')::integer, 100),
      coalesce(v_meter->'metadata', '{}'::jsonb) || jsonb_build_object('source', 'admin')
    );
  end loop;

  select jsonb_build_object(
    'sku', to_jsonb(sku),
    'meters', coalesce((
      select jsonb_agg(to_jsonb(meter) order by meter.meter_order, meter.meter_key)
      from public.v2_pricing_sku_meters meter
      where meter.sku_id = v_sku_id
    ), '[]'::jsonb)
  ) into v_after
  from public.v2_pricing_skus sku
  where sku.sku_id = v_sku_id;

  v_resource_id := v_sku_id::text;
  insert into public.v2_catalogue_admin_changes (
    actor_user_id, resource_type, resource_id, action, before_state, after_state
  ) values (
    p_actor_user_id,
    'pricing_sku',
    v_resource_id,
    case when v_before is null then 'create' else 'update' end,
    v_before,
    v_after
  );

  if nullif(p_sku->'metadata'->>'source_key', '') is not null then
    insert into public.v2_catalogue_source_overrides (
      source_type, source_key, disposition, actor_user_id, resource_id, updated_at
    ) values (
      'pricing_rule', p_sku->'metadata'->>'source_key', 'database_managed', p_actor_user_id, v_resource_id, now()
    )
    on conflict (source_type, source_key) do update set
      disposition = excluded.disposition,
      actor_user_id = excluded.actor_user_id,
      resource_id = excluded.resource_id,
      updated_at = now();
  end if;

  return v_after;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_pricing_sku"(uuid, text, text, jsonb) TO "service_role";

COMMENT ON FUNCTION "public"."mutate_v2_admin_pricing_sku"(uuid, text, text, jsonb) IS 'Atomically creates, updates, or deletes one pricing SKU and its meters. Service role only, with a database-backed admin actor check.';

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_pricing_sku"(uuid, text, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_pricing_sku"(uuid, text, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_pricing_sku"(uuid, text, text, jsonb) FROM PUBLIC, "anon", "authenticated";
