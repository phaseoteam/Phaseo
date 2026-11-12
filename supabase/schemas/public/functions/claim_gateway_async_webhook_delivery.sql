CREATE OR REPLACE FUNCTION public.claim_gateway_async_webhook_delivery (
  p_workspace_id        uuid,
  p_kind                text,
  p_internal_id         text,
  p_delivery_key        text,
  p_claim_token         text,
  p_stale_after_seconds integer          DEFAULT 300,
  p_event_type          text             DEFAULT NULL::text,
  p_phase               text             DEFAULT NULL::text,
  p_progress            double precision DEFAULT NULL::double precision,
  p_previous_status     text             DEFAULT NULL::text,
  p_current_status      text             DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_row public.gateway_async_webhook_deliveries%rowtype;
begin
  if p_workspace_id is null or coalesce(trim(p_kind), '') = ''
     or coalesce(trim(p_internal_id), '') = '' or coalesce(trim(p_delivery_key), '') = ''
     or coalesce(trim(p_claim_token), '') = '' then
    raise exception 'invalid_webhook_delivery_claim';
  end if;

  insert into public.gateway_async_webhook_deliveries (
    workspace_id, kind, internal_id, delivery_key, status, claim_token, claimed_at, updated_at
  ) values (
    p_workspace_id, p_kind, p_internal_id, p_delivery_key, 'claimed', p_claim_token, now(), now()
  ) on conflict do nothing;

  select * into v_row
  from public.gateway_async_webhook_deliveries
  where workspace_id = p_workspace_id and kind = p_kind
    and internal_id = p_internal_id and delivery_key = p_delivery_key
  for update;

  if v_row.status in ('delivered', 'failed') then return false; end if;
  if v_row.status = 'pending' and v_row.next_attempt_at > now() then return false; end if;
  if v_row.status = 'claimed' and v_row.claim_token <> p_claim_token
     and v_row.claimed_at > now() - make_interval(secs => greatest(30, p_stale_after_seconds)) then
    return false;
  end if;

  update public.gateway_async_webhook_deliveries
  set status = 'claimed', claim_token = p_claim_token, claimed_at = now(), updated_at = now(),
      event_type = coalesce(event_type, p_event_type, split_part(p_delivery_key, ':', 1)),
      phase = coalesce(phase, p_phase, split_part(split_part(p_delivery_key, ':', 1), '.', 2)),
      progress = coalesce(progress, p_progress),
      previous_status = coalesce(previous_status, p_previous_status),
      current_status = coalesce(current_status, p_current_status)
  where workspace_id = p_workspace_id and kind = p_kind
    and internal_id = p_internal_id and delivery_key = p_delivery_key;
  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_gateway_async_webhook_delivery"(uuid, text, text, text, text, integer, text, text, double precision, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_gateway_async_webhook_delivery"(uuid, text, text, text, text, integer, text, text, double precision, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_gateway_async_webhook_delivery"(uuid, text, text, text, text, integer, text, text, double precision, text, text) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."claim_gateway_async_webhook_delivery"(uuid, text, text, text, text, integer, text, text, double precision, text, text)
  FROM PUBLIC, "anon", "authenticated";
