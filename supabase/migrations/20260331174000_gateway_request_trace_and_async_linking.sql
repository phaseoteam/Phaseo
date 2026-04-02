-- Add request/session/trace metadata for observability and session analytics.
-- Add explicit request/session/app linkage on async operations for Jobs UI.

-- ---------------------------------------------------------------------------
-- gateway_requests
-- ---------------------------------------------------------------------------
alter table public.gateway_requests
  add column if not exists auth_method text;

alter table public.gateway_requests
  add column if not exists oauth_client_id text;

alter table public.gateway_requests
  add column if not exists oauth_user_id uuid;

alter table public.gateway_requests
  add column if not exists end_user_id text;

alter table public.gateway_requests
  add column if not exists session_id text;

alter table public.gateway_requests
  add column if not exists trace_data jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'gateway_requests'
      and c.conname = 'gateway_requests_auth_method_ck'
  ) then
    alter table public.gateway_requests
      add constraint gateway_requests_auth_method_ck
      check (auth_method in ('api_key', 'oauth'));
  end if;
end $$;

create index if not exists gateway_requests_team_session_created_idx
  on public.gateway_requests (team_id, session_id, created_at desc)
  where session_id is not null;

create index if not exists gateway_requests_team_end_user_created_idx
  on public.gateway_requests (team_id, end_user_id, created_at desc)
  where end_user_id is not null;

create index if not exists gateway_requests_team_auth_method_created_idx
  on public.gateway_requests (team_id, auth_method, created_at desc);

create index if not exists gateway_requests_team_oauth_client_created_idx
  on public.gateway_requests (team_id, oauth_client_id, created_at desc)
  where oauth_client_id is not null;

create index if not exists gateway_requests_trace_data_gin_idx
  on public.gateway_requests using gin (trace_data jsonb_path_ops)
  where trace_data is not null;

-- ---------------------------------------------------------------------------
-- gateway_async_operations
-- ---------------------------------------------------------------------------
alter table public.gateway_async_operations
  add column if not exists request_id text;

alter table public.gateway_async_operations
  add column if not exists session_id text;

alter table public.gateway_async_operations
  add column if not exists app_id uuid references public.api_apps (id) on delete set null;

create index if not exists gateway_async_operations_team_request_updated_idx
  on public.gateway_async_operations (team_id, request_id, updated_at desc)
  where request_id is not null;

create index if not exists gateway_async_operations_team_session_updated_idx
  on public.gateway_async_operations (team_id, session_id, updated_at desc)
  where session_id is not null;

create index if not exists gateway_async_operations_team_app_updated_idx
  on public.gateway_async_operations (team_id, app_id, updated_at desc)
  where app_id is not null;

comment on column public.gateway_requests.end_user_id is
  'Caller-supplied user identifier for trace/session analytics (for example request.user).';
comment on column public.gateway_requests.session_id is
  'Caller-supplied session identifier for grouping related requests.';
comment on column public.gateway_requests.trace_data is
  'Arbitrary caller-supplied trace key-value metadata for observability.';
comment on column public.gateway_async_operations.request_id is
  'Gateway request_id that initiated this async operation.';
comment on column public.gateway_async_operations.session_id is
  'Session identifier copied from the originating request for grouping.';
