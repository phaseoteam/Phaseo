CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_with_reservations (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  payload jsonb;
  min_balance_nanos bigint := case when endpoint like 'video.%' or endpoint like 'batch%' then 1000000000 else 100000000 end; -- 1.00 USD
  wallet_balance_nanos bigint := 0;
  wallet_reserved_nanos bigint := 0;
  wallet_available_nanos bigint := 0;
  credit_status jsonb;
  enriched_pricing jsonb;
begin
  payload := public.gateway_fetch_request_context(workspace_id, model, endpoint, api_key_id);
  if payload is null then
    return null;
  end if;

  with provider_cards as (
    select provider_key, card
    from jsonb_each(coalesce(payload->'pricing', '{}'::jsonb)) as p(provider_key, card)
  ),
  enriched_cards as (
    select
      provider_key,
      jsonb_set(
        card,
        '{rules}',
        coalesce(rules.enriched_rules, '[]'::jsonb),
        true
      ) as card
    from provider_cards
    cross join lateral (
      select jsonb_agg(
        rule_item.value ||
        jsonb_build_object(
          'billing_timestamp_basis', coalesce(rule_row.billing_timestamp_basis, 'request_start'),
          'time_windows', coalesce(rule_row.time_windows, '[]'::jsonb)
        )
        order by rule_item.ordinality
      ) as enriched_rules
      from jsonb_array_elements(coalesce(card->'rules', '[]'::jsonb)) with ordinality as rule_item(value, ordinality)
      left join private.v2_rpc_pricing_compat rule_row
        on rule_row.rule_id::text = rule_item.value->>'id'
    ) rules
  )
  select coalesce(jsonb_object_agg(provider_key, card), '{}'::jsonb)
  into enriched_pricing
  from enriched_cards;

  payload := jsonb_set(payload, '{pricing}', coalesce(enriched_pricing, '{}'::jsonb), true);

  select
    coalesce(w.balance_nanos, 0)::bigint,
    coalesce(w.reserved_nanos, 0)::bigint
  into
    wallet_balance_nanos,
    wallet_reserved_nanos
  from public.wallets w
  where w.workspace_id = gateway_fetch_request_context_with_reservations.workspace_id
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

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_with_reservations"(uuid, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_with_reservations"(uuid, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_with_reservations"(uuid, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_with_reservations"(uuid, text, text, uuid) FROM PUBLIC, "anon", "authenticated";
