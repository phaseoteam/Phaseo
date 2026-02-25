-- Ensure gateway_requests partitions stay one month ahead.

create or replace function public.ensure_gateway_requests_partitions(months_ahead integer default 1)
returns void
language plpgsql
as $$
declare
  v_cur_month timestamptz;
  v_last_month timestamptz;
  v_partition_name text;
begin
  if months_ahead is null or months_ahead < 0 then
    raise exception 'months_ahead must be >= 0';
  end if;

  v_cur_month := date_trunc('month', now());
  v_last_month := v_cur_month + make_interval(months => months_ahead);

  while v_cur_month <= v_last_month loop
    v_partition_name := format('gateway_requests_%s', to_char(v_cur_month, 'YYYY_MM'));
    execute format(
      'create table if not exists public.%I partition of public.gateway_requests for values from (%L) to (%L)',
      v_partition_name,
      v_cur_month,
      v_cur_month + interval '1 month'
    );
    v_cur_month := v_cur_month + interval '1 month';
  end loop;
end;
$$;

comment on function public.ensure_gateway_requests_partitions(integer) is
  'Creates current and future monthly partitions for gateway_requests up to months_ahead.';

-- Create/repair current + next month immediately.
select public.ensure_gateway_requests_partitions(1);

create extension if not exists pg_cron with schema extensions;

-- Ensure idempotent weekly schedule.
do $$
declare
  v_job_id int;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'ensure-gateway-requests-partitions'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
exception
  when others then
    -- best-effort: ignore if cron schema isn't ready or job doesn't exist
    null;
end $$;

-- Weekly Monday run at 03:00 UTC; keeps next month partition ready before month change.
select cron.schedule(
  'ensure-gateway-requests-partitions',
  '0 3 * * 1',
  $$select public.ensure_gateway_requests_partitions(1);$$
);
