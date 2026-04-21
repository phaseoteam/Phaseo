-- Enable RLS and policies for workspace_settings

alter table public.workspace_settings enable row level security;
drop policy if exists workspace_settings_select_own_team on public.workspace_settings;
drop policy if exists workspace_settings_insert_own_team on public.workspace_settings;
drop policy if exists workspace_settings_update_own_team on public.workspace_settings;
create policy workspace_settings_select_own_team
  on public.workspace_settings
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workspace_settings_insert_own_team
  on public.workspace_settings
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));
create policy workspace_settings_update_own_team
  on public.workspace_settings
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
