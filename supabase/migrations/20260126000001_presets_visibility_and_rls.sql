-- =========================
-- presets visibility + updated RLS
-- =========================

alter table public.presets
  add column if not exists visibility text not null default 'team';
alter table public.presets
  add constraint presets_visibility_check
  check (visibility in ('private', 'team', 'public'));
create index if not exists presets_visibility_idx
  on public.presets (visibility);
create index if not exists presets_created_by_idx
  on public.presets (created_by);
-- Update RLS policies to support private/team/public presets
drop policy if exists presets_select_own_team on public.presets;
drop policy if exists presets_insert_own_team on public.presets;
drop policy if exists presets_update_own_team on public.presets;
drop policy if exists presets_delete_own_team on public.presets;
drop policy if exists presets_select_visible on public.presets;
drop policy if exists presets_insert_owned on public.presets;
drop policy if exists presets_update_owned on public.presets;
drop policy if exists presets_delete_owned on public.presets;
create policy presets_select_visible
  on public.presets
  for select
  to authenticated
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or (visibility = 'team' and public.is_team_member(team_id))
  );
create policy presets_insert_owned
  on public.presets
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_team_member(team_id)
    and visibility in ('private', 'team', 'public')
  );
create policy presets_update_owned
  on public.presets
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
create policy presets_delete_owned
  on public.presets
  for delete
  to authenticated
  using (created_by = auth.uid());
