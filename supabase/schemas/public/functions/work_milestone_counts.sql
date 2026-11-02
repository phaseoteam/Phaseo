CREATE OR REPLACE FUNCTION public.work_milestone_counts (
  p_workspace_id uuid,
  p_project_id   uuid
)
  RETURNS TABLE(milestone_id uuid, item_count integer, done_count integer)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Items per milestone of a project (cancelled items left out) and how many are done.
select item.milestone_id,
  count(*) filter (where item.state <> 'cancelled')::integer,
  count(*) filter (where item.state = 'done')::integer
from public.work_items item
join public.work_milestones milestone on milestone.id = item.milestone_id
where item.workspace_id = p_workspace_id and milestone.project_id = p_project_id
group by item.milestone_id;
$function$;

COMMENT ON FUNCTION public.work_milestone_counts(uuid, uuid) IS 'Item and done counts for each milestone of a work project. Service role only.';

REVOKE ALL ON FUNCTION public.work_milestone_counts(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_milestone_counts(uuid, uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_milestone_counts(uuid, uuid) TO "service_role";
