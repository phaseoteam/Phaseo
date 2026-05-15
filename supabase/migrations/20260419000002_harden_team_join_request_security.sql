-- Harden team invite/join-request security and make approval/rejection atomic.

-- Tighten insert policy so users can only create pending requests for themselves
-- using a valid invite that belongs to the same team.
create or replace function public.is_active_invite_for_team(
  p_invite_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_invites ti
    where ti.id = p_invite_id
      and ti.team_id = p_team_id
      and (ti.expires_at is null or ti.expires_at > now())
      and (ti.max_uses is null or coalesce(ti.uses_count, 0) < ti.max_uses)
  );
$$;
revoke all on function public.is_active_invite_for_team(uuid, uuid) from public;
grant execute on function public.is_active_invite_for_team(uuid, uuid) to authenticated;
drop policy if exists team_join_requests_insert on public.team_join_requests;
create policy team_join_requests_insert
  on public.team_join_requests
  for insert
  to authenticated
  with check (
    requester_user_id = auth.uid()
    and invite_id is not null
    and status = 'pending'::join_request_status
    and decided_by is null
    and decided_at is null
    and not public.is_team_member(team_id)
    and public.is_active_invite_for_team(invite_id, team_id)
  );
-- Only admins can update pending requests, and only to final decided states.
drop policy if exists team_join_requests_update on public.team_join_requests;
create policy team_join_requests_update
  on public.team_join_requests
  for update
  to authenticated
  using (
    public.is_team_admin(team_id)
    and status = 'pending'::join_request_status
  )
  with check (
    public.is_team_admin(team_id)
    and status in ('approved'::join_request_status, 'denied'::join_request_status)
    and decided_by = auth.uid()
    and decided_at is not null
  );
-- One pending request per (team, requester) to prevent spam/races.
create unique index if not exists team_join_requests_pending_unique
  on public.team_join_requests (team_id, requester_user_id)
  where status = 'pending'::join_request_status;
-- Guard cross-team invite linkage and state transitions at the table level.
create or replace function public.enforce_team_join_request_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invite_id is not null then
    if not exists (
      select 1
      from public.team_invites ti
      where ti.id = new.invite_id
        and ti.team_id = new.team_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'invite_team_mismatch',
        detail = 'Join request invite must belong to the same team.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending'::join_request_status
       or new.decided_by is not null
       or new.decided_at is not null then
      raise exception using
        errcode = '23514',
        message = 'invalid_join_request_insert_state',
        detail = 'New join requests must be pending and undecided.';
    end if;
    return new;
  end if;

  -- UPDATE path
  if old.status <> 'pending'::join_request_status then
    raise exception using
      errcode = '23514',
      message = 'join_request_already_decided',
      detail = 'Only pending join requests can be updated.';
  end if;

  if new.status not in ('approved'::join_request_status, 'denied'::join_request_status) then
    raise exception using
      errcode = '23514',
      message = 'invalid_join_request_status_transition',
      detail = 'Join request updates must transition to approved or denied.';
  end if;

  if new.decided_by is null or new.decided_at is null then
    raise exception using
      errcode = '23514',
      message = 'join_request_decision_metadata_required',
      detail = 'Decided join requests must include decided_by and decided_at.';
  end if;

  if new.team_id <> old.team_id or new.requester_user_id <> old.requester_user_id then
    raise exception using
      errcode = '23514',
      message = 'join_request_immutable_fields_modified',
      detail = 'team_id and requester_user_id are immutable.';
  end if;

  if new.invite_id is distinct from old.invite_id then
    raise exception using
      errcode = '23514',
      message = 'join_request_invite_immutable',
      detail = 'invite_id is immutable after request creation.';
  end if;

  return new;
end;
$$;
drop trigger if exists team_join_requests_write_rules_guard on public.team_join_requests;
create trigger team_join_requests_write_rules_guard
before insert or update
on public.team_join_requests
for each row
execute function public.enforce_team_join_request_write_rules();
-- Atomic approval flow: verifies admin rights, locks request, enforces invite-team
-- consistency, increments invite uses, upserts membership, and marks request approved.
create or replace function public.approve_team_join_request(
  p_request_id uuid
)
returns table (
  id uuid,
  team_id uuid,
  requester_user_id uuid,
  invite_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_req public.team_join_requests%rowtype;
  v_role public.team_role := 'member'::public.team_role;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized';
  end if;

  select *
    into v_req
  from public.team_join_requests
  where team_join_requests.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Join request not found';
  end if;

  if v_req.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;

  if not public.is_team_admin(v_req.team_id) then
    raise exception using errcode = '42501', message = 'Only owners or admins may approve join requests.';
  end if;

  if v_req.invite_id is not null then
    update public.team_invites ti
      set uses_count = coalesce(ti.uses_count, 0) + 1
    where ti.id = v_req.invite_id
      and ti.team_id = v_req.team_id
      and (ti.expires_at is null or ti.expires_at > now())
      and (ti.max_uses is null or coalesce(ti.uses_count, 0) < ti.max_uses)
    returning ti.role into v_role;

    if not found then
      raise exception using errcode = '23514', message = 'Invite is invalid for this request';
    end if;
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_req.team_id, v_req.requester_user_id, v_role)
  on conflict (team_id, user_id) do nothing;

  return query
  update public.team_join_requests r
     set status = 'approved'::public.join_request_status,
         decided_by = v_user_id,
         decided_at = now()
   where r.id = v_req.id
     and r.status = 'pending'::public.join_request_status
  returning r.id, r.team_id, r.requester_user_id, r.invite_id;

  if not found then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;
end;
$$;
-- Atomic reject flow: verifies admin rights, locks request, and marks denied once.
create or replace function public.reject_team_join_request(
  p_request_id uuid
)
returns table (
  id uuid,
  team_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_req public.team_join_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized';
  end if;

  select *
    into v_req
  from public.team_join_requests
  where team_join_requests.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Join request not found';
  end if;

  if v_req.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;

  if not public.is_team_admin(v_req.team_id) then
    raise exception using errcode = '42501', message = 'Only owners or admins may reject join requests.';
  end if;

  return query
  update public.team_join_requests r
     set status = 'denied'::public.join_request_status,
         decided_by = v_user_id,
         decided_at = now()
   where r.id = v_req.id
     and r.status = 'pending'::public.join_request_status
  returning r.id, r.team_id;

  if not found then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;
end;
$$;
revoke all on function public.approve_team_join_request(uuid) from public;
grant execute on function public.approve_team_join_request(uuid) to authenticated;
revoke all on function public.reject_team_join_request(uuid) from public;
grant execute on function public.reject_team_join_request(uuid) to authenticated;
