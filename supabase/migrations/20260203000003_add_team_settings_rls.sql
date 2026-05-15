-- Enable RLS and policies for team_settings

alter table public.team_settings enable row level security;
drop policy if exists team_settings_select_own_team on public.team_settings;
drop policy if exists team_settings_insert_own_team on public.team_settings;
drop policy if exists team_settings_update_own_team on public.team_settings;
create policy team_settings_select_own_team
  on public.team_settings
  for select
  to authenticated
  using (public.is_team_member(team_id));
create policy team_settings_insert_own_team
  on public.team_settings
  for insert
  to authenticated
  with check (public.is_team_member(team_id));
create policy team_settings_update_own_team
  on public.team_settings
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
