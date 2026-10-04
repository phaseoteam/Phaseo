CREATE OR REPLACE FUNCTION public.gateway_requests_attach_chat_app_id()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_key_name text;
  v_chat_app_key constant text := 'https://ai-stats.phaseo.app/chat';
  v_app_id uuid;
begin
  if new.app_id is not null then
    return new;
  end if;

  if new.workspace_id is null or new.key_id is null then
    return new;
  end if;

  select k.name into v_key_name
  from public.keys k
  where k.id = new.key_id
  limit 1;

  if coalesce(v_key_name, '') <> '__chat_route_managed_key__' then
    return new;
  end if;

  insert into public.api_apps (
    workspace_id,
    app_key,
    title,
    url,
    is_active,
    last_seen,
    updated_at,
    meta
  )
  values (
    new.workspace_id,
    v_chat_app_key,
    'AI Stats Chat',
    v_chat_app_key,
    true,
    coalesce(new.created_at, now()),
    now(),
    jsonb_build_object(
      'identityUrl', v_chat_app_key,
      'managed', true
    )
  )
  on conflict (workspace_id, app_key) do update
    set title = excluded.title,
        url = excluded.url,
        is_active = true,
        last_seen = greatest(public.api_apps.last_seen, excluded.last_seen),
        updated_at = now(),
        meta = coalesce(public.api_apps.meta, '{}'::jsonb) || excluded.meta
  returning id into v_app_id;

  new.app_id := v_app_id;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_requests_attach_chat_app_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_requests_attach_chat_app_id"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_requests_attach_chat_app_id"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_requests_attach_chat_app_id"() FROM PUBLIC, "anon", "authenticated";
