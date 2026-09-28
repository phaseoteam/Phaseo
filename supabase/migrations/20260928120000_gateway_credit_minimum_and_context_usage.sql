-- Keep the context RPC's wallet gate aligned with the API credit cache.
-- Video and batch retain a $1 minimum; ordinary inference needs $0.10.
do $migration$
declare
  function_name text;
  definition text;
  updated_definition text;
begin
  foreach function_name in array array[
    'gateway_fetch_request_context_without_workspace_budget',
    'gateway_fetch_request_context_with_reservations'
  ] loop
    select pg_get_functiondef(to_regprocedure(format('public.%I(uuid,text,text,uuid)', function_name)))
    into definition;
    if definition is null then
      raise exception 'Missing gateway context function: %', function_name;
    end if;
    updated_definition := regexp_replace(
      definition,
      'min_balance_nanos[[:space:]]+bigint[[:space:]]*:=[[:space:]]*1000000000;',
      'min_balance_nanos bigint := case when endpoint like ''video.%'' or endpoint like ''batch%'' then 1000000000 else 100000000 end;'
    );
    if updated_definition = definition then
      raise exception 'Gateway credit minimum not found in %', function_name;
    end if;

    if function_name = 'gateway_fetch_request_context_without_workspace_budget' then
      -- Key limits are daily, weekly, or monthly. Older partitions cannot
      -- contribute to any configured limit or to today's key enrichment.
      definition := updated_definition;
      updated_definition := regexp_replace(
        definition,
        '(and gr.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id[[:space:]]+and gr.success is true);',
        E'\\1\n    and gr.created_at >= month_start;'
      );
      if updated_definition = definition then
        raise exception 'Gateway key usage query not found';
      end if;
    end if;
    execute updated_definition;
  end loop;
end
$migration$;

-- The remaining lifetime enrichment queries can use index-only reads.
create index if not exists gateway_requests_success_workspace_cost_idx
  on public.gateway_requests (workspace_id, created_at)
  include (cost_nanos)
  where success is true;

create index if not exists gateway_requests_success_key_cost_idx
  on public.gateway_requests (key_id, created_at)
  include (cost_nanos)
  where success is true and key_id is not null;

-- Async requests reserve their quoted cost, but still need $1 available at
-- submission. Check under the wallet lock so concurrent holds cannot bypass it.
create or replace function public.gateway_wallet_reserve_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_amount_nanos bigint,
  p_hold_ref_id text default null,
  p_key_id uuid default null,
  p_request_count integer default null
)
returns table (
  ok boolean,
  applied boolean,
  reason text,
  amount_nanos bigint,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  before_reserved_nanos bigint,
  after_reserved_nanos bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_status jsonb;
  v_balance_nanos bigint;
  v_reserved_nanos bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  perform 1 from public.workspace_budgets
    where workspace_id = p_workspace_id
    order by interval
    for update;

  if not exists (
    select 1 from public.gateway_wallet_reservations
    where workspace_id = p_workspace_id and reservation_id = p_reservation_id
  ) then
    v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, p_amount_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      return query select false, false, (v_budget_status->>'reason')::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    if p_reservation_id like 'video_hold:%' or p_reservation_id like 'batch_hold:%' then
      select coalesce(wallet.balance_nanos, 0), coalesce(wallet.reserved_nanos, 0)
      into v_balance_nanos, v_reserved_nanos
      from public.wallets wallet
      where wallet.workspace_id = p_workspace_id
      for update;
      if found and v_balance_nanos - v_reserved_nanos < 1000000000 then
        return query select false, false, 'insufficient_funds'::text, p_amount_nanos,
          v_balance_nanos, v_balance_nanos, v_reserved_nanos, v_reserved_nanos;
        return;
      end if;
    end if;
  end if;

  return query
  select * from public.gateway_wallet_reserve_once_without_workspace_budget(
    p_workspace_id, p_reservation_id, p_amount_nanos, p_hold_ref_id, p_key_id, p_request_count
  );
end;
$$;
