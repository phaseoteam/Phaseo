CREATE OR REPLACE FUNCTION public.delete_slack_agent_schedules()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Uninstalling, from Phaseo settings (web-api) or in Slack
  -- (uninstall_slack_agent_from_slack), deletes the installation's recurring
  -- tasks in the transaction that marks it uninstalled, like its memory
  -- (delete_slack_agent_memory). save_slack_agent_schedule locks the installation
  -- row, so a schedule being saved waits for this and then finds no installation.
  delete from public.slack_agent_schedules schedule where schedule.installation_id = new.id;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."delete_slack_agent_schedules"() IS 'Deletes a Slack agent installation''s recurring tasks when it is marked uninstalled, whichever path uninstalls it.';

REVOKE ALL ON FUNCTION "public"."delete_slack_agent_schedules"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_slack_agent_schedules"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."delete_slack_agent_schedules"() FROM PUBLIC, "anon", "authenticated";
