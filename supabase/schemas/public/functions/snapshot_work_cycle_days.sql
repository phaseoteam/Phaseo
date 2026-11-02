CREATE OR REPLACE FUNCTION public.snapshot_work_cycle_days (
  p_day          date,
  p_workspace_id uuid DEFAULT NULL,
  p_cycle_id     uuid DEFAULT NULL
)
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records each cycle running on p_day (starts_on <= p_day <= ends_on): its scope (estimates of
-- every item but cancelled), completed (estimates of done items) and item counts, replacing any
-- earlier snapshot that day. Optionally one workspace or one cycle. Returns the cycles recorded.
with totals as (
  insert into public.work_cycle_days as day_row (cycle_id, workspace_id, day, scope, completed, item_count, done_count, recorded_at)
  select
    cycle.id,
    cycle.workspace_id,
    p_day,
    coalesce(sum(item.estimate) filter (where item.state <> 'cancelled'), 0),
    coalesce(sum(item.estimate) filter (where item.state = 'done'), 0),
    count(item.id) filter (where item.state <> 'cancelled')::integer,
    count(item.id) filter (where item.state = 'done')::integer,
    now()
  from public.work_cycles cycle
  left join public.work_items item on item.workspace_id = cycle.workspace_id and item.cycle_id = cycle.id
  where cycle.starts_on <= p_day and cycle.ends_on >= p_day
    and (p_workspace_id is null or cycle.workspace_id = p_workspace_id)
    and (p_cycle_id is null or cycle.id = p_cycle_id)
  group by cycle.id, cycle.workspace_id
  on conflict (cycle_id, day) do update set
    scope = excluded.scope,
    completed = excluded.completed,
    item_count = excluded.item_count,
    done_count = excluded.done_count,
    recorded_at = excluded.recorded_at
  returning 1
)
select count(*)::integer from totals;
$function$;

COMMENT ON FUNCTION public.snapshot_work_cycle_days(date, uuid, uuid) IS 'Records the day''s totals for every work cycle running on that day (or one workspace''s, or one cycle''s), for burn-up charts. Service role only.';

REVOKE ALL ON FUNCTION public.snapshot_work_cycle_days(date, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.snapshot_work_cycle_days(date, uuid, uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.snapshot_work_cycle_days(date, uuid, uuid) TO "service_role";
