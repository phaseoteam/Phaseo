-- Durable async webhook endpoints and per-request batch tracking.
-- Webhook endpoints are managed per workspace by settings UI/API surfaces and
-- referenced by async video/batch jobs. Batch request rows let reconciliation
-- track individual provider rows independently of the parent async operation.

create table if not exists public.gateway_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  url text not null,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'deleted')),
  events text[] not null default array[
    'video.completed',
    'video.failed',
    'video.cancelled',
    'batch.completed',
    'batch.failed',
    'batch.cancelled'
  ],
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_hash text not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists gateway_webhook_endpoints_workspace_status_idx
  on public.gateway_webhook_endpoints (workspace_id, status, created_at desc);

create unique index if not exists gateway_webhook_endpoints_workspace_secret_hash_idx
  on public.gateway_webhook_endpoints (workspace_id, secret_hash);

alter table public.gateway_webhook_endpoints enable row level security;

drop policy if exists gateway_webhook_endpoints_select_workspace_members on public.gateway_webhook_endpoints;
create policy gateway_webhook_endpoints_select_workspace_members
  on public.gateway_webhook_endpoints
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = gateway_webhook_endpoints.workspace_id
        and wm.user_id = auth.uid()
    )
    or public.is_workspace_admin(gateway_webhook_endpoints.workspace_id)
  );

drop policy if exists gateway_webhook_endpoints_insert_workspace_admins on public.gateway_webhook_endpoints;
create policy gateway_webhook_endpoints_insert_workspace_admins
  on public.gateway_webhook_endpoints
  for insert
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists gateway_webhook_endpoints_update_workspace_admins on public.gateway_webhook_endpoints;
create policy gateway_webhook_endpoints_update_workspace_admins
  on public.gateway_webhook_endpoints
  for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

grant select on public.gateway_webhook_endpoints to authenticated;
grant select, insert, update, delete on public.gateway_webhook_endpoints to service_role;

comment on table public.gateway_webhook_endpoints is
  'Workspace-managed async webhook endpoints for video and batch notifications.';
comment on column public.gateway_webhook_endpoints.secret_ciphertext is
  'Encrypted signing secret. Public API responses must never expose this value.';

create table if not exists public.gateway_batch_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id text not null,
  provider text not null,
  native_batch_id text null,
  custom_id text not null,
  request_index integer not null default 0,
  method text null,
  endpoint text null,
  model text null,
  status text not null default 'queued',
  request_body_hash text null,
  response_status integer null,
  response_body jsonb null,
  error_body jsonb null,
  usage jsonb null,
  cost_nanos bigint null,
  cost_usd numeric null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create unique index if not exists gateway_batch_requests_workspace_batch_custom_idx
  on public.gateway_batch_requests (workspace_id, batch_id, custom_id);

create index if not exists gateway_batch_requests_workspace_batch_status_idx
  on public.gateway_batch_requests (workspace_id, batch_id, status, request_index);

create index if not exists gateway_batch_requests_provider_native_idx
  on public.gateway_batch_requests (provider, native_batch_id)
  where native_batch_id is not null;

alter table public.gateway_batch_requests enable row level security;

drop policy if exists gateway_batch_requests_select_workspace_members on public.gateway_batch_requests;
create policy gateway_batch_requests_select_workspace_members
  on public.gateway_batch_requests
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = gateway_batch_requests.workspace_id
        and wm.user_id = auth.uid()
    )
    or public.is_workspace_admin(gateway_batch_requests.workspace_id)
  );

grant select on public.gateway_batch_requests to authenticated;
grant select, insert, update, delete on public.gateway_batch_requests to service_role;

comment on table public.gateway_batch_requests is
  'Per-request lifecycle rows for provider batch jobs. Request bodies are represented by hash by default to avoid retaining prompt payloads.';
