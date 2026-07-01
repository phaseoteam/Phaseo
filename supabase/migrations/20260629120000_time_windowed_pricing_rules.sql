alter table if exists public.data_api_pricing_rules
  add column if not exists billing_timestamp_basis text not null default 'request_start',
  add column if not exists time_windows jsonb not null default '[]'::jsonb;

create or replace function public.gateway_validate_pricing_time_windows(value jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(value) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(value) as item(window)
      where
        jsonb_typeof(item.window) is distinct from 'object'
        or jsonb_typeof(item.window->'label') is distinct from 'string'
        or btrim(item.window->>'label') = ''
        or item.window->>'timezone' is distinct from 'UTC'
        or coalesce(item.window->>'start_time', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(item.window->>'end_time', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        or item.window->>'start_time' = item.window->>'end_time'
        or (
          item.window ? 'price_per_unit'
          and case jsonb_typeof(item.window->'price_per_unit')
            when 'null' then false
            when 'number' then (item.window->>'price_per_unit')::numeric < 0
            when 'string' then
              case
                when btrim(item.window->>'price_per_unit') !~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$' then true
                else (btrim(item.window->>'price_per_unit'))::numeric < 0
              end
            else true
          end
        )
        or (
          item.window ? 'priority'
          and case jsonb_typeof(item.window->'priority')
            when 'null' then false
            when 'number' then ((item.window->>'priority')::numeric % 1) <> 0
            else true
          end
        )
    );
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'data_api_pricing_rules_billing_timestamp_basis_check'
      and conrelid = 'public.data_api_pricing_rules'::regclass
  ) then
    alter table public.data_api_pricing_rules
      add constraint data_api_pricing_rules_billing_timestamp_basis_check
      check (billing_timestamp_basis in ('request_start', 'provider_accept', 'completion', 'unknown'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'data_api_pricing_rules_time_windows_array_check'
      and conrelid = 'public.data_api_pricing_rules'::regclass
  ) then
    alter table public.data_api_pricing_rules
      add constraint data_api_pricing_rules_time_windows_array_check
      check (jsonb_typeof(time_windows) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'data_api_pricing_rules_time_windows_shape_check'
      and conrelid = 'public.data_api_pricing_rules'::regclass
  ) then
    alter table public.data_api_pricing_rules
      add constraint data_api_pricing_rules_time_windows_shape_check
      check (public.gateway_validate_pricing_time_windows(time_windows));
  end if;
end $$;

comment on column public.data_api_pricing_rules.billing_timestamp_basis is
  'Timestamp basis used to resolve time-windowed pricing. Defaults to gateway request start.';
comment on column public.data_api_pricing_rules.time_windows is
  'UTC-only time-window price overrides for this rule, evaluated against billing_timestamp_basis.';

create or replace function public.gateway_fetch_request_context_with_reservations(
  workspace_id uuid,
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
      left join public.data_api_pricing_rules rule_row
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

revoke all on function public.gateway_fetch_request_context_with_reservations(uuid, text, text, uuid) from public;
grant execute on function public.gateway_fetch_request_context_with_reservations(uuid, text, text, uuid) to authenticated;
grant execute on function public.gateway_fetch_request_context_with_reservations(uuid, text, text, uuid) to service_role;
