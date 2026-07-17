-- Apply the batch request lifecycle constraint to databases where the
-- foundation migration has already run.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gateway_batch_requests'::regclass
      and conname = 'gateway_batch_requests_status_check'
  ) then
    alter table public.gateway_batch_requests
      add constraint gateway_batch_requests_status_check
      check (status in ('queued', 'validating', 'in_progress', 'completed', 'failed', 'cancelled', 'expired'))
      not valid;
  end if;
end
$$;

alter table public.gateway_batch_requests
  validate constraint gateway_batch_requests_status_check;
