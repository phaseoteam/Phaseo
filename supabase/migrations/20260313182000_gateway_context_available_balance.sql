-- Ensure gateway credit checks account for reserved wallet holds.
-- This wrapper preserves existing context RPC behavior while overriding
-- credit and team balance fields to use available balance.

create or replace function public.gateway_fetch_request_context_with_reservations(
  team_id uuid,
  model text,
  endpoint text,
  api_key_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  payload jsonb;
  min_balance_nanos bigint := 1000000000; -- 1.00 USD
  wallet_balance_nanos bigint := 0;
  wallet_reserved_nanos bigint := 0;
  wallet_available_nanos bigint := 0;
  credit_status jsonb;
begin
  payload := public.gateway_fetch_request_context(team_id, model, endpoint, api_key_id);
  if payload is null then
    return null;
  end if;

  select
    coalesce(w.balance_nanos, 0)::bigint,
    coalesce(w.reserved_nanos, 0)::bigint
  into
    wallet_balance_nanos,
    wallet_reserved_nanos
  from public.wallets w
  where w.team_id = gateway_fetch_request_context_with_reservations.team_id
  limit 1;

  if not found then
    credit_status := jsonb_build_object('ok', false, 'reason', 'wallet_missing');
    return jsonb_set(payload, '{credit_ok}', credit_status, true);
  end if;

  wallet_available_nanos := greatest(wallet_balance_nanos - wallet_reserved_nanos, 0);

  if wallet_available_nanos >= min_balance_nanos then
    credit_status := jsonb_build_object(
      'ok', true,
      'balance_nanos', wallet_available_nanos,
      'raw_balance_nanos', wallet_balance_nanos,
      'reserved_nanos', wallet_reserved_nanos,
      'available_nanos', wallet_available_nanos
    );
  else
    credit_status := jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_funds',
      'balance_nanos', wallet_available_nanos,
      'raw_balance_nanos', wallet_balance_nanos,
      'reserved_nanos', wallet_reserved_nanos,
      'available_nanos', wallet_available_nanos
    );
  end if;

  payload := jsonb_set(payload, '{credit_ok}', credit_status, true);

  if jsonb_typeof(payload->'team_enrichment') = 'object' then
    payload := jsonb_set(payload, '{team_enrichment,balance_nanos}', to_jsonb(wallet_available_nanos), true);
    payload := jsonb_set(payload, '{team_enrichment,available_nanos}', to_jsonb(wallet_available_nanos), true);
    payload := jsonb_set(payload, '{team_enrichment,reserved_nanos}', to_jsonb(wallet_reserved_nanos), true);
    payload := jsonb_set(
      payload,
      '{team_enrichment,balance_usd}',
      to_jsonb(round((wallet_available_nanos::numeric / 1000000000.0)::numeric, 2)),
      true
    );
    payload := jsonb_set(payload, '{team_enrichment,balance_is_low}', to_jsonb(wallet_available_nanos < min_balance_nanos), true);
  end if;

  return payload;
end;
$function$;

revoke all on function public.gateway_fetch_request_context_with_reservations(uuid, text, text, uuid) from public;
grant execute on function public.gateway_fetch_request_context_with_reservations(uuid, text, text, uuid) to authenticated;
grant execute on function public.gateway_fetch_request_context_with_reservations(uuid, text, text, uuid) to service_role;
