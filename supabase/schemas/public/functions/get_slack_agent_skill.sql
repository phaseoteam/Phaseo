CREATE OR REPLACE FUNCTION public.get_slack_agent_skill (
  p_installation_id uuid,
  p_name            text
)
  RETURNS SETOF public.slack_agent_skills
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The Slack agent's use_skill tool: a saved skill by name, whatever its case.
  -- No row when there is none. Service role only.
  select skill.*
  from public.slack_agent_skills skill
  where skill.installation_id = p_installation_id and lower(skill.name) = lower(btrim(p_name))
  limit 1;
$function$;

COMMENT ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) IS 'For the Slack Worker''s use_skill tool: one saved skill by name, case-insensitively, or no row.';

GRANT EXECUTE ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_slack_agent_skill"(uuid, text) FROM PUBLIC, "anon", "authenticated";
