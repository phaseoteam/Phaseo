create table if not exists public.data_api_pricing_skus (
  model_key text not null,
  capability_id text not null,
  sku_id text not null,
  label text not null,
  kind text not null,
  display_order integer not null default 100,
  unit_label text not null,
  display_multiplier numeric null,
  description text null,
  is_billable boolean not null default true,
  derived_from_sku_id text null,
  derived_quantity numeric null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (model_key, sku_id)
);

alter table if exists public.data_api_pricing_rules
  add column if not exists sku_id text,
  add column if not exists tier_id text,
  add column if not exists tier_label text,
  add column if not exists tier_order integer;

update public.data_api_pricing_rules
set
  sku_id = coalesce(
    nullif(btrim(sku_id), ''),
    trim(both '-' from regexp_replace(lower(meter), '[^a-z0-9]+', '-', 'g')),
    'usage'
  ),
  tier_id = coalesce(nullif(btrim(tier_id), ''), 'default'),
  tier_label = coalesce(nullif(btrim(tier_label), ''), 'Standard'),
  tier_order = coalesce(tier_order, 1)
where
  sku_id is null or btrim(sku_id) = '' or
  tier_id is null or btrim(tier_id) = '' or
  tier_label is null or btrim(tier_label) = '' or
  tier_order is null;

alter table if exists public.data_api_pricing_rules
  alter column sku_id set not null,
  alter column tier_id set not null,
  alter column tier_label set not null,
  alter column tier_order set not null;

insert into public.data_api_pricing_skus (
  model_key,
  capability_id,
  sku_id,
  label,
  kind,
  display_order,
  unit_label,
  display_multiplier,
  metadata
)
select distinct on (model_key, sku_id)
  model_key,
  capability_id,
  sku_id,
  initcap(replace(sku_id, '-', ' ')),
  unit,
  case
    when meter like 'input_%' then 10
    when meter like 'cached_read_%' then 20
    when meter like 'cached_write_%' then 30
    when meter like 'output_%' then 40
    else 100
  end,
  case when unit = 'token' then '/M tokens' else '/' || unit end,
  case when unit = 'token' then 1000000 else null end,
  jsonb_build_object(
    'calculator_input',
    jsonb_build_object('key', meter, 'label', initcap(replace(meter, '_', ' ')), 'type', 'number')
  )
from public.data_api_pricing_rules
on conflict (model_key, sku_id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'data_api_pricing_rules_sku_fk'
      and conrelid = 'public.data_api_pricing_rules'::regclass
  ) then
    alter table public.data_api_pricing_rules
      add constraint data_api_pricing_rules_sku_fk
      foreign key (model_key, sku_id)
      references public.data_api_pricing_skus (model_key, sku_id);
  end if;
end $$;
