-- Normalize every provider interaction beneath its complete gateway request.

create table if not exists public.gateway_upstream_requests (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null,
  gateway_request_id uuid not null,
  gateway_request_created_at timestamp with time zone not null,
  request_id text not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  app_id uuid null references public.api_apps (id) on delete set null,
  key_id uuid null references public.keys (id) on delete set null,
  sequence integer not null,
  round_number integer not null default 1,
  attempt_number integer null,
  internal_attempt_number integer null,
  stage text not null default 'upstream',
  endpoint text not null,
  model_id text not null,
  provider text null,
  api_model_id text null,
  provider_model_slug text null,
  upstream_route text null,
  upstream_url text null,
  status_code integer null,
  status_text text null,
  success boolean not null default false,
  outcome text not null,
  retryable boolean null,
  fallback_attempted boolean not null default false,
  was_probe boolean not null default false,
  key_source text null,
  native_response_id text null,
  provider_finish_reason text null,
  finish_reason text null,
  duration_ms integer null,
  latency_ms integer null,
  generation_ms integer null,
  total_ms integer null,
  request_build_ms integer null,
  upstream_headers_ms integer null,
  retry_delay_ms integer null,
  usage jsonb not null default '{}'::jsonb,
  cost_nanos bigint not null default 0,
  currency text null,
  error_code text null,
  error_type text null,
  error_message text null,
  error_description text null,
  error_param text null,
  request_payload jsonb null,
  response_payload jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  constraint gateway_upstream_requests_pkey primary key (id, created_at),
  constraint gateway_upstream_requests_gateway_request_fkey
    foreign key (gateway_request_id, gateway_request_created_at)
    references public.gateway_requests (id, created_at)
    on delete cascade,
  constraint gateway_upstream_requests_sequence_ck check (sequence > 0),
  constraint gateway_upstream_requests_round_ck check (round_number > 0),
  constraint gateway_upstream_requests_attempt_ck
    check (attempt_number is null or attempt_number > 0),
  constraint gateway_upstream_requests_internal_attempt_ck
    check (internal_attempt_number is null or internal_attempt_number > 0),
  constraint gateway_upstream_requests_status_ck
    check (status_code is null or status_code between 100 and 599),
  constraint gateway_upstream_requests_key_source_ck
    check (key_source is null or key_source in ('gateway', 'byok')),
  constraint gateway_upstream_requests_stage_ck
    check (stage in ('routing', 'upstream')),
  constraint gateway_upstream_requests_parent_sequence_key
    unique (gateway_request_id, gateway_request_created_at, sequence, created_at)
) partition by range (created_at);

create table if not exists public.gateway_upstream_requests_default
  partition of public.gateway_upstream_requests default;

create index if not exists gateway_upstream_requests_parent_sequence_idx
  on public.gateway_upstream_requests
  (gateway_request_id, gateway_request_created_at, sequence);

create index if not exists gateway_upstream_requests_workspace_created_idx
  on public.gateway_upstream_requests (workspace_id, created_at desc);

create index if not exists gateway_upstream_requests_workspace_request_created_sequence_idx
  on public.gateway_upstream_requests
  (workspace_id, request_id, gateway_request_created_at, sequence);

create index if not exists gateway_upstream_requests_workspace_provider_created_idx
  on public.gateway_upstream_requests (workspace_id, provider, created_at desc)
  where provider is not null;

create index if not exists gateway_upstream_requests_key_created_idx
  on public.gateway_upstream_requests (key_id, created_at desc)
  where key_id is not null;

alter table public.gateway_upstream_requests enable row level security;

drop policy if exists gateway_upstream_requests_select_service
  on public.gateway_upstream_requests;
create policy gateway_upstream_requests_select_service
  on public.gateway_upstream_requests
  for select
  to service_role
  using (true);

drop policy if exists gateway_upstream_requests_insert_service
  on public.gateway_upstream_requests;
create policy gateway_upstream_requests_insert_service
  on public.gateway_upstream_requests
  for insert
  to service_role
  with check (true);

revoke all on public.gateway_upstream_requests from public, anon, authenticated;
grant select, insert on public.gateway_upstream_requests to service_role;

comment on table public.gateway_upstream_requests is
  'Ordered provider interactions, retries, fallbacks, and model rounds linked to one complete gateway request.';
comment on column public.gateway_upstream_requests.request_payload is
  'Sanitized upstream request snapshot. Full raw payloads remain in opt-in R2 I/O logs.';
comment on column public.gateway_upstream_requests.response_payload is
  'Sanitized upstream response snapshot. Full raw payloads remain in opt-in R2 I/O logs.';

create or replace function public.ensure_gateway_requests_partitions(months_ahead integer default 1)
returns void
language plpgsql
as $$
declare
  v_cur_month timestamptz;
  v_last_month timestamptz;
  v_gateway_partition_name text;
  v_upstream_partition_name text;
begin
  if months_ahead is null or months_ahead < 0 then
    raise exception 'months_ahead must be >= 0';
  end if;

  v_cur_month := date_trunc('month', now());
  v_last_month := v_cur_month + make_interval(months => months_ahead);

  while v_cur_month <= v_last_month loop
    v_gateway_partition_name := format('gateway_requests_%s', to_char(v_cur_month, 'YYYY_MM'));
    execute format(
      'create table if not exists public.%I partition of public.gateway_requests for values from (%L) to (%L)',
      v_gateway_partition_name,
      v_cur_month,
      v_cur_month + interval '1 month'
    );

    v_upstream_partition_name := format(
      'gateway_upstream_requests_%s',
      to_char(v_cur_month, 'YYYY_MM')
    );
    execute format(
      'create table if not exists public.%I partition of public.gateway_upstream_requests for values from (%L) to (%L)',
      v_upstream_partition_name,
      v_cur_month,
      v_cur_month + interval '1 month'
    );

    v_cur_month := v_cur_month + interval '1 month';
  end loop;
end;
$$;

comment on function public.ensure_gateway_requests_partitions(integer) is
  'Creates current and future monthly partitions for gateway_requests and gateway_upstream_requests.';

select public.ensure_gateway_requests_partitions(1);
