CREATE OR REPLACE FUNCTION public.record_gateway_async_webhook_result (
  p_workspace_id    uuid,
  p_kind            text,
  p_internal_id     text,
  p_delivery_key    text,
  p_attempt         jsonb,
  p_retry_state     jsonb                    DEFAULT NULL::jsonb,
  p_delivered_at    timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_next_retry_at   timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_progress        double precision         DEFAULT NULL::double precision,
  p_telemetry_patch jsonb                    DEFAULT NULL::jsonb,
  p_claim_token     text                     DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_meta jsonb;
  v_attempts jsonb;
  v_queue jsonb;
  v_deliveries jsonb;
  v_next_retry_at timestamptz;
  v_telemetry_patch jsonb;
begin
  select coalesce(meta, '{}'::jsonb) into v_meta
  from public.gateway_async_operations
  where workspace_id = p_workspace_id and kind = p_kind and internal_id = p_internal_id
  for update;
  if not found then return; end if;

  -- Lock in the same order as lifecycle updates: operation, then delivery.
  if p_claim_token is not null then
    perform 1 from public.gateway_async_webhook_deliveries
    where workspace_id = p_workspace_id and kind = p_kind
      and internal_id = p_internal_id and delivery_key = p_delivery_key
      and status = 'claimed' and claim_token = p_claim_token
    for update;
    if not found then raise exception 'stale_webhook_delivery_claim'; end if;
  end if;


  v_telemetry_patch := coalesce(p_telemetry_patch, '{}'::jsonb)
    - 'webhookAttempts'
    - 'webhookRetryQueue'
    - 'webhookDeliveries'
    - 'nextWebhookRetryAt'
    - 'lastWebhookDispatchedAt'
    - 'lastWebhookProgress'
    - 'lastWebhookProgressAt';

  v_attempts := coalesce(v_meta->'webhookAttempts', '[]'::jsonb) || jsonb_build_array(p_attempt);
  if jsonb_array_length(v_attempts) > 50 then
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
      into v_attempts
    from jsonb_array_elements(v_attempts) with ordinality
    where ordinality > jsonb_array_length(v_attempts) - 50;
  end if;

  v_queue := coalesce(v_meta->'webhookRetryQueue', '{}'::jsonb);
  if p_retry_state is null then
    v_queue := v_queue - p_delivery_key;
  else
    v_queue := jsonb_set(v_queue, array[p_delivery_key], p_retry_state, true);
  end if;

  v_deliveries := coalesce(v_meta->'webhookDeliveries', '{}'::jsonb);
  if p_delivered_at is not null then
    v_deliveries := jsonb_set(v_deliveries, array[p_delivery_key], to_jsonb(p_delivered_at::text), true);
  end if;

  select min(nullif(value->>'nextRetryAt', '')::timestamptz)
    into v_next_retry_at
  from jsonb_each(v_queue);

  v_meta := v_meta || jsonb_build_object(
    'webhookAttempts', v_attempts,
    'webhookRetryQueue', v_queue,
    'webhookDeliveries', v_deliveries,
    'nextWebhookRetryAt', case when v_next_retry_at is null then 'null'::jsonb else to_jsonb(v_next_retry_at::text) end,
    'lastWebhookDispatchedAt', to_jsonb(now()::text)
  ) || v_telemetry_patch;
  if p_progress is not null then
    v_meta := v_meta || jsonb_build_object(
      'lastWebhookProgress', p_progress,
      'lastWebhookProgressAt', to_jsonb(now()::text)
    );
  end if;

  update public.gateway_async_operations
  set meta = v_meta, updated_at = now()
  where workspace_id = p_workspace_id and kind = p_kind and internal_id = p_internal_id;

  update public.gateway_async_webhook_deliveries
  set status = case
        when p_delivered_at is not null then 'delivered'
        when p_next_retry_at is null then 'failed'
        else status
      end,
      claim_token = case when p_next_retry_at is null then null else claim_token end,
      claimed_at = case when p_next_retry_at is null then null else claimed_at end,
      delivered_at = coalesce(p_delivered_at, delivered_at),
      next_attempt_at = p_next_retry_at,
      last_error = p_attempt->>'error_message',
      updated_at = now()
  where workspace_id = p_workspace_id and kind = p_kind
    and internal_id = p_internal_id and delivery_key = p_delivery_key;
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."record_gateway_async_webhook_result"(uuid, text, text, text, jsonb, jsonb, timestamp WITH time zone, timestamp
    WITH time zone, double precision, jsonb, text)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."record_gateway_async_webhook_result"(uuid, text, text, text, jsonb, jsonb, timestamp WITH time zone, timestamp
    WITH time zone, double precision, jsonb, text)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."record_gateway_async_webhook_result"(uuid, text, text, text, jsonb, jsonb, timestamp WITH time zone, timestamp
    WITH time zone, double precision, jsonb, text)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."record_gateway_async_webhook_result"(uuid, text, text, text, jsonb, jsonb, timestamp WITH time zone, timestamp
    WITH time zone, double precision, jsonb, text)
  FROM PUBLIC, "anon", "authenticated";
