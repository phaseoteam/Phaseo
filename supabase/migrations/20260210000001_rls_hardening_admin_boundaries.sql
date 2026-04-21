-- =========================
-- RLS hardening: admin/owner write boundaries
-- =========================
-- Tightens write access for sensitive team-scoped resources and
-- restricts oauth_authorizations updates to revoke-only semantics.

-- Helper: is current user owner/admin of the given team?
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
      from public.workspace_members tm
      where tm.workspace_id = p_workspace_id
        and tm.user_id = auth.uid()
        and lower(coalesce(tm.role::text, '')) in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.workspaces t
      where t.id = p_workspace_id
        and t.owner_user_id = auth.uid()
    );
$$;
revoke all on function public.is_workspace_admin(uuid) from public;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
-- -------------------------
-- teams: only owner/admin can update
-- -------------------------
drop policy if exists teams_update_member on public.workspaces;
drop policy if exists teams_update_own_team on public.workspaces;
create policy teams_update_member
  on public.workspaces
  for update
  to authenticated
  using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));
-- -------------------------
-- workspace_members: only owner/admin can mutate membership rows
-- -------------------------
drop policy if exists workspace_members_insert_own_team on public.workspace_members;
drop policy if exists workspace_members_update_own_team on public.workspace_members;
drop policy if exists workspace_members_delete_own_team on public.workspace_members;
drop policy if exists workspace_members_insert_admin on public.workspace_members;
drop policy if exists workspace_members_update_admin on public.workspace_members;
drop policy if exists workspace_members_delete_admin on public.workspace_members;
create policy workspace_members_insert_admin
  on public.workspace_members
  for insert
  to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy workspace_members_update_admin
  on public.workspace_members
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (
    public.is_workspace_admin(workspace_id)
    and not exists (
      select 1
      from public.workspaces t
      where t.id = workspace_members.workspace_id
        and t.owner_user_id = workspace_members.user_id
        and lower(coalesce(workspace_members.role::text, '')) <> 'owner'
    )
  );
create policy workspace_members_delete_admin
  on public.workspace_members
  for delete
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    and not exists (
      select 1
      from public.workspaces t
      where t.id = workspace_members.workspace_id
        and t.owner_user_id = workspace_members.user_id
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
  with check (public.is_workspace_admin(workspace_id));
create policy keys_update_own_team
  on public.keys
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
create policy keys_delete_own_team
  on public.keys
  for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));
drop policy if exists byok_keys_insert_own_team on public.byok_keys;
drop policy if exists byok_keys_update_own_team on public.byok_keys;
drop policy if exists byok_keys_delete_own_team on public.byok_keys;
create policy byok_keys_insert_own_team
  on public.byok_keys
  for insert
  to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy byok_keys_update_own_team
  on public.byok_keys
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
create policy byok_keys_delete_own_team
  on public.byok_keys
  for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));
drop policy if exists provisioning_keys_insert_own_team on public.provisioning_keys;
drop policy if exists provisioning_keys_update_own_team on public.provisioning_keys;
drop policy if exists provisioning_keys_delete_own_team on public.provisioning_keys;
create policy provisioning_keys_insert_own_team
  on public.provisioning_keys
  for insert
  to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy provisioning_keys_update_own_team
  on public.provisioning_keys
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
create policy provisioning_keys_delete_own_team
  on public.provisioning_keys
  for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));
-- -------------------------
-- team governance: only owner/admin can mutate
-- -------------------------
drop policy if exists workspace_invites_insert_own_team on public.workspace_invites;
drop policy if exists workspace_invites_update_own_team on public.workspace_invites;
drop policy if exists workspace_invites_delete_own_team on public.workspace_invites;
create policy workspace_invites_insert_own_team
  on public.workspace_invites
  for insert
  to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy workspace_invites_update_own_team
  on public.workspace_invites
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
create policy workspace_invites_delete_own_team
  on public.workspace_invites
  for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));
drop policy if exists workspace_join_requests_update on public.workspace_join_requests;
create policy workspace_join_requests_update
  on public.workspace_join_requests
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
drop policy if exists workspace_settings_insert_own_team on public.workspace_settings;
drop policy if exists workspace_settings_update_own_team on public.workspace_settings;
create policy workspace_settings_insert_own_team
  on public.workspace_settings
  for insert
  to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy workspace_settings_update_own_team
  on public.workspace_settings
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
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
