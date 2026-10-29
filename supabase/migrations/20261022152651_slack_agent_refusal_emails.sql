SET local check_function_bodies = off;

-- Phaseo Slack agent: when the agent turns people away because the plan is full, a
-- limit is reached or a charge is unpaid, the Worker emails the workspace's owners and admins.

CREATE OR REPLACE FUNCTION public.queue_slack_agent_refusal_email (
  p_installation_id uuid,
  p_reason          text,
  p_people          integer
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_installation public.slack_installations%rowtype;
  v_month text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_queued integer;
begin
  -- Only the refusals that stop the agent for everyone new are emailed. Guests,
  -- Slack Connect users and the hourly limit stay in the audit log.
  if p_reason is null or p_reason not in ('plan_full', 'max_people', 'monthly_cap', 'payment_due') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select * into v_installation
  from public.slack_installations installation
  where installation.id = p_installation_id;
  if not found or v_installation.status = 'uninstalled' then
    return 0;
  end if;

  -- One email to each owner and admin per installation, reason and UTC month. The
  -- dedupe key turns a repeat (the next refusal, a retried Slack event) into a no-op.
  -- The email names no Slack user and carries no message text.
  with recipient as (
    select workspace.owner_user_id as user_id
    from public.workspaces workspace
    where workspace.id = v_installation.workspace_id
    union
    select member.user_id
    from public.workspace_members member
    where member.workspace_id = v_installation.workspace_id
      and member.role in ('owner', 'admin')
  )
  insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
  select
    'slack_agent_refused',
    'slack_agent_refused',
    account.email,
    null,
    v_installation.workspace_id,
    account.id,
    jsonb_build_object(
      'workspace_name', workspace.name,
      'team_name', v_installation.team_name,
      'reason', p_reason,
      'people', greatest(coalesce(p_people, 0), 0),
      'plan_people', v_installation.plan_people,
      'max_people', v_installation.max_people,
      'monthly_cap_usd', round(v_installation.monthly_cap_nanos / 1000000000.0, 2)
    ),
    'slack_agent_refused:' || v_installation.id || ':' || p_reason || ':' || v_month || ':' || account.id
  from recipient
  join auth.users account on account.id = recipient.user_id
  join public.workspaces workspace on workspace.id = v_installation.workspace_id
  where coalesce(account.email, '') <> ''
    and account.deleted_at is null
  on conflict (dedupe_key) do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$function$;

COMMENT ON FUNCTION "public"."queue_slack_agent_refusal_email"(uuid, text, integer) IS 'For the Slack Worker when the agent turns someone away because the plan is full, the monthly people limit or spending cap is reached, or a charge is unpaid: queues one slack_agent_refused email to each workspace owner and admin, at most once per installation, reason and UTC month. Returns how many emails were queued.';

GRANT EXECUTE ON FUNCTION "public"."queue_slack_agent_refusal_email"(uuid, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."queue_slack_agent_refusal_email"(uuid, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_slack_agent_refusal_email"(uuid, text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."queue_slack_agent_refusal_email"(uuid, text, integer) FROM PUBLIC, "anon", "authenticated";
