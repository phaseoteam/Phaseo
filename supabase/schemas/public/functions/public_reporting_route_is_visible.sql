create or replace function public.public_reporting_route_is_visible(
  p_model_slug text, p_provider_model_id text default null,
  p_provider_slug text default null, p_occurred_at timestamptz default now()
)
returns boolean language sql stable security invoker set search_path = '' as $$
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
$$;
revoke all on function public.public_reporting_route_is_visible(text,text,text,timestamptz) from public;
grant execute on function public.public_reporting_route_is_visible(text,text,text,timestamptz) to anon, authenticated, service_role;
