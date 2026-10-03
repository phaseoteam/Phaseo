-- Server-only aggregate; the web API verifies owner/admin access before calling.
create function public.get_workspace_user_usage(p_workspace_id uuid, p_user_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if p_workspace_id is null or p_user_id is null or p_from is null or p_to is null
     or p_to <= p_from or p_to - p_from > interval '31 days' then
    raise exception 'invalid usage window' using errcode = '22023';
  end if;
  with base as materialized (
    select gr.created_at, coalesce(nullif(gr.canonical_model_id, ''), nullif(gr.model_id, ''), 'unknown') as model_id,
           coalesce(gr.cost_nanos, 0)::numeric as cost_nanos
    from private.v2_rpc_gateway_requests_compat gr
    join public.keys k on k.id = gr.key_id and k.workspace_id = gr.workspace_id
    where gr.workspace_id = p_workspace_id and k.created_by = p_user_id
      and gr.success is true and gr.created_at >= p_from and gr.created_at < p_to
  ), daily as (
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as date,
           count(*) as requests, sum(cost_nanos) / 1e9 as "spendUsd"
    from base group by 1
  ), models as (
    select model_id as "modelId", count(*) as requests, sum(cost_nanos) / 1e9 as "spendUsd"
    from base group by model_id order by count(*) desc, model_id limit 10
  )
  select jsonb_build_object(
    'requests', (select count(*) from base),
    'spendUsd', coalesce((select sum(cost_nanos) / 1e9 from base), 0),
    'points', coalesce((select jsonb_agg(to_jsonb(daily) order by date) from daily), '[]'::jsonb),
    'models', coalesce((select jsonb_agg(to_jsonb(models) order by requests desc, "modelId") from models), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_workspace_user_usage(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_workspace_user_usage(uuid, uuid, timestamptz, timestamptz) to service_role;
notify pgrst, 'reload schema';
