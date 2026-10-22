CREATE OR REPLACE FUNCTION public.protect_slack_agent_guardrail()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Deletes cascading from a deleted key or workspace are allowed: they leave the
  -- installation without a working key, so nothing can run unguarded.
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_table_name = 'workspace_guardrails' then
    -- Renaming or other edits are fine while every privacy switch stays off.
    if tg_op = 'UPDATE' and new.enabled
      and not new.privacy_enable_paid_may_train and not new.privacy_enable_free_may_train
      and not new.privacy_enable_free_may_publish_prompts and not new.privacy_enable_input_output_logging then
      return new;
    end if;
    if exists (
      select 1 from public.slack_installations installation
      where installation.guardrail_id = old.id and installation.status <> 'uninstalled'
    ) then
      raise exception 'slack_agent_guardrail_protected'
        using errcode = '23514',
          detail = 'This guardrail keeps Slack data out of training and logs. Uninstall the Slack agent to change or remove it.';
    end if;
  else
    if tg_op = 'UPDATE' and new.key_id = old.key_id and new.guardrail_id = old.guardrail_id then
      return new;
    end if;
    if exists (
      select 1 from public.slack_installations installation
      where installation.key_id = old.key_id and installation.guardrail_id = old.guardrail_id
        and installation.status <> 'uninstalled'
    ) then
      raise exception 'slack_agent_guardrail_protected'
        using errcode = '23514',
          detail = 'This guardrail keeps Slack data out of training and logs. Uninstall the Slack agent to change or remove it.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_slack_agent_guardrail"() IS 'Keeps a live Slack agent installation''s privacy guardrail in force: it cannot be deleted, disabled, have a privacy switch turned back on, or be detached from the installation''s key until the agent is uninstalled.';

REVOKE ALL ON FUNCTION "public"."protect_slack_agent_guardrail"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_slack_agent_guardrail"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_slack_agent_guardrail"() FROM PUBLIC, "anon", "authenticated";
