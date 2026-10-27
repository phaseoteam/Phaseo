CREATE OR REPLACE FUNCTION public.save_slack_agent_schedule (
  p_installation_id uuid,
  p_channel_id      text,
  p_title           text,
  p_prompt          text,
  p_frequency       text,
  p_hour            integer,
  p_minute          integer,
  p_day_of_week     integer,
  p_day_of_month    integer,
  p_timezone        text,
  p_created_by      text,
  p_creation_key    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The Slack agent's schedule_task tool: saves a recurring task for one
-- conversation, which first runs at the next matching local time. Only while the
-- installation's admins allow recurring tasks (schedules_enabled), only for
-- someone who linked their Phaseo account when they allow only that
-- (schedule_creators linked), and at most schedules_max (20 by default) per
-- installation. Hourly is the finest frequency, so nothing runs more often.
-- Locks the installation row like the memory functions, so the cap holds and
-- uninstalling, which deletes every schedule, can't miss one.
-- p_creation_key keys what the tool call sets up (its Slack event, the answer's
-- part, and a digest of the conversation, title and timing): saving again with
-- the same key, as a retried Workflow step does, returns the schedule saved the
-- first time and saves nothing.
-- Returns {status: saved | full | off | link_required | not_installed,
-- schedule?, limit?}. Service role only.
declare
  v_installation public.slack_installations%rowtype;
  v_schedule public.slack_agent_schedules%rowtype;
begin
  select * into v_installation
  from public.slack_installations installation
  where installation.id = p_installation_id and installation.status <> 'uninstalled'
  for no key update;
  if not found then
    return jsonb_build_object('status', 'not_installed');
  end if;
  select * into v_schedule
  from public.slack_agent_schedules schedule
  where schedule.installation_id = p_installation_id and schedule.creation_key = p_creation_key;
  if found then
    return jsonb_build_object('status', 'saved', 'schedule', to_jsonb(v_schedule) - 'installation_id');
  end if;
  if not v_installation.schedules_enabled then
    return jsonb_build_object('status', 'off');
  end if;
  if v_installation.schedule_creators = 'linked' and not exists (
    select 1 from public.slack_user_links link
    where link.installation_id = p_installation_id and link.slack_user_id = p_created_by
  ) then
    return jsonb_build_object('status', 'link_required');
  end if;
  if (select count(*) from public.slack_agent_schedules schedule where schedule.installation_id = p_installation_id) >= v_installation.schedules_max then
    return jsonb_build_object('status', 'full', 'limit', v_installation.schedules_max);
  end if;

  insert into public.slack_agent_schedules (
    installation_id, channel_id, title, prompt, frequency, hour, minute, day_of_week, day_of_month, timezone, created_by, creation_key, next_run_at
  )
  values (
    p_installation_id, p_channel_id, btrim(p_title), btrim(p_prompt), p_frequency, p_hour, p_minute, p_day_of_week, p_day_of_month, p_timezone, p_created_by, p_creation_key,
    public.slack_agent_schedule_next_run(p_frequency, p_hour, p_minute, p_day_of_week, p_day_of_month, p_timezone, now())
  )
  returning * into v_schedule;
  return jsonb_build_object('status', 'saved', 'schedule', to_jsonb(v_schedule) - 'installation_id');
end;
$function$;

COMMENT ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) IS 'For the Slack Worker''s schedule_task tool: saves a recurring task, at most schedules_max per installation, while recurring tasks are on and the creator may set them up; a repeat with the same p_creation_key returns the one already saved. Returns {status: saved | full | off | link_required | not_installed, schedule?, limit?}.';

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) FROM PUBLIC, "anon", "authenticated";
