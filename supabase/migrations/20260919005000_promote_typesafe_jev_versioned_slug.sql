-- Promote Jev 1.13's versioned slug to the canonical model identity.
-- Catalogue rows are append-only, so the former canonical row and aliases are
-- retired/end-dated instead of deleted.

insert into public.v2_models (
  model_slug,
  lab_slug,
  name,
  description,
  status,
  hidden,
  input_modalities,
  output_modalities,
  family_slug,
  announced_at,
  released_at,
  deprecated_at,
  retired_at,
  metadata,
  created_at,
  updated_at,
  license,
  license_url,
  previous_model_slug,
  removal_date,
  replacement_model_slug,
  variant_kind,
  base_model_slug,
  catalogue_status
)
select
  'typesafe/jev-1.13.0',
  lab_slug,
  name,
  description,
  status,
  hidden,
  input_modalities,
  output_modalities,
  family_slug,
  announced_at,
  released_at,
  deprecated_at,
  retired_at,
  metadata,
  created_at,
  now(),
  license,
  license_url,
  previous_model_slug,
  removal_date,
  replacement_model_slug,
  variant_kind,
  base_model_slug,
  catalogue_status
from public.v2_models
where model_slug = 'typesafe/jev'
on conflict (model_slug) do nothing;

update public.v2_model_aliases
set model_slug = 'typesafe/jev-1.13.0',
    alias_type = 'public',
    enabled = true,
    effective_to = null,
    updated_at = now()
where alias_slug = 'typesafe/jev-latest';

update public.v2_model_aliases
set enabled = false,
    effective_to = coalesce(effective_to, now()),
    updated_at = now()
where alias_slug <> 'typesafe/jev-latest'
  and (
    model_slug in ('typesafe/jev', 'typesafe/jev-1.13.0')
    or alias_slug in (
      'typesafe/jev',
      'typesafe/jev-1.13',
      'typesafe/jev-1.13.0',
      'typesafe/jev-preview'
    )
  );

update public.provider_catalog_models
set canonical_model_slug = 'typesafe/jev-1.13.0'
where canonical_model_slug = 'typesafe/jev';

update public.provider_catalog_route_candidates
set canonical_model_slug = 'typesafe/jev-1.13.0'
where canonical_model_slug = 'typesafe/jev';

update public.provider_catalog_sync_models
set canonical_model_slug = 'typesafe/jev-1.13.0'
where canonical_model_slug = 'typesafe/jev';

update public.v2_benchmark_results
set model_slug = 'typesafe/jev-1.13.0'
where model_slug = 'typesafe/jev';

update public.v2_model_details
set model_slug = 'typesafe/jev-1.13.0',
    updated_at = now()
where model_slug = 'typesafe/jev';

update public.v2_model_links
set model_slug = 'typesafe/jev-1.13.0',
    updated_at = now()
where model_slug = 'typesafe/jev';

delete from public.v2_model_page_notices
where model_slug in ('typesafe/jev', 'typesafe/jev-1.13.0');

update public.v2_model_provider_routes
set model_slug = 'typesafe/jev-1.13.0',
    updated_at = now()
where model_slug = 'typesafe/jev';

update public.v2_private_usage_daily
set model_slug = 'typesafe/jev-1.13.0'
where model_slug = 'typesafe/jev';

update public.v2_public_effective_pricing_daily
set model_slug = 'typesafe/jev-1.13.0'
where model_slug = 'typesafe/jev';

update public.v2_public_provider_health_daily
set model_slug = 'typesafe/jev-1.13.0'
where model_slug = 'typesafe/jev';

update public.v2_public_usage_daily
set model_slug = 'typesafe/jev-1.13.0'
where model_slug = 'typesafe/jev';

update public.v2_public_usage_hourly
set model_slug = 'typesafe/jev-1.13.0'
where model_slug = 'typesafe/jev';

update public.v2_request_facts
set requested_model_slug = case
      when requested_model_slug = 'typesafe/jev' then 'typesafe/jev-1.13.0'
      else requested_model_slug
    end,
    routed_model_slug = case
      when routed_model_slug = 'typesafe/jev' then 'typesafe/jev-1.13.0'
      else routed_model_slug
    end
where requested_model_slug = 'typesafe/jev'
   or routed_model_slug = 'typesafe/jev';

update public.v2_subscription_plan_models
set model_slug = 'typesafe/jev-1.13.0'
where model_slug = 'typesafe/jev';

update public.v2_models
set previous_model_slug = 'typesafe/jev-1.13.0'
where previous_model_slug = 'typesafe/jev';

update public.v2_models
set replacement_model_slug = 'typesafe/jev-1.13.0'
where replacement_model_slug = 'typesafe/jev';

update public.v2_models
set base_model_slug = 'typesafe/jev-1.13.0'
where base_model_slug = 'typesafe/jev';

update public.model_discovery_public_announcements
set model_slug = 'typesafe/jev-1.13.0'
where model_slug = 'typesafe/jev';

update public.v2_models
set status = 'retired',
    hidden = true,
    retired_at = coalesce(retired_at, now()),
    removal_date = coalesce(removal_date, now()),
    replacement_model_slug = 'typesafe/jev-1.13.0',
    catalogue_status = 'retired',
    metadata = metadata || jsonb_build_object(
      'canonical_slug_migrated_to', 'typesafe/jev-1.13.0',
      'canonical_slug_migrated_at', coalesce(
        metadata -> 'canonical_slug_migrated_at',
        to_jsonb(now())
      )
    ),
    updated_at = now()
where model_slug = 'typesafe/jev';

update public.model_release_push_events
set status = 'complete',
    completed_at = coalesce(completed_at, now()),
    updated_at = now(),
    last_error = null
where model_slug = 'typesafe/jev';
