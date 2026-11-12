CREATE OR REPLACE FUNCTION public.gateway_realtime_enforce_provider_concurrency()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  v_provider text := lower(trim(coalesce(new.provider, '')));
  v_active_count integer;
begin
  if v_provider = '' then
    raise exception 'realtime_provider_required';
  end if;

  -- Serialize creates for one shared provider account across all workspaces.
  perform pg_advisory_xact_lock(
    hashtextextended('gateway_realtime_provider:' || v_provider, 0)
  );

  select count(*)::integer into v_active_count
  from public.gateway_realtime_sessions
  where lower(provider) = v_provider
    and status in ('created', 'connecting', 'connected', 'ending')
    -- Stuck rows awaiting reconciliation hold no provider connection: never
    -- claimed after 2 minutes, past expiry, or silent past the relay idle and
    -- drain timeouts.
    and not (
      (status = 'created' and created_at < now() - interval '2 minutes')
      or (expires_at is not null and expires_at < now() - interval '1 minute')
      or (status <> 'created'
        and coalesce(last_event_at, connected_at, created_at) < now() - interval '10 minutes')
    );

  if v_active_count >= 20 then
    raise exception 'realtime_provider_concurrency_limit';
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."gateway_realtime_enforce_provider_concurrency"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_enforce_provider_concurrency"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_enforce_provider_concurrency"() FROM PUBLIC, "anon", "authenticated", "service_role";
