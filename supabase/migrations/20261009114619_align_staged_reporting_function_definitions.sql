SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.set_contribution_public_reporting_scope()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.public_reporting_allowed := new.provider_slug is not null
    and public.public_reporting_route_is_visible(new.model_slug, null, new.provider_slug, new.occurred_at);
  if tg_op = 'UPDATE' then
    new.public_reporting_allowed := old.public_reporting_allowed and new.public_reporting_allowed;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_request_public_reporting_scope()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.public_reporting_allowed := new.provider_model_id is not null
    and public.public_reporting_route_is_visible(
      coalesce(new.routed_model_slug, new.requested_model_slug), new.provider_model_id, null, new.occurred_at
    )
    and coalesce(new.safe_metadata->>'testing_mode', 'false') <> 'true';
  if tg_op = 'UPDATE' then
    new.public_reporting_allowed := old.public_reporting_allowed and new.public_reporting_allowed;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.public_reporting_route_is_visible (
  p_model_slug        text,
  p_provider_model_id text                     DEFAULT NULL::text,
  p_provider_slug     text                     DEFAULT NULL::text,
  p_occurred_at       timestamp with time zone DEFAULT now()
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.v2_models model
    join public.v2_model_provider_routes route on route.model_slug = model.model_slug
    where model.model_slug = p_model_slug
      and model.hidden = false
      and model.status not in ('disabled', 'not_ready', 'coming_soon', 'testing', 'draft', 'pending')
      and (model.released_at is null or model.released_at <= p_occurred_at)
      and route.access_scope = 'public'
      and route.phaseo_status = 'enabled'
      and route.routing_enabled = true
      and route.status in ('active', 'degraded')
      and route.is_stealth = false
      and route.provider_availability_status in ('available', 'preview', 'limited_access')
      and (p_provider_model_id is null or route.provider_model_id = p_provider_model_id)
      and (p_provider_slug is null or route.provider_slug = p_provider_slug)
      and (route.effective_from is null or route.effective_from <= p_occurred_at)
      and (route.effective_to is null or route.effective_to > p_occurred_at)
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_v2_admin_model_availability (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_available     boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  model_row public.v2_models%rowtype;
  route_ids text[];
  before_state jsonb;
  after_state jsonb;
begin
  if p_available is null then raise exception 'availability is required'; end if;
  if not exists (select 1 from public.users where user_id = p_actor_user_id and role::text = 'admin') then
    raise exception 'actor must have the admin role';
  end if;
  select * into model_row from public.v2_models where model_slug = p_model_slug for update;
  if not found then raise exception 'model not found'; end if;
  perform 1 from public.v2_model_provider_routes where model_slug = p_model_slug for update;
  before_state := to_jsonb(model_row);

  if p_available then
    if model_row.hidden = false and model_row.status = 'active' then
      return jsonb_build_object('model_slug', p_model_slug, 'available', true);
    end if;
    if model_row.retired_at <= now() then raise exception 'retired models cannot be released'; end if;
    select array_agg(route.provider_model_id) into route_ids
    from public.v2_model_provider_routes route
    join public.v2_providers provider on provider.provider_slug = route.provider_slug
    where route.model_slug = p_model_slug and route.access_scope = 'internal'
      and route.phaseo_status = 'testing' and route.status in ('active', 'degraded')
      and route.is_stealth = false
      and route.provider_availability_status in ('available', 'preview', 'limited_access')
      and (route.effective_from is null or route.effective_from <= now())
      and (route.effective_to is null or route.effective_to > now())
      and provider.routing_enabled = true and provider.routable = true
      and exists (select 1 from public.v2_pricing_skus sku
        join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id
        where sku.provider_model_id = route.provider_model_id and sku.status = 'active'
          and sku.effective_from <= now() and (sku.effective_to is null or sku.effective_to > now()))
      and exists (select 1 from public.v2_route_capabilities capability
        where capability.provider_model_id = route.provider_model_id
          and capability.status in ('active', 'internal_testing')
          and (capability.effective_from is null or capability.effective_from <= now())
          and (capability.effective_to is null or capability.effective_to > now()));
    if coalesce(cardinality(route_ids), 0) = 0 then
      raise exception 'no prepared internal testing routes are ready for release';
    end if;
    update public.v2_model_provider_routes set access_scope = 'public', phaseo_status = 'enabled',
      routing_enabled = true, updated_at = now() where provider_model_id = any(route_ids);
    update public.v2_route_capabilities set status = 'active', updated_at = now()
      where provider_model_id = any(route_ids) and status = 'internal_testing';
    update public.v2_models set hidden = false, status = 'active', catalogue_status = 'available',
      released_at = case when released_at is null or released_at > now() then now() else released_at end,
      updated_at = now() where model_slug = p_model_slug;
  else
    select array_agg(provider_model_id) into route_ids from public.v2_model_provider_routes
      where model_slug = p_model_slug and access_scope = 'public' and phaseo_status = 'enabled';
    update public.v2_models set hidden = true, status = 'draft', updated_at = now()
      where model_slug = p_model_slug;
    update public.v2_model_provider_routes set access_scope = 'internal', phaseo_status = 'testing',
      routing_enabled = false, updated_at = now() where provider_model_id = any(route_ids);
    update public.v2_route_capabilities set status = 'internal_testing', updated_at = now()
      where provider_model_id = any(route_ids) and status = 'active';
  end if;
  select to_jsonb(model) into after_state from public.v2_models model where model_slug = p_model_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id, resource_type, resource_id, action, before_state, after_state)
    values(p_actor_user_id, 'models', p_model_slug, 'update', before_state, after_state);
  insert into public.v2_catalogue_source_overrides(source_type, source_key, disposition, actor_user_id, resource_id, updated_at)
    values('models', p_model_slug, 'database_managed', p_actor_user_id, p_model_slug, now())
    on conflict(source_type, source_key) do update set disposition = 'database_managed',
      actor_user_id = excluded.actor_user_id, updated_at = now();
  return jsonb_build_object('model_slug', p_model_slug, 'available', p_available, 'routes', to_jsonb(route_ids));
end;
$function$;
