-- Reset pricing-related tables to ensure schema matches expected shape.
-- Drops in dependency order, then recreates.

drop table if exists public.api_pricing_conditions;
drop table if exists public.api_pricing_rules;
drop table if exists public.api_provider_model_capabilities;
drop table if exists public.api_model_aliases;
drop table if exists public.api_provider_models;
-- =========================
-- api_provider_models
-- =========================
create table if not exists public.api_provider_models (
  provider_api_model_id text primary key,
  provider_id           text not null,
  api_model_id          text not null,
  provider_model_slug   text null,
  internal_model_id     text null,

  is_active_gateway     boolean not null default false,

  input_modalities      text[] null,
  output_modalities     text[] null,
  quantization_scheme   text null,

  effective_from        timestamptz null,
  effective_to          timestamptz null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists api_provider_models_lookup_idx
  on public.api_provider_models (api_model_id, provider_id);
create index if not exists api_provider_models_active_idx
  on public.api_provider_models (api_model_id)
  where is_active_gateway = true;
-- =========================
-- api_provider_model_capabilities
-- =========================
create table if not exists public.api_provider_model_capabilities (
  provider_api_model_id text not null references public.api_provider_models(provider_api_model_id) on delete cascade,
  capability_id         text not null,

  max_input_tokens      integer null,
  max_output_tokens     integer null,

  params               jsonb not null default '{}'::jsonb,

  effective_from        timestamptz null,
  effective_to          timestamptz null,

  notes                text null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  primary key (provider_api_model_id, capability_id)
);
create index if not exists api_provider_model_capabilities_cap_idx
  on public.api_provider_model_capabilities (capability_id);
create index if not exists api_provider_model_capabilities_effective_idx
  on public.api_provider_model_capabilities (provider_api_model_id, capability_id, effective_from, effective_to);
create index if not exists api_provider_model_capabilities_params_gin
  on public.api_provider_model_capabilities
  using gin (params);
-- =========================
-- api_model_aliases
-- =========================
create table if not exists public.api_model_aliases (
  alias_slug  text primary key,
  api_model_id text not null,
  channel     text null,
  is_enabled  boolean not null default true,
  notes       text null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists api_model_aliases_target_idx
  on public.api_model_aliases (api_model_id)
  where is_enabled = true;
-- =========================
-- api_pricing_rules
-- =========================
create table if not exists public.api_pricing_rules (
  rule_id        bigint generated always as identity primary key,
  key            text null,

  provider_id    text not null,
  api_model_id   text not null,
  capability_id  text not null,

  pricing_plan   text not null default 'standard',

  meter          text not null,
  unit           text not null default 'token',
  unit_size      numeric not null default 1,
  price_per_unit numeric not null,
  currency       text not null default 'USD',

  tiering_mode   text not null default 'flat',
  priority       integer not null default 100,

  effective_from timestamptz null,
  effective_to   timestamptz null,
  note           text null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists api_pricing_rules_lookup_idx
  on public.api_pricing_rules (provider_id, api_model_id, capability_id);
create index if not exists api_pricing_rules_lookup_meter_idx
  on public.api_pricing_rules (provider_id, api_model_id, capability_id, meter);
-- =========================
-- api_pricing_conditions
-- =========================
create table if not exists public.api_pricing_conditions (
  condition_id  bigint generated always as identity primary key,
  rule_id       bigint not null references public.api_pricing_rules(rule_id) on delete cascade,

  or_group      integer not null default 0,
  and_index     integer not null default 0,

  path          text not null,
  op            text not null,

  value_text    text null,
  value_number  numeric null,
  value_list    jsonb null,

  note          text null,
  created_at    timestamptz not null default now()
);
create index if not exists api_pricing_conditions_rule_idx
  on public.api_pricing_conditions (rule_id, or_group, and_index);
