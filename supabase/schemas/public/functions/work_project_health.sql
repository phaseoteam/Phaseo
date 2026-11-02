CREATE OR REPLACE FUNCTION public.work_project_health (
  p_workspace_id uuid
)
  RETURNS TABLE(project_id uuid, health text, updated_at timestamp with time zone)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Each project's current health: its newest update's.
select distinct on (update_row.project_id) update_row.project_id, update_row.health, update_row.created_at
from public.work_project_updates update_row
where update_row.workspace_id = p_workspace_id
order by update_row.project_id, update_row.created_at desc;
$function$;

COMMENT ON FUNCTION public.work_project_health(uuid) IS 'The newest project update''s health for each work project in a workspace. Service role only.';

REVOKE ALL ON FUNCTION public.work_project_health(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_project_health(uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_project_health(uuid) TO "service_role";
