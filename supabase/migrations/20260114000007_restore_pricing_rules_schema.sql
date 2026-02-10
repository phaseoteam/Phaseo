-- Restore pricing rules schema to match importer expectations (model_key + match JSON).

drop table if exists public.data_api_pricing_conditions;
drop table if exists public.data_api_pricing_rules;
create table if not exists public.data_api_pricing_rules (
  rule_id        bigint generated always as identity primary key,
  model_key      text not null,               -- provider:model:capability_id

  pricing_plan   text not null default 'standard',
  meter          text not null,
  unit           text not null default 'token',
  unit_size      numeric not null default 1,
  price_per_unit numeric not null,
  currency       text not null default 'USD',

  tiering_mode   text not null default 'flat',
  match          jsonb not null default '[]'::jsonb,
  priority       integer not null default 100,

  effective_from timestamptz null,
  effective_to   timestamptz null,
  note           text null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists data_api_pricing_rules_model_key_idx
  on public.data_api_pricing_rules (model_key);
create index if not exists data_api_pricing_rules_model_key_meter_idx
  on public.data_api_pricing_rules (model_key, meter);
