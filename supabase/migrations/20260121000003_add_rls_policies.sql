-- =========================
-- RLS: restrict access to team/user-owned rows
-- =========================

-- Helper: is the current user a member of the given team?
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
  );
$$;
-- Core team-owned tables
alter table public.gateway_requests enable row level security;
alter table public.api_apps enable row level security;
alter table public.keys enable row level security;
alter table public.byok_keys enable row level security;
alter table public.provisioning_keys enable row level security;
alter table public.presets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.wallets enable row level security;
alter table public.team_invites enable row level security;
alter table public.team_join_requests enable row level security;
alter table public.team_members enable row level security;
alter table public.teams enable row level security;
alter table public.users enable row level security;
-- gateway_requests: read-only for authenticated team members
drop policy if exists gateway_requests_select_own_team on public.gateway_requests;
create policy gateway_requests_select_own_team
  on public.gateway_requests
  for select
  to authenticated
  using (public.is_team_member(team_id));
-- api_apps: full access for team members
drop policy if exists api_apps_select_own_team on public.api_apps;
drop policy if exists api_apps_insert_own_team on public.api_apps;
drop policy if exists api_apps_update_own_team on public.api_apps;
drop policy if exists api_apps_delete_own_team on public.api_apps;
create policy api_apps_select_own_team
  on public.api_apps
  for select
  to authenticated
  using (public.is_team_member(team_id));
create policy api_apps_insert_own_team
  on public.api_apps
  for insert
  to authenticated
  with check (public.is_team_member(team_id));
create policy api_apps_update_own_team
  on public.api_apps
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy api_apps_delete_own_team
  on public.api_apps
  for delete
  to authenticated
  using (public.is_team_member(team_id));
-- keys: full access for team members
drop policy if exists keys_select_own_team on public.keys;
drop policy if exists keys_insert_own_team on public.keys;
drop policy if exists keys_update_own_team on public.keys;
drop policy if exists keys_delete_own_team on public.keys;
create policy keys_select_own_team
  on public.keys
  for select
  to authenticated
  using (public.is_team_member(team_id));
create policy keys_insert_own_team
  on public.keys
  for insert
  to authenticated
  with check (public.is_team_member(team_id));
create policy keys_update_own_team
  on public.keys
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy keys_delete_own_team
  on public.keys
  for delete
  to authenticated
  using (public.is_team_member(team_id));
-- byok_keys: full access for team members
drop policy if exists byok_keys_select_own_team on public.byok_keys;
drop policy if exists byok_keys_insert_own_team on public.byok_keys;
drop policy if exists byok_keys_update_own_team on public.byok_keys;
drop policy if exists byok_keys_delete_own_team on public.byok_keys;
create policy byok_keys_select_own_team
  on public.byok_keys
  for select
  to authenticated
  using (public.is_team_member(team_id));
create policy byok_keys_insert_own_team
  on public.byok_keys
  for insert
  to authenticated
  with check (public.is_team_member(team_id));
create policy byok_keys_update_own_team
  on public.byok_keys
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy byok_keys_delete_own_team
  on public.byok_keys
  for delete
  to authenticated
  using (public.is_team_member(team_id));
-- provisioning_keys: full access for team members
drop policy if exists provisioning_keys_select_own_team on public.provisioning_keys;
drop policy if exists provisioning_keys_insert_own_team on public.provisioning_keys;
drop policy if exists provisioning_keys_update_own_team on public.provisioning_keys;
drop policy if exists provisioning_keys_delete_own_team on public.provisioning_keys;
create policy provisioning_keys_select_own_team
  on public.provisioning_keys
  for select
  to authenticated
  using (public.is_team_member(team_id));
create policy provisioning_keys_insert_own_team
  on public.provisioning_keys
  for insert
  to authenticated
  with check (public.is_team_member(team_id));
create policy provisioning_keys_update_own_team
  on public.provisioning_keys
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy provisioning_keys_delete_own_team
  on public.provisioning_keys
  for delete
  to authenticated
  using (public.is_team_member(team_id));
-- presets: full access for team members
drop policy if exists presets_select_own_team on public.presets;
drop policy if exists presets_insert_own_team on public.presets;
drop policy if exists presets_update_own_team on public.presets;
drop policy if exists presets_delete_own_team on public.presets;
create policy presets_select_own_team
  on public.presets
  for select
  to authenticated
  using (public.is_team_member(team_id));
create policy presets_insert_own_team
  on public.presets
  for insert
  to authenticated
  with check (public.is_team_member(team_id));
create policy presets_update_own_team
  on public.presets
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy presets_delete_own_team
  on public.presets
  for delete
  to authenticated
  using (public.is_team_member(team_id));
-- credit_ledger: read-only for team members
drop policy if exists credit_ledger_select_own_team on public.credit_ledger;
create policy credit_ledger_select_own_team
  on public.credit_ledger
  for select
  to authenticated
  using (public.is_team_member(team_id));
-- wallets: read-only for team members
drop policy if exists wallets_select_own_team on public.wallets;
create policy wallets_select_own_team
  on public.wallets
  for select
  to authenticated
  using (public.is_team_member(team_id));
-- team_members: allow members to view team membership rows for teams they belong to
drop policy if exists team_members_select_own_team on public.team_members;
create policy team_members_select_own_team
  on public.team_members
  for select
  to authenticated
  using (public.is_team_member(team_id));
-- teams: allow members to view teams they belong to
drop policy if exists teams_select_own_team on public.teams;
create policy teams_select_own_team
  on public.teams
  for select
  to authenticated
  using (public.is_team_member(id));
-- users: users can read/update their own profile row
drop policy if exists users_select_self on public.users;
drop policy if exists users_update_self on public.users;
create policy users_select_self
  on public.users
  for select
  to authenticated
  using (user_id = auth.uid());
create policy users_update_self
  on public.users
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- team_invites: team members can manage invites for their teams
drop policy if exists team_invites_select_own_team on public.team_invites;
drop policy if exists team_invites_insert_own_team on public.team_invites;
drop policy if exists team_invites_update_own_team on public.team_invites;
drop policy if exists team_invites_delete_own_team on public.team_invites;
create policy team_invites_select_own_team
  on public.team_invites
  for select
  to authenticated
  using (public.is_team_member(team_id));
create policy team_invites_insert_own_team
  on public.team_invites
  for insert
  to authenticated
  with check (public.is_team_member(team_id));
create policy team_invites_update_own_team
  on public.team_invites
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy team_invites_delete_own_team
  on public.team_invites
  for delete
  to authenticated
  using (public.is_team_member(team_id));
-- team_join_requests: requester or team members can view; team members can update
drop policy if exists team_join_requests_select on public.team_join_requests;
drop policy if exists team_join_requests_insert on public.team_join_requests;
drop policy if exists team_join_requests_update on public.team_join_requests;
create policy team_join_requests_select
  on public.team_join_requests
  for select
  to authenticated
  using (public.is_team_member(team_id) or requester_user_id = auth.uid());
create policy team_join_requests_insert
  on public.team_join_requests
  for insert
  to authenticated
  with check (requester_user_id = auth.uid());
create policy team_join_requests_update
  on public.team_join_requests
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
