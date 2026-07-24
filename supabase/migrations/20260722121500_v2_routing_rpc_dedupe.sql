-- Keep routing candidate output one row per provider/model variant when a
-- caller asks for any capability. The original implementation remains as a
-- private raw helper for compatibility.

alter function public.get_v2_routing_candidates(text, text, text, text)
  rename to get_v2_routing_candidates_raw;

create or replace function public.get_v2_routing_candidates(
  p_model_slug text,
  p_capability_id text default null,
  p_region text default null,
  p_service_tier text default 'standard'
)
returns table (
  provider_model_id text,
  provider_slug text,
  provider_name text,
  model_slug text,
  provider_model_slug text,
  variant_id uuid,
  service_tier_slug text,
  execution_region text,
  data_region text,
  route_status text,
  provider_status text,
  capability_status text,
  routing_enabled boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (candidate.provider_model_id, candidate.variant_id)
    candidate.provider_model_id,
    candidate.provider_slug,
    candidate.provider_name,
    candidate.model_slug,
    candidate.provider_model_slug,
    candidate.variant_id,
    candidate.service_tier_slug,
    candidate.execution_region,
    candidate.data_region,
    candidate.route_status,
    candidate.provider_status,
    candidate.capability_status,
    candidate.routing_enabled
  from public.get_v2_routing_candidates_raw(p_model_slug, p_capability_id, p_region, p_service_tier) candidate
  order by candidate.provider_model_id, candidate.variant_id, candidate.routing_enabled desc, candidate.capability_status;
$$;

grant execute on function public.get_v2_routing_candidates(text, text, text, text) to authenticated, service_role;
