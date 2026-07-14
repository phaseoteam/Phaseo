drop function if exists public.get_workspace_key_usage(uuid, timestamptz);
create or replace function public.get_workspace_key_usage(
  p_workspace_id uuid,
  p_day_start timestamptz
)
returns table(
  key_id uuid,
  daily_request_count bigint,
  weekly_request_count bigint,
  monthly_request_count bigint,
  daily_cost_nanos bigint,
  weekly_cost_nanos bigint,
  monthly_cost_nanos bigint,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      p_day_start as day_start,
      date_trunc('week', now() at time zone 'utc') as week_start,
      date_trunc('month', now() at time zone 'utc') as month_start
  )
  select
    gr.key_id,
    count(*) filter (where gr.created_at >= bounds.day_start)::bigint as daily_request_count,
    count(*) filter (where gr.created_at >= bounds.week_start)::bigint as weekly_request_count,
    count(*) filter (where gr.created_at >= bounds.month_start)::bigint as monthly_request_count,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= bounds.day_start), 0)::bigint as daily_cost_nanos,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= bounds.week_start), 0)::bigint as weekly_cost_nanos,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= bounds.month_start), 0)::bigint as monthly_cost_nanos,
    max(gr.created_at) as last_used_at
  from public.gateway_requests gr
  cross join bounds
  where gr.workspace_id = p_workspace_id
    and gr.key_id is not null
    and gr.success is true
    and public.is_workspace_member(p_workspace_id)
  group by gr.key_id;
$$;
grant execute on function public.get_workspace_key_usage(uuid, timestamptz) to authenticated;
