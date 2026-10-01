-- Self-serve providers may stage and test routes before Phaseo approves the
-- provider, but no route may become public or routable before that decision.

create or replace function public.enforce_self_serve_provider_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  review_status text;
begin
  select provider.metadata -> 'self_serve' ->> 'provider_review_status'
    into review_status
  from public.v2_providers provider
  where provider.provider_slug = new.provider_slug;

  if review_status is not null and review_status <> 'approved' then
    new.routing_enabled := false;
    new.access_scope := 'internal';
    new.phaseo_status := 'testing';
    if new.status in ('active', 'degraded') then new.status := 'disabled'; end if;
    if new.provider_availability_status in ('available', 'preview') then
      new.provider_availability_status := 'coming_soon';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_self_serve_provider_approval on public.v2_model_provider_routes;
create trigger enforce_self_serve_provider_approval
before insert or update on public.v2_model_provider_routes
for each row execute function public.enforce_self_serve_provider_approval();

create or replace function public.set_self_serve_provider_review(
  p_provider_slug text,
  p_decision text,
  p_reason text,
  p_reviewed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewed_at_value timestamptz := now();
  activated_ids text[] := '{}';
begin
  if p_decision not in ('approved', 'paused', 'rejected', 'needs_changes') then
    raise exception 'invalid_provider_review_decision';
  end if;
  if p_decision <> 'approved' and nullif(btrim(p_reason), '') is null then
    raise exception 'provider_review_reason_required';
  end if;

  update public.v2_providers provider
  set metadata = jsonb_set(
        coalesce(provider.metadata, '{}'::jsonb),
        '{self_serve}',
        coalesce(provider.metadata -> 'self_serve', '{}'::jsonb) || jsonb_build_object(
          'provider_review_status', p_decision,
          'provider_review_reason', case when p_decision = 'approved' then null else p_reason end,
          'provider_reviewed_by', p_reviewed_by,
          'provider_reviewed_at', reviewed_at_value
        ),
        true
      ),
      status = case when p_decision = 'approved' then 'beta' else 'not_ready' end,
      routable = p_decision = 'approved',
      routing_enabled = p_decision = 'approved',
      updated_at = reviewed_at_value
  where provider.provider_slug = p_provider_slug
    and provider.metadata ? 'self_serve';
  if not found then raise exception 'self_serve_provider_not_found'; end if;

  if p_decision = 'approved' then
    with eligible as (
      select route.provider_model_id,
        case when candidate.availability = 'ready' then 'active' else 'degraded' end as next_status
      from public.v2_model_provider_routes route
      join public.provider_catalog_route_candidates candidate
        on candidate.provider_slug = route.provider_slug
       and candidate.canonical_model_slug = route.model_slug
       and candidate.provider_model_slug = route.provider_model_slug
       and route.metadata ->> 'source_run_id' = candidate.run_id::text
      where route.provider_slug = p_provider_slug
        and candidate.status = 'promoted'
        and candidate.availability in ('ready', 'degraded')
        and (route.effective_from is null or route.effective_from <= reviewed_at_value)
        and (route.effective_to is null or route.effective_to > reviewed_at_value)
        and not route.is_stealth
        and coalesce((select (p.metadata ->> 'adapter_ready')::boolean from public.v2_providers p where p.provider_slug = route.provider_slug), false)
        and coalesce((select (p.metadata ->> 'credentials_ready')::boolean from public.v2_providers p where p.provider_slug = route.provider_slug), false)
        and exists (select 1 from public.v2_providers p where p.provider_slug = route.provider_slug and nullif(trim(p.base_url), '') is not null)
    ), activated as (
      update public.v2_model_provider_routes route
      set status = eligible.next_status,
          routing_enabled = true,
          provider_availability_status = case when eligible.next_status = 'active' then 'available' else 'preview' end,
          phaseo_status = 'enabled', access_scope = 'public',
          metadata = route.metadata || jsonb_build_object('release_scheduled', false, 'provider_approved_at', reviewed_at_value),
          updated_at = reviewed_at_value
      from eligible where route.provider_model_id = eligible.provider_model_id
      returning route.provider_model_id
    ) select coalesce(array_agg(provider_model_id), '{}'::text[]) into activated_ids from activated;

    update public.v2_route_variants set routing_enabled = true,
      status = case when status = 'disabled' then 'active' else status end, updated_at = reviewed_at_value
    where provider_model_id = any(activated_ids) and metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_capabilities set
      status = case when status = 'internal_testing' then 'active' else status end, updated_at = reviewed_at_value
    where provider_model_id = any(activated_ids) and metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_models model set hidden = false,
      released_at = coalesce(model.released_at, route.effective_from, reviewed_at_value), updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_model_id = any(activated_ids) and model.model_slug = route.model_slug
      and model.metadata ->> 'created_from_provider_proposal' = 'true';
    update public.v2_labs lab set status = case when lab.status = 'disabled' then 'active' else lab.status end,
      updated_at = reviewed_at_value
    where lab.lab_slug in (
      select distinct model.lab_slug from public.v2_models model
      join public.v2_model_provider_routes route on route.model_slug = model.model_slug
      where route.provider_model_id = any(activated_ids)
        and model.metadata ->> 'created_from_provider_proposal' = 'true'
    );
  else
    update public.v2_model_provider_routes set status = 'disabled', routing_enabled = false,
      access_scope = 'internal', phaseo_status = 'testing', provider_availability_status = 'coming_soon', updated_at = reviewed_at_value
    where provider_slug = p_provider_slug and metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_variants variant set status = 'disabled', routing_enabled = false, updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug and variant.provider_model_id = route.provider_model_id
      and variant.metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_capabilities capability set status = 'internal_testing', updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug and capability.provider_model_id = route.provider_model_id
      and capability.metadata ->> 'managed_by' = 'provider_catalog';
  end if;

  return jsonb_build_object('providerSlug', p_provider_slug, 'decision', p_decision, 'activatedRouteIds', activated_ids);
end;
$$;

revoke all on function public.set_self_serve_provider_review(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.set_self_serve_provider_review(text,text,text,uuid) to service_role;
