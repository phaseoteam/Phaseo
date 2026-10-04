CREATE OR REPLACE FUNCTION public.gateway_async_operation_video_webhook_outbox()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_previous text;
  v_current text := lower(coalesce(new.status, ''));
  v_terminal_phase text;
begin
  if new.kind not in ('video', 'batch')
     or new.meta->'webhook' is null
     or new.meta->'webhook' = 'null'::jsonb then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.enqueue_gateway_async_webhook_delivery(
      new.workspace_id, new.kind, new.internal_id,
      new.kind || '.created', new.kind || '.created', 'created', null, null, v_current
    );
  end if;

  v_previous := case when tg_op = 'INSERT' then '' else lower(coalesce(old.status, '')) end;
  if v_previous = v_current then return new; end if;

  if tg_op = 'UPDATE' then
  perform public.enqueue_gateway_async_webhook_delivery(
    new.workspace_id, new.kind, new.internal_id,
    new.kind || '.status_changed:' || coalesce(nullif(v_previous, ''), 'unknown') || ':' || coalesce(nullif(v_current, ''), 'unknown'),
    new.kind || '.status_changed', 'status_changed', null,
    nullif(v_previous, ''), nullif(v_current, '')
  );
  end if;

  v_terminal_phase := case v_current
    when 'completed' then 'completed'
    when 'failed' then 'failed'
    when 'cancelled' then 'cancelled'
    when 'canceled' then 'cancelled'
    when 'expired' then 'expired'
    else null
  end;
  if v_terminal_phase is not null then
    perform public.enqueue_gateway_async_webhook_delivery(
      new.workspace_id, new.kind, new.internal_id,
      new.kind || '.' || v_terminal_phase,
      new.kind || '.' || v_terminal_phase,
      v_terminal_phase,
      null,
      nullif(v_previous, ''),
      nullif(v_current, '')
    );
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_async_operation_video_webhook_outbox"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_async_operation_video_webhook_outbox"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_async_operation_video_webhook_outbox"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_async_operation_video_webhook_outbox"() FROM PUBLIC, "anon", "authenticated";
