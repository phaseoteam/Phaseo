-- Track BYOK request counts per team/month to support monthly free tiers.

create table if not exists public.workspace_byok_monthly_usage (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month_start timestamptz not null,
  request_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, month_start)
);

create index if not exists workspace_byok_monthly_usage_month_start_idx
  on public.workspace_byok_monthly_usage (month_start);

create or replace function public.increment_workspace_byok_monthly_request_count(
  p_workspace_id uuid,
  p_now timestamptz default now()
)
returns table (
  month_start timestamptz,
  request_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month_start timestamptz;
begin
  if p_workspace_id is null then
    raise exception 'p_workspace_id is required';
  end if;

  v_month_start := (date_trunc('month', p_now at time zone 'UTC') at time zone 'UTC');

  insert into public.workspace_byok_monthly_usage as usage (
    workspace_id,
    month_start,
    request_count,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    v_month_start,
    1,
    now(),
    now()
  )
  on conflict (workspace_id, month_start)
  do update
    set request_count = usage.request_count + 1,
        updated_at = now();

  return query
  select u.month_start, u.request_count
  from public.workspace_byok_monthly_usage u
  where u.workspace_id = p_workspace_id
    and u.month_start = v_month_start;
end;
$$;

comment on function public.increment_workspace_byok_monthly_request_count(uuid, timestamptz) is
  'Atomically increments BYOK request count for team/month (UTC month boundary) and returns updated count.';
