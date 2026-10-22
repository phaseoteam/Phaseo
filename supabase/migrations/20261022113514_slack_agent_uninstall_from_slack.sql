SET local check_function_bodies = off;

-- Phaseo Slack agent: when the app is removed inside Slack, the Worker deletes the
-- installation's key, marks it uninstalled and removes its guardrail in one call.
-- phaseo:allow-destructive-migration reason: The only DELETEs are inside the function body. They run when Slack reports the app was removed, and remove that installation's own key_guardrails link and its guardrail when nothing else uses it. Creating the function deletes nothing.

CREATE OR REPLACE FUNCTION public.uninstall_slack_agent_from_slack (
  p_installation_id uuid,
  p_event           text,
  p_event_time      timestamptz
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_installation public.slack_installations%rowtype;
  v_now timestamptz := now();
begin
  if p_event is null or p_event not in ('app_uninstalled', 'tokens_revoked') then
    raise exception 'invalid_event' using errcode = '22023';
  end if;

  select * into v_installation
  from public.slack_installations installation
  where installation.id = p_installation_id
  for update;

  -- Slack retries events, so a second call finds nothing left to do. An event from
  -- before the current install (a retry arriving after a quick reinstall) is ignored.
  if not found or v_installation.status = 'uninstalled'
    or (p_event_time is not null and p_event_time < v_installation.installed_at) then
    return false;
  end if;

  -- The same order as web-api's uninstall. First the key, deleted as on the Keys
  -- page, so it can never authenticate again. The row stays for request history.
  if v_installation.key_id is not null then
    update public.keys
    set status = 'deleted', soft_blocked = true, expires_at = v_now, hash = 'deleted:' || v_installation.key_id::text
    where id = v_installation.key_id and workspace_id = v_installation.workspace_id;
  end if;

  -- Then the installation. The row stays for billing history.
  update public.slack_installations
  set status = 'uninstalled', uninstalled_at = v_now
  where id = v_installation.id;

  -- Then the guardrail, which protect_slack_agent_guardrail only lets go once the
  -- installation is uninstalled: unlinked from the key, and deleted unless an
  -- admin has given it to other keys or members.
  if v_installation.key_id is not null and v_installation.guardrail_id is not null then
    delete from public.key_guardrails
    where key_id = v_installation.key_id and guardrail_id = v_installation.guardrail_id;
    if not exists (select 1 from public.key_guardrails link where link.guardrail_id = v_installation.guardrail_id)
      and not exists (select 1 from public.workspace_member_guardrails member where member.guardrail_id = v_installation.guardrail_id) then
      delete from public.workspace_guardrails
      where id = v_installation.guardrail_id and workspace_id = v_installation.workspace_id;
    end if;
  end if;

  insert into public.workspace_audit_events (workspace_id, actor_user_id, action, target_type, target_id, target_name, metadata)
  values (
    v_installation.workspace_id, null, 'slack_agent.uninstalled_in_slack', 'slack_installation', v_installation.id::text,
    left(v_installation.team_name, 200),
    jsonb_build_object('event', p_event, 'team_id', v_installation.team_id, 'enterprise_id', v_installation.enterprise_id)
  );
  return true;
end;
$function$;

COMMENT ON FUNCTION "public"."uninstall_slack_agent_from_slack"(uuid, text, timestamptz) IS 'For the Slack Worker when the app is removed inside Slack (app_uninstalled) or its bot token is revoked (tokens_revoked): deletes the installation''s gateway key, marks it uninstalled, removes its guardrail and records slack_agent.uninstalled_in_slack, in one transaction. Returns false when there was nothing to do (already uninstalled, or the event predates the install).';

GRANT EXECUTE ON FUNCTION "public"."uninstall_slack_agent_from_slack"(uuid, text, timestamptz) TO "service_role";

REVOKE ALL ON FUNCTION "public"."uninstall_slack_agent_from_slack"(uuid, text, timestamptz) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."uninstall_slack_agent_from_slack"(uuid, text, timestamptz) TO "postgres";

REVOKE ALL ON FUNCTION "public"."uninstall_slack_agent_from_slack"(uuid, text, timestamptz) FROM PUBLIC, "anon", "authenticated";
