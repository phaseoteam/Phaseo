-- v2 provider regions, service tiers, route variants, and capabilities.

create table if not exists public.v2_service_tiers (
  service_tier_slug text primary key,
  display_name text not null,
  description text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_service_tiers_slug_check check (service_tier_slug = lower(service_tier_slug) and service_tier_slug ~ '^[a-z0-9][a-z0-9._:-]*$'),
  constraint v2_service_tiers_status_check check (status in ('active', 'deprecated', 'disabled'))
);

create table if not exists public.v2_provider_regions (
  provider_region_id uuid primary key default gen_random_uuid(),
  provider_slug text not null references public.v2_providers(provider_slug) on delete cascade,
  region_code text not null,
  display_name text,
  execution_supported boolean not null default true,
  data_residency_supported boolean not null default false,
  status text not null default 'active',
  routing_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_provider_regions_key unique (provider_slug, region_code),
  constraint v2_provider_regions_region_check check (region_code = lower(region_code) and region_code ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint v2_provider_regions_status_check check (status in ('active', 'deprecated', 'disabled'))
);

create index if not exists v2_provider_regions_lookup_idx
  on public.v2_provider_regions (region_code, status, routing_enabled, provider_slug);

create table if not exists public.v2_route_capabilities (
  provider_model_id text not null references public.v2_model_provider_routes(provider_model_id) on delete cascade,
  capability_id text not null,
  status text not null default 'active',
  max_input_tokens integer,
  max_output_tokens integer,
  params jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_model_id, capability_id),
  constraint v2_route_capabilities_status_check check (status in ('active', 'degraded', 'disabled', 'internal_testing')),
  constraint v2_route_capabilities_window_check check (effective_to is null or effective_from is null or effective_to > effective_from)
);

create index if not exists v2_route_capabilities_capability_idx
  on public.v2_route_capabilities (capability_id, status, provider_model_id);

create table if not exists public.v2_route_variants (
  variant_id uuid primary key default gen_random_uuid(),
  provider_model_id text not null references public.v2_model_provider_routes(provider_model_id) on delete cascade,
  variant_key text not null,
  provider_region_id uuid references public.v2_provider_regions(provider_region_id) on delete set null,
  execution_region text,
  data_region text,
  service_tier_slug text not null references public.v2_service_tiers(service_tier_slug) on delete restrict,
  status text not null default 'active',
  routing_enabled boolean not null default true,
  endpoint_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_route_variants_key unique (provider_model_id, variant_key),
  constraint v2_route_variants_status_check check (status in ('active', 'degraded', 'disabled', 'retired')),
  constraint v2_route_variants_key_check check (variant_key = lower(variant_key) and variant_key ~ '^[a-z0-9][a-z0-9._:-]*$')
);

create index if not exists v2_route_variants_lookup_idx
  on public.v2_route_variants (provider_model_id, service_tier_slug, execution_region, data_region, status, routing_enabled);
create index if not exists v2_route_variants_region_idx
  on public.v2_route_variants (execution_region, data_region, service_tier_slug)
  where status in ('active', 'degraded') and routing_enabled = true;

alter table public.v2_pricing_skus add column if not exists service_tier_slug text;
alter table public.v2_pricing_skus add column if not exists route_variant_id uuid;
alter table public.v2_pricing_skus
  add constraint v2_pricing_skus_service_tier_fkey
  foreign key (service_tier_slug) references public.v2_service_tiers(service_tier_slug) on delete restrict;
alter table public.v2_pricing_skus
  add constraint v2_pricing_skus_route_variant_fkey
  foreign key (route_variant_id) references public.v2_route_variants(variant_id) on delete set null;

insert into public.v2_service_tiers (service_tier_slug, display_name, metadata)
values
  ('standard', 'Standard', jsonb_build_object('source', 'v2_default')),
  ('batch', 'Batch', jsonb_build_object('source', 'v2_default')),
  ('priority', 'Priority', jsonb_build_object('source', 'v2_default')),
  ('flex', 'Flex', jsonb_build_object('source', 'v2_default')),
  ('enterprise', 'Enterprise', jsonb_build_object('source', 'v2_default'))
on conflict (service_tier_slug) do update set
  display_name = excluded.display_name,
  updated_at = now();

insert into public.v2_service_tiers (service_tier_slug, display_name, metadata)
select distinct
  lower(regexp_replace(coalesce(rule.pricing_plan, 'standard'), '[^a-zA-Z0-9._:-]+', '-', 'g')),
  initcap(replace(lower(coalesce(rule.pricing_plan, 'standard')), '_', ' ')),
  jsonb_build_object('source', 'legacy_pricing_rules', 'legacy_pricing_plan', rule.pricing_plan)
from public.data_api_pricing_rules rule
where nullif(trim(coalesce(rule.pricing_plan, '')), '') is not null
on conflict (service_tier_slug) do update set
  display_name = excluded.display_name,
  metadata = public.v2_service_tiers.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_provider_regions (
  provider_slug, region_code, display_name, execution_supported,
  data_residency_supported, metadata
)
select distinct
  provider.provider_slug,
  lower(trim(region.value)),
  upper(trim(region.value)),
  true,
  false,
  jsonb_build_object('source', 'legacy_provider.default_execution_regions')
from public.v2_providers provider
cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(provider.metadata->'default_execution_regions') = 'array'
    then provider.metadata->'default_execution_regions'
    else '[]'::jsonb
  end
) region(value)
where nullif(trim(region.value), '') is not null
on conflict (provider_slug, region_code) do update set
  display_name = excluded.display_name,
  updated_at = now();

insert into public.v2_route_capabilities (
  provider_model_id, capability_id, status, max_input_tokens,
  max_output_tokens, params, effective_from, effective_to, metadata
)
select
  capability.provider_api_model_id,
  capability.capability_id,
  case lower(capability.status::text)
    when 'active' then 'active'
    when 'disabled' then 'disabled'
    when 'internal_testing' then 'internal_testing'
    else 'degraded'
  end,
  capability.max_input_tokens,
  capability.max_output_tokens,
  coalesce(capability.params, '{}'::jsonb),
  null,
  null,
  jsonb_build_object('source', 'legacy_provider_model_capabilities', 'notes', capability.notes)
from public.data_api_provider_model_capabilities capability
join public.v2_model_provider_routes route
  on route.provider_model_id = capability.provider_api_model_id
on conflict (provider_model_id, capability_id) do update set
  status = excluded.status,
  max_input_tokens = excluded.max_input_tokens,
  max_output_tokens = excluded.max_output_tokens,
  params = excluded.params,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  updated_at = now();

update public.v2_pricing_skus sku
set service_tier_slug = coalesce(
  nullif(lower(regexp_replace(rule.pricing_plan, '[^a-zA-Z0-9._:-]+', '-', 'g')), ''),
  'standard'
)
from public.data_api_pricing_rules rule
where sku.metadata->>'legacy_rule_id' = rule.rule_id::text;

update public.v2_pricing_skus
set service_tier_slug = 'standard'
where service_tier_slug is null;

insert into public.v2_route_variants (
  provider_model_id, variant_key, service_tier_slug, status,
  routing_enabled, endpoint_label, metadata
)
select distinct
  sku.provider_model_id,
  'global:' || sku.service_tier_slug,
  sku.service_tier_slug,
  route.status,
  route.routing_enabled,
  initcap(replace(sku.service_tier_slug, '-', ' ')),
  jsonb_build_object('source', 'v2_default_variant')
from public.v2_pricing_skus sku
join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id
on conflict (provider_model_id, variant_key) do update set
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  endpoint_label = excluded.endpoint_label,
  updated_at = now();

update public.v2_pricing_skus sku
set route_variant_id = variant.variant_id
from public.v2_route_variants variant
where variant.provider_model_id = sku.provider_model_id
  and variant.service_tier_slug = sku.service_tier_slug
  and variant.variant_key = 'global:' || sku.service_tier_slug;

alter table public.v2_service_tiers enable row level security;
alter table public.v2_provider_regions enable row level security;
alter table public.v2_route_capabilities enable row level security;
alter table public.v2_route_variants enable row level security;

drop policy if exists v2_service_tiers_public_select on public.v2_service_tiers;
create policy v2_service_tiers_public_select on public.v2_service_tiers
  for select to anon, authenticated using (status <> 'disabled');
drop policy if exists v2_provider_regions_public_select on public.v2_provider_regions;
create policy v2_provider_regions_public_select on public.v2_provider_regions
  for select to anon, authenticated using (status <> 'disabled' and routing_enabled = true);
drop policy if exists v2_route_capabilities_public_select on public.v2_route_capabilities;
create policy v2_route_capabilities_public_select on public.v2_route_capabilities
  for select to anon, authenticated using (status <> 'disabled');
drop policy if exists v2_route_variants_public_select on public.v2_route_variants;
create policy v2_route_variants_public_select on public.v2_route_variants
  for select to anon, authenticated using (status <> 'disabled' and routing_enabled = true);

grant select on public.v2_service_tiers, public.v2_provider_regions, public.v2_route_capabilities, public.v2_route_variants to anon, authenticated;

comment on table public.v2_provider_regions is 'Normalized provider execution/data regions used for display and route eligibility.';
comment on table public.v2_route_variants is 'Concrete provider/model region and service-tier variant. Pricing attaches here when regional or tier-specific.';
comment on table public.v2_route_capabilities is 'Queryable provider/model capability facts used by routing and catalogue display.';
