CREATE OR REPLACE FUNCTION public.enqueue_gateway_async_webhook_delivery (
  p_workspace_id    uuid,
  p_kind            text,
  p_internal_id     text,
  p_delivery_key    text,
  p_event_type      text,
  p_phase           text,
  p_progress        double precision DEFAULT NULL::double precision,
  p_previous_status text             DEFAULT NULL::text,
  p_current_status  text             DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into public.gateway_async_webhook_deliveries (
    workspace_id, kind, internal_id, delivery_key, status,
    event_type, phase, progress, previous_status, current_status,
    next_attempt_at, updated_at
  ) values (
    p_workspace_id, p_kind, p_internal_id, p_delivery_key, 'pending',
    p_event_type, p_phase, p_progress, p_previous_status, p_current_status,
    now(), now()
  ) on conflict (workspace_id, kind, internal_id, delivery_key) do nothing;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enqueue_gateway_async_webhook_delivery"(uuid, text, text, text, text, text, double precision, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_gateway_async_webhook_delivery"(uuid, text, text, text, text, text, double precision, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_gateway_async_webhook_delivery"(uuid, text, text, text, text, text, double precision, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_gateway_async_webhook_delivery"(uuid, text, text, text, text, text, double precision, text, text) FROM PUBLIC, "anon", "authenticated";
