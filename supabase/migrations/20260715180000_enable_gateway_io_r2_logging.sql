-- Forward-only production activation for gateway I/O logging.
-- This intentionally avoids the unrelated historical migration backlog.

alter table public.workspace_settings
  add column if not exists io_logging_enabled boolean not null default false,
  add column if not exists io_logging_retention_days integer not null default 90,
  add column if not exists io_logging_include_provider_payloads boolean not null default true,
  add column if not exists io_logging_updated_at timestamptz;

alter table public.workspace_settings
  drop constraint if exists workspace_settings_io_logging_retention_days_check;

alter table public.workspace_settings
  add constraint workspace_settings_io_logging_retention_days_check
  check (io_logging_retention_days between 90 and 365);

-- Keep only a compact, ownership-scoped R2 index in Postgres. Prompt and
-- completion payloads remain exclusively in the private R2 bucket.
create table if not exists public.gateway_io_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id text not null,
  created_at timestamptz not null default now(),
  io_log_status text not null default 'not_enabled',
  io_log_storage_provider text,
  io_log_bucket text,
  io_log_object_key text,
  io_log_bytes bigint,
  io_log_sha256 text,
  io_log_content_type text,
  io_log_retention_until timestamptz,
  io_log_error text,
  constraint gateway_io_logs_status_check
    check (io_log_status in ('not_enabled', 'stored', 'missing_bucket', 'too_large', 'error', 'deleted')),
  constraint gateway_io_logs_workspace_request_key unique (workspace_id, request_id)
);

create index if not exists gateway_io_logs_workspace_created_idx
  on public.gateway_io_logs (workspace_id, created_at desc);

create index if not exists gateway_io_logs_object_key_idx
  on public.gateway_io_logs (io_log_object_key)
  where io_log_object_key is not null;

alter table public.gateway_io_logs enable row level security;
revoke all on public.gateway_io_logs from anon, authenticated;
grant select, insert, update on public.gateway_io_logs to service_role;

comment on table public.gateway_io_logs is
  'Private R2 I/O log metadata keyed by workspace and gateway request. Raw payloads remain in R2.';
