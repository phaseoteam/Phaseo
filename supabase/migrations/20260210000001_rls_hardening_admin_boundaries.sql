-- =========================
-- RLS hardening: admin/owner write boundaries
-- =========================
-- Tightens write access for sensitive team-scoped resources and
-- restricts oauth_authorizations updates to revoke-only semantics.

-- Helper: is current user owner/admin of the given team?
create or replace function public.is_team_admin(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.team_members tm
      where tm.team_id = p_team_id
        and tm.user_id = auth.uid()
        and lower(coalesce(tm.role::text, '')) in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.teams t
      where t.id = p_team_id
        and t.owner_user_id = auth.uid()
    );
$$;

revoke all on function public.is_team_admin(uuid) from public;
grant execute on function public.is_team_admin(uuid) to authenticated;

-- -------------------------
-- teams: only owner/admin can update
-- -------------------------
drop policy if exists teams_update_member on public.teams;
drop policy if exists teams_update_own_team on public.teams;
create policy teams_update_member
  on public.teams
  for update
  to authenticated
  using (public.is_team_admin(id))
  with check (public.is_team_admin(id));

-- -------------------------
-- team_members: only owner/admin can mutate membership rows
-- -------------------------
drop policy if exists team_members_insert_own_team on public.team_members;
drop policy if exists team_members_update_own_team on public.team_members;
drop policy if exists team_members_delete_own_team on public.team_members;
drop policy if exists team_members_insert_admin on public.team_members;
drop policy if exists team_members_update_admin on public.team_members;
drop policy if exists team_members_delete_admin on public.team_members;

create policy team_members_insert_admin
  on public.team_members
  for insert
  to authenticated
  with check (public.is_team_admin(team_id));

create policy team_members_update_admin
  on public.team_members
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (
    public.is_team_admin(team_id)
    and not exists (
      select 1
      from public.teams t
      where t.id = team_members.team_id
        and t.owner_user_id = team_members.user_id
        and lower(coalesce(team_members.role::text, '')) <> 'owner'
    )
  );

create policy team_members_delete_admin
  on public.team_members
  for delete
  to authenticated
  using (
    public.is_team_admin(team_id)
    and not exists (
      select 1
      from public.teams t
      where t.id = team_members.team_id
        and t.owner_user_id = team_members.user_id
    )
  );

-- -------------------------
-- key-management tables: only owner/admin can write
-- -------------------------
drop policy if exists keys_insert_own_team on public.keys;
drop policy if exists keys_update_own_team on public.keys;
drop policy if exists keys_delete_own_team on public.keys;
create policy keys_insert_own_team
  on public.keys
  for insert
  to authenticated
  with check (public.is_team_admin(team_id));
create policy keys_update_own_team
  on public.keys
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));
create policy keys_delete_own_team
  on public.keys
  for delete
  to authenticated
  using (public.is_team_admin(team_id));

drop policy if exists byok_keys_insert_own_team on public.byok_keys;
drop policy if exists byok_keys_update_own_team on public.byok_keys;
drop policy if exists byok_keys_delete_own_team on public.byok_keys;
create policy byok_keys_insert_own_team
  on public.byok_keys
  for insert
  to authenticated
  with check (public.is_team_admin(team_id));
create policy byok_keys_update_own_team
  on public.byok_keys
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));
create policy byok_keys_delete_own_team
  on public.byok_keys
  for delete
  to authenticated
  using (public.is_team_admin(team_id));

drop policy if exists provisioning_keys_insert_own_team on public.provisioning_keys;
drop policy if exists provisioning_keys_update_own_team on public.provisioning_keys;
drop policy if exists provisioning_keys_delete_own_team on public.provisioning_keys;
create policy provisioning_keys_insert_own_team
  on public.provisioning_keys
  for insert
  to authenticated
  with check (public.is_team_admin(team_id));
create policy provisioning_keys_update_own_team
  on public.provisioning_keys
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));
create policy provisioning_keys_delete_own_team
  on public.provisioning_keys
  for delete
  to authenticated
  using (public.is_team_admin(team_id));

-- -------------------------
-- team governance: only owner/admin can mutate
-- -------------------------
drop policy if exists team_invites_insert_own_team on public.team_invites;
drop policy if exists team_invites_update_own_team on public.team_invites;
drop policy if exists team_invites_delete_own_team on public.team_invites;
create policy team_invites_insert_own_team
  on public.team_invites
  for insert
  to authenticated
  with check (public.is_team_admin(team_id));
create policy team_invites_update_own_team
  on public.team_invites
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));
create policy team_invites_delete_own_team
  on public.team_invites
  for delete
  to authenticated
  using (public.is_team_admin(team_id));

drop policy if exists team_join_requests_update on public.team_join_requests;
create policy team_join_requests_update
  on public.team_join_requests
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

drop policy if exists team_settings_insert_own_team on public.team_settings;
drop policy if exists team_settings_update_own_team on public.team_settings;
create policy team_settings_insert_own_team
  on public.team_settings
  for insert
  to authenticated
  with check (public.is_team_admin(team_id));
create policy team_settings_update_own_team
  on public.team_settings
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

-- -------------------------
-- oauth_authorizations: revoke-only updates for end users
-- -------------------------
drop policy if exists oauth_authorizations_update_own on public.oauth_authorizations;
create policy oauth_authorizations_update_own
  on public.oauth_authorizations
  for update
  to authenticated
  using (user_id = auth.uid() and revoked_at is null)
  with check (user_id = auth.uid() and revoked_at is not null);

-- Restrict authenticated updates to revoked_at only.
revoke update on public.oauth_authorizations from authenticated;
grant update (revoked_at) on public.oauth_authorizations to authenticated;
