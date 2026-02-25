-- =========================
-- Extend async operations to include music jobs
-- =========================

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'gateway_async_operations'
    and c.contype = 'c'
    and (
      c.conname = 'gateway_async_operations_kind_check'
      or pg_get_constraintdef(c.oid) ilike '%kind in%'
    )
  loop
    execute format('alter table public.gateway_async_operations drop constraint %I', rec.conname);
  end loop;

  execute '
    alter table public.gateway_async_operations
      add constraint gateway_async_operations_kind_check
      check (kind in (''video'', ''batch'', ''music''))
  ';
end $$;

comment on table public.gateway_async_operations is
  'Team-scoped registry for long-running operations (video, batch, music) with ownership and billing markers.';
