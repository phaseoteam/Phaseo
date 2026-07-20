-- Human-approved, single-use execution tickets for MCP control-plane changes.

create table if not exists public.mcp_action_approvals (
  id uuid primary key default gen_random_uuid(),
  execution_token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  oauth_client_id text not null,
  tool_name text not null,
  action_title text not null,
  action_method text not null check (action_method in ('POST', 'PATCH', 'DELETE')),
  action_path text not null,
  action_payload jsonb not null default '{}'::jsonb,
  required_scopes text[] not null,
  action_hash text not null,
  approved_at timestamptz,
  consumed_at timestamptz,
  completed_at timestamptz,
  outcome text check (outcome in ('succeeded', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint mcp_action_approval_lifecycle_check check (
    (consumed_at is null or approved_at is not null)
    and (completed_at is null or consumed_at is not null)
    and (outcome is null or completed_at is not null)
  )
);

create index if not exists mcp_action_approvals_user_created_idx
  on public.mcp_action_approvals(user_id, created_at desc);
create index if not exists mcp_action_approvals_workspace_created_idx
  on public.mcp_action_approvals(workspace_id, created_at desc);
create index if not exists mcp_action_approvals_pending_idx
  on public.mcp_action_approvals(expires_at)
  where consumed_at is null;

alter table public.mcp_action_approvals enable row level security;
revoke all on public.mcp_action_approvals from public, anon, authenticated;
grant select, insert, update on public.mcp_action_approvals to service_role;

create table if not exists public.mcp_action_audit_events (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.mcp_action_approvals(id) on delete restrict,
  event_type text not null check (event_type in ('prepared', 'approved', 'consumed', 'succeeded', 'failed')),
  actor_type text not null check (actor_type in ('mcp_client', 'user')),
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  oauth_client_id text not null,
  tool_name text not null,
  action_hash text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mcp_action_audit_workspace_created_idx
  on public.mcp_action_audit_events(workspace_id, created_at desc);
create index if not exists mcp_action_audit_user_created_idx
  on public.mcp_action_audit_events(user_id, created_at desc);
create index if not exists mcp_action_audit_approval_idx
  on public.mcp_action_audit_events(approval_id, created_at);

alter table public.mcp_action_audit_events enable row level security;
revoke all on public.mcp_action_audit_events from public, anon, authenticated;
grant select, insert on public.mcp_action_audit_events to service_role;
