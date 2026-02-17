create or replace function public.get_team_key_usage(
  p_team_id uuid,
  p_day_start timestamptz
)
returns table(
  key_id uuid,
  daily_request_count bigint,
  daily_cost_nanos bigint,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    gr.key_id,
    count(*) filter (where gr.created_at >= p_day_start)::bigint as daily_request_count,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= p_day_start), 0)::bigint as daily_cost_nanos,
    max(gr.created_at) as last_used_at
  from public.gateway_requests gr
  where gr.team_id = p_team_id
    and gr.key_id is not null
    and gr.success is true
    and public.is_team_member(p_team_id)
  group by gr.key_id;
$$;

grant execute on function public.get_team_key_usage(uuid, timestamptz) to authenticated;
