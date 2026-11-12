CREATE OR REPLACE FUNCTION public.upsert_gateway_request_into_workspace_usage_rollup (
  p_request_row_id     uuid,
  p_request_created_at timestamp with time zone,
  p_workspace_id       uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_fact record;
  v_seconds numeric;
begin
  select fact.request_event_id, fact.occurred_at, request.endpoint, request.usage
  into v_fact
  from public.gateway_requests request
  join public.v2_request_facts fact
    on fact.gateway_request_id = request.id
    and fact.gateway_request_created_at = request.created_at
    and fact.workspace_id = request.workspace_id
  where request.id = p_request_row_id
    and request.created_at = p_request_created_at
    and request.workspace_id = p_workspace_id
  for update of fact;

  if not found then return false; end if;

  if v_fact.endpoint = 'video.generation'
    and v_fact.usage->>'output_video_seconds' ~ '^[0-9]+(\.[0-9]+)?$' then
    v_seconds := (v_fact.usage->>'output_video_seconds')::numeric;
    if v_seconds > 0 then
      -- Replace the measurement, never increment it: polling and webhooks can
      -- deliver the same completed job repeatedly, with different old sequences.
      delete from public.v2_request_usage
      where request_event_id = v_fact.request_event_id
        and meter_key in ('output_video_seconds', 'video_seconds');
      insert into public.v2_request_usage (
        request_event_id, meter_key, modality, unit, quantity, source, billable, sequence
      ) values (
        v_fact.request_event_id, 'output_video_seconds', 'video', 'seconds',
        v_seconds, 'gateway', true, 0
      );
    end if;
  end if;

  insert into public.v2_analytics_outbox (
    request_event_id, workspace_id, occurred_at, status, attempt_count,
    available_at, last_error, updated_at
  ) values (
    v_fact.request_event_id, p_workspace_id, v_fact.occurred_at, 'pending', 0,
    now(), null, now()
  ) on conflict (request_event_id) do update set
    status = 'pending', attempt_count = 0, available_at = now(),
    last_error = null, updated_at = now();
  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."upsert_gateway_request_into_workspace_usage_rollup"(uuid, timestamp WITH time zone, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_gateway_request_into_workspace_usage_rollup"(uuid, timestamp WITH time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."upsert_gateway_request_into_workspace_usage_rollup"(uuid, timestamp WITH time zone, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."upsert_gateway_request_into_workspace_usage_rollup"(uuid, timestamp WITH time zone, uuid) FROM PUBLIC, "anon", "authenticated";
