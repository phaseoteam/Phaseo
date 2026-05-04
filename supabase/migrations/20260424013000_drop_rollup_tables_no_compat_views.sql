-- Disable rollup writers/schedules and remove rollup relations entirely.
-- Intentionally does not create replacement views.

do $$
declare
  v_job_name text;
  v_job_id int;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  foreach v_job_name in array array[
    'refresh-public-usage-rollups',
    'refresh-gateway-usage-rollups-15m',
    'refresh-gateway-usage-rollups-nightly-catchup',
    'refresh-gateway-usage-rollups-team-15m',
    'refresh-gateway-usage-rollups-team-nightly-catchup'
  ]
  loop
    select jobid into v_job_id
    from cron.job
    where jobname = v_job_name
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  end loop;
exception
  when others then
    null;
end $$;
drop function if exists public.refresh_gateway_usage_rollups(timestamptz);
drop function if exists public.refresh_gateway_usage_rollups_workspace_scope(timestamptz);
drop function if exists public.refresh_gateway_activity_rollup_daily(uuid, timestamptz, timestamptz);
drop function if exists public.apply_workspace_usage_rollup_delta(
  timestamptz,
  uuid,
  uuid,
  text,
  text,
  bigint,
  bigint,
  bigint,
  bigint,
  numeric,
  bigint,
  numeric,
  bigint
);
drop function if exists public.upsert_gateway_request_into_workspace_usage_rollup(uuid, timestamptz, uuid);
create or replace function public.refresh_gateway_usage_rollups(
  p_since timestamptz default now() - interval '3 hours'
)
returns void
language plpgsql
as $$
begin
  -- Rollup refresh disabled intentionally.
  return;
end;
$$;
create or replace function public.refresh_gateway_usage_rollups_workspace_scope(
  p_since timestamptz default now() - interval '3 hours'
)
returns void
language plpgsql
as $$
begin
  -- Rollup refresh disabled intentionally.
  return;
end;
$$;
create or replace function public.refresh_gateway_activity_rollup_daily(
  p_workspace_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rollup refresh disabled intentionally.
  return;
end;
$$;
create or replace function public.apply_workspace_usage_rollup_delta(
  p_bucket_15m timestamptz,
  p_workspace_id uuid,
  p_key_id uuid,
  p_provider text,
  p_canonical_model_id text,
  p_requests bigint,
  p_success_requests bigint,
  p_total_tokens bigint,
  p_total_cost_nanos bigint,
  p_latency_sum_ms numeric,
  p_latency_samples bigint,
  p_throughput_sum numeric,
  p_throughput_samples bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rollup writes disabled intentionally.
  return;
end;
$$;
create or replace function public.upsert_gateway_request_into_workspace_usage_rollup(
  p_request_row_id uuid,
  p_request_created_at timestamptz,
  p_workspace_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rollup writes disabled intentionally.
  return false;
end;
$$;
do $$
declare
  v_name text;
  v_relkind "char";
begin
  foreach v_name in array array[
    'gateway_usage_rollup_15m_team_provider_model',
    'gateway_usage_rollup_15m_workspace_provider_model',
    'gateway_usage_rollup_15m_model_provider',
    'gateway_usage_rollup_15m_app_model',
    'gateway_usage_rollup_15m_provider_app',
    'gateway_usage_rollup_daily_app_model',
    'gateway_usage_rollup_daily_app',
    'gateway_activity_rollup_daily',
    'gateway_usage_rollup_workspace_request_state',
    'gateway_usage_rollup_team_request_state'
  ]
  loop
    select c.relkind
    into v_relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_name
    limit 1;

    if v_relkind is null then
      continue;
    end if;

    if v_relkind in ('r', 'p') then
      execute format('drop table public.%I cascade', v_name);
    elsif v_relkind = 'v' then
      execute format('drop view public.%I cascade', v_name);
    elsif v_relkind = 'm' then
      execute format('drop materialized view public.%I cascade', v_name);
    else
      execute format('drop table public.%I cascade', v_name);
    end if;
  end loop;
end $$;
