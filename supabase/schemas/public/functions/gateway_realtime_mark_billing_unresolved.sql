CREATE OR REPLACE FUNCTION public.gateway_realtime_mark_billing_unresolved (
  p_workspace_id uuid,
  p_session_id   text,
  p_usage        jsonb,
  p_reason       text
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_session public.gateway_realtime_sessions%rowtype;
begin
  update public.gateway_realtime_sessions
  set status = 'billing_unresolved',
      usage = coalesce(p_usage, '{}'::jsonb),
      disconnect_reason = left(coalesce(nullif(trim(p_reason), ''), 'authoritative_usage_missing'), 240),
      error_code = 'realtime_authoritative_usage_missing',
      last_event_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id
    and session_id = p_session_id
    and status in ('created', 'connecting', 'connected', 'ending', 'billing_unresolved')
  returning * into v_session;

  if not found then
    select * into v_session
    from public.gateway_realtime_sessions
    where workspace_id = p_workspace_id and session_id = p_session_id;
  end if;
  if not found then raise exception 'realtime_session_not_found'; end if;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return next v_session;
    return;
  end if;

  update public.gateway_requests
  set status_code = 202,
      success = false,
      error_code = 'realtime_authoritative_usage_missing',
      error_message = 'Realtime billing requires reconciliation.',
      usage = coalesce(p_usage, '{}'::jsonb)
  where realtime_session_id = p_session_id
    and created_at = v_session.started_at;

  return next v_session;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text) FROM PUBLIC, "anon", "authenticated";
