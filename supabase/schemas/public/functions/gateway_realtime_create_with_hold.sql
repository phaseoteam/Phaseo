CREATE OR REPLACE FUNCTION public.gateway_realtime_create_with_hold (
  p_workspace_id             uuid,
  p_session_id               text,
  p_key_id                   uuid,
  p_user_id                  text,
  p_source                   text,
  p_provider                 text,
  p_model_id                 text,
  p_provider_model_id        text,
  p_voice                    text,
  p_expires_at               timestamp with time zone,
  p_reservation_prefix       text,
  p_reservation_id           text,
  p_hold_nanos               bigint,
  p_client_secret_hash       text,
  p_metadata                 jsonb                    DEFAULT '{}'::jsonb,
  p_max_workspace_sessions   integer                  DEFAULT 8,
  p_max_key_sessions         integer                  DEFAULT 4,
  p_max_user_sessions        integer                  DEFAULT 1,
  p_max_creations_per_minute integer                  DEFAULT 8
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_budget_status jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, p_hold_nanos);
  if not coalesce((v_budget_status->>'ok')::boolean, true) then
    raise exception '%', v_budget_status->>'reason';
  end if;

  return query select * from public.gateway_realtime_create_with_hold_without_workspace_budget(
    p_workspace_id, p_session_id, p_key_id, p_user_id, p_source, p_provider,
    p_model_id, p_provider_model_id, p_voice, p_expires_at, p_reservation_prefix,
    p_reservation_id, p_hold_nanos, p_client_secret_hash, p_metadata,
    p_max_workspace_sessions, p_max_key_sessions, p_max_user_sessions,
    p_max_creations_per_minute
  );
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  FROM PUBLIC, "anon", "authenticated";
