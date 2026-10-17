CREATE OR REPLACE FUNCTION public.claim_mobile_push_test (
  p_user_id         uuid,
  p_installation_id text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Allows three test pushes per user in any ten minutes. Returns the device's token to send
-- to, or {"error": "device_not_registered" | "rate_limited", "retryAfterSeconds"}.
declare
  v_recent timestamp with time zone[];
  v_device_id uuid;
  v_token text;
begin
  if p_user_id is null or p_installation_id is null then
    return jsonb_build_object('error', 'device_not_registered');
  end if;

  select d.id, d.expo_push_token into v_device_id, v_token
  from public.mobile_push_devices d
  where d.user_id = p_user_id and d.installation_id = p_installation_id and d.status = 'active';
  if v_device_id is null then
    return jsonb_build_object('error', 'device_not_registered');
  end if;

  insert into public.mobile_notification_preferences (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select array(
    select t from unnest(p.test_push_sent_at) as t where t > now() - interval '10 minutes' order by t
  ) into v_recent
  from public.mobile_notification_preferences p
  where p.user_id = p_user_id
  for update;

  if cardinality(v_recent) >= 3 then
    return jsonb_build_object(
      'error', 'rate_limited',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_recent[1] + interval '10 minutes' - now()))))::integer
    );
  end if;

  update public.mobile_notification_preferences
  set test_push_sent_at = v_recent || now(), updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object('deviceId', v_device_id, 'expoPushToken', v_token);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) FROM PUBLIC, "anon", "authenticated";
