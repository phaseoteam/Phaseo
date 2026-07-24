-- Rollback-only linked-database smoke test for the realtime billing lifecycle.
-- This never opens a provider connection and leaves no persistent rows or holds.

begin;

do $$
declare
  v_workspace_id uuid;
  v_key_id uuid;
  v_session_id text := 'rt_smoke_' || replace(gen_random_uuid()::text, '-', '');
  v_reservation_prefix text;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_status text;
  v_request_status integer;
  v_request_cost bigint;
  v_request_success boolean;
begin
  select w.workspace_id, k.id, w.balance_nanos, w.reserved_nanos
  into v_workspace_id, v_key_id, v_before_balance, v_before_reserved
  from public.wallets w
  join public.keys k on k.workspace_id = w.workspace_id and k.status = 'active'
  where coalesce(w.balance_nanos, 0) - coalesce(w.reserved_nanos, 0) > 1
  order by k.created_at
  limit 1;

  if not found then
    raise exception 'realtime_smoke_requires_an_active_funded_workspace';
  end if;

  v_reservation_prefix := 'rt:' || v_session_id || ':';

  perform * from public.gateway_realtime_create_with_hold(
    p_workspace_id => v_workspace_id,
    p_session_id => v_session_id,
    p_key_id => v_key_id,
    p_user_id => null,
    p_source => 'api',
    p_provider => 'openai',
    p_model_id => 'security-smoke-realtime',
    p_provider_model_id => 'security-smoke-realtime',
    p_voice => 'marin',
    p_expires_at => now() + interval '5 minutes',
    p_reservation_prefix => v_reservation_prefix,
    p_reservation_id => v_reservation_prefix || '0001',
    p_hold_nanos => 1,
    p_client_secret_hash => 'security-smoke-hash',
    p_metadata => '{"security_smoke":true}'::jsonb,
    p_max_workspace_sessions => 2147483647,
    p_max_key_sessions => 2147483647,
    p_max_user_sessions => 2147483647,
    p_max_creations_per_minute => 2147483647
  );

  if not exists (
    select 1 from public.gateway_realtime_sessions
    where session_id = v_session_id and status = 'created'
  ) then
    raise exception 'realtime_smoke_create_failed';
  end if;

  if not exists (
    select 1 from public.gateway_requests
    where realtime_session_id = v_session_id and status_code = 102 and cost_nanos = 0
  ) then
    raise exception 'realtime_smoke_request_summary_missing';
  end if;

  if (select reserved_nanos from public.wallets where workspace_id = v_workspace_id)
      <> v_before_reserved + 1 then
    raise exception 'realtime_smoke_hold_not_reserved';
  end if;

  perform * from public.gateway_realtime_claim_connection(
    v_session_id,
    'security-smoke-hash'
  );

  begin
    perform * from public.gateway_realtime_claim_connection(
      v_session_id,
      'security-smoke-hash'
    );
    raise exception 'realtime_smoke_duplicate_claim_was_allowed';
  exception
    when others then
      if sqlerrm <> 'realtime_relay_already_connected' then
        raise;
      end if;
  end;

  perform * from public.gateway_realtime_mark_billing_unresolved(
    v_workspace_id,
    v_session_id,
    '{"output_audio_tokens":7}'::jsonb,
    'security_smoke_authoritative_usage_pending'
  );

  select status into v_status
  from public.gateway_realtime_sessions
  where session_id = v_session_id;
  if v_status <> 'billing_unresolved' then
    raise exception 'realtime_smoke_unresolved_status_failed';
  end if;

  if (select reserved_nanos from public.wallets where workspace_id = v_workspace_id)
      <> v_before_reserved + 1 then
    raise exception 'realtime_smoke_unresolved_released_hold';
  end if;

  perform * from public.gateway_realtime_settle_once(
    p_workspace_id => v_workspace_id,
    p_session_id => v_session_id,
    p_final_cost_nanos => 0,
    p_usage => '{"output_audio_tokens":7}'::jsonb,
    p_pricing_lines => '[]'::jsonb,
    p_status => 'cancelled',
    p_disconnect_reason => 'security_smoke_complete'
  );

  if (select balance_nanos from public.wallets where workspace_id = v_workspace_id)
      <> v_before_balance then
    raise exception 'realtime_smoke_zero_cost_changed_balance';
  end if;
  if (select reserved_nanos from public.wallets where workspace_id = v_workspace_id)
      <> v_before_reserved then
    raise exception 'realtime_smoke_settlement_did_not_release_hold';
  end if;

  select status_code, cost_nanos, success
  into v_request_status, v_request_cost, v_request_success
  from public.gateway_requests
  where realtime_session_id = v_session_id;
  if v_request_status <> 499 or v_request_cost <> 0 or v_request_success then
    raise exception 'realtime_smoke_request_not_settled_atomically';
  end if;

  -- A delayed relay callback must not resurrect a terminal request summary.
  perform * from public.gateway_realtime_mark_billing_unresolved(
    v_workspace_id,
    v_session_id,
    '{"output_audio_tokens":8}'::jsonb,
    'security_smoke_late_callback'
  );

  select status_code into v_request_status
  from public.gateway_requests
  where realtime_session_id = v_session_id;
  if v_request_status <> 499 then
    raise exception 'realtime_smoke_terminal_request_was_resurrected';
  end if;

  raise notice 'realtime security smoke passed for session %', v_session_id;
end;
$$;

rollback;
