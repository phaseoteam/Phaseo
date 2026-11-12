CREATE OR REPLACE FUNCTION public.gateway_realtime_claim_connection (
  p_session_id         text,
  p_client_secret_hash text
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_session public.gateway_realtime_sessions%rowtype;
begin
  select * into v_session
  from public.gateway_realtime_sessions
  where session_id = p_session_id
  for update;

  if not found then raise exception 'realtime_session_not_found'; end if;
  if coalesce(v_session.provider_client_secret_hash, '') <> coalesce(p_client_secret_hash, '') then
    raise exception 'realtime_relay_forbidden';
  end if;
  if v_session.status <> 'created' then
    raise exception 'realtime_relay_already_connected';
  end if;
  if v_session.expires_at is not null and v_session.expires_at <= now() then
    raise exception 'realtime_session_expired';
  end if;

  update public.gateway_realtime_sessions
  set status = 'connecting', last_event_at = now(), updated_at = now()
  where id = v_session.id and status = 'created'
  returning * into v_session;

  if not found then raise exception 'realtime_relay_already_connected'; end if;
  return next v_session;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_claim_connection"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_claim_connection"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_claim_connection"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_claim_connection"(text, text) FROM PUBLIC, "anon", "authenticated";
