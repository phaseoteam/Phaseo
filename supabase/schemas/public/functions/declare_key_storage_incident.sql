CREATE OR REPLACE FUNCTION public.declare_key_storage_incident (
  p_client_request_id   uuid,
  p_location_id         text,
  p_action              text,
  p_keys_created_before timestamp with time zone,
  p_title               text,
  p_customer_message    text,
  p_source_url          text,
  p_declared_by         uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_incident_id uuid;
  v_created boolean := false;
begin
  -- Declares an incident and applies it in the same transaction, so there is
  -- never a declared but unapplied incident. Retrying with the same
  -- p_client_request_id returns the first result instead of declaring again,
  -- so a caller that lost the response (or failed to send the emails) can
  -- safely retry. Service-only.
  insert into public.key_storage_incidents (client_request_id, location_id, action, keys_created_before, title, customer_message, source_url, declared_by)
  values (p_client_request_id, p_location_id, p_action, p_keys_created_before, p_title, p_customer_message, p_source_url, p_declared_by)
  on conflict (client_request_id) do nothing
  returning id into v_incident_id;

  if v_incident_id is null then
    select incident.id into v_incident_id
    from public.key_storage_incidents as incident
    where incident.client_request_id = p_client_request_id;
  else
    v_created := true;
    perform public.apply_key_storage_incident(v_incident_id);
  end if;

  return jsonb_build_object(
    'incident_id', v_incident_id,
    'created', v_created,
    'keys', coalesce((
      select jsonb_agg(jsonb_build_object('key_id', changed.key_id, 'workspace_id', changed.workspace_id) order by changed.key_id)
      from public.key_storage_incident_keys as changed
      where changed.incident_id = v_incident_id
    ), '[]'::jsonb)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) IS 'Declares and applies a key storage incident in one transaction; idempotent per client request id. Returns the incident id and the keys it changed. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."declare_key_storage_incident"(uuid, text, text, timestamp with time zone, text, text, text, uuid) FROM PUBLIC, "anon", "authenticated";
