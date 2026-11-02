CREATE OR REPLACE FUNCTION public.work_insights (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The work tracker's insights for one workspace and period, aggregated here so callers never add
-- up rows: items created and closed per UTC day (created split by source), open items by state and
-- by priority, open items past their SLA, stalled open items (no activity for the workspace's
-- stall_days), the median and 90th percentile hours from creation to close, and agent runs by agent
-- with their cost. Days without items are omitted.
with settings as (
  select coalesce((select stall_days from public.work_settings where workspace_id = p_workspace_id), 7) as stall_days
),
created as (
  select date_trunc('day', item.created_at at time zone 'UTC')::date as day, item.source, count(*)::integer as items
  from public.work_items item
  where item.workspace_id = p_workspace_id and item.created_at >= p_from and item.created_at < p_to
  group by 1, 2
),
closed as (
  select date_trunc('day', item.closed_at at time zone 'UTC')::date as day, count(*)::integer as items,
    count(*) filter (where item.state = 'done')::integer as done
  from public.work_items item
  where item.workspace_id = p_workspace_id and item.closed_at >= p_from and item.closed_at < p_to
  group by 1
),
open_items as (
  select item.state, item.priority, item.sla_due_at, item.last_activity_at
  from public.work_items item
  where item.workspace_id = p_workspace_id and item.closed_at is null and item.state not in ('done', 'cancelled')
),
durations as (
  select extract(epoch from (item.closed_at - item.created_at)) / 3600 as hours
  from public.work_items item
  where item.workspace_id = p_workspace_id and item.state = 'done' and item.closed_at >= p_from and item.closed_at < p_to
),
runs as (
  select run.agent, count(*)::integer as runs, count(*) filter (where run.status = 'succeeded')::integer as succeeded,
    coalesce(sum(run.cost_nanos), 0)::bigint as cost_nanos
  from public.work_agent_runs run
  where run.workspace_id = p_workspace_id and run.created_at >= p_from and run.created_at < p_to
  group by 1
)
select jsonb_build_object(
  'created', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'source', source, 'items', items) order by day, source) from created), '[]'::jsonb),
  'closed', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'items', items, 'done', done) order by day) from closed), '[]'::jsonb),
  'open_by_state', coalesce((select jsonb_object_agg(state, items) from (select state, count(*)::integer as items from open_items group by 1) by_state), '{}'::jsonb),
  'open_by_priority', coalesce((select jsonb_object_agg(priority::text, items) from (select priority, count(*)::integer as items from open_items group by 1) by_priority), '{}'::jsonb),
  'open_past_sla', (select count(*)::integer from open_items where sla_due_at is not null and sla_due_at < now()),
  'open_stalled', (select count(*)::integer from open_items, settings where last_activity_at < now() - make_interval(days => settings.stall_days)),
  'close_hours_p50', (select round((percentile_cont(0.5) within group (order by hours))::numeric, 1) from durations),
  'close_hours_p90', (select round((percentile_cont(0.9) within group (order by hours))::numeric, 1) from durations),
  'runs', coalesce((select jsonb_agg(jsonb_build_object('agent', agent, 'runs', runs, 'succeeded', succeeded, 'cost_nanos', cost_nanos) order by agent) from runs), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION public.work_insights(uuid, timestamp with time zone, timestamp with time zone) IS 'Aggregated work tracker insights for a workspace and period. Service role only; called by the web-api insights route after a membership check.';

REVOKE ALL ON FUNCTION public.work_insights(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_insights(uuid, timestamp with time zone, timestamp with time zone) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_insights(uuid, timestamp with time zone, timestamp with time zone) TO "service_role";
