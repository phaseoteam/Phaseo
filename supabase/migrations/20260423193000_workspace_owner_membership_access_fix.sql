-- Ensure workspace owners are always treated as workspace members for RLS checks.
-- This prevents owner-only workspaces from becoming inaccessible when a canonical
-- workspace_members owner row is missing.

create or replace function public.is_workspace_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p_team_id
        and wm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.workspaces w
      where w.id = p_team_id
        and w.owner_user_id = auth.uid()
    );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- Backfill canonical owner membership rows so read/write policies depending on
-- workspace_members continue to work across all existing workspaces.
-- Some environments may still have legacy membership triggers that reference
-- pre-rename relations. Treat this as best-effort so the core access fix above
-- is not blocked.
do $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  select
    w.id as workspace_id,
    w.owner_user_id as user_id,
    'owner'::public.workspace_role as role
  from public.workspaces w
  where w.owner_user_id is not null
  on conflict (workspace_id, user_id)
  do update
  set role = 'owner'::public.workspace_role;
exception
  when others then
    raise notice
      'workspace_owner_membership_backfill_skipped: % (%)',
      sqlerrm,
      sqlstate;
end $$;
