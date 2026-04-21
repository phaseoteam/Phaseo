-- Restrict assignable workspace roles to admin/member.
-- Keep owner as a system role only for teams.owner_user_id.

-- Normalize legacy invite roles.
update public.workspace_invites
set role = 'admin'::public.workspace_role
where lower(coalesce(role::text, '')) = 'owner';

-- Ensure canonical owner membership rows exist and are marked owner.
insert into public.workspace_members (workspace_id, user_id, role)
select t.id, t.owner_user_id, 'owner'::public.workspace_role
from public.workspaces t
on conflict (workspace_id, user_id)
do update set role = 'owner'::public.workspace_role;

-- Demote non-canonical owner rows to admin.
update public.workspace_members tm
set role = 'admin'::public.workspace_role
where lower(coalesce(tm.role::text, '')) = 'owner'
  and exists (
    select 1
    from public.workspaces t
    where t.id = tm.workspace_id
      and t.owner_user_id <> tm.user_id
  );

-- Enforce membership role rules:
-- - Only canonical owner may have role=owner.
-- - Non-owner members can only be admin/member.
create or replace function public.enforce_workspace_member_role_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
begin
  select t.owner_user_id
    into v_owner_user_id
  from public.workspaces t
  where t.id = new.workspace_id;

  if v_owner_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'team_not_found_for_membership';
  end if;

  if new.user_id = v_owner_user_id then
    new.role := 'owner'::public.workspace_role;
    return new;
  end if;

  if lower(coalesce(new.role::text, '')) = 'owner' then
    raise exception using
      errcode = '23514',
      message = 'owner_role_reserved_for_workspace_owner',
      detail = 'Only teams.owner_user_id may have role=owner.';
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
create trigger workspace_members_role_policy_guard
before insert or update
on public.workspace_members
for each row
execute function public.enforce_workspace_member_role_policy();

-- Enforce invite role rules:
-- - Invites may only grant admin/member.
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
create trigger workspace_invites_role_policy_guard
before insert or update
on public.workspace_invites
for each row
execute function public.enforce_workspace_invite_role_policy();

-- Mirror the same restriction in RLS checks for invite writes.
drop policy if exists workspace_invites_insert_own_team on public.workspace_invites;
create policy workspace_invites_insert_own_team
  on public.workspace_invites
  for insert
  to authenticated
  with check (
    public.is_workspace_admin(workspace_id)
    and role in ('admin'::public.workspace_role, 'member'::public.workspace_role)
  );

drop policy if exists workspace_invites_update_own_team on public.workspace_invites;
create policy workspace_invites_update_own_team
  on public.workspace_invites
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (
    public.is_workspace_admin(workspace_id)
    and role in ('admin'::public.workspace_role, 'member'::public.workspace_role)
  );
