create table if not exists public.workspace_member_guardrails (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(user_id) on delete cascade,
  guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id, guardrail_id)
);

create index if not exists workspace_member_guardrails_guardrail_id_idx
  on public.workspace_member_guardrails (guardrail_id);

create index if not exists workspace_member_guardrails_user_id_idx
  on public.workspace_member_guardrails (user_id);

alter table public.workspace_member_guardrails enable row level security;

drop policy if exists workspace_member_guardrails_select_own_workspace on public.workspace_member_guardrails;
create policy workspace_member_guardrails_select_own_workspace
  on public.workspace_member_guardrails
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_member_guardrails.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists workspace_member_guardrails_insert_admin on public.workspace_member_guardrails;
create policy workspace_member_guardrails_insert_admin
  on public.workspace_member_guardrails
  for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_member_guardrails.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

drop policy if exists workspace_member_guardrails_delete_admin on public.workspace_member_guardrails;
create policy workspace_member_guardrails_delete_admin
  on public.workspace_member_guardrails
  for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_member_guardrails.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

grant select, insert, delete on public.workspace_member_guardrails to authenticated, service_role;
