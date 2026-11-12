CREATE OR REPLACE FUNCTION public.enforce_oauth_device_poll_interval (
  p_device_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  device public.oauth_device_codes%rowtype;
begin
  select * into device
  from public.oauth_device_codes
  where id = p_device_id
  for update;

  if not found then return 'invalid'; end if;

  if device.last_polled_at is not null
     and device.last_polled_at + make_interval(secs => device.interval_seconds) > now() then
    update public.oauth_device_codes
    set last_polled_at = now(), interval_seconds = interval_seconds + 5
    where id = p_device_id;
    return 'slow_down';
  end if;

  update public.oauth_device_codes set last_polled_at = now() where id = p_device_id;
  return 'ok';
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_oauth_device_poll_interval"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_oauth_device_poll_interval"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_oauth_device_poll_interval"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_oauth_device_poll_interval"(uuid) FROM PUBLIC, "anon", "authenticated";
