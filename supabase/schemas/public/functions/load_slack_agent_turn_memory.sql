CREATE OR REPLACE FUNCTION public.load_slack_agent_turn_memory (
  p_installation_id uuid,
  p_channel_id      text,
  p_workspace_notes boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- What the Slack agent is shown of its memory on every turn: the conversation's
-- pins and, with p_workspace_notes, the whole Slack workspace's, newest first and
-- 10 of each at most, and the names and descriptions of the 20 saved skills
-- changed most recently, with how many there are. No pins while an admin has
-- turned the installation's memory off (memory_enabled), and none of the
-- workspace's for someone from another organisation (the Worker passes false).
-- Expired notes are deleted here first, so none outlasts its date by more than a
-- turn. Returns {pins: [{id, scope, text, created_at}], skills: [{name,
-- description}], skills_total}. Service role only.
declare
  v_memory_enabled boolean := coalesce((
    select installation.memory_enabled from public.slack_installations installation where installation.id = p_installation_id
  ), false);
begin
  delete from public.slack_agent_notes note
  where note.installation_id = p_installation_id and note.expires_at <= now();

  return jsonb_build_object(
    'pins', coalesce((
      select jsonb_agg(jsonb_build_object('id', pin.id, 'scope', pin.scope, 'text', pin.text, 'created_at', pin.created_at)
        order by pin.scope, pin.created_at desc, pin.id)
      from (
        (select note.id, 'channel'::text as scope, note.text, note.created_at
          from public.slack_agent_notes note
          where v_memory_enabled
            and note.installation_id = p_installation_id and note.kind = 'pin' and note.channel_id = p_channel_id
          order by note.created_at desc, note.id
          limit 10)
        union all
        (select note.id, 'workspace'::text, note.text, note.created_at
          from public.slack_agent_notes note
          where v_memory_enabled and coalesce(p_workspace_notes, false)
            and note.installation_id = p_installation_id and note.kind = 'pin' and note.channel_id is null
          order by note.created_at desc, note.id
          limit 10)
      ) pin
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('name', skill.name, 'description', skill.description) order by skill.updated_at desc, skill.name)
      from (
        select recent.name, recent.description, recent.updated_at
        from public.slack_agent_skills recent
        where recent.installation_id = p_installation_id
        order by recent.updated_at desc, recent.name
        limit 20
      ) skill
    ), '[]'::jsonb),
    'skills_total', (select count(*) from public.slack_agent_skills skill where skill.installation_id = p_installation_id)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text, boolean) IS 'For the Slack Worker on every turn: up to 10 of the conversation''s pins and, with p_workspace_notes, 10 of the Slack workspace''s (none while the installation''s memory is off), and the 20 most recently changed saved skills'' names and descriptions with the total. Deletes the installation''s expired notes first.';

GRANT EXECUTE ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."load_slack_agent_turn_memory"(uuid, text, boolean) FROM PUBLIC, "anon", "authenticated";
