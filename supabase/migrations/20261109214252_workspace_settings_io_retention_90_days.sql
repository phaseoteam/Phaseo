SET LOCAL lock_timeout = '10s';

-- I/O log retention is held at 90 days until extended retention is billed: longer settings are
-- set to 90 (with a NOTICE giving the count) before the check is added, so existing rows pass it.
-- Locks only workspace_settings (row locks for the update, then ACCESS EXCLUSIVE for the check,
-- which scans its rows).
DO $normalize$
declare
  v_count integer;
begin
  update public.workspace_settings
  set io_logging_retention_days = 90
  where io_logging_retention_days is distinct from 90;
  get diagnostics v_count = row_count;
  raise notice 'io_logging_retention_days set to 90 on % workspace_settings row(s)', v_count;
end
$normalize$;

ALTER TABLE public.workspace_settings
  DROP CONSTRAINT IF EXISTS workspace_settings_io_logging_retention_days_check,
  ADD CONSTRAINT workspace_settings_io_logging_retention_days_check CHECK ((io_logging_retention_days = 90));
