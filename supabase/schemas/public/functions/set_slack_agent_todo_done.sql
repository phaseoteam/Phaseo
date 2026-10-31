CREATE OR REPLACE FUNCTION public.set_slack_agent_todo_done (
  p_installation_id uuid,
  p_channel_id      text,
  p_workspace_notes boolean,
  p_note_id         uuid,
  p_done            boolean
)
  RETURNS SETOF public.slack_agent_notes
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  -- The Slack agent's update_todo tool: marks a to-do done or not done. Only a
  -- to-do the conversation can see (its own or, with p_workspace_notes, the whole
  -- Slack workspace's) that hasn't expired, while the installation's memory is
  -- on; no row when there is none. Marking a done to-do done again keeps when it
  -- was done. Service role only.
  update public.slack_agent_notes note
  set done_at = case when coalesce(p_done, false) then coalesce(note.done_at, now()) end
  from public.slack_installations installation
  where note.id = p_note_id
    and note.installation_id = p_installation_id
    and installation.id = note.installation_id and installation.memory_enabled
    and note.kind = 'todo'
    and (note.channel_id = p_channel_id or (note.channel_id is null and coalesce(p_workspace_notes, false)))
    and (note.expires_at is null or note.expires_at > now())
  returning note.*;
$function$;

COMMENT ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, boolean, uuid, boolean) IS 'For the Slack Worker''s update_todo tool: marks a to-do the conversation can see (the workspace''s only with p_workspace_notes) done or not done, while the installation''s memory is on. Returns the to-do, or no row when there is none.';

GRANT EXECUTE ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, boolean, uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, boolean, uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, boolean, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_slack_agent_todo_done"(uuid, text, boolean, uuid, boolean) FROM PUBLIC, "anon", "authenticated";
