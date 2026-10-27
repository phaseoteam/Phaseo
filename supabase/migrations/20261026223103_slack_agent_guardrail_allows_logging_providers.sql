SET local check_function_bodies = off;

-- The Slack agent's guardrail turned off providers that keep logs, which left most
-- models (all OpenAI and Anthropic ones among them) with no eligible route. Slack's
-- terms forbid training on Slack data, so training and prompt publishing stay off and
-- stay protected; providers that keep logs but don't train are allowed. Phaseo itself
-- still stores no content for the agent's key (never_store_content).

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
    -- Renaming or other edits are fine while training and prompt publishing stay off.
    -- Providers that keep logs may serve the agent: they don't train on it, and
    -- Phaseo stores no content for its key (never_store_content).
    if tg_op = 'UPDATE' and new.enabled
      and not new.privacy_enable_paid_may_train and not new.privacy_enable_free_may_train
      and not new.privacy_enable_free_may_publish_prompts then
      return new;
    end if;
    if exists (
      select 1 from public.slack_installations installation
      where installation.guardrail_id = old.id and installation.status <> 'uninstalled'
    ) then
      raise exception 'slack_agent_guardrail_protected'
        using errcode = '23514',
          detail = 'This guardrail keeps Slack data out of training and prompt publishing. Uninstall the Slack agent to change or remove it.';
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
          detail = 'This guardrail keeps Slack data out of training and prompt publishing. Uninstall the Slack agent to change or remove it.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_slack_agent_guardrail"() IS 'Keeps a live Slack agent installation''s privacy guardrail in force: it cannot be deleted, disabled, have training or prompt publishing turned back on, or be detached from the installation''s key until the agent is uninstalled.';

REVOKE ALL ON FUNCTION "public"."protect_slack_agent_guardrail"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_slack_agent_guardrail"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_slack_agent_guardrail"() FROM PUBLIC, "anon", "authenticated";

-- Live installations' guardrails allow logging providers too, and the description
-- the install wrote says what is off now. The trigger above is replaced first, so
-- it accepts this change.
UPDATE public.workspace_guardrails guardrail
SET privacy_enable_input_output_logging = true,
  description = CASE
    WHEN guardrail.description = 'Managed by the Slack agent. Slack''s API terms do not allow training on Slack data or keeping it, so training, prompt publishing and providers that log prompts are off.'
      THEN 'Managed by the Slack agent. Slack''s API terms do not allow training on Slack data, so training and prompt publishing are off.'
    ELSE guardrail.description
  END,
  updated_at = now()
FROM public.slack_installations installation
WHERE installation.guardrail_id = guardrail.id
  AND installation.status <> 'uninstalled'
  AND guardrail.privacy_enable_input_output_logging = false;
