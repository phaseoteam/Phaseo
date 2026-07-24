-- v2 catalogue foundation
--
-- This is an additive namespace. Existing data_* catalogue tables remain the
-- compatibility source until the backfill and consumer cutover are complete.
-- The v2 model slug is the only canonical model identity in this namespace.

create table if not exists public.v2_labs (
  lab_slug text primary key,
  name text not null,
  country_code text not null default 'xx',
  description text,
  status text not null default 'active',
  routable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_labs_slug_check check (lab_slug = lower(lab_slug) and lab_slug ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint v2_labs_status_check check (status in ('active', 'deprecated', 'disabled'))
);

create unique index if not exists v2_labs_name_key on public.v2_labs (lower(name));
create index if not exists v2_labs_status_idx on public.v2_labs (status) where status <> 'disabled';

create table if not exists public.v2_models (
  model_slug text primary key,
  lab_slug text not null references public.v2_labs(lab_slug) on delete restrict,
  name text not null,
  description text,
  status text not null default 'active',
  hidden boolean not null default false,
  input_modalities text[] not null default '{}'::text[],
  output_modalities text[] not null default '{}'::text[],
  family_slug text,
  announced_at timestamptz,
  released_at timestamptz,
  deprecated_at timestamptz,
  retired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_models_slug_check check (model_slug = lower(model_slug) and model_slug ~ '^[a-z0-9][a-z0-9._:/+@-]*$'),
  constraint v2_models_status_check check (status in ('draft', 'active', 'deprecated', 'retired', 'disabled'))
);

create index if not exists v2_models_lab_idx on public.v2_models (lab_slug);
create index if not exists v2_models_status_idx on public.v2_models (status, hidden, model_slug);
create index if not exists v2_models_input_modalities_idx on public.v2_models using gin (input_modalities);
create index if not exists v2_models_output_modalities_idx on public.v2_models using gin (output_modalities);

create table if not exists public.v2_providers (
  provider_slug text primary key,
  lab_slug text references public.v2_labs(lab_slug) on delete set null,
  name text not null,
  status text not null default 'active',
  routing_enabled boolean not null default false,
  routable boolean not null default false,
  country_code text not null default 'xx',
  base_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_providers_slug_check check (provider_slug = lower(provider_slug) and provider_slug ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint v2_providers_status_check check (status in ('active', 'beta', 'alpha', 'not_ready', 'deprecated', 'disabled'))
);

create index if not exists v2_providers_lab_idx on public.v2_providers (lab_slug);
create index if not exists v2_providers_routing_idx on public.v2_providers (status, routing_enabled, routable)
  where status not in ('disabled', 'deprecated');

create table if not exists public.v2_model_aliases (
  alias_slug text primary key,
  model_slug text not null references public.v2_models(model_slug) on delete cascade,
  alias_type text not null default 'public',
  enabled boolean not null default true,
  effective_from timestamptz,
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_model_aliases_slug_check check (alias_slug = lower(alias_slug) and alias_slug ~ '^[a-z0-9][a-z0-9._:/+@-]*$'),
  constraint v2_model_aliases_window_check check (effective_to is null or effective_from is null or effective_to > effective_from)
);

create index if not exists v2_model_aliases_model_idx on public.v2_model_aliases (model_slug) where enabled;
create index if not exists v2_model_aliases_active_idx on public.v2_model_aliases (alias_slug, effective_from, effective_to) where enabled;

create table if not exists public.v2_model_provider_routes (
  provider_model_id text primary key,
  model_slug text not null references public.v2_models(model_slug) on delete cascade,
  provider_slug text not null references public.v2_providers(provider_slug) on delete restrict,
  provider_model_slug text not null,
  status text not null default 'active',
  routing_enabled boolean not null default false,
  input_modalities text[] not null default '{}'::text[],
  output_modalities text[] not null default '{}'::text[],
  regions text[] not null default '{}'::text[],
  context_length integer,
  max_output_tokens integer,
  effective_from timestamptz,
  effective_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_model_provider_routes_status_check check (status in ('active', 'degraded', 'disabled', 'retired')),
  constraint v2_model_provider_routes_window_check check (effective_to is null or effective_from is null or effective_to > effective_from),
  constraint v2_model_provider_routes_context_check check (context_length is null or context_length > 0),
  constraint v2_model_provider_routes_output_check check (max_output_tokens is null or max_output_tokens > 0)
);

create index if not exists v2_model_provider_routes_model_idx
  on public.v2_model_provider_routes (model_slug, status, routing_enabled);
create index if not exists v2_model_provider_routes_provider_idx
  on public.v2_model_provider_routes (provider_slug, status, routing_enabled);
create index if not exists v2_model_provider_routes_active_idx
  on public.v2_model_provider_routes (model_slug, provider_slug)
  where status in ('active', 'degraded') and routing_enabled = true;

alter table public.v2_labs enable row level security;
alter table public.v2_models enable row level security;
alter table public.v2_providers enable row level security;
alter table public.v2_model_aliases enable row level security;
alter table public.v2_model_provider_routes enable row level security;

drop policy if exists v2_labs_public_select on public.v2_labs;
create policy v2_labs_public_select on public.v2_labs
  for select to anon, authenticated
  using (status <> 'disabled');

drop policy if exists v2_models_public_select on public.v2_models;
create policy v2_models_public_select on public.v2_models
  for select to anon, authenticated
  using (hidden = false and status <> 'disabled');

drop policy if exists v2_providers_public_select on public.v2_providers;
create policy v2_providers_public_select on public.v2_providers
  for select to anon, authenticated
  using (status <> 'disabled');

drop policy if exists v2_model_aliases_public_select on public.v2_model_aliases;
create policy v2_model_aliases_public_select on public.v2_model_aliases
  for select to anon, authenticated
  using (enabled = true and (effective_from is null or effective_from <= now()) and (effective_to is null or effective_to > now()));

drop policy if exists v2_model_provider_routes_public_select on public.v2_model_provider_routes;
create policy v2_model_provider_routes_public_select on public.v2_model_provider_routes
  for select to anon, authenticated
  using (status <> 'disabled' and (effective_from is null or effective_from <= now()) and (effective_to is null or effective_to > now()));

grant select on public.v2_labs, public.v2_models, public.v2_providers, public.v2_model_aliases, public.v2_model_provider_routes to anon, authenticated;

comment on table public.v2_models is 'Canonical model catalogue. model_slug is the sole v2 model identity used by public URLs and routing resolution.';
comment on table public.v2_model_provider_routes is 'Provider/model combination anchor. Pricing, capabilities, health, and request facts reference provider_model_id.';
comment on column public.v2_providers.routing_enabled is 'Global provider routing switch; effective routing also requires the route-level switch.';
comment on column public.v2_model_provider_routes.routing_enabled is 'Per provider/model routing switch, evaluated together with provider and model status.';
