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

comment on column public.workspace_settings.io_logging_enabled is
  'Opt-in workspace setting for raw gateway request/response I/O capture into private object storage.';

comment on column public.workspace_settings.io_logging_retention_days is
  'Requested gateway I/O retention in days. 90 days is the default; retention beyond the included window is credit-metered.';

comment on column public.workspace_settings.io_logging_include_provider_payloads is
  'When true, gateway I/O logs include provider request/response payloads in addition to client request and gateway response.';

alter table public.gateway_request_details
  add column if not exists io_log_status text not null default 'not_enabled',
  add column if not exists io_log_storage_provider text,
  add column if not exists io_log_bucket text,
  add column if not exists io_log_object_key text,
  add column if not exists io_log_bytes bigint,
  add column if not exists io_log_sha256 text,
  add column if not exists io_log_content_type text,
  add column if not exists io_log_retention_until timestamptz,
  add column if not exists io_log_error text;

alter table public.gateway_request_details
  drop constraint if exists gateway_request_details_io_log_status_check;

alter table public.gateway_request_details
  add constraint gateway_request_details_io_log_status_check
  check (io_log_status in ('not_enabled', 'stored', 'missing_bucket', 'too_large', 'error', 'deleted'));

create index if not exists idx_gateway_request_details_io_log_object_key
  on public.gateway_request_details (io_log_object_key)
  where io_log_object_key is not null;

grant select, insert, update on public.gateway_request_details to service_role;

comment on column public.gateway_request_details.io_log_object_key is
  'Private R2 object key for the raw gateway I/O log associated with this request detail row.';
