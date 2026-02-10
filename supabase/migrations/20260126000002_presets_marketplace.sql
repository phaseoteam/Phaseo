-- =========================
-- presets marketplace: forks + public read access
-- =========================

alter table public.presets
  add column if not exists source_preset_id uuid null;
alter table public.presets
  add constraint presets_source_preset_id_fkey
  foreign key (source_preset_id)
  references public.presets (id)
  on delete set null;
create index if not exists presets_source_preset_id_idx
  on public.presets (source_preset_id);
-- Allow unauthenticated users to read public presets
drop policy if exists presets_select_public_anon on public.presets;
create policy presets_select_public_anon
  on public.presets
  for select
  to anon
  using (visibility = 'public');
