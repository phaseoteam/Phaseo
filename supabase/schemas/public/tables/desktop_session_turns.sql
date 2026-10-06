-- Native desktop history is reported metadata, never gateway usage or billing.
create table public.desktop_session_turns (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  environment_id text not null check (length(environment_id) between 1 and 200),
  session_id text not null check (length(session_id) between 1 and 512),
  turn_id text not null check (length(turn_id) between 1 and 300),
  provider text not null check (provider in ('codex','claudeAgent')),
  model text not null check (length(model) between 1 and 256),
  status text not null check (status in ('completed','failed','cancelled','interrupted')),
  started_at timestamptz not null,
  completed_at timestamptz not null check (completed_at >= started_at),
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  usage_status text not null check (usage_status in ('complete','partial','unavailable')),
  check ((usage_status = 'complete' and input_tokens is not null and output_tokens is not null)
    or (usage_status = 'partial' and (input_tokens is not null or output_tokens is not null))
    or (usage_status = 'unavailable' and input_tokens is null and output_tokens is null)),
  desktop_scheme text not null check (desktop_scheme in ('t3code','t3code-dev')),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id,environment_id,turn_id)
);
create index desktop_session_turns_history on public.desktop_session_turns (workspace_id,user_id,completed_at desc);
alter table public.desktop_session_turns enable row level security;
revoke all on public.desktop_session_turns from anon,authenticated;
grant select on public.desktop_session_turns to authenticated;
grant all on public.desktop_session_turns to service_role;
create policy desktop_history_read on public.desktop_session_turns for select to authenticated
using (user_id = (select auth.uid()) and (
  exists (select 1 from public.workspace_members m where m.workspace_id = desktop_session_turns.workspace_id and m.user_id = (select auth.uid()))
  or exists (select 1 from public.workspaces w where w.id = desktop_session_turns.workspace_id and w.owner_user_id = (select auth.uid()))
));
