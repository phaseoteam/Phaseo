-- v2 initial catalogue backfill from the current database.
-- The repository JSON remains the authoring source; the importer will keep
-- these tables synchronized after this one-time seed.

create table if not exists public.v2_catalogue_backfill_issues (
  issue_id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_key text not null,
  issue_code text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_catalogue_backfill_issues_key unique (source_type, source_key, issue_code)
);

create index if not exists v2_catalogue_backfill_issues_type_idx
  on public.v2_catalogue_backfill_issues (source_type, issue_code, created_at desc);
alter table public.v2_catalogue_backfill_issues enable row level security;
grant select on public.v2_catalogue_backfill_issues to authenticated;
grant insert on public.v2_catalogue_backfill_issues to service_role;

insert into public.v2_labs (lab_slug, name, country_code, description, status, routable, metadata)
select
  o.organisation_id,
  o.name,
  coalesce(nullif(o.country_code, ''), 'xx'),
  o.description,
  'active',
  false,
  jsonb_build_object('legacy_organisation_id', o.organisation_id)
from public.data_organisations o
on conflict (lab_slug) do update set
  name = excluded.name,
  country_code = excluded.country_code,
  description = excluded.description,
  updated_at = now(),
  metadata = public.v2_labs.metadata || excluded.metadata;

insert into public.v2_models (
  model_slug, lab_slug, name, description, status, hidden, input_modalities,
  output_modalities, family_slug, announced_at, released_at, deprecated_at,
  retired_at, metadata
)
select
  m.model_id,
  m.organisation_id,
  m.name,
  m.description,
  case lower(coalesce(m.status, ''))
    when 'retired' then 'retired'
    when 'deprecated' then 'deprecated'
    when 'withheld' then 'disabled'
    when 'announced' then 'draft'
    when 'rumoured' then 'draft'
    else 'active'
  end,
  coalesce(m.hidden, false),
  case when nullif(trim(coalesce(m.input_types, '')), '') is null then '{}'::text[]
       else regexp_split_to_array(lower(m.input_types), '\s*,\s*') end,
  case when nullif(trim(coalesce(m.output_types, '')), '') is null then '{}'::text[]
       else regexp_split_to_array(lower(m.output_types), '\s*,\s*') end,
  m.family_id,
  m.announcement_date,
  m.release_date,
  m.deprecation_date,
  m.retirement_date,
  jsonb_build_object(
    'legacy_model_id', m.model_id,
    'legacy_api_model_id', m.api_model_id,
    'legacy_status', m.status,
    'legacy_id', m.id
  )
from public.data_models m
on conflict (model_slug) do update set
  lab_slug = excluded.lab_slug,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  hidden = excluded.hidden,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  family_slug = excluded.family_slug,
  announced_at = excluded.announced_at,
  released_at = excluded.released_at,
  deprecated_at = excluded.deprecated_at,
  retired_at = excluded.retired_at,
  updated_at = now(),
  metadata = public.v2_models.metadata || excluded.metadata;

insert into public.v2_providers (
  provider_slug, lab_slug, name, status, routing_enabled, routable, country_code, metadata
)
select
  p.api_provider_id,
  coalesce(
    (select o.organisation_id from public.data_organisations o where o.organisation_id = p.api_provider_id),
    (select o.organisation_id from public.data_organisations o where o.organisation_id = p.provider_family_id)
  ),
  p.api_provider_name,
  case lower(coalesce(p.status, ''))
    when 'alpha' then 'alpha'
    when 'beta' then 'beta'
    when 'notready' then 'not_ready'
    when 'disabled' then 'disabled'
    when 'deprecated' then 'deprecated'
    else 'active'
  end,
  lower(coalesce(p.routing_status, '')) = 'active',
  lower(coalesce(p.routing_status, '')) = 'active',
  coalesce(nullif(p.country_code, ''), 'xx'),
  jsonb_build_object(
    'legacy_provider_id', p.api_provider_id,
    'provider_family_id', p.provider_family_id,
    'link', p.link,
    'description', p.description,
    'colour', p.colour,
    'prompt_training_policy', p.prompt_training_policy,
    'residency_mode', p.residency_mode,
    'default_execution_regions', p.default_execution_regions,
    'default_data_regions', p.default_data_regions
  )
from public.data_api_providers p
on conflict (provider_slug) do update set
  lab_slug = excluded.lab_slug,
  name = excluded.name,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  routable = excluded.routable,
  country_code = excluded.country_code,
  updated_at = now(),
  metadata = public.v2_providers.metadata || excluded.metadata;

insert into public.v2_model_provider_routes (
  provider_model_id, model_slug, provider_slug, provider_model_slug, status,
  routing_enabled, input_modalities, output_modalities, context_length,
  max_output_tokens, effective_from, effective_to, metadata
)
select
  p.provider_api_model_id,
  coalesce(p.model_id, p.internal_model_id, p.api_model_id),
  p.provider_id,
  p.provider_model_slug,
  case lower(coalesce(p.routing_status, ''))
    when 'disabled' then 'disabled'
    when 'retired' then 'retired'
    when 'active' then 'active'
    else 'degraded'
  end,
  coalesce(p.is_active_gateway, false) and lower(coalesce(p.routing_status, '')) = 'active',
  coalesce(p.input_modalities, '{}'::text[]),
  coalesce(p.output_modalities, '{}'::text[]),
  p.context_length,
  p.max_output_tokens,
  p.effective_from,
  case when p.effective_to is not null and p.effective_from is not null and p.effective_to <= p.effective_from then null else p.effective_to end,
  jsonb_build_object(
    'legacy_provider_api_model_id', p.provider_api_model_id,
    'legacy_api_model_id', p.api_model_id,
    'legacy_internal_model_id', p.internal_model_id,
    'legacy_is_active_gateway', p.is_active_gateway,
    'quantization_scheme', p.quantization_scheme
  )
from public.data_api_provider_models p
where exists (
  select 1 from public.v2_models m
  where m.model_slug = coalesce(p.model_id, p.internal_model_id, p.api_model_id)
)
on conflict (provider_model_id) do update set
  model_slug = excluded.model_slug,
  provider_slug = excluded.provider_slug,
  provider_model_slug = excluded.provider_model_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  context_length = excluded.context_length,
  max_output_tokens = excluded.max_output_tokens,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  updated_at = now(),
  metadata = public.v2_model_provider_routes.metadata || excluded.metadata;

insert into public.v2_model_aliases (alias_slug, model_slug, alias_type, enabled, metadata)
select
  a.alias_slug,
  coalesce(direct.model_id, api_model.model_id),
  coalesce(a.channel, 'public'),
  coalesce(a.is_enabled, true),
  jsonb_build_object('legacy_api_model_id', a.api_model_id, 'legacy_channel', a.channel)
from public.data_api_model_aliases a
left join public.data_models direct on direct.model_id = a.api_model_id
left join public.data_models api_model on api_model.api_model_id = a.api_model_id
where coalesce(direct.model_id, api_model.model_id) is not null
on conflict (alias_slug) do update set
  model_slug = excluded.model_slug,
  alias_type = excluded.alias_type,
  enabled = excluded.enabled,
  updated_at = now(),
  metadata = public.v2_model_aliases.metadata || excluded.metadata;

insert into public.v2_catalogue_backfill_issues (source_type, source_key, issue_code, details)
select 'alias', a.alias_slug, 'unresolved_model', jsonb_build_object('api_model_id', a.api_model_id)
from public.data_api_model_aliases a
left join public.data_models direct on direct.model_id = a.api_model_id
left join public.data_models api_model on api_model.api_model_id = a.api_model_id
where coalesce(direct.model_id, api_model.model_id) is null
on conflict (source_type, source_key, issue_code) do nothing;

insert into public.v2_pricing_skus (
  provider_model_id, sku_code, version, operation, status, display_name,
  description, currency, effective_from, effective_to, metadata
)
select
  route.provider_model_id,
  'legacy-' || replace(r.rule_id::text, '-', ''),
  1,
  r.capability_id,
  case when r.effective_to is not null and r.effective_to <= now() then 'deprecated' else 'active' end,
  coalesce(nullif(r.tier_label, ''), r.meter),
  r.note,
  coalesce(r.currency, 'USD'),
  coalesce(r.effective_from, '1970-01-01T00:00:00Z'::timestamptz),
  case
    when r.effective_to is not null
      and r.effective_to <= coalesce(r.effective_from, '1970-01-01T00:00:00Z'::timestamptz)
      then null
    else r.effective_to
  end,
  jsonb_build_object(
    'legacy_rule_id', r.rule_id,
    'legacy_model_key', r.model_key,
    'legacy_sku_id', r.sku_id,
    'legacy_tier_id', r.tier_id,
    'legacy_tier_order', r.tier_order,
    'match', coalesce(r.match, '[]'::jsonb),
    'time_windows', coalesce(r.time_windows, '[]'::jsonb),
    'billing_timestamp_basis', r.billing_timestamp_basis
  )
from public.data_api_pricing_rules r
join lateral (
  select p.provider_api_model_id
  from public.data_api_provider_models p
  where p.provider_id = split_part(r.model_key, ':', 1)
    and p.api_model_id = split_part(substring(r.model_key from position(':' in r.model_key) + 1), ':', 1)
  order by p.is_active_gateway desc, p.effective_from desc nulls last, p.provider_api_model_id
  limit 1
) legacy_route on true
join public.v2_model_provider_routes route on route.provider_model_id = legacy_route.provider_api_model_id
on conflict (provider_model_id, sku_code, version) do update set
  operation = excluded.operation,
  status = excluded.status,
  display_name = excluded.display_name,
  description = excluded.description,
  currency = excluded.currency,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  updated_at = now(),
  metadata = public.v2_pricing_skus.metadata || excluded.metadata;

insert into public.v2_pricing_sku_meters (
  sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos,
  display_label, display_unit, metadata
)
select
  sku.sku_id,
  lower(regexp_replace(r.meter, '[^a-zA-Z0-9._:-]+', '_', 'g')),
  case
    when r.meter ilike '%audio%' then 'audio'
    when r.meter ilike '%image%' or r.meter ilike '%pixel%' then 'image'
    when r.meter ilike '%video%' or r.meter ilike '%second%' then 'video'
    when r.meter ilike '%character%' then 'text'
    when r.meter ilike '%embedding%' then 'embedding'
    when r.meter ilike '%rerank%' then 'rerank'
    else 'text'
  end,
  case when r.meter ilike 'input_%' or r.meter ilike 'cached_%' then 'input'
       when r.meter ilike 'output_%' then 'output' else null end,
  coalesce(r.unit, 'unit'),
  coalesce(r.unit_size, 1),
  round(coalesce(r.price_per_unit, 0) * 1000000000, 12),
  coalesce(r.meter, 'meter'),
  coalesce(r.unit_size, 1)::text || ' ' || coalesce(r.unit, 'unit'),
  jsonb_build_object('legacy_rule_id', r.rule_id, 'legacy_priority', r.priority)
from public.data_api_pricing_rules r
join lateral (
  select p.provider_api_model_id
  from public.data_api_provider_models p
  where p.provider_id = split_part(r.model_key, ':', 1)
    and p.api_model_id = split_part(substring(r.model_key from position(':' in r.model_key) + 1), ':', 1)
  order by p.is_active_gateway desc, p.effective_from desc nulls last, p.provider_api_model_id
  limit 1
) legacy_route on true
join public.v2_model_provider_routes route on route.provider_model_id = legacy_route.provider_api_model_id
join public.v2_pricing_skus sku
  on sku.provider_model_id = route.provider_model_id
 and sku.sku_code = 'legacy-' || replace(r.rule_id::text, '-', '')
 and sku.version = 1
on conflict (sku_id, meter_key) do update set
  modality = excluded.modality,
  direction = excluded.direction,
  unit = excluded.unit,
  unit_quantity = excluded.unit_quantity,
  price_nanos = excluded.price_nanos,
  display_label = excluded.display_label,
  display_unit = excluded.display_unit,
  updated_at = now(),
  metadata = public.v2_pricing_sku_meters.metadata || excluded.metadata;

insert into public.v2_catalogue_backfill_issues (source_type, source_key, issue_code, details)
select
  'pricing_rule', r.rule_id::text, 'unresolved_provider_model',
  jsonb_build_object('model_key', r.model_key, 'provider_slug', split_part(r.model_key, ':', 1))
from public.data_api_pricing_rules r
left join lateral (
  select p.provider_api_model_id
  from public.data_api_provider_models p
  where p.provider_id = split_part(r.model_key, ':', 1)
    and p.api_model_id = split_part(substring(r.model_key from position(':' in r.model_key) + 1), ':', 1)
  order by p.is_active_gateway desc, p.effective_from desc nulls last, p.provider_api_model_id
  limit 1
) legacy_route on true
left join public.v2_model_provider_routes route on route.provider_model_id = legacy_route.provider_api_model_id
where route.provider_model_id is null
on conflict (source_type, source_key, issue_code) do nothing;
