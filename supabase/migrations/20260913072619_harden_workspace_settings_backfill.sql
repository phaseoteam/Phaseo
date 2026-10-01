-- The initial repair migration is already applied in production. Lock the
-- workspace table while re-running the backfill so legacy rows are repaired
-- without a concurrent insert bypassing the settings invariant.
lock table public.workspaces in share row exclusive mode;

insert into public.workspace_settings (workspace_id)
select w.id
from public.workspaces w
where not exists (
  select 1
  from public.workspace_settings ws
  where ws.workspace_id = w.id
)
on conflict (workspace_id) do nothing;
