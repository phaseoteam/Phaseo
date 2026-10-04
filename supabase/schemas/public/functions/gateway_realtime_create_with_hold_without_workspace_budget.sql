CREATE OR REPLACE FUNCTION public.gateway_realtime_create_with_hold_without_workspace_budget (
  p_workspace_id             uuid,
  p_session_id               text,
  p_key_id                   uuid,
  p_user_id                  text,
  p_source                   text,
  p_provider                 text,
  p_model_id                 text,
  p_provider_model_id        text,
  p_voice                    text,
  p_expires_at               timestamp with time zone,
  p_reservation_prefix       text,
  p_reservation_id           text,
  p_hold_nanos               bigint,
  p_client_secret_hash       text,
  p_metadata                 jsonb                    DEFAULT '{}'::jsonb,
  p_max_workspace_sessions   integer                  DEFAULT 8,
  p_max_key_sessions         integer                  DEFAULT 4,
  p_max_user_sessions        integer                  DEFAULT 1,
  p_max_creations_per_minute integer                  DEFAULT 8
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_session public.gateway_realtime_sessions%rowtype;
  v_count integer;
begin
  if p_workspace_id is null or coalesce(trim(p_session_id), '') = '' then
    raise exception 'invalid_realtime_session_identity';
  end if;
  if p_key_id is null then
    raise exception 'invalid_realtime_key';
  end if;
  if p_hold_nanos is null or p_hold_nanos <= 0 then
    raise exception 'invalid_realtime_hold';
  end if;
  if p_source not in ('api', 'chat') then
    raise exception 'invalid_realtime_source';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid_realtime_expiry';
  end if;

  -- The wallet row serializes create/limit checks for the workspace.
  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  select count(*)::integer into v_count
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id
    and status in ('created', 'connecting', 'connected', 'ending', 'billing_unresolved');
  if v_count >= greatest(1, p_max_workspace_sessions) then
    raise exception 'realtime_workspace_concurrency_limit';
  end if;

  select count(*)::integer into v_count
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id
    and key_id = p_key_id
    and status in ('created', 'connecting', 'connected', 'ending', 'billing_unresolved');
  if v_count >= greatest(1, p_max_key_sessions) then
    raise exception 'realtime_key_concurrency_limit';
  end if;

  if nullif(trim(coalesce(p_user_id, '')), '') is not null then
    select count(*)::integer into v_count
    from public.gateway_realtime_sessions
    where workspace_id = p_workspace_id
      and user_id = p_user_id
      and status in ('created', 'connecting', 'connected', 'ending', 'billing_unresolved');
    if v_count >= greatest(1, p_max_user_sessions) then
      raise exception 'realtime_user_concurrency_limit';
    end if;
  end if;

  select count(*)::integer into v_count
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id
    and created_at >= now() - interval '1 minute';
  if v_count >= greatest(1, p_max_creations_per_minute) then
    raise exception 'realtime_creation_rate_limit';
  end if;

  if coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0) < p_hold_nanos then
    raise exception 'insufficient_funds';
  end if;

  insert into public.gateway_realtime_sessions (
    session_id, workspace_id, key_id, user_id, source, provider, model_id,
    provider_model_id, voice, status, expires_at, reservation_prefix,
    reservation_count, reserved_nanos, provider_client_secret_hash, metadata
  ) values (
    p_session_id, p_workspace_id, p_key_id, nullif(trim(coalesce(p_user_id, '')), ''),
    p_source, p_provider, p_model_id, p_provider_model_id, p_voice, 'created',
    p_expires_at, p_reservation_prefix, 1, p_hold_nanos,
    p_client_secret_hash, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_session;

  insert into public.gateway_wallet_reservations (
    reservation_id, workspace_id, amount_nanos, status, hold_ref_id,
    captured_nanos, released_nanos, created_at, updated_at
  ) values (
    p_reservation_id, p_workspace_id, p_hold_nanos, 'reserved', p_session_id,
    0, 0, now(), now()
  );

  insert into public.gateway_requests (
    workspace_id, request_id, realtime_session_id, endpoint, model_id, provider,
    stream, byok, status_code, success, usage, cost_nanos, currency,
    pricing_lines, key_id, created_at
  ) values (
    p_workspace_id, 'realtime:' || p_session_id, p_session_id, 'audio.realtime',
    p_model_id, p_provider, true, false, 102, false, '{}'::jsonb, 0, 'USD',
    '[]'::jsonb, p_key_id, v_session.started_at
  );

  update public.wallets
  set reserved_nanos = coalesce(reserved_nanos, 0) + p_hold_nanos,
      updated_at = now()
  where workspace_id = p_workspace_id;

  return next v_session;
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."gateway_realtime_create_with_hold_without_workspace_budget"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."gateway_realtime_create_with_hold_without_workspace_budget"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."gateway_realtime_create_with_hold_without_workspace_budget"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."gateway_realtime_create_with_hold_without_workspace_budget"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  FROM PUBLIC, "anon", "authenticated";
