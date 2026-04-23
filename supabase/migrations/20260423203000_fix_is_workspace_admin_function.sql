-- Fix stale workspace admin helper function bodies that may still reference
-- pre-rename team tables in some environments.

create or replace function public.is_workspace_admin(p_workspace_id uuid)
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
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and lower(coalesce(wm.role::text, '')) in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.workspaces w
      where w.id = p_workspace_id
        and w.owner_user_id = auth.uid()
    );
$$;

revoke all on function public.is_workspace_admin(uuid) from public;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
