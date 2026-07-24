-- v2 request facts and observability metadata
--
-- These tables intentionally contain no prompt, completion, provider body, or
-- tool I/O payloads. Payloads belong in R2 and are referenced by metadata only.

create table if not exists public.v2_request_facts (
  request_event_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id text not null,
  occurred_at timestamptz not null default now(),
  app_id uuid references public.api_apps(id) on delete set null,
  key_id uuid references public.keys(id) on delete set null,
  endpoint text not null,
  requested_model_input text not null,
  requested_model_slug text references public.v2_models(model_slug) on delete set null,
  routed_model_slug text references public.v2_models(model_slug) on delete set null,
  provider_model_id text references public.v2_model_provider_routes(provider_model_id) on delete set null,
  status_code integer,
  success boolean not null default false,
  error_code text,
  stop_reason text,
  tool_call_count integer not null default 0,
  structured_output_attempted boolean not null default false,
  structured_output_succeeded boolean not null default false,
  stream boolean not null default false,
  byok boolean not null default false,
  latency_ms integer,
  time_to_first_token_ms integer,
  generation_ms integer,
  queue_ms integer,
  upstream_latency_ms integer,
  upstream_attempt_count smallint not null default 0,
  throughput numeric(30, 12),
  user_agent text,
  sdk_name text,
  sdk_version text,
  client_version text,
  region text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_request_facts_request_key unique (workspace_id, request_id),
  constraint v2_request_facts_request_id_check check (length(trim(request_id)) > 0),
  constraint v2_request_facts_model_input_check check (length(trim(requested_model_input)) > 0),
  constraint v2_request_facts_status_code_check check (status_code is null or status_code between 100 and 599),
  constraint v2_request_facts_tool_count_check check (tool_call_count >= 0),
  constraint v2_request_facts_attempt_count_check check (upstream_attempt_count >= 0),
  constraint v2_request_facts_timing_check check (
    (latency_ms is null or latency_ms >= 0) and
    (time_to_first_token_ms is null or time_to_first_token_ms >= 0) and
    (generation_ms is null or generation_ms >= 0) and
    (queue_ms is null or queue_ms >= 0) and
    (upstream_latency_ms is null or upstream_latency_ms >= 0)
  ),
  constraint v2_request_facts_throughput_check check (throughput is null or throughput >= 0)
);

create index if not exists v2_request_facts_workspace_time_idx
  on public.v2_request_facts (workspace_id, occurred_at desc, request_event_id desc);
create index if not exists v2_request_facts_model_time_idx
  on public.v2_request_facts (requested_model_slug, occurred_at desc);
create index if not exists v2_request_facts_routed_model_time_idx
  on public.v2_request_facts (routed_model_slug, occurred_at desc);
create index if not exists v2_request_facts_provider_route_time_idx
  on public.v2_request_facts (provider_model_id, occurred_at desc);
create index if not exists v2_request_facts_app_time_idx
  on public.v2_request_facts (app_id, occurred_at desc)
  where app_id is not null;

create table if not exists public.v2_request_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  request_event_id uuid not null references public.v2_request_facts(request_event_id) on delete cascade,
  attempt_number smallint not null,
  provider_model_id text references public.v2_model_provider_routes(provider_model_id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  status_code integer,
  success boolean not null default false,
  error_code text,
  failure_class text,
  upstream_response_id text,
  latency_ms integer,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_request_attempts_number_check check (attempt_number > 0),
  constraint v2_request_attempts_window_check check (completed_at is null or started_at is null or completed_at >= started_at),
  constraint v2_request_attempts_status_code_check check (status_code is null or status_code between 100 and 599),
  constraint v2_request_attempts_latency_check check (latency_ms is null or latency_ms >= 0),
  constraint v2_request_attempts_key unique (request_event_id, attempt_number)
);

create index if not exists v2_request_attempts_request_idx
  on public.v2_request_attempts (request_event_id, attempt_number);
create index if not exists v2_request_attempts_route_time_idx
  on public.v2_request_attempts (provider_model_id, started_at desc)
  where provider_model_id is not null;

create table if not exists public.v2_request_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  request_event_id uuid not null references public.v2_request_facts(request_event_id) on delete cascade,
  attempt_id uuid references public.v2_request_attempts(attempt_id) on delete cascade,
  artifact_kind text not null,
  r2_key text not null,
  sha256 text,
  byte_size bigint,
  content_type text,
  redacted boolean not null default true,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  constraint v2_request_artifacts_kind_check check (artifact_kind in (
    'request_body', 'response_body', 'upstream_request', 'upstream_response', 'tool_io'
  )),
  constraint v2_request_artifacts_key_check check (length(trim(r2_key)) > 0 and r2_key !~* '^https?://'),
  constraint v2_request_artifacts_size_check check (byte_size is null or byte_size >= 0),
  constraint v2_request_artifacts_sha_check check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$')
);

create index if not exists v2_request_artifacts_request_idx
  on public.v2_request_artifacts (request_event_id, artifact_kind);
create unique index if not exists v2_request_artifacts_request_kind_key
  on public.v2_request_artifacts (request_event_id, artifact_kind)
  where attempt_id is null;
create unique index if not exists v2_request_artifacts_attempt_kind_key
  on public.v2_request_artifacts (attempt_id, artifact_kind)
  where attempt_id is not null;
create index if not exists v2_request_artifacts_retention_idx
  on public.v2_request_artifacts (retention_until)
  where retention_until is not null;

create table if not exists public.v2_request_usage (
  usage_id uuid primary key default gen_random_uuid(),
  request_event_id uuid not null references public.v2_request_facts(request_event_id) on delete cascade,
  sku_meter_id uuid references public.v2_pricing_sku_meters(sku_meter_id) on delete set null,
  meter_key text not null,
  modality text not null,
  unit text not null,
  quantity numeric(30, 12) not null,
  source text not null default 'provider',
  billable boolean not null default true,
  sequence integer not null default 0,
  created_at timestamptz not null default now(),
  constraint v2_request_usage_quantity_check check (quantity >= 0),
  constraint v2_request_usage_sequence_check check (sequence >= 0),
  constraint v2_request_usage_key unique (request_event_id, meter_key, sequence)
);

create index if not exists v2_request_usage_request_idx
  on public.v2_request_usage (request_event_id, meter_key);
create index if not exists v2_request_usage_meter_time_idx
  on public.v2_request_usage (meter_key, created_at desc);
create index if not exists v2_request_usage_modality_time_idx
  on public.v2_request_usage (modality, created_at desc);

create table if not exists public.v2_request_pricing_lines (
  pricing_line_id uuid primary key default gen_random_uuid(),
  request_event_id uuid not null references public.v2_request_facts(request_event_id) on delete cascade,
  sku_id uuid references public.v2_pricing_skus(sku_id) on delete set null,
  sku_meter_id uuid references public.v2_pricing_sku_meters(sku_meter_id) on delete set null,
  meter_key text not null,
  quantity numeric(30, 12) not null,
  unit text not null,
  unit_price_nanos numeric(30, 12) not null,
  charged_nanos bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint v2_request_pricing_lines_quantity_check check (quantity >= 0),
  constraint v2_request_pricing_lines_unit_price_check check (unit_price_nanos >= 0),
  constraint v2_request_pricing_lines_charge_check check (charged_nanos >= 0)
);

create index if not exists v2_request_pricing_lines_request_idx
  on public.v2_request_pricing_lines (request_event_id, meter_key);
create index if not exists v2_request_pricing_lines_sku_time_idx
  on public.v2_request_pricing_lines (sku_id, created_at desc)
  where sku_id is not null;

create table if not exists public.v2_request_feedback (
  feedback_id uuid primary key default gen_random_uuid(),
  request_event_id uuid not null references public.v2_request_facts(request_event_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  feedback_type text not null,
  value text not null,
  score numeric(10, 4),
  source text not null default 'user',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_request_feedback_score_check check (score is null or score between -1 and 1)
);

create index if not exists v2_request_feedback_request_idx
  on public.v2_request_feedback (request_event_id, created_at desc);
create index if not exists v2_request_feedback_workspace_time_idx
  on public.v2_request_feedback (workspace_id, created_at desc);

alter table public.v2_request_facts enable row level security;
alter table public.v2_request_attempts enable row level security;
alter table public.v2_request_artifacts enable row level security;
alter table public.v2_request_usage enable row level security;
alter table public.v2_request_pricing_lines enable row level security;
alter table public.v2_request_feedback enable row level security;

drop policy if exists v2_request_facts_workspace_select on public.v2_request_facts;
create policy v2_request_facts_workspace_select on public.v2_request_facts
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

drop policy if exists v2_request_attempts_workspace_select on public.v2_request_attempts;
create policy v2_request_attempts_workspace_select on public.v2_request_attempts
  for select to authenticated
  using (exists (
    select 1 from public.v2_request_facts request
    where request.request_event_id = v2_request_attempts.request_event_id
      and (select public.is_workspace_member(request.workspace_id))
  ));

drop policy if exists v2_request_artifacts_workspace_select on public.v2_request_artifacts;
create policy v2_request_artifacts_workspace_select on public.v2_request_artifacts
  for select to authenticated
  using (exists (
    select 1 from public.v2_request_facts request
    where request.request_event_id = v2_request_artifacts.request_event_id
      and (select public.is_workspace_member(request.workspace_id))
  ));

drop policy if exists v2_request_usage_workspace_select on public.v2_request_usage;
create policy v2_request_usage_workspace_select on public.v2_request_usage
  for select to authenticated
  using (exists (
    select 1 from public.v2_request_facts request
    where request.request_event_id = v2_request_usage.request_event_id
      and (select public.is_workspace_member(request.workspace_id))
  ));

drop policy if exists v2_request_pricing_lines_workspace_select on public.v2_request_pricing_lines;
create policy v2_request_pricing_lines_workspace_select on public.v2_request_pricing_lines
  for select to authenticated
  using (exists (
    select 1 from public.v2_request_facts request
    where request.request_event_id = v2_request_pricing_lines.request_event_id
      and (select public.is_workspace_member(request.workspace_id))
  ));

drop policy if exists v2_request_feedback_workspace_select on public.v2_request_feedback;
create policy v2_request_feedback_workspace_select on public.v2_request_feedback
  for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));

grant select on public.v2_request_facts, public.v2_request_attempts, public.v2_request_artifacts, public.v2_request_usage, public.v2_request_pricing_lines, public.v2_request_feedback to authenticated;
grant insert on public.v2_request_facts, public.v2_request_attempts, public.v2_request_artifacts, public.v2_request_usage, public.v2_request_pricing_lines, public.v2_request_feedback to service_role;

comment on table public.v2_request_facts is 'One logical gateway request with queryable metadata only; raw bodies never belong in Supabase.';
comment on column public.v2_request_facts.requested_model_input is 'Exact client-supplied model value, which may be a canonical slug or alias.';
comment on column public.v2_request_facts.requested_model_slug is 'Canonical slug resolved from requested_model_input.';
comment on column public.v2_request_facts.routed_model_slug is 'Canonical slug actually selected for the request.';
comment on column public.v2_request_facts.tool_call_count is 'Count of provider responses whose stop reason was tool_call; no tool payloads are stored.';
comment on table public.v2_request_artifacts is 'R2 object references and retention metadata only; the object body is never stored in Supabase.';
comment on column public.v2_request_facts.safe_metadata is 'Non-content metadata only. Prompt, completion, provider body, and tool I/O values are prohibited.';
