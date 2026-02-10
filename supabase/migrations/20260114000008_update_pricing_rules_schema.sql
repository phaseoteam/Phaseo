-- Recreate pricing rules table to match importer expectations with capability_id + match JSON.
drop table if exists public.data_api_pricing_conditions;
drop table if exists public.data_api_pricing_rules;
create table if not exists public.data_api_pricing_rules (
  rule_id        uuid primary key default gen_random_uuid(),
  model_key      text not null,               -- provider:model:capability_id
  capability_id  text not null,

  pricing_plan   text not null default 'standard',
  meter          text not null,
  unit           text not null default 'token',
  unit_size      numeric not null default 1,
  price_per_unit numeric not null,
  currency       text not null default 'USD',

  tiering_mode   text not null default 'flat',
  note           text null,
  match          jsonb not null default '[]'::jsonb,
  priority       integer not null default 100,

  effective_from timestamptz null,
  effective_to   timestamptz null,
  updated_at     timestamptz not null default now()
);
create index if not exists data_api_pricing_rules_model_key_idx
  on public.data_api_pricing_rules (model_key);
create index if not exists data_api_pricing_rules_model_key_meter_idx
  on public.data_api_pricing_rules (model_key, meter);
create index if not exists data_api_pricing_rules_capability_idx
  on public.data_api_pricing_rules (capability_id);
