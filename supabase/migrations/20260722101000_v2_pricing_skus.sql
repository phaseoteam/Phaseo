-- v2 SKU pricing
--
-- A SKU belongs to one provider/model route. Meters are rows rather than
-- columns so new modalities and billing units do not require schema changes.

create table if not exists public.v2_pricing_skus (
  sku_id uuid primary key default gen_random_uuid(),
  provider_model_id text not null references public.v2_model_provider_routes(provider_model_id) on delete cascade,
  sku_code text not null,
  version integer not null default 1,
  operation text not null default 'inference',
  status text not null default 'active',
  region text,
  display_name text not null,
  description text,
  currency text not null default 'USD',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_pricing_skus_version_check check (version > 0),
  constraint v2_pricing_skus_status_check check (status in ('draft', 'active', 'deprecated', 'disabled')),
  constraint v2_pricing_skus_window_check check (effective_to is null or effective_to > effective_from),
  constraint v2_pricing_skus_code_check check (sku_code = lower(sku_code) and sku_code ~ '^[a-z0-9][a-z0-9._:-]*$'),
  constraint v2_pricing_skus_key unique (provider_model_id, sku_code, version)
);

create index if not exists v2_pricing_skus_route_idx
  on public.v2_pricing_skus (provider_model_id, status, effective_from desc);
create index if not exists v2_pricing_skus_active_idx
  on public.v2_pricing_skus (provider_model_id, operation, region)
  where status = 'active';

create table if not exists public.v2_pricing_sku_meters (
  sku_meter_id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.v2_pricing_skus(sku_id) on delete cascade,
  meter_key text not null,
  modality text not null,
  direction text,
  unit text not null,
  unit_quantity numeric(30, 12) not null default 1,
  price_nanos numeric(30, 12) not null,
  display_label text not null,
  display_unit text not null,
  billable boolean not null default true,
  meter_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_pricing_sku_meters_key unique (sku_id, meter_key),
  constraint v2_pricing_sku_meters_key_check check (meter_key = lower(meter_key) and meter_key ~ '^[a-z0-9][a-z0-9._:-]*$'),
  constraint v2_pricing_sku_meters_unit_quantity_check check (unit_quantity > 0),
  constraint v2_pricing_sku_meters_price_check check (price_nanos >= 0),
  constraint v2_pricing_sku_meters_order_check check (meter_order >= 0)
);

create index if not exists v2_pricing_sku_meters_sku_idx
  on public.v2_pricing_sku_meters (sku_id, meter_order, meter_key);
create index if not exists v2_pricing_sku_meters_lookup_idx
  on public.v2_pricing_sku_meters (meter_key, modality, direction);

alter table public.v2_pricing_skus enable row level security;
alter table public.v2_pricing_sku_meters enable row level security;

drop policy if exists v2_pricing_skus_public_select on public.v2_pricing_skus;
create policy v2_pricing_skus_public_select on public.v2_pricing_skus
  for select to anon, authenticated
  using (status <> 'disabled' and (effective_from <= now()) and (effective_to is null or effective_to > now()));

drop policy if exists v2_pricing_sku_meters_public_select on public.v2_pricing_sku_meters;
create policy v2_pricing_sku_meters_public_select on public.v2_pricing_sku_meters
  for select to anon, authenticated
  using (exists (
    select 1
    from public.v2_pricing_skus sku
    where sku.sku_id = v2_pricing_sku_meters.sku_id
      and sku.status <> 'disabled'
      and sku.effective_from <= now()
      and (sku.effective_to is null or sku.effective_to > now())
  ));

grant select on public.v2_pricing_skus, public.v2_pricing_sku_meters to anon, authenticated;

comment on table public.v2_pricing_skus is 'Versioned billable SKU attached to exactly one v2 provider/model route.';
comment on table public.v2_pricing_sku_meters is 'Flexible pricing meter definition. price_nanos is charged per unit_quantity of the declared unit.';
comment on column public.v2_pricing_sku_meters.meter_key is 'Stable machine key used by request usage facts and rollups, for example input_tokens or video_seconds.';
