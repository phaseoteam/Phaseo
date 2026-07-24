-- v2 usage and performance rollups
--
-- Daily tables are the durable baseline. Public hourly rows support recent
-- performance pages; retention and refresh cadence are operational concerns.
-- Percentages are intentionally not stored: calculate rates from counters.

create table if not exists public.v2_private_usage_daily (
  rollup_id uuid primary key default gen_random_uuid(),
  usage_date date not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_id uuid references public.api_apps(id) on delete set null,
  model_slug text not null references public.v2_models(model_slug) on delete restrict,
  provider_model_id text references public.v2_model_provider_routes(provider_model_id) on delete set null,
  requests bigint not null default 0,
  successful_requests bigint not null default 0,
  failed_requests bigint not null default 0,
  rate_limited_requests bigint not null default 0,
  tool_call_count bigint not null default 0,
  structured_output_attempts bigint not null default 0,
  structured_output_successes bigint not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_count bigint not null default 0,
  generation_sum_ms bigint not null default 0,
  generation_count bigint not null default 0,
  throughput_sum numeric(30, 12) not null default 0,
  throughput_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_private_usage_daily_counts_check check (
    requests >= 0 and successful_requests >= 0 and failed_requests >= 0 and
    rate_limited_requests >= 0 and tool_call_count >= 0 and
    structured_output_attempts >= 0 and structured_output_successes >= 0 and
    latency_sum_ms >= 0 and latency_count >= 0 and generation_sum_ms >= 0 and
    generation_count >= 0 and throughput_sum >= 0 and throughput_count >= 0
  )
);

create unique index if not exists v2_private_usage_daily_key
  on public.v2_private_usage_daily (
    workspace_id,
    usage_date,
    coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid),
    model_slug,
    coalesce(provider_model_id, '')
  );
create index if not exists v2_private_usage_daily_workspace_date_idx
  on public.v2_private_usage_daily (workspace_id, usage_date desc);
create index if not exists v2_private_usage_daily_model_date_idx
  on public.v2_private_usage_daily (model_slug, usage_date desc);
create index if not exists v2_private_usage_daily_app_date_idx
  on public.v2_private_usage_daily (app_id, usage_date desc)
  where app_id is not null;

create table if not exists public.v2_private_usage_daily_meters (
  rollup_id uuid not null references public.v2_private_usage_daily(rollup_id) on delete cascade,
  meter_key text not null,
  modality text not null,
  unit text not null,
  quantity numeric(30, 12) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (rollup_id, meter_key, modality, unit),
  constraint v2_private_usage_daily_meters_quantity_check check (quantity >= 0)
);

create index if not exists v2_private_usage_daily_meters_lookup_idx
  on public.v2_private_usage_daily_meters (meter_key, modality, unit, rollup_id);

create table if not exists public.v2_public_usage_daily (
  rollup_id uuid primary key default gen_random_uuid(),
  usage_date date not null,
  app_id uuid references public.api_apps(id) on delete set null,
  model_slug text not null references public.v2_models(model_slug) on delete restrict,
  provider_model_id text references public.v2_model_provider_routes(provider_model_id) on delete set null,
  requests bigint not null default 0,
  successful_requests bigint not null default 0,
  failed_requests bigint not null default 0,
  rate_limited_requests bigint not null default 0,
  tool_call_count bigint not null default 0,
  structured_output_attempts bigint not null default 0,
  structured_output_successes bigint not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_count bigint not null default 0,
  generation_sum_ms bigint not null default 0,
  generation_count bigint not null default 0,
  throughput_sum numeric(30, 12) not null default 0,
  throughput_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_public_usage_daily_counts_check check (
    requests >= 0 and successful_requests >= 0 and failed_requests >= 0 and
    rate_limited_requests >= 0 and tool_call_count >= 0 and
    structured_output_attempts >= 0 and structured_output_successes >= 0 and
    latency_sum_ms >= 0 and latency_count >= 0 and generation_sum_ms >= 0 and
    generation_count >= 0 and throughput_sum >= 0 and throughput_count >= 0
  )
);

create unique index if not exists v2_public_usage_daily_key
  on public.v2_public_usage_daily (
    usage_date,
    coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid),
    model_slug,
    coalesce(provider_model_id, '')
  );
create index if not exists v2_public_usage_daily_model_date_idx
  on public.v2_public_usage_daily (model_slug, usage_date desc);
create index if not exists v2_public_usage_daily_provider_date_idx
  on public.v2_public_usage_daily (provider_model_id, usage_date desc)
  where provider_model_id is not null;
create index if not exists v2_public_usage_daily_app_date_idx
  on public.v2_public_usage_daily (app_id, usage_date desc)
  where app_id is not null;

create table if not exists public.v2_public_usage_daily_meters (
  rollup_id uuid not null references public.v2_public_usage_daily(rollup_id) on delete cascade,
  meter_key text not null,
  modality text not null,
  unit text not null,
  quantity numeric(30, 12) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (rollup_id, meter_key, modality, unit),
  constraint v2_public_usage_daily_meters_quantity_check check (quantity >= 0)
);

create index if not exists v2_public_usage_daily_meters_lookup_idx
  on public.v2_public_usage_daily_meters (meter_key, modality, unit, rollup_id);

create table if not exists public.v2_public_usage_hourly (
  rollup_id uuid primary key default gen_random_uuid(),
  bucket_start timestamptz not null,
  app_id uuid references public.api_apps(id) on delete set null,
  model_slug text not null references public.v2_models(model_slug) on delete restrict,
  provider_model_id text references public.v2_model_provider_routes(provider_model_id) on delete set null,
  requests bigint not null default 0,
  successful_requests bigint not null default 0,
  failed_requests bigint not null default 0,
  rate_limited_requests bigint not null default 0,
  tool_call_count bigint not null default 0,
  structured_output_attempts bigint not null default 0,
  structured_output_successes bigint not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_count bigint not null default 0,
  generation_sum_ms bigint not null default 0,
  generation_count bigint not null default 0,
  throughput_sum numeric(30, 12) not null default 0,
  throughput_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_public_usage_hourly_counts_check check (
    requests >= 0 and successful_requests >= 0 and failed_requests >= 0 and
    rate_limited_requests >= 0 and tool_call_count >= 0 and
    structured_output_attempts >= 0 and structured_output_successes >= 0 and
    latency_sum_ms >= 0 and latency_count >= 0 and generation_sum_ms >= 0 and
    generation_count >= 0 and throughput_sum >= 0 and throughput_count >= 0
  )
);

create unique index if not exists v2_public_usage_hourly_key
  on public.v2_public_usage_hourly (
    bucket_start,
    coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid),
    model_slug,
    coalesce(provider_model_id, '')
  );
create index if not exists v2_public_usage_hourly_model_bucket_idx
  on public.v2_public_usage_hourly (model_slug, bucket_start desc);
create index if not exists v2_public_usage_hourly_provider_bucket_idx
  on public.v2_public_usage_hourly (provider_model_id, bucket_start desc)
  where provider_model_id is not null;

create table if not exists public.v2_public_usage_hourly_meters (
  rollup_id uuid not null references public.v2_public_usage_hourly(rollup_id) on delete cascade,
  meter_key text not null,
  modality text not null,
  unit text not null,
  quantity numeric(30, 12) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (rollup_id, meter_key, modality, unit),
  constraint v2_public_usage_hourly_meters_quantity_check check (quantity >= 0)
);

create index if not exists v2_public_usage_hourly_meters_lookup_idx
  on public.v2_public_usage_hourly_meters (meter_key, modality, unit, rollup_id);

create table if not exists public.v2_rollup_refresh_state (
  rollup_name text not null,
  bucket_start timestamptz not null,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  source_watermark timestamptz,
  status text not null default 'pending',
  error_message text,
  updated_at timestamptz not null default now(),
  primary key (rollup_name, bucket_start),
  constraint v2_rollup_refresh_state_status_check check (status in ('pending', 'running', 'complete', 'failed'))
);

create index if not exists v2_rollup_refresh_state_status_idx
  on public.v2_rollup_refresh_state (status, bucket_start);

alter table public.v2_private_usage_daily enable row level security;
alter table public.v2_private_usage_daily_meters enable row level security;
alter table public.v2_public_usage_daily enable row level security;
alter table public.v2_public_usage_daily_meters enable row level security;
alter table public.v2_public_usage_hourly enable row level security;
alter table public.v2_public_usage_hourly_meters enable row level security;
alter table public.v2_rollup_refresh_state enable row level security;

drop policy if exists v2_private_usage_daily_workspace_select on public.v2_private_usage_daily;
create policy v2_private_usage_daily_workspace_select on public.v2_private_usage_daily
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists v2_private_usage_daily_meters_workspace_select on public.v2_private_usage_daily_meters;
create policy v2_private_usage_daily_meters_workspace_select on public.v2_private_usage_daily_meters
  for select to authenticated
  using (exists (
    select 1
    from public.v2_private_usage_daily rollup
    where rollup.rollup_id = v2_private_usage_daily_meters.rollup_id
      and (select public.is_workspace_member(rollup.workspace_id))
  ));

drop policy if exists v2_public_usage_daily_public_select on public.v2_public_usage_daily;
create policy v2_public_usage_daily_public_select on public.v2_public_usage_daily
  for select to anon, authenticated
  using (true);

drop policy if exists v2_public_usage_daily_meters_public_select on public.v2_public_usage_daily_meters;
create policy v2_public_usage_daily_meters_public_select on public.v2_public_usage_daily_meters
  for select to anon, authenticated
  using (true);

drop policy if exists v2_public_usage_hourly_public_select on public.v2_public_usage_hourly;
create policy v2_public_usage_hourly_public_select on public.v2_public_usage_hourly
  for select to anon, authenticated
  using (true);

drop policy if exists v2_public_usage_hourly_meters_public_select on public.v2_public_usage_hourly_meters;
create policy v2_public_usage_hourly_meters_public_select on public.v2_public_usage_hourly_meters
  for select to anon, authenticated
  using (true);

grant select on public.v2_private_usage_daily, public.v2_private_usage_daily_meters to authenticated;
grant select on public.v2_public_usage_daily, public.v2_public_usage_daily_meters, public.v2_public_usage_hourly, public.v2_public_usage_hourly_meters to anon, authenticated;
grant insert, update on public.v2_private_usage_daily, public.v2_private_usage_daily_meters, public.v2_public_usage_daily, public.v2_public_usage_daily_meters, public.v2_public_usage_hourly, public.v2_public_usage_hourly_meters to service_role;
grant insert, update on public.v2_rollup_refresh_state to service_role;

comment on table public.v2_private_usage_daily is 'Workspace-scoped daily usage/performance projection for settings and trends.';
comment on table public.v2_public_usage_daily is 'Public daily model/provider/app projection used by rankings and catalogue pages.';
comment on table public.v2_public_usage_hourly is 'Recent public hourly projection for performance pages; daily remains the durable baseline.';
comment on column public.v2_public_usage_daily_meters.meter_key is 'Includes modality-specific meters such as tokens, images, characters, requests, and media seconds.';
comment on table public.v2_public_usage_daily is 'Cache hit rate is derived as cached_input_tokens / input_tokens, never stored as a precomputed percentage.';
comment on table public.v2_rollup_refresh_state is 'Incremental refresh watermark and retry state; refresh jobs should reprocess recent buckets for late request updates.';
