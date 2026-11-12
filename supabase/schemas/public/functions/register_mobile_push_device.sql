CREATE OR REPLACE FUNCTION public.register_mobile_push_device (
  p_user_id         uuid,
  p_installation_id text,
  p_expo_push_token text,
  p_platform        text,
  p_time_zone       text,
  p_device_name     text,
  p_app_version     text,
  p_channel_scheme  integer DEFAULT 1
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- One row per installation and per Expo token. When a token or installation turns up under
-- another account (sign-out then sign-in as someone else) or another installation, the old
-- row is replaced so the device never receives the previous account's pushes. A user keeps
-- at most 20 active devices; the least recently seen ones beyond that are disabled. The app
-- reports its notification channel scheme each time it registers, so a build that only has
-- the single model-updates channel (scheme 1, the default) is never sent to a channel it lacks.
declare
  v_time_zone text := nullif(btrim(p_time_zone), '');
  v_channel_scheme smallint := least(greatest(coalesce(p_channel_scheme, 1), 1), 100);
  v_device_id uuid;
begin
  if p_user_id is null or p_installation_id is null or p_expo_push_token is null then
    raise exception 'invalid_mobile_push_device';
  end if;

  -- Keep only zones this database can convert; anything else falls back to UTC.
  if v_time_zone is not null then
    begin
      perform now() at time zone v_time_zone;
    exception when others then
      v_time_zone := null;
    end;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile_push_device:' || p_expo_push_token, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile_push_installation:' || p_installation_id, 0));

  delete from public.mobile_push_devices d
  where (d.expo_push_token = p_expo_push_token or d.installation_id = p_installation_id)
    and not (d.user_id = p_user_id and d.installation_id = p_installation_id);

  insert into public.mobile_push_devices as d (
    user_id, installation_id, expo_push_token, platform, status, time_zone, device_name, app_version, channel_scheme,
    last_seen_at, updated_at, invalidated_at
  )
  values (
    p_user_id, p_installation_id, p_expo_push_token, p_platform, 'active', v_time_zone,
    nullif(btrim(p_device_name), ''), nullif(btrim(p_app_version), ''), v_channel_scheme, now(), now(), null
  )
  on conflict (user_id, installation_id) do update
    set expo_push_token = excluded.expo_push_token,
        platform = excluded.platform,
        status = 'active',
        time_zone = excluded.time_zone,
        device_name = excluded.device_name,
        app_version = excluded.app_version,
        channel_scheme = excluded.channel_scheme,
        last_seen_at = now(),
        updated_at = now(),
        invalidated_at = null
  returning d.id into v_device_id;

  update public.mobile_push_devices d
  set status = 'disabled', updated_at = now()
  where d.id in (
    select o.id from public.mobile_push_devices o
    where o.user_id = p_user_id and o.status = 'active' and o.id <> v_device_id
    order by o.last_seen_at desc, o.id
    offset 19
  );

  return v_device_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text, integer) FROM PUBLIC, "anon", "authenticated";
