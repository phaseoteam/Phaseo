CREATE OR REPLACE FUNCTION public.cancel_slack_agent_schedule (
  p_installation_id uuid,
  p_schedule_id     uuid,
  p_slack_user_id   text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The Slack agent's cancel_schedule tool: deletes one of the installation's
-- schedules for the person who set it up, or for someone whose Slack account is
-- linked to an owner or admin of the installation's Phaseo workspace. Returns
-- deleted, not_allowed or not_found. Service role only.
declare
  v_created_by text;
  v_workspace_id uuid;
begin
  select schedule.created_by, installation.workspace_id into v_created_by, v_workspace_id
  from public.slack_agent_schedules schedule
  join public.slack_installations installation on installation.id = schedule.installation_id
  where schedule.id = p_schedule_id and schedule.installation_id = p_installation_id
  for update of schedule;
  if not found then
    return 'not_found';
  end if;
  if v_created_by is distinct from p_slack_user_id and not exists (
    select 1
    from public.slack_user_links link
    where link.installation_id = p_installation_id and link.slack_user_id = p_slack_user_id
      and (
        exists (
          select 1 from public.workspace_members member
          where member.workspace_id = v_workspace_id and member.user_id = link.user_id and member.role in ('owner', 'admin')
        )
        or exists (
          select 1 from public.workspaces workspace
          where workspace.id = v_workspace_id and workspace.owner_user_id = link.user_id
        )
      )
  ) then
    return 'not_allowed';
  end if;
  delete from public.slack_agent_schedules schedule where schedule.id = p_schedule_id;
  return 'deleted';
end;
$function$;

COMMENT ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) IS 'For the Slack Worker''s cancel_schedule tool: deletes a schedule for its creator, or for a Slack person linked to an owner or admin of the workspace. Returns deleted, not_allowed or not_found.';

GRANT EXECUTE ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";
