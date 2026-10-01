-- External providers remain external globally. Individual provider-model
-- routes must opt in before they can appear as callable or public routes.

update public.v2_providers
set routable = false,
    metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{routable}', 'false'::jsonb, true),
    updated_at = now()
where provider_slug = 'openrouter';

update public.v2_model_provider_routes
set metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{external_routing_override}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
where provider_model_id = 'stealth:stealth/space-bunny-alpha:openrouter'
  and model_slug = 'stealth/space-bunny-alpha'
  and provider_slug = 'openrouter';

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('public.get_v2_routing_candidates(text,text,text,text)'::regprocedure)
  into definition;

  patched := replace(
    definition,
    $old$or exists (
        select 1
        from public.v2_providers provider
        where provider.provider_slug = candidate.provider_slug
          and provider.status = 'external'
          and provider.routable = true
          and provider.routing_enabled = true
      )$old$,
    $new$or exists (
        select 1
        from public.v2_model_provider_routes route_override
        where route_override.provider_model_id = candidate.provider_model_id
          and route_override.provider_slug = candidate.provider_slug
          and route_override.routing_enabled = true
          and coalesce(route_override.metadata->>'external_routing_override', 'false') = 'true'
      )$new$
  );

  if patched = definition then
    raise exception 'get_v2_routing_candidates has an unexpected definition';
  end if;
  execute patched;
end
$migration$;

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('public.get_public_provider_index()'::regprocedure)
  into definition;

  patched := replace(
    definition,
    $old$and (provider.status <> 'external' or (provider.routable and provider.routing_enabled))$old$,
    $new$and (
        provider.status <> 'external'
        or exists (
          select 1
          from public.v2_model_provider_routes route_override
          where route_override.provider_slug = provider.provider_slug
            and route_override.routing_enabled = true
            and coalesce(route_override.metadata->>'external_routing_override', 'false') = 'true'
        )
      )$new$
  );
  patched := replace(
    patched,
    $old$where not model.hidden$old$,
    $new$where not model.hidden
      and (
        provider.status <> 'external'
        or coalesce(route.metadata->>'external_routing_override', 'false') = 'true'
      )$new$
  );

  if patched = definition then
    raise exception 'get_public_provider_index has an unexpected definition';
  end if;
  execute patched;
end
$migration$;

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)'::regprocedure
  ) into definition;

  patched := replace(
    definition,
    $old$and (provider.status <> 'external' or (provider.routable and provider.routing_enabled))$old$,
    $new$and (
        provider.status <> 'external'
        or (
          route.routing_enabled = true
          and coalesce(route.metadata->>'external_routing_override', 'false') = 'true'
        )
      )$new$
  );

  if patched = definition then
    raise exception 'get_v2_model_pricing_without_stealth_redaction has an unexpected definition';
  end if;
  execute patched;
end
$migration$;

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.gateway_fetch_request_context_without_workspace_budget(uuid,text,text,uuid)'::regprocedure
  ) into definition;
  definition := replace(definition, chr(13) || chr(10), chr(10));

  patched := replace(
    definition,
    $old$m.routing_status as model_status,
      m.input_modalities,$old$,
    $new$m.routing_status as model_status,
      coalesce((m.metadata->>'external_routing_override')::boolean, false) as external_routing_override,
      m.input_modalities,$new$
  );
  patched := replace(
    patched,
    $old$input_modalities, output_modalities, effective_from, effective_to
      from public.v2_model_provider_routes$old$,
    $new$input_modalities, output_modalities, effective_from, effective_to, metadata
      from public.v2_model_provider_routes$new$
  );
  patched := replace(
    patched,
    $old$and m.is_active_gateway
      and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')$old$,
    $new$and m.is_active_gateway
      and (
        p.status <> 'external'
        or coalesce((m.metadata->>'external_routing_override')::boolean, false)
      )
      and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')$new$
  );
  patched := replace(
    patched,
    $old$'model_status', pr.model_status,
          'input_modalities',$old$,
    $new$'model_status', pr.model_status,
          'external_routing_override', pr.external_routing_override,
          'input_modalities',$new$
  );

  if patched = definition then
    raise exception 'gateway_fetch_request_context_without_workspace_budget has an unexpected definition';
  end if;
  execute patched;
end
$migration$;

do $migration$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef('public.gateway_fetch_public_catalog(text,text[])'::regprocedure)
  into definition;

  patched := replace(
    definition,
    $old$and r.routing_enabled and (r.effective_from is null or r.effective_from<=now())$old$,
    $new$and r.routing_enabled
        and (p.status <> 'external' or coalesce(r.metadata->>'external_routing_override', 'false') = 'true')
        and (r.effective_from is null or r.effective_from<=now())$new$
  );
  patched := replace(
    patched,
    $old$'provider_model_slug',r.provider_model_slug,'availability',r.availability,'model_status',r.status,$old$,
    $new$'provider_model_slug',r.provider_model_slug,'availability',r.availability,'model_status',r.status,
      'external_routing_override',coalesce((r.metadata->>'external_routing_override')::boolean,false),$new$
  );

  if patched = definition then
    raise exception 'gateway_fetch_public_catalog has an unexpected definition';
  end if;
  execute patched;
end
$migration$;

comment on column public.v2_providers.routable is
  'Legacy provider-level routing flag. External providers require a route-level metadata.external_routing_override opt-in.';

notify pgrst, 'reload schema';
