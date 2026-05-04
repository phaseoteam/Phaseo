-- Fix legacy role-policy functions that still reference pre-rename team tables.
-- This restores workspace_members inserts/updates and allows owner row backfills.

create or replace function public.enforce_workspace_member_role_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
begin
  select w.owner_user_id
    into v_owner_user_id
  from public.workspaces w
  where w.id = new.workspace_id;

  if v_owner_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'workspace_not_found_for_membership';
  end if;

  if new.user_id = v_owner_user_id then
    new.role := 'owner'::public.workspace_role;
    return new;
  end if;

  if lower(coalesce(new.role::text, '')) = 'owner' then
    raise exception using
      errcode = '23514',
      message = 'owner_role_reserved_for_workspace_owner',
      detail = 'Only workspaces.owner_user_id may have role=owner.';
  end if;

  if lower(coalesce(new.role::text, '')) not in ('admin', 'member') then
    raise exception using
      errcode = '23514',
      message = 'invalid_workspace_member_role',
      detail = 'Assignable roles are admin and member.';
  end if;

  return new;
end;
$$;
drop trigger if exists workspace_members_role_policy_guard on public.workspace_members;
drop trigger if exists team_members_role_policy_guard on public.workspace_members;
create trigger workspace_members_role_policy_guard
before insert or update
on public.workspace_members
for each row
execute function public.enforce_workspace_member_role_policy();
create or replace function public.enforce_workspace_invite_role_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.role::text, '')) not in ('admin', 'member') then
    raise exception using
      errcode = '23514',
      message = 'invalid_workspace_invite_role',
      detail = 'Invite roles are restricted to admin and member.';
  end if;

  return new;
end;
$$;
drop trigger if exists workspace_invites_role_policy_guard on public.workspace_invites;
drop trigger if exists team_invites_role_policy_guard on public.workspace_invites;
create trigger workspace_invites_role_policy_guard
before insert or update
on public.workspace_invites
for each row
execute function public.enforce_workspace_invite_role_policy();
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
