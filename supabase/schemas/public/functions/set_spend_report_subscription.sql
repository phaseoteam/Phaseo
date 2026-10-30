CREATE OR REPLACE FUNCTION public.set_spend_report_subscription (
  p_token      uuid,
  p_subscribed boolean DEFAULT NULL::boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The unsubscribe link in a spend report email (and its RFC 8058 one-click List-Unsubscribe).
-- The unguessable token names one person and one workspace. p_subscribed false unsubscribes them
-- from that workspace's report emails and cancels any of those emails still waiting in the outbox;
-- true subscribes them again; null only reads. Other emails, other workspaces' reports and the
-- routed spend_report events are untouched. Repeating it is harmless. Returns null for an unknown
-- token, otherwise { workspace_name, subscribed }.
declare
  v_workspace_id uuid;
  v_user_id uuid;
  v_opted_out_at timestamp with time zone;
begin
  if p_token is null then
    return null;
  end if;

  if p_subscribed is null then
    select recipient.workspace_id, recipient.user_id, recipient.opted_out_at
    into v_workspace_id, v_user_id, v_opted_out_at
    from public.workspace_spend_report_recipients recipient
    where recipient.unsubscribe_token = p_token;
  else
    update public.workspace_spend_report_recipients recipient
    set opted_out_at = case when p_subscribed then null else coalesce(recipient.opted_out_at, now()) end,
      updated_at = now()
    where recipient.unsubscribe_token = p_token
    returning recipient.workspace_id, recipient.user_id, recipient.opted_out_at
    into v_workspace_id, v_user_id, v_opted_out_at;
  end if;

  if v_workspace_id is null then
    return null;
  end if;

  if p_subscribed is false then
    update public.email_outbox event
    set attempts = 5, last_error = 'unsubscribed'
    where event.user_id = v_user_id
      and event.workspace_id = v_workspace_id
      and event.kind = 'spend_report_email'
      and event.sent_at is null
      and event.attempts < 5;
  end if;

  return jsonb_build_object(
    'workspace_name', (select coalesce(nullif(btrim(workspace.name), ''), 'your workspace') from public.workspaces workspace where workspace.id = v_workspace_id),
    'subscribed', v_opted_out_at is null
  );
end;
$function$;

COMMENT ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) IS 'Reads (null), unsubscribes (false) or resubscribes (true) the person and workspace named by a spend report unsubscribe token. Unsubscribing also cancels their unsent report emails for that workspace. Null for an unknown token. Service role only (the public web-api route behind the email link).';

REVOKE ALL ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) FROM "anon", "authenticated";
