CREATE OR REPLACE FUNCTION catalogue_private.apply_v2_admin_model_capabilities (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_capabilities  jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_capability jsonb;
  v_route_id text;
  v_provider_model_id text;
  v_provider_model_slug text;
  v_capability_id text;
  v_previous_capability_id text;
  v_existing_capability_id text;
  v_existing_effective_to timestamptz;
  v_has_previous boolean;
  v_has_target boolean;
begin
  if not exists (
    select 1
    from public.users
    where user_id = p_actor_user_id
      and lower(coalesce(role::text, '')) = 'admin'
  ) then
    raise exception 'actor must have the admin role';
  end if;

  if jsonb_typeof(coalesce(p_capabilities, '[]'::jsonb)) <> 'array' then
    raise exception 'provider capabilities must be an array';
  end if;

  if not exists (
    select 1 from public.v2_models where model_slug = p_model_slug
  ) then
    raise exception 'model not found';
  end if;

  -- The graph mutation locks the model before calling this helper. Reject
  -- duplicate target keys here so the error is deterministic before the
  -- per-row upserts run.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_capabilities, '[]'::jsonb)) as payload(value)
    join public.v2_model_provider_routes route
      on route.model_slug = p_model_slug
      and route.provider_slug = nullif(trim(payload.value->>'provider_id'), '')
      and route.provider_model_slug = coalesce(
        nullif(trim(payload.value->>'provider_model_slug'), ''),
        nullif(trim(payload.value->>'api_model_id'), '')
      )
      and (
        nullif(trim(payload.value->>'provider_model_id'), '') is null
        or route.provider_model_id = trim(payload.value->>'provider_model_id')
      )
    group by route.provider_model_id, lower(trim(payload.value->>'capability_id'))
    having count(*) > 1
  ) then
    raise exception 'a provider model cannot have duplicate capabilities';
  end if;

  for v_capability in
    select value
    from jsonb_array_elements(coalesce(p_capabilities, '[]'::jsonb))
  loop
    v_provider_model_id := nullif(trim(v_capability->>'provider_model_id'), '');
    v_provider_model_slug := coalesce(
      nullif(trim(v_capability->>'provider_model_slug'), ''),
      nullif(trim(v_capability->>'api_model_id'), '')
    );
    v_capability_id := nullif(lower(trim(v_capability->>'capability_id')), '');
    v_previous_capability_id := nullif(lower(trim(v_capability->>'previous_capability_id')), '');

    if v_capability_id is null then
      raise exception 'provider capability id is required';
    end if;

    select route.provider_model_id
    into v_route_id
    from public.v2_model_provider_routes route
    where route.model_slug = p_model_slug
      and route.provider_slug = nullif(trim(v_capability->>'provider_id'), '')
      and route.provider_model_slug = v_provider_model_slug
      and (v_provider_model_id is null or route.provider_model_id = v_provider_model_id)
    order by route.provider_model_id
    limit 1;

    if v_route_id is null then
      raise exception 'provider capability does not match a model route';
    end if;

    select exists (
      select 1
      from public.v2_route_capabilities capability
      where capability.provider_model_id = v_route_id
        and lower(capability.capability_id) = v_capability_id
    )
    into v_has_target;

    v_existing_capability_id := null;
    v_existing_effective_to := null;
    v_has_previous := false;
    select capability.capability_id, capability.effective_to
    into v_existing_capability_id, v_existing_effective_to
    from public.v2_route_capabilities capability
    where capability.provider_model_id = v_route_id
      and lower(capability.capability_id) = coalesce(v_previous_capability_id, v_capability_id)
    for update;

    v_has_previous := v_existing_capability_id is not null;
    -- Historical rows are immutable even when the editor keeps the same
    -- capability identity. Lock and validate the source before any upsert.
    if v_has_previous and v_existing_effective_to is not null
       and v_existing_effective_to <= now() then
      raise exception 'historical capabilities cannot be changed';
    end if;

    if v_previous_capability_id is not null
       and v_previous_capability_id <> v_capability_id then
      if v_has_previous and v_has_target then
        raise exception 'provider model already has capability %', v_capability_id;
      end if;

      -- A historical row is immutable. An active or future row can be
      -- reassigned in place, which is the operation the editor needs.
      if v_has_previous and exists (
        select 1
        from public.v2_route_parameter_support support
        where support.provider_model_id = v_route_id
          and lower(support.capability_id) = lower(v_existing_capability_id)
      ) then
        raise exception 'capability has parameter support records and cannot be reassigned';
      end if;

      if v_has_previous and exists (
        select 1
        from public.v2_execution_plans plan
        where plan.provider_model_id = v_route_id
          and lower(plan.capability_id) = lower(v_existing_capability_id)
      ) then
        raise exception 'capability has execution plans and cannot be reassigned';
      end if;

      if v_has_previous then
        update public.v2_route_capabilities
        set capability_id = v_capability_id,
            updated_at = now()
        where provider_model_id = v_route_id
          and capability_id = v_existing_capability_id;
      end if;
    end if;

    insert into public.v2_route_capabilities(
      provider_model_id,
      capability_id,
      status,
      params,
      effective_from,
      effective_to,
      metadata,
      updated_at
    )
    values (
      v_route_id,
      v_capability_id,
      case
        when coalesce(v_capability->>'status', '') like 'deranked_%' then 'degraded'
        else coalesce(nullif(trim(v_capability->>'status'), ''), 'active')
      end,
      coalesce(v_capability->'params', '{}'::jsonb),
      nullif(v_capability->>'effective_from', '')::timestamptz,
      nullif(v_capability->>'effective_to', '')::timestamptz,
      jsonb_build_object('editor_status', v_capability->>'status', 'source', 'admin'),
      now()
    )
    on conflict (provider_model_id, capability_id) do update set
      status = excluded.status,
      params = excluded.params,
      effective_from = excluded.effective_from,
      effective_to = excluded.effective_to,
      metadata = public.v2_route_capabilities.metadata || excluded.metadata,
      updated_at = now();
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION "catalogue_private"."apply_v2_admin_model_capabilities"(uuid, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "catalogue_private"."apply_v2_admin_model_capabilities"(uuid, text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "catalogue_private"."apply_v2_admin_model_capabilities"(uuid, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "catalogue_private"."apply_v2_admin_model_capabilities"(uuid, text, jsonb) TO "postgres";
