-- Retire CrofAI from active Phaseo routing while preserving its historical
-- catalogue identity, pricing, sync revisions, and request/usage records.
--
-- This is intentionally a soft retirement for catalogue rows. The catalogue
-- history triggers reject destructive removal from the v2 identity tables.
-- phaseo:allow-destructive-migration reason: Remove active CrofAI adapter credentials and routing wiring while preserving historical request, usage, audit, billing, observability, sync, and execution records.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update public.v2_labs
set status = 'deprecated',
    routable = false,
    updated_at = now()
where lab_slug = 'crofai';

update public.v2_models
set status = 'retired',
    catalogue_status = 'retired',
    deprecated_at = coalesce(deprecated_at, now()),
    retired_at = coalesce(retired_at, now()),
    updated_at = now()
where lab_slug = 'crofai'
   or model_slug like 'crofai/%';

update public.v2_model_aliases
set enabled = false,
    effective_to = case
      when effective_to is null and (effective_from is null or effective_from < now()) then now()
      else effective_to
    end,
    updated_at = now()
where model_slug in (
  select model_slug
  from public.v2_models
  where lab_slug = 'crofai'
     or model_slug like 'crofai/%'
);

update public.v2_providers
set status = 'disabled',
    routing_enabled = false,
    routable = false,
    base_url = null,
    byok_available = false,
    credential_mode = 'byok_only',
    updated_at = now()
where provider_slug = 'crofai';

update public.v2_model_provider_routes
set status = 'disabled',
    routing_enabled = false,
    provider_availability_status = 'removed',
    phaseo_status = 'disabled',
    updated_at = now()
where provider_slug = 'crofai';

update public.v2_route_capabilities as capability
set status = 'disabled',
    updated_at = now()
from public.v2_model_provider_routes as route
where route.provider_model_id = capability.provider_model_id
  and route.provider_slug = 'crofai';

update public.v2_route_variants as variant
set status = 'disabled',
    routing_enabled = false,
    updated_at = now()
from public.v2_model_provider_routes as route
where route.provider_model_id = variant.provider_model_id
  and route.provider_slug = 'crofai';

update public.v2_provider_regions
set status = 'disabled',
    routing_enabled = false,
    updated_at = now()
where provider_slug = 'crofai';

update public.v2_pricing_skus as sku
set status = 'disabled',
    updated_at = now()
from public.v2_model_provider_routes as route
where route.provider_model_id = sku.provider_model_id
  and route.provider_slug = 'crofai';

update public.v2_capability_constraints
set status = 'disabled',
    updated_at = now()
where provider_slug = 'crofai'
   or provider_model_id in (
     select provider_model_id
     from public.v2_model_provider_routes
     where provider_slug = 'crofai'
   );

-- Remove active adapter wiring and provider credentials. Historical execution
-- plans and all request, usage, audit, billing, and observability records stay.
delete from public.v2_provider_capability_adapters
where provider_slug = 'crofai';

delete from public.v2_provider_endpoints
where provider_slug = 'crofai';

delete from public.v2_provider_auth_profiles
where provider_slug = 'crofai';

delete from public.provider_rate_limits
where provider_id = 'crofai';

delete from public.byok_keys
where provider_id = 'crofai';

-- Close provider-owned workflows without deleting their audit trail.
update public.provider_onboarding_submissions
set status = 'withdrawn',
    updated_at = now()
where lower(provider_slug) = 'crofai'
  and status not in ('rejected', 'withdrawn');

update public.provider_account_links
set status = 'revoked',
    updated_at = now()
where provider_slug = 'crofai'
  and status <> 'revoked';

update public.provider_claim_challenges
set status = 'cancelled'
where provider_slug = 'crofai'
  and status in ('pending', 'verified');

-- Stop future catalog polling/webhooks and remove active source credentials;
-- immutable sync runs/revisions remain available for historical review.
update public.provider_catalog_sources
set catalog_url = null,
    status = 'disabled',
    next_poll_at = null,
    refresh_requested = false,
    sync_lease_token = null,
    sync_lease_expires_at = null,
    webhook_secret_ciphertext = null,
    webhook_secret_iv = null,
    webhook_secret_hash = null,
    managed_catalog = null,
    managed_updated_by = null,
    managed_updated_at = null,
    updated_at = now()
where provider_slug = 'crofai';

update public.provider_catalog_models
set status = 'removed',
    availability = 'retired',
    shutdown_at = coalesce(shutdown_at, now()),
    updated_at = now()
where provider_slug = 'crofai';

update public.provider_catalog_model_capabilities
set status = 'removed',
    observed_at = now()
where provider_slug = 'crofai';

update public.provider_catalog_route_candidates
set status = 'rejected',
    updated_at = now()
where provider_slug = 'crofai'
  and status in ('pending_probe', 'probe_failed', 'probe_passed');

do $$
begin
  if exists (
    select 1
    from public.v2_providers
    where provider_slug = 'crofai'
      and (status <> 'disabled' or routing_enabled or routable)
  ) then
    raise exception 'CrofAI provider remains active after retirement';
  end if;

  if exists (
    select 1
    from public.v2_model_provider_routes
    where provider_slug = 'crofai'
      and (status in ('active', 'degraded') or routing_enabled)
  ) then
    raise exception 'CrofAI route remains active after retirement';
  end if;

  if exists (
    select 1
    from public.provider_catalog_sources
    where provider_slug = 'crofai'
      and status = 'active'
  ) then
    raise exception 'CrofAI catalog source remains active after retirement';
  end if;
end;
$$;

commit;
