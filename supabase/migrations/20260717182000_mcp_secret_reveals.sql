-- Encrypted, user-only, one-time reveal records for secrets created by MCP.

create table if not exists public.mcp_secret_reveals (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public.mcp_action_approvals(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  oauth_client_id text not null,
  tool_name text not null,
  secret_ciphertext text not null,
  secret_iv text not null,
  expires_at timestamptz not null,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_secret_reveals_user_created_idx
  on public.mcp_secret_reveals(user_id, created_at desc);
create index if not exists mcp_secret_reveals_workspace_created_idx
  on public.mcp_secret_reveals(workspace_id, created_at desc);
create index if not exists mcp_secret_reveals_expiry_idx
  on public.mcp_secret_reveals(expires_at)
  where revealed_at is null;

alter table public.mcp_secret_reveals enable row level security;
revoke all on public.mcp_secret_reveals from public, anon, authenticated;
grant select, insert, update on public.mcp_secret_reveals to service_role;
