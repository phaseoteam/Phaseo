-- Keep provider capability rows editable in the admin graph editor.
-- Capability identity is part of v2_route_capabilities' primary key, so the
-- editor sends the prior key and this RPC updates it in place. That preserves
-- the catalogue history trigger without requiring an end-date for a simple
-- reassignment.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists catalogue_private;
revoke all on schema catalogue_private from public, anon, authenticated;
grant usage on schema catalogue_private to service_role;

create or replace function catalogue_private.apply_v2_admin_model_capabilities(
  p_actor_user_id uuid,
  p_model_slug text,
  p_capabilities jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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
    if v_previous_capability_id is not null
       and v_previous_capability_id <> v_capability_id then
      select capability.capability_id, capability.effective_to
      into v_existing_capability_id, v_existing_effective_to
      from public.v2_route_capabilities capability
      where capability.provider_model_id = v_route_id
        and lower(capability.capability_id) = v_previous_capability_id
      for update;

      v_has_previous := v_existing_capability_id is not null;
      if v_has_previous and v_has_target then
        raise exception 'provider model already has capability %', v_capability_id;
      end if;

      -- A historical row is immutable. An active or future row can be
      -- reassigned in place, which is the operation the editor needs.
      if v_has_previous and v_existing_effective_to is not null
         and v_existing_effective_to <= now() then
        raise exception 'historical capabilities cannot be changed';
      end if;

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
$$;

revoke all on function catalogue_private.apply_v2_admin_model_capabilities(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function catalogue_private.apply_v2_admin_model_capabilities(uuid, text, jsonb)
  to service_role;

create or replace function catalogue_private.apply_v2_admin_model_provider_routes(
  p_actor_user_id uuid,
  p_model_slug text,
  p_provider_models jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_route jsonb;
  v_existing public.v2_model_provider_routes%rowtype;
  v_requested_route_id text;
  v_route_id text;
  v_provider_slug text;
  v_provider_model_slug text;
  v_status text;
  v_routing_enabled boolean;
  v_provider_availability_status text;
  v_phaseo_status text;
  v_access_scope text;
  v_input_modalities text[];
  v_output_modalities text[];
  v_regions text[];
  v_context_length integer;
  v_max_output_tokens integer;
  v_effective_from timestamptz;
  v_effective_to timestamptz;
  v_metadata jsonb;
begin
  if not exists (
    select 1
    from public.users
    where user_id = p_actor_user_id
      and lower(coalesce(role::text, '')) = 'admin'
  ) then
    raise exception 'actor must have the admin role';
  end if;

  if jsonb_typeof(coalesce(p_provider_models, '[]'::jsonb)) <> 'array' then
    raise exception 'provider models must be an array';
  end if;

  if not exists (
    select 1 from public.v2_models where model_slug = p_model_slug
  ) then
    raise exception 'model not found';
  end if;

  for v_route in
    select value
    from jsonb_array_elements(coalesce(p_provider_models, '[]'::jsonb))
  loop
    v_existing := null;
    v_provider_slug := nullif(trim(coalesce(v_route->>'provider_id', v_route->>'provider_slug')), '');
    v_provider_model_slug := nullif(trim(coalesce(v_route->>'provider_model_slug', v_route->>'api_model_id')), '');
    v_requested_route_id := nullif(trim(coalesce(v_route->>'provider_model_id', v_route->>'id')), '');

    if v_provider_slug is null then
      raise exception 'provider id is required';
    end if;
    if v_provider_model_slug is null then
      raise exception 'provider model slug is required';
    end if;
    if not exists (
      select 1 from public.v2_providers where provider_slug = v_provider_slug
    ) then
      raise exception 'provider not found';
    end if;

    -- Resolve by the database key first, then by the natural route identity.
    -- This keeps an editor save from inserting a duplicate route when an
    -- older source adapter supplied a stale provider-model id.
    if v_requested_route_id is not null and v_requested_route_id not like 'new-%' then
      if exists (
        select 1
        from public.v2_model_provider_routes route
        where route.provider_model_id = v_requested_route_id
          and route.model_slug <> p_model_slug
      ) then
        raise exception 'provider model id belongs to another model';
      end if;

      select route.*
      into v_existing
      from public.v2_model_provider_routes route
      where route.provider_model_id = v_requested_route_id
        and route.model_slug = p_model_slug
      for update;
    end if;

    if v_existing.provider_model_id is null then
      select route.*
      into v_existing
      from public.v2_model_provider_routes route
      where route.model_slug = p_model_slug
        and route.provider_slug = v_provider_slug
        and route.provider_model_slug = v_provider_model_slug
      order by route.created_at, route.provider_model_id
      limit 1
      for update;
    end if;

    v_route_id := coalesce(
      v_existing.provider_model_id,
      case
        when v_requested_route_id is null or v_requested_route_id like 'new-%' then null
        else v_requested_route_id
      end,
      v_provider_slug || ':' || p_model_slug || ':' || v_provider_model_slug
    );

    v_status := lower(coalesce(
      nullif(trim(coalesce(v_route->>'status', v_route->>'routing_status')), ''),
      nullif(trim(v_existing.status), ''),
      'active'
    ));
    if v_status not in ('active', 'degraded', 'disabled', 'retired') then
      v_status := 'active';
    end if;

    v_routing_enabled := coalesce(
      nullif(v_route->>'is_active_gateway', '')::boolean,
      nullif(v_route->>'routing_enabled', '')::boolean,
      coalesce(v_existing.routing_enabled, false)
    );

    v_phaseo_status := lower(coalesce(
      nullif(trim(v_route->>'phaseo_status'), ''),
      nullif(trim(v_existing.phaseo_status), ''),
      case when v_routing_enabled then 'enabled' else 'disabled' end
    ));
    if v_routing_enabled and v_phaseo_status <> 'enabled' then
      if not (v_route ? 'phaseo_status') then
        v_phaseo_status := 'enabled';
      else
        raise exception 'routable provider routes require phaseo_status=enabled';
      end if;
    end if;

    v_provider_availability_status := lower(coalesce(
      nullif(trim(v_route->>'provider_availability_status'), ''),
      nullif(trim(v_existing.provider_availability_status), ''),
      case when v_routing_enabled then 'available' else 'unknown' end
    ));
    if v_routing_enabled
       and v_provider_availability_status not in ('available', 'preview', 'limited_access') then
      if not (v_route ? 'provider_availability_status') then
        v_provider_availability_status := 'available';
      else
        raise exception 'routable provider routes require an available provider';
      end if;
    end if;

    v_access_scope := lower(coalesce(
      nullif(trim(v_route->>'access_scope'), ''),
      nullif(trim(v_existing.access_scope), ''),
      'public'
    ));
    if v_routing_enabled and v_access_scope <> 'public' then
      raise exception 'routable provider routes must have public access scope';
    end if;

    v_input_modalities := case
      when jsonb_typeof(v_route->'input_modalities') = 'array' then
        array(select jsonb_array_elements_text(v_route->'input_modalities'))
      when nullif(trim(v_route->>'input_modalities'), '') is not null then
        string_to_array(v_route->>'input_modalities', ',')
      when v_existing.provider_model_id is not null then
        coalesce(v_existing.input_modalities, '{}'::text[])
      else '{}'::text[]
    end;
    v_output_modalities := case
      when jsonb_typeof(v_route->'output_modalities') = 'array' then
        array(select jsonb_array_elements_text(v_route->'output_modalities'))
      when nullif(trim(v_route->>'output_modalities'), '') is not null then
        string_to_array(v_route->>'output_modalities', ',')
      when v_existing.provider_model_id is not null then
        coalesce(v_existing.output_modalities, '{}'::text[])
      else '{}'::text[]
    end;
    v_regions := case
      when jsonb_typeof(v_route->'regions') = 'array' then
        array(select jsonb_array_elements_text(v_route->'regions'))
      when v_existing.provider_model_id is not null then
        coalesce(v_existing.regions, '{}'::text[])
      else '{}'::text[]
    end;
    v_context_length := case
      when v_route ? 'context_length' then nullif(v_route->>'context_length', '')::integer
      else v_existing.context_length
    end;
    v_max_output_tokens := case
      when v_route ? 'max_output_tokens' then nullif(v_route->>'max_output_tokens', '')::integer
      else v_existing.max_output_tokens
    end;
    v_effective_from := case
      when v_route ? 'effective_from' then nullif(v_route->>'effective_from', '')::timestamptz
      else v_existing.effective_from
    end;
    v_effective_to := case
      when v_route ? 'effective_to' then nullif(v_route->>'effective_to', '')::timestamptz
      else v_existing.effective_to
    end;
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'prompt_training_policy_override', v_route->>'prompt_training_policy_override',
      'prompt_training_override_notes', v_route->>'prompt_training_override_notes',
      'prompt_training_override_source_url', v_route->>'prompt_training_override_source_url',
      'quantization_scheme', v_route->>'quantization_scheme',
      'source', 'admin'
    ));

    insert into public.v2_model_provider_routes(
      provider_model_id,
      model_slug,
      provider_slug,
      provider_model_slug,
      status,
      routing_enabled,
      input_modalities,
      output_modalities,
      regions,
      context_length,
      max_output_tokens,
      effective_from,
      effective_to,
      metadata,
      provider_availability_status,
      phaseo_status,
      access_scope,
      updated_at
    )
    values (
      v_route_id,
      p_model_slug,
      v_provider_slug,
      v_provider_model_slug,
      v_status,
      v_routing_enabled,
      v_input_modalities,
      v_output_modalities,
      v_regions,
      v_context_length,
      v_max_output_tokens,
      v_effective_from,
      v_effective_to,
      v_metadata,
      v_provider_availability_status,
      v_phaseo_status,
      v_access_scope,
      now()
    )
    on conflict (provider_model_id) do update set
      model_slug = excluded.model_slug,
      provider_slug = excluded.provider_slug,
      provider_model_slug = excluded.provider_model_slug,
      status = excluded.status,
      routing_enabled = excluded.routing_enabled,
      input_modalities = excluded.input_modalities,
      output_modalities = excluded.output_modalities,
      regions = excluded.regions,
      context_length = excluded.context_length,
      max_output_tokens = excluded.max_output_tokens,
      effective_from = excluded.effective_from,
      effective_to = excluded.effective_to,
      metadata = public.v2_model_provider_routes.metadata || excluded.metadata,
      provider_availability_status = excluded.provider_availability_status,
      phaseo_status = excluded.phaseo_status,
      access_scope = excluded.access_scope,
      updated_at = now();
  end loop;
end;
$$;

revoke all on function catalogue_private.apply_v2_admin_model_provider_routes(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function catalogue_private.apply_v2_admin_model_provider_routes(uuid, text, jsonb)
  to service_role;

-- Run the existing graph mutation and the route/capability reconciliation in
-- one database transaction. Older graph functions replace capability rows and
-- do not populate the phaseo/provider status columns required by the route
-- checks, so both editor-owned child collections use the explicit helpers.
create or replace function public.mutate_v2_admin_model_graph_editable(
  p_actor_user_id uuid,
  p_model_slug text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_graph_payload jsonb := coalesce(p_payload, '{}'::jsonb) - 'provider_models' - 'provider_capabilities';
  v_result jsonb;
begin
  v_result := public.mutate_v2_admin_model_graph_with_successor(
    p_actor_user_id,
    p_model_slug,
    v_graph_payload
  );

  if p_payload ? 'provider_models' or p_payload ? 'provider_capabilities' then
    -- Older graph functions do not set the history actor themselves.
    perform set_config('phaseo.catalogue_actor', p_actor_user_id::text, true);
  end if;

  if p_payload ? 'provider_models' then
    perform catalogue_private.apply_v2_admin_model_provider_routes(
      p_actor_user_id,
      p_model_slug,
      p_payload->'provider_models'
    );
  end if;

  if p_payload ? 'provider_capabilities' then
    perform catalogue_private.apply_v2_admin_model_capabilities(
      p_actor_user_id,
      p_model_slug,
      p_payload->'provider_capabilities'
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.mutate_v2_admin_model_graph_editable(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_v2_admin_model_graph_editable(uuid, text, jsonb)
  to service_role;
