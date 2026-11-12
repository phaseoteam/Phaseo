CREATE OR REPLACE FUNCTION catalogue_private.apply_v2_admin_model_provider_routes (
  p_actor_user_id   uuid,
  p_model_slug      text,
  p_provider_models jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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

    -- The editor does not currently send provider availability. Preserve an
    -- existing deprecated route during its future-dated retirement window.
    v_provider_availability_status := lower(case
      when v_route ? 'provider_availability_status' then
        coalesce(nullif(trim(v_route->>'provider_availability_status'), ''), 'unknown')
      when v_existing.provider_model_id is not null then
        coalesce(nullif(trim(v_existing.provider_availability_status), ''), 'unknown')
      when v_routing_enabled then 'available'
      else 'unknown'
    end);
    if v_routing_enabled
       and v_provider_availability_status not in ('available', 'preview', 'limited_access', 'deprecated') then
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
      when v_route ? 'input_modalities' then case
        when jsonb_typeof(v_route->'input_modalities') = 'array' then
          array(select jsonb_array_elements_text(v_route->'input_modalities'))
        when nullif(trim(v_route->>'input_modalities'), '') is not null then
          string_to_array(v_route->>'input_modalities', ',')
        else '{}'::text[]
      end
      when v_existing.provider_model_id is not null then
        coalesce(v_existing.input_modalities, '{}'::text[])
      else '{}'::text[]
    end;
    v_output_modalities := case
      when v_route ? 'output_modalities' then case
        when jsonb_typeof(v_route->'output_modalities') = 'array' then
          array(select jsonb_array_elements_text(v_route->'output_modalities'))
        when nullif(trim(v_route->>'output_modalities'), '') is not null then
          string_to_array(v_route->>'output_modalities', ',')
        else '{}'::text[]
      end
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
      metadata = (
        coalesce(public.v2_model_provider_routes.metadata, '{}'::jsonb)
          - 'prompt_training_policy_override'
          - 'prompt_training_override_notes'
          - 'prompt_training_override_source_url'
          - 'quantization_scheme'
      ) || excluded.metadata,
      provider_availability_status = excluded.provider_availability_status,
      phaseo_status = excluded.phaseo_status,
      access_scope = excluded.access_scope,
      updated_at = now();
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION "catalogue_private"."apply_v2_admin_model_provider_routes"(uuid, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "catalogue_private"."apply_v2_admin_model_provider_routes"(uuid, text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "catalogue_private"."apply_v2_admin_model_provider_routes"(uuid, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "catalogue_private"."apply_v2_admin_model_provider_routes"(uuid, text, jsonb) TO "postgres";
