CREATE OR REPLACE FUNCTION public.save_slack_agent_skill (
  p_installation_id uuid,
  p_name            text,
  p_description     text,
  p_instructions    text,
  p_created_by      text,
  p_replace         boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The Slack agent's save_skill tool: saves instructions for a task people repeat,
-- under a name unique in the installation whatever its case. A skill with that
-- name is only overwritten with p_replace (it keeps who first saved it). An
-- installation keeps at most 100. Locks the installation row like
-- save_slack_agent_note, so the cap holds and uninstalling can't miss one.
-- Returns {status: saved | replaced | name_taken | full | not_installed, skill?,
-- limit?}, without the instructions. Service role only.
declare
  v_skill public.slack_agent_skills%rowtype;
  v_name text := btrim(p_name);
begin
  perform 1 from public.slack_installations installation
  where installation.id = p_installation_id and installation.status <> 'uninstalled'
  for no key update;
  if not found then
    return jsonb_build_object('status', 'not_installed');
  end if;

  select * into v_skill
  from public.slack_agent_skills skill
  where skill.installation_id = p_installation_id and lower(skill.name) = lower(v_name);
  if found then
    if not coalesce(p_replace, false) then
      return jsonb_build_object('status', 'name_taken', 'skill', jsonb_build_object('name', v_skill.name, 'description', v_skill.description));
    end if;
    update public.slack_agent_skills skill
    set name = v_name, description = btrim(p_description), instructions = btrim(p_instructions)
    where skill.id = v_skill.id
    returning * into v_skill;
    return jsonb_build_object('status', 'replaced', 'skill', to_jsonb(v_skill) - 'installation_id' - 'instructions');
  end if;

  if (select count(*) from public.slack_agent_skills skill where skill.installation_id = p_installation_id) >= 100 then
    return jsonb_build_object('status', 'full', 'limit', 100);
  end if;

  insert into public.slack_agent_skills (installation_id, name, description, instructions, created_by)
  values (p_installation_id, v_name, btrim(p_description), btrim(p_instructions), p_created_by)
  returning * into v_skill;
  return jsonb_build_object('status', 'saved', 'skill', to_jsonb(v_skill) - 'installation_id' - 'instructions');
end;
$function$;

COMMENT ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) IS 'For the Slack Worker''s save_skill tool: saves a named skill, at most 100 per installation, overwriting one with the same name only when asked to. Returns {status: saved | replaced | name_taken | full | not_installed, skill?, limit?}.';

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_skill"(uuid, text, text, text, text, boolean) FROM PUBLIC, "anon", "authenticated";
