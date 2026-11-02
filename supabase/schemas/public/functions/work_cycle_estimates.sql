CREATE OR REPLACE FUNCTION public.work_cycle_estimates (
  p_workspace_id uuid,
  p_cycle_id     uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- A cycle's estimate totals: scope (every item but cancelled) and completed (done items), with
-- items without an estimate counted as zero.
select jsonb_build_object(
  'scope', coalesce(sum(item.estimate) filter (where item.state <> 'cancelled'), 0),
  'completed', coalesce(sum(item.estimate) filter (where item.state = 'done'), 0)
)
from public.work_items item
where item.workspace_id = p_workspace_id and item.cycle_id = p_cycle_id;
$function$;

COMMENT ON FUNCTION public.work_cycle_estimates(uuid, uuid) IS 'Estimate totals (scope and completed) for one work cycle. Service role only.';

REVOKE ALL ON FUNCTION public.work_cycle_estimates(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_cycle_estimates(uuid, uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_cycle_estimates(uuid, uuid) TO "service_role";
