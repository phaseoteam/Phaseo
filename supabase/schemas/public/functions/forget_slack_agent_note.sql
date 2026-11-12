CREATE OR REPLACE FUNCTION public.forget_slack_agent_note (
  p_installation_id uuid,
  p_channel_id      text,
  p_workspace_notes boolean,
  p_note_id         uuid
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  -- The Slack agent's forget tool: deletes one note, pin or to-do the conversation
  -- can see (its own or, with p_workspace_notes, the whole Slack workspace's),
  -- while the installation's memory is on. False when there was none. Service
  -- role only.
  with deleted as (
    delete from public.slack_agent_notes note
    using public.slack_installations installation
    where note.id = p_note_id
      and note.installation_id = p_installation_id
      and installation.id = note.installation_id and installation.memory_enabled
      and (note.channel_id = p_channel_id or (note.channel_id is null and coalesce(p_workspace_notes, false)))
    returning note.id
  )
  select exists (select 1 from deleted);
$function$;

COMMENT ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, boolean, uuid) IS 'For the Slack Worker''s forget tool: deletes one note the conversation can see (the workspace''s only with p_workspace_notes), while the installation''s memory is on. Returns whether there was one.';

GRANT EXECUTE ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, boolean, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, boolean, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, boolean, uuid) FROM PUBLIC, "anon", "authenticated";
