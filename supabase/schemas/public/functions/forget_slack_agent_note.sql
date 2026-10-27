CREATE OR REPLACE FUNCTION public.forget_slack_agent_note (
  p_installation_id uuid,
  p_channel_id      text,
  p_note_id         uuid
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  -- The Slack agent's forget tool: deletes one note, pin or to-do the conversation
  -- can see (its own or the whole Slack workspace's). False when there was none.
  -- Service role only.
  with deleted as (
    delete from public.slack_agent_notes note
    where note.id = p_note_id
      and note.installation_id = p_installation_id
      and (note.channel_id is null or note.channel_id = p_channel_id)
    returning note.id
  )
  select exists (select 1 from deleted);
$function$;

COMMENT ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) IS 'For the Slack Worker''s forget tool: deletes one note the conversation can see. Returns whether there was one.';

GRANT EXECUTE ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."forget_slack_agent_note"(uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";
