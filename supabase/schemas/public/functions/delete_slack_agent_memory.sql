CREATE OR REPLACE FUNCTION public.delete_slack_agent_memory()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Uninstalling, from Phaseo settings (web-api) or in Slack
  -- (uninstall_slack_agent_from_slack), deletes what the agent kept: its notes,
  -- pins and to-dos and its saved skills. As a trigger it runs in the transaction
  -- that marks the installation uninstalled, so neither path can leave them
  -- behind, and the save functions, which lock the installation row, wait for it.
  delete from public.slack_agent_notes note where note.installation_id = new.id;
  delete from public.slack_agent_skills skill where skill.installation_id = new.id;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."delete_slack_agent_memory"() IS 'Deletes a Slack agent installation''s notes and saved skills when it is marked uninstalled, whichever path uninstalls it.';

REVOKE ALL ON FUNCTION "public"."delete_slack_agent_memory"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_slack_agent_memory"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."delete_slack_agent_memory"() FROM PUBLIC, "anon", "authenticated";
