CREATE OR REPLACE FUNCTION public.record_work_error_event (
  p_project_id     uuid,
  p_fingerprint    text,
  p_exception_type text,
  p_message        text,
  p_culprit        text DEFAULT NULL::text,
  p_release        text DEFAULT NULL::text,
  p_environment    text DEFAULT NULL::text,
  p_event          jsonb DEFAULT '{}'::jsonb,
  p_seen_at        timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Counts one error event against its group, creating the group on first sight. A resolved group
-- that sees a new event is reopened; an ignored group stays ignored. Returns
-- { group_id, workspace_id, is_new, reopened, status, work_item_id, event_count }, or null when the
-- project is unknown or disabled. The caller decides whether a new or reopened group gets a work item.
declare
  v_project public.work_error_projects;
  v_group public.work_error_groups;
  v_previous_status text;
  v_is_new boolean;
begin
  select * into v_project from public.work_error_projects project
  where project.id = p_project_id and project.enabled;
  if v_project.id is null then
    return null;
  end if;

  select error_group.status into v_previous_status from public.work_error_groups error_group
  where error_group.project_id = p_project_id and error_group.fingerprint = p_fingerprint;
  v_is_new := v_previous_status is null;

  insert into public.work_error_groups as error_group (
    workspace_id, project_id, fingerprint, exception_type, message, culprit, status, event_count,
    first_seen_at, last_seen_at, last_release, last_environment, last_event
  ) values (
    v_project.workspace_id, p_project_id, p_fingerprint, left(p_exception_type, 200), left(coalesce(p_message, ''), 2000),
    left(p_culprit, 500), 'open', 1, p_seen_at, p_seen_at, left(p_release, 200), left(p_environment, 100),
    coalesce(p_event, '{}'::jsonb)
  )
  on conflict (project_id, fingerprint) do update set
    event_count = error_group.event_count + 1,
    last_seen_at = greatest(error_group.last_seen_at, excluded.last_seen_at),
    message = excluded.message,
    culprit = coalesce(excluded.culprit, error_group.culprit),
    last_release = coalesce(excluded.last_release, error_group.last_release),
    last_environment = coalesce(excluded.last_environment, error_group.last_environment),
    last_event = excluded.last_event,
    status = case when error_group.status = 'resolved' then 'open' else error_group.status end,
    resolved_at = case when error_group.status = 'resolved' then null else error_group.resolved_at end
  returning * into v_group;

  update public.work_error_projects project set last_event_at = p_seen_at
  where project.id = p_project_id and (project.last_event_at is null or project.last_event_at < p_seen_at - interval '1 minute');

  return jsonb_build_object(
    'group_id', v_group.id,
    'workspace_id', v_group.workspace_id,
    'is_new', v_is_new,
    'reopened', coalesce(v_previous_status = 'resolved', false),
    'status', v_group.status,
    'work_item_id', v_group.work_item_id,
    'event_count', v_group.event_count,
    'auto_triage', v_project.auto_triage,
    'github_repo', v_project.github_repo
  );
end;
$function$;

COMMENT ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone) IS 'Counts one error event against its group (creating or reopening it). Service role only; called by the web-api error ingest route.';

REVOKE ALL ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone) TO "service_role";
