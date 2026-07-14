-- Parallel V2 model catalogue foundation.
-- Every new table is suffixed _v2 and existing production tables are read-only
-- backfill sources. This migration makes no destructive schema changes.

create table if not exists public.data_api_quickstart_example_types_v2 (
  quickstart_example_type_id text primary key check (btrim(quickstart_example_type_id) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  description text,
  template_key text not null check (btrim(template_key) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.data_models_v2 (
  model_id text primary key check (btrim(model_id) <> ''),
  legacy_id uuid unique,
  full_name text not null check (btrim(full_name) <> ''),
  short_name text,
  organisation_id text not null references public.data_organisations(organisation_id)
    on update cascade on delete restrict,
  description text,
  status text not null default 'inactive'
    check (status in ('coming_soon', 'active', 'deprecated', 'retired', 'inactive', 'disabled')),
  announcement_date timestamptz,
  release_date timestamptz,
  deprecation_date timestamptz,
  retirement_date timestamptz,
  knowledge_cutoff date,
  knowledge_cutoff_precision text
    check (knowledge_cutoff_precision is null or knowledge_cutoff_precision in ('day', 'month', 'year', 'unknown')),
  context_length integer check (context_length is null or context_length > 0),
  input_modalities text[] not null default '{}'::text[],
  output_modalities text[] not null default '{}'::text[],
  hidden boolean not null default false,
  notice_tone text check (notice_tone is null or notice_tone in ('info', 'warning', 'critical')),
  notice_markdown text,
  notice_active_from timestamptz,
  notice_active_to timestamptz,
  supports_reasoning boolean not null default false,
  reasoning_config jsonb not null default '{}'::jsonb check (jsonb_typeof(reasoning_config) = 'object'),
  quickstart_example_type_id text references public.data_api_quickstart_example_types_v2(quickstart_example_type_id)
    on update cascade on delete set null,
  default_rpm integer check (default_rpm is null or default_rpm > 0),
  default_rpd integer check (default_rpd is null or default_rpd > 0),
  supported_voices jsonb check (supported_voices is null or jsonb_typeof(supported_voices) = 'array'),
  previous_model_id text,
  family_id text,
  license text,
  timeline jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (notice_active_to is null or notice_active_from is null or notice_active_to > notice_active_from)
);

create index if not exists data_models_v2_public_catalogue_idx
  on public.data_models_v2 (status, release_date desc, model_id) where hidden = false;
create index if not exists data_models_v2_organisation_idx
  on public.data_models_v2 (organisation_id, model_id);

insert into public.data_models_v2 (
  model_id, legacy_id, full_name, organisation_id, description, status,
  announcement_date, release_date, deprecation_date, retirement_date,
  input_modalities, output_modalities, hidden, notice_tone, notice_markdown,
  previous_model_id, family_id, license, timeline, created_at, updated_at
)
select
  model.model_id,
  model.id,
  model.name,
  model.organisation_id,
  model.description,
  case
    when lower(coalesce(model.status, '')) in ('announced', 'coming_soon', 'coming-soon') then 'coming_soon'
    when lower(coalesce(model.status, '')) in ('active', 'stable', 'ga', 'beta', 'preview') then 'active'
    when lower(coalesce(model.status, '')) in ('deprecated', 'deprecating') then 'deprecated'
    when lower(coalesce(model.status, '')) in ('retired', 'retirement') then 'retired'
    when lower(coalesce(model.status, '')) in ('disabled') then 'disabled'
    else 'inactive'
  end,
  model.announcement_date,
  model.release_date,
  model.deprecation_date,
  model.retirement_date,
  case
    when model.input_types is null or btrim(model.input_types) = '' then '{}'::text[]
    when btrim(model.input_types) like '{%}' then
      array_remove(string_to_array(trim(both '{}' from btrim(model.input_types)), ','), '')
    else regexp_split_to_array(btrim(model.input_types), '\s*,\s*')
  end,
  case
    when model.output_types is null or btrim(model.output_types) = '' then '{}'::text[]
    when btrim(model.output_types) like '{%}' then
      array_remove(string_to_array(trim(both '{}' from btrim(model.output_types)), ','), '')
    else regexp_split_to_array(btrim(model.output_types), '\s*,\s*')
  end,
  coalesce(model.hidden, false),
  notice.tone,
  notice.markdown,
  model.previous_model_id,
  model.family_id,
  model.license,
  model.timeline,
  model.created_at,
  model.updated_at
from public.data_models model
left join lateral (
  select model_notice.tone, model_notice.markdown
  from public.data_api_model_page_notices model_notice
  where model_notice.api_model_id in (model.model_id, model.api_model_id)
  order by model_notice.updated_at desc
  limit 1
) notice on true
on conflict (model_id) do nothing;

create table if not exists public.data_api_providers_v2 (
  provider_id text primary key check (btrim(provider_id) <> ''),
  legacy_id uuid unique,
  display_name text not null check (btrim(display_name) <> ''),
  description text,
  homepage_url text,
  gateway_base_url text,
  icon_url text,
  status_page_url text,
  headquarters_country_code text,
  headquarters_city text,
  availability_status text not null default 'not_ready'
    check (availability_status in ('active', 'beta', 'alpha', 'not_ready')),
  routing_status text not null default 'active'
    check (routing_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3', 'disabled')),
  training_policy_public text not null default 'unknown'
    check (training_policy_public in ('unknown', 'may_train', 'no_train', 'opt_out_available', 'enterprise_no_train')),
  training_policy_phaseo text not null default 'unknown'
    check (training_policy_phaseo in ('unknown', 'may_train', 'no_train')),
  prompt_retention_policy text not null default 'unknown'
    check (prompt_retention_policy in ('unknown', 'not_retained', 'retained', 'varies')),
  terms_of_service_url text,
  privacy_policy_url text,
  data_policy_source_url text,
  data_policy_notes text,
  byok_enabled boolean not null default false,
  colour text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.data_api_providers_v2 (
  provider_id, legacy_id, display_name, description, homepage_url,
  headquarters_country_code, availability_status, routing_status,
  training_policy_public, terms_of_service_url, privacy_policy_url,
  data_policy_source_url, data_policy_notes, colour, created_at, updated_at
)
select
  provider.api_provider_id,
  provider.uuid,
  provider.api_provider_name,
  provider.description,
  provider.link,
  nullif(provider.country_code, 'xx'),
  case lower(coalesce(provider.status, ''))
    when 'active' then 'active'
    when 'beta' then 'beta'
    when 'alpha' then 'alpha'
    else 'not_ready'
  end,
  case replace(lower(coalesce(provider.routing_status, 'active')), '-', '_')
    when 'deranked_lvl1' then 'deranked_lvl1'
    when 'deranked_lvl2' then 'deranked_lvl2'
    when 'deranked_lvl3' then 'deranked_lvl3'
    when 'disabled' then 'disabled'
    else 'active'
  end,
  coalesce(provider.prompt_training_policy, 'unknown'),
  provider.terms_of_service_url,
  provider.privacy_policy_url,
  provider.prompt_training_source_url,
  provider.prompt_training_notes,
  provider.colour,
  provider.created_at,
  provider.updated_at
from public.data_api_providers provider
on conflict (provider_id) do nothing;

create table if not exists public.data_api_provider_owners_v2 (
  owner_id bigint generated always as identity primary key,
  provider_id text not null references public.data_api_providers_v2(provider_id)
    on update cascade on delete cascade,
  user_id uuid references public.users(user_id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(user_id, workspace_id) = 1)
);

create unique index if not exists data_api_provider_owners_v2_user_unique_idx
  on public.data_api_provider_owners_v2 (provider_id, user_id) where user_id is not null;
create unique index if not exists data_api_provider_owners_v2_workspace_unique_idx
  on public.data_api_provider_owners_v2 (provider_id, workspace_id) where workspace_id is not null;
create index if not exists data_api_provider_owners_v2_user_idx
  on public.data_api_provider_owners_v2 (user_id) where user_id is not null;
create index if not exists data_api_provider_owners_v2_workspace_idx
  on public.data_api_provider_owners_v2 (workspace_id) where workspace_id is not null;

create or replace function public.can_manage_api_provider_v2(p_provider_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.data_api_provider_owners_v2 owner
    where owner.provider_id = p_provider_id
      and (
        owner.user_id = (select auth.uid())
        or exists (
          select 1 from public.workspace_members member
          where member.workspace_id = owner.workspace_id
            and member.user_id = (select auth.uid())
        )
      )
  );
$$;
revoke all on function public.can_manage_api_provider_v2(text) from public;
grant execute on function public.can_manage_api_provider_v2(text) to authenticated, service_role;

create table if not exists public.data_api_provider_regions_v2 (
  provider_region_id bigint generated always as identity primary key,
  provider_id text not null references public.data_api_providers_v2(provider_id)
    on update cascade on delete cascade,
  region_code text not null check (btrim(region_code) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  region_kind text not null default 'execution'
    check (region_kind in ('datacenter', 'execution', 'data_residency')),
  country_code text,
  city text,
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, region_code, region_kind)
);
create index if not exists data_api_provider_regions_v2_provider_idx
  on public.data_api_provider_regions_v2 (provider_id, region_kind, region_code);

insert into public.data_api_provider_regions_v2 (provider_id, region_code, display_name, region_kind, is_default)
select provider.api_provider_id, region_code, region_code, 'execution', true
from public.data_api_providers provider
cross join lateral unnest(coalesce(provider.default_execution_regions, '{}'::text[])) region_code
where btrim(region_code) <> ''
on conflict (provider_id, region_code, region_kind) do nothing;

insert into public.data_api_provider_regions_v2 (provider_id, region_code, display_name, region_kind, is_default)
select provider.api_provider_id, region_code, region_code, 'data_residency', true
from public.data_api_providers provider
cross join lateral unnest(coalesce(provider.default_data_regions, '{}'::text[])) region_code
where btrim(region_code) <> ''
on conflict (provider_id, region_code, region_kind) do nothing;

create table if not exists public.data_api_provider_models_v2 (
  provider_model_id text primary key check (btrim(provider_model_id) <> ''),
  provider_id text not null references public.data_api_providers_v2(provider_id)
    on update cascade on delete cascade,
  model_id text not null references public.data_models_v2(model_id)
    on update cascade on delete cascade,
  provider_model_api_id text not null check (btrim(provider_model_api_id) <> ''),
  provider_model_slug text not null check (btrim(provider_model_slug) <> ''),
  provider_model_name text,
  availability_status text not null default 'inactive'
    check (availability_status in ('active', 'coming_soon', 'inactive')),
  routing_status text not null default 'active'
    check (routing_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3', 'disabled')),
  context_length integer check (context_length is null or context_length > 0),
  max_output_tokens integer check (max_output_tokens is null or max_output_tokens > 0),
  input_modalities text[] not null default '{}'::text[],
  output_modalities text[] not null default '{}'::text[],
  quantization text,
  is_free boolean not null default false,
  rpm_limit integer check (rpm_limit is null or rpm_limit > 0),
  rpd_limit integer check (rpd_limit is null or rpd_limit > 0),
  supported_voices jsonb check (supported_voices is null or jsonb_typeof(supported_voices) = 'array'),
  provider_release_date timestamptz,
  provider_deprecation_date timestamptz,
  provider_retirement_date timestamptz,
  training_policy_override text
    check (training_policy_override is null or training_policy_override in ('unknown', 'may_train', 'no_train', 'opt_out_available', 'enterprise_no_train')),
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to > effective_from)
);

create index if not exists data_api_provider_models_v2_model_idx
  on public.data_api_provider_models_v2 (model_id, availability_status, routing_status, provider_id);
create index if not exists data_api_provider_models_v2_provider_idx
  on public.data_api_provider_models_v2 (provider_id, availability_status, model_id);

insert into public.data_api_provider_models_v2 (
  provider_model_id, provider_id, model_id, provider_model_api_id, provider_model_slug,
  availability_status, routing_status, context_length, max_output_tokens,
  input_modalities, output_modalities, quantization, is_free,
  training_policy_override, effective_from, effective_to, created_at, updated_at
)
select
  provider_model.provider_api_model_id,
  provider_model.provider_id,
  model_v2.model_id,
  provider_model.api_model_id,
  coalesce(nullif(provider_model.provider_model_slug, ''), provider_model.api_model_id),
  case
    when provider_model.effective_from is not null and provider_model.effective_from > now() then 'coming_soon'
    when provider_model.is_active_gateway then 'active'
    else 'inactive'
  end,
  case replace(lower(coalesce(provider_model.routing_status, 'active')), '-', '_')
    when 'deranked' then 'deranked_lvl1'
    when 'deranked_lvl1' then 'deranked_lvl1'
    when 'deranked_lvl2' then 'deranked_lvl2'
    when 'deranked_lvl3' then 'deranked_lvl3'
    when 'disabled' then 'disabled'
    else 'active'
  end,
  provider_model.context_length,
  provider_model.max_output_tokens,
  coalesce(provider_model.input_modalities, '{}'::text[]),
  coalesce(provider_model.output_modalities, '{}'::text[]),
  provider_model.quantization_scheme,
  lower(provider_model.api_model_id) like '%:free',
  provider_model.prompt_training_policy_override,
  provider_model.effective_from,
  provider_model.effective_to,
  provider_model.created_at,
  provider_model.updated_at
from public.data_api_provider_models provider_model
join public.data_models_v2 model_v2
  on model_v2.model_id = coalesce(
    nullif(btrim(provider_model.model_id), ''),
    nullif(btrim(provider_model.internal_model_id), ''),
    nullif(btrim(provider_model.api_model_id), '')
  )
join public.data_api_providers_v2 provider_v2 on provider_v2.provider_id = provider_model.provider_id
on conflict (provider_model_id) do nothing;

create table if not exists public.data_api_provider_model_capabilities_v2 (
  provider_model_id text not null references public.data_api_provider_models_v2(provider_model_id)
    on update cascade on delete cascade,
  capability_id text not null check (btrim(capability_id) <> ''),
  status text not null default 'inactive'
    check (status in ('active', 'coming_soon', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3', 'inactive', 'disabled', 'internal_testing')),
  max_input_tokens integer check (max_input_tokens is null or max_input_tokens > 0),
  max_output_tokens integer check (max_output_tokens is null or max_output_tokens > 0),
  supported_parameters text[] not null default '{}'::text[],
  parameter_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(parameter_schema) = 'object'),
  rpm_limit integer check (rpm_limit is null or rpm_limit > 0),
  rpd_limit integer check (rpd_limit is null or rpd_limit > 0),
  effective_from timestamptz,
  effective_to timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_model_id, capability_id),
  check (effective_to is null or effective_from is null or effective_to > effective_from)
);
create index if not exists data_api_provider_capabilities_v2_status_idx
  on public.data_api_provider_model_capabilities_v2 (capability_id, status, provider_model_id);

insert into public.data_api_provider_model_capabilities_v2 (
  provider_model_id, capability_id, status, max_input_tokens, max_output_tokens,
  supported_parameters, parameter_schema, effective_from, effective_to, notes,
  created_at, updated_at
)
select
  capability.provider_api_model_id,
  capability.capability_id,
  case replace(lower(capability.status::text), '-', '_')
    when 'active' then 'active'
    when 'coming_soon' then 'coming_soon'
    when 'deranked' then 'deranked_lvl1'
    when 'deranked_lvl1' then 'deranked_lvl1'
    when 'deranked_lvl2' then 'deranked_lvl2'
    when 'deranked_lvl3' then 'deranked_lvl3'
    when 'disabled' then 'disabled'
    when 'internal_testing' then 'internal_testing'
    else 'inactive'
  end,
  capability.max_input_tokens,
  capability.max_output_tokens,
  case
    when jsonb_typeof(capability.params->'properties') = 'object' then
      array(
        select parameter_key
        from jsonb_object_keys(capability.params->'properties') as parameter_key
        order by parameter_key
      )
    else '{}'::text[]
  end,
  case when jsonb_typeof(capability.params) = 'object' then capability.params else '{}'::jsonb end,
  capability.effective_from,
  capability.effective_to,
  capability.notes,
  capability.created_at,
  capability.updated_at
from public.data_api_provider_model_capabilities capability
join public.data_api_provider_models_v2 provider_model_v2
  on provider_model_v2.provider_model_id = capability.provider_api_model_id
on conflict (provider_model_id, capability_id) do nothing;

create table if not exists public.data_api_billing_units_v2 (
  meter_id text primary key check (btrim(meter_id) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  modality_group text not null default 'other'
    check (modality_group in ('text', 'image', 'video', 'audio', 'embedding', 'tools', 'other')),
  base_unit text not null check (btrim(base_unit) <> ''),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.data_api_billing_units_v2 (meter_id, display_name, modality_group, base_unit)
select
  meter,
  initcap(replace(meter, '_', ' ')),
  case
    when meter like '%image%' then 'image'
    when meter like '%video%' then 'video'
    when meter like '%audio%' then 'audio'
    when meter like '%embedding%' then 'embedding'
    when meter like '%search%' or meter like '%fetch%' or meter like '%tool%' then 'tools'
    when meter like '%token%' or meter like '%character%' then 'text'
    else 'other'
  end,
  coalesce(nullif(btrim(unit), ''), 'unit')
from (
  select distinct on (meter) meter, unit
  from public.data_api_pricing_rules
  where meter is not null and btrim(meter) <> ''
  order by meter, updated_at desc
) legacy_units
on conflict (meter_id) do nothing;

create table if not exists public.data_api_pricing_skus_v2 (
  sku_id uuid primary key default gen_random_uuid(),
  sku_key text not null unique check (btrim(sku_key) <> ''),
  provider_model_id text not null,
  capability_id text not null,
  meter_id text not null references public.data_api_billing_units_v2(meter_id) on update cascade,
  provider_sku_id text,
  pricing_plan text not null default 'standard',
  label text not null check (btrim(label) <> ''),
  display_text text,
  display_group text not null default 'other'
    check (display_group in ('text', 'image', 'video', 'audio', 'embedding', 'tools', 'other')),
  display_tier text not null default 'primary' check (display_tier in ('primary', 'secondary')),
  display_order integer not null default 100,
  billing_unit_size numeric not null default 1 check (billing_unit_size > 0),
  display_multiplier numeric not null default 1 check (display_multiplier > 0),
  display_unit_label text not null check (btrim(display_unit_label) <> ''),
  currency text not null default 'USD',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (provider_model_id, capability_id)
    references public.data_api_provider_model_capabilities_v2(provider_model_id, capability_id)
    on update cascade on delete cascade
);
create index if not exists data_api_pricing_skus_v2_lookup_idx
  on public.data_api_pricing_skus_v2 (provider_model_id, capability_id, pricing_plan, display_order)
  where is_active = true;
create index if not exists data_api_pricing_skus_v2_meter_idx
  on public.data_api_pricing_skus_v2 (meter_id);

create table if not exists public.data_api_pricing_rates_v2 (
  rate_id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.data_api_pricing_skus_v2(sku_id) on delete cascade,
  rate_type text not null default 'standard'
    check (rate_type in ('standard', 'promotional', 'contract', 'override')),
  promotion_name text,
  price_per_unit numeric not null check (price_per_unit >= 0),
  match jsonb not null default '[]'::jsonb check (jsonb_typeof(match) = 'array'),
  priority integer not null default 100,
  note text,
  effective_from timestamptz not null,
  effective_to timestamptz,
  billing_timestamp_basis text not null default 'request_start'
    check (billing_timestamp_basis in ('request_start', 'provider_accept', 'completion', 'unknown')),
  time_windows jsonb not null default '[]'::jsonb check (jsonb_typeof(time_windows) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  check (rate_type <> 'promotional' or btrim(coalesce(promotion_name, '')) <> ''),
  check (rate_type <> 'promotional' or effective_to is not null)
);

create index if not exists data_api_pricing_rates_v2_resolution_idx
  on public.data_api_pricing_rates_v2 (sku_id, priority desc, effective_from desc, effective_to);
create index if not exists data_api_pricing_rates_v2_open_ended_idx
  on public.data_api_pricing_rates_v2 (sku_id, priority desc, effective_from desc)
  where effective_to is null;
create index if not exists data_api_pricing_rates_v2_history_idx
  on public.data_api_pricing_rates_v2 (sku_id, effective_from desc, effective_to desc);

create table if not exists public.data_api_provider_meter_mappings_v2 (
  provider_id text not null references public.data_api_providers_v2(provider_id)
    on update cascade on delete cascade,
  native_meter_id text not null check (btrim(native_meter_id) <> ''),
  meter_id text not null references public.data_api_billing_units_v2(meter_id) on update cascade,
  scale numeric not null default 1 check (scale > 0),
  mapping_config jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping_config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_id, native_meter_id)
);
create index if not exists data_api_provider_meter_mappings_v2_meter_idx
  on public.data_api_provider_meter_mappings_v2 (meter_id);

insert into public.data_api_pricing_skus_v2 (
  sku_id, sku_key, provider_model_id, capability_id, meter_id, pricing_plan,
  label, display_group, display_tier, billing_unit_size, display_multiplier,
  display_unit_label, currency, updated_at
)
select
  rule.rule_id,
  'legacy/' || rule.rule_id::text,
  provider_model_v2.provider_model_id,
  rule.capability_id,
  rule.meter,
  coalesce(nullif(lower(rule.pricing_plan), ''), 'standard'),
  initcap(replace(rule.meter, '_', ' ')),
  billing_unit.modality_group,
  case when rule.meter in ('input_tokens', 'input_text_tokens', 'output_tokens', 'output_text_tokens')
    then 'primary' else 'secondary' end,
  rule.unit_size,
  case when rule.meter like '%token%' then 1000000 else 1 end,
  case when rule.meter like '%token%' then '1M tokens' else rule.unit end,
  rule.currency,
  rule.updated_at
from public.data_api_pricing_rules rule
join public.data_api_provider_models provider_model
  on rule.model_key = provider_model.provider_id || ':' || provider_model.api_model_id || ':' || rule.capability_id
join public.data_api_provider_models_v2 provider_model_v2
  on provider_model_v2.provider_model_id = provider_model.provider_api_model_id
join public.data_api_provider_model_capabilities_v2 capability_v2
  on capability_v2.provider_model_id = provider_model_v2.provider_model_id
 and capability_v2.capability_id = rule.capability_id
join public.data_api_billing_units_v2 billing_unit on billing_unit.meter_id = rule.meter
where rule.unit_size > 0 and rule.price_per_unit >= 0
on conflict (sku_id) do nothing;

insert into public.data_api_pricing_rates_v2 (
  rate_id, sku_id, rate_type, price_per_unit, match, priority, note,
  effective_from, effective_to, billing_timestamp_basis, time_windows, updated_at
)
select
  rule.rule_id,
  sku.sku_id,
  'standard',
  rule.price_per_unit,
  rule.match,
  rule.priority,
  rule.note,
  coalesce(rule.effective_from, rule.updated_at, now()),
  rule.effective_to,
  rule.billing_timestamp_basis,
  rule.time_windows,
  rule.updated_at
from public.data_api_pricing_rules rule
join public.data_api_pricing_skus_v2 sku on sku.sku_id = rule.rule_id
on conflict (rate_id) do nothing;

create or replace view public.data_api_pricing_rules_v2_compat as
select
  rate.rate_id as rule_id,
  provider_model.provider_id || ':' || provider_model.provider_model_api_id || ':' || sku.capability_id as model_key,
  sku.capability_id,
  sku.pricing_plan,
  sku.meter_id as meter,
  billing_unit.base_unit as unit,
  sku.billing_unit_size as unit_size,
  rate.price_per_unit,
  sku.currency,
  rate.note,
  rate.match,
  rate.priority,
  rate.effective_from,
  rate.effective_to,
  rate.billing_timestamp_basis,
  rate.time_windows,
  greatest(sku.updated_at, rate.updated_at) as updated_at
from public.data_api_pricing_skus_v2 sku
join public.data_api_pricing_rates_v2 rate on rate.sku_id = sku.sku_id
join public.data_api_billing_units_v2 billing_unit on billing_unit.meter_id = sku.meter_id
join public.data_api_provider_models_v2 provider_model on provider_model.provider_model_id = sku.provider_model_id
where sku.is_active;

create or replace view public.data_api_pricing_history_v2 as
select
  sku.sku_key,
  sku.label,
  sku.meter_id,
  rate.rate_id,
  rate.rate_type,
  rate.promotion_name,
  rate.price_per_unit,
  rate.priority,
  rate.effective_from,
  rate.effective_to,
  rate.match,
  rate.note
from public.data_api_pricing_skus_v2 sku
join public.data_api_pricing_rates_v2 rate on rate.sku_id = sku.sku_id;

create or replace function public.get_monitor_model_rows_v2(
  p_include_hidden boolean default false
)
returns table (
  model_id text,
  model_name text,
  model_release_date timestamptz,
  model_retirement_date timestamptz,
  model_status text,
  model_input_types text[],
  model_output_types text[],
  organisation_id text,
  organisation_name text,
  hidden boolean,
  provider_api_model_id text,
  provider_id text,
  api_model_id text,
  provider_model_slug text,
  is_active_gateway boolean,
  input_modalities text[],
  output_modalities text[],
  quantization_scheme text,
  context_length integer,
  provider_max_output_tokens integer,
  effective_from timestamptz,
  effective_to timestamptz,
  capability_id text,
  capability_params jsonb,
  capability_status text,
  capability_max_input_tokens integer,
  capability_max_output_tokens integer,
  api_provider_name text,
  provider_link text,
  input_price numeric,
  output_price numeric,
  standard_input_price numeric,
  standard_output_price numeric,
  standard_input_price_label text,
  standard_input_price_unit text,
  standard_output_price_label text,
  standard_output_price_unit text,
  from_price numeric,
  from_price_unit text,
  pricing_tier text,
  is_free_variant boolean,
  weekly_tokens_model bigint,
  weekly_tokens_model_provider bigint,
  weekly_throughput_model numeric,
  weekly_latency_model numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_rates as (
    select
      sku.provider_model_id,
      sku.capability_id,
      sku.meter_id,
      sku.label,
      sku.display_unit_label,
      sku.display_tier,
      sku.pricing_plan,
      sku.billing_unit_size,
      rate.price_per_unit,
      rate.priority,
      row_number() over (
        partition by sku.sku_id
        order by rate.priority desc, rate.effective_from desc, rate.rate_id
      ) as rate_rank
    from public.data_api_pricing_skus_v2 sku
    join public.data_api_pricing_rates_v2 rate on rate.sku_id = sku.sku_id
    where sku.is_active
      and rate.effective_from <= now()
      and (rate.effective_to is null or now() < rate.effective_to)
  ),
  selected_rates as (
    select
      current_rate.*,
      case
        when current_rate.meter_id like '%token%'
          then current_rate.price_per_unit * (1000000 / nullif(current_rate.billing_unit_size, 0))
        else current_rate.price_per_unit / nullif(current_rate.billing_unit_size, 0)
      end as display_price
    from current_rates current_rate
    where current_rate.rate_rank = 1
  ),
  pricing_summary as (
    select
      selected_rate.provider_model_id,
      selected_rate.capability_id,
      min(selected_rate.display_price) filter (
        where selected_rate.pricing_plan = 'standard'
          and selected_rate.meter_id in ('input_tokens', 'input_text_tokens')
      ) as input_price,
      min(selected_rate.display_price) filter (
        where selected_rate.pricing_plan = 'standard'
          and selected_rate.meter_id in ('output_tokens', 'output_text_tokens')
      ) as output_price,
      min(selected_rate.display_price) filter (
        where selected_rate.display_tier = 'primary'
          and selected_rate.meter_id like 'input_%'
      ) as standard_input_price,
      min(selected_rate.display_price) filter (
        where selected_rate.display_tier = 'primary'
          and selected_rate.meter_id like 'output_%'
      ) as standard_output_price,
      min(selected_rate.label) filter (
        where selected_rate.display_tier = 'primary'
          and selected_rate.meter_id like 'input_%'
      ) as standard_input_price_label,
      min(selected_rate.display_unit_label) filter (
        where selected_rate.display_tier = 'primary'
          and selected_rate.meter_id like 'input_%'
      ) as standard_input_price_unit,
      min(selected_rate.label) filter (
        where selected_rate.display_tier = 'primary'
          and selected_rate.meter_id like 'output_%'
      ) as standard_output_price_label,
      min(selected_rate.display_unit_label) filter (
        where selected_rate.display_tier = 'primary'
          and selected_rate.meter_id like 'output_%'
      ) as standard_output_price_unit,
      case when count(distinct selected_rate.display_unit_label) = 1
        then min(selected_rate.display_price) else null end as from_price,
      case when count(distinct selected_rate.display_unit_label) = 1
        then min(selected_rate.display_unit_label) else null end as from_price_unit,
      case when bool_or(provider_model.is_free) then 'free' else 'standard' end as pricing_tier
    from selected_rates selected_rate
    join public.data_api_provider_models_v2 provider_model
      on provider_model.provider_model_id = selected_rate.provider_model_id
    group by selected_rate.provider_model_id, selected_rate.capability_id
  )
  select
    model.model_id,
    model.full_name,
    model.release_date,
    model.retirement_date,
    model.status,
    model.input_modalities,
    model.output_modalities,
    model.organisation_id,
    organisation.name,
    model.hidden,
    provider_model.provider_model_id,
    provider_model.provider_id,
    provider_model.provider_model_api_id,
    provider_model.provider_model_slug,
    provider_model.availability_status = 'active'
      and provider_model.routing_status <> 'disabled'
      and capability.status not in ('inactive', 'disabled', 'coming_soon', 'internal_testing'),
    provider_model.input_modalities,
    provider_model.output_modalities,
    provider_model.quantization,
    provider_model.context_length,
    provider_model.max_output_tokens,
    provider_model.effective_from,
    provider_model.effective_to,
    capability.capability_id,
    capability.parameter_schema,
    capability.status,
    capability.max_input_tokens,
    capability.max_output_tokens,
    provider.display_name,
    provider.homepage_url,
    pricing.input_price,
    pricing.output_price,
    pricing.standard_input_price,
    pricing.standard_output_price,
    pricing.standard_input_price_label,
    pricing.standard_input_price_unit,
    pricing.standard_output_price_label,
    pricing.standard_output_price_unit,
    pricing.from_price,
    pricing.from_price_unit,
    coalesce(pricing.pricing_tier, case when provider_model.is_free then 'free' else 'standard' end),
    provider_model.is_free,
    null::bigint,
    null::bigint,
    null::numeric,
    null::numeric
  from public.data_api_provider_models_v2 provider_model
  join public.data_models_v2 model on model.model_id = provider_model.model_id
  join public.data_api_provider_model_capabilities_v2 capability
    on capability.provider_model_id = provider_model.provider_model_id
  join public.data_api_providers_v2 provider on provider.provider_id = provider_model.provider_id
  left join public.data_organisations organisation on organisation.organisation_id = model.organisation_id
  left join pricing_summary pricing
    on pricing.provider_model_id = provider_model.provider_model_id
   and pricing.capability_id = capability.capability_id
  where p_include_hidden or not model.hidden
  order by provider_model.provider_model_id, capability.capability_id;
$$;
revoke all on function public.get_monitor_model_rows_v2(boolean) from public;
grant execute on function public.get_monitor_model_rows_v2(boolean) to service_role;

create or replace view public.data_api_catalogue_migration_issues_v2 as
select
  'provider_model_missing_canonical_model'::text as issue_type,
  provider_model.provider_api_model_id as record_id,
  jsonb_build_object(
    'provider_id', provider_model.provider_id,
    'api_model_id', provider_model.api_model_id,
    'model_id', provider_model.model_id
  ) as details
from public.data_api_provider_models provider_model
left join public.data_api_provider_models_v2 provider_model_v2
  on provider_model_v2.provider_model_id = provider_model.provider_api_model_id
where provider_model_v2.provider_model_id is null

union all

select
  'pricing_rule_not_backfilled'::text,
  rule.rule_id::text,
  jsonb_build_object(
    'model_key', rule.model_key,
    'capability_id', rule.capability_id,
    'meter', rule.meter,
    'unit_size', rule.unit_size,
    'price_per_unit', rule.price_per_unit
  )
from public.data_api_pricing_rules rule
left join public.data_api_pricing_skus_v2 sku on sku.sku_id = rule.rule_id
where sku.sku_id is null

union all

select
  'billing_unit_has_multiple_legacy_units'::text,
  rule.meter,
  jsonb_build_object('units', jsonb_agg(distinct rule.unit order by rule.unit))
from public.data_api_pricing_rules rule
group by rule.meter
having count(distinct rule.unit) > 1;

alter table public.data_api_quickstart_example_types_v2 enable row level security;
alter table public.data_models_v2 enable row level security;
alter table public.data_api_providers_v2 enable row level security;
alter table public.data_api_provider_owners_v2 enable row level security;
alter table public.data_api_provider_regions_v2 enable row level security;
alter table public.data_api_provider_models_v2 enable row level security;
alter table public.data_api_provider_model_capabilities_v2 enable row level security;
alter table public.data_api_billing_units_v2 enable row level security;
alter table public.data_api_pricing_skus_v2 enable row level security;
alter table public.data_api_pricing_rates_v2 enable row level security;
alter table public.data_api_provider_meter_mappings_v2 enable row level security;

drop policy if exists "Public reads quickstart example types V2" on public.data_api_quickstart_example_types_v2;
create policy "Public reads quickstart example types V2" on public.data_api_quickstart_example_types_v2
  for select to anon, authenticated using (true);
drop policy if exists "Public reads model catalogue V2" on public.data_models_v2;
create policy "Public reads model catalogue V2" on public.data_models_v2
  for select to anon, authenticated using (not hidden);
drop policy if exists "Public reads providers V2" on public.data_api_providers_v2;
create policy "Public reads providers V2" on public.data_api_providers_v2
  for select to anon, authenticated using (true);
drop policy if exists "Provider owners read own assignments V2" on public.data_api_provider_owners_v2;
create policy "Provider owners read own assignments V2" on public.data_api_provider_owners_v2
  for select to authenticated using ((select public.can_manage_api_provider_v2(provider_id)));
drop policy if exists "Public reads provider regions V2" on public.data_api_provider_regions_v2;
create policy "Public reads provider regions V2" on public.data_api_provider_regions_v2
  for select to anon, authenticated using (true);
drop policy if exists "Public reads provider models V2" on public.data_api_provider_models_v2;
create policy "Public reads provider models V2" on public.data_api_provider_models_v2
  for select to anon, authenticated using (availability_status <> 'inactive');
drop policy if exists "Public reads capabilities V2" on public.data_api_provider_model_capabilities_v2;
create policy "Public reads capabilities V2" on public.data_api_provider_model_capabilities_v2
  for select to anon, authenticated using (status <> 'internal_testing');
drop policy if exists "Public reads billing units V2" on public.data_api_billing_units_v2;
create policy "Public reads billing units V2" on public.data_api_billing_units_v2
  for select to anon, authenticated using (true);
drop policy if exists "Public reads pricing SKUs V2" on public.data_api_pricing_skus_v2;
create policy "Public reads pricing SKUs V2" on public.data_api_pricing_skus_v2
  for select to anon, authenticated using (is_active);
drop policy if exists "Public reads pricing rates V2" on public.data_api_pricing_rates_v2;
create policy "Public reads pricing rates V2" on public.data_api_pricing_rates_v2
  for select to anon, authenticated using (true);
drop policy if exists "Authenticated reads meter mappings V2" on public.data_api_provider_meter_mappings_v2;
create policy "Authenticated reads meter mappings V2" on public.data_api_provider_meter_mappings_v2
  for select to authenticated using (true);

grant select on public.data_api_quickstart_example_types_v2 to anon, authenticated;
grant select on public.data_models_v2 to anon, authenticated;
grant select on public.data_api_providers_v2 to anon, authenticated;
grant select on public.data_api_provider_owners_v2 to authenticated;
grant select on public.data_api_provider_regions_v2 to anon, authenticated;
grant select on public.data_api_provider_models_v2 to anon, authenticated;
grant select on public.data_api_provider_model_capabilities_v2 to anon, authenticated;
grant select on public.data_api_billing_units_v2 to anon, authenticated;
grant select on public.data_api_pricing_skus_v2 to anon, authenticated;
grant select on public.data_api_pricing_rates_v2 to anon, authenticated;
grant select on public.data_api_pricing_rules_v2_compat to anon, authenticated;
grant select on public.data_api_pricing_history_v2 to anon, authenticated;
grant select on public.data_api_provider_meter_mappings_v2 to authenticated;
revoke all on public.data_api_catalogue_migration_issues_v2 from anon, authenticated;
grant select on public.data_api_catalogue_migration_issues_v2 to service_role;

grant all on public.data_api_quickstart_example_types_v2 to service_role;
grant all on public.data_models_v2 to service_role;
grant all on public.data_api_providers_v2 to service_role;
grant all on public.data_api_provider_owners_v2 to service_role;
grant all on public.data_api_provider_regions_v2 to service_role;
grant all on public.data_api_provider_models_v2 to service_role;
grant all on public.data_api_provider_model_capabilities_v2 to service_role;
grant all on public.data_api_billing_units_v2 to service_role;
grant all on public.data_api_pricing_skus_v2 to service_role;
grant all on public.data_api_pricing_rates_v2 to service_role;
grant all on public.data_api_provider_meter_mappings_v2 to service_role;

comment on table public.data_api_pricing_rates_v2 is
  'Effective-dated standard, promotional, contract, and override rates. Highest matching active priority wins.';
comment on view public.data_api_pricing_history_v2 is
  'Complete pricing history including promotion identity, priority, and effective windows.';
comment on view public.data_api_pricing_rules_v2_compat is
  'Compatibility projection matching the current gateway PriceRule loader contract.';
