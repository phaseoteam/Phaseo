-- Read-only billing reconciliation for one UTC window. See gateway-billing-reconciliation.md.
-- Edit the two timestamps in each `params` CTE, keep windows to a few days on production,
-- and run each statement separately.

-- 1. Every wallet charge in the window, joined to the request row of the attempt it paid for.
--    Expected: only `matched`. Anything else needs a focused follow-up.
with params as (
  select timestamptz '2026-11-01 00:00:00+00' as from_at, timestamptz '2026-11-08 00:00:00+00' as to_at
),
charges as (
  select c.*
  from public.gateway_request_charges c, params p
  where c.created_at >= p.from_at and c.created_at < p.to_at
),
linked as (
  select
    c.workspace_id,
    c.request_id as billing_request_id,
    c.cost_nanos as charged_nanos,
    c.status as charge_status,
    r.request_id,
    r.success,
    r.cost_nanos as request_cost_nanos,
    count(r.request_id) over (partition by c.workspace_id, c.request_id) as request_rows
  from charges c
  -- The audit row is written after the charge; a day either side bounds the
  -- partition scan without missing long streams.
  left join public.gateway_requests r
    on r.workspace_id = c.workspace_id
   and r.billing_request_id = c.request_id
   and r.created_at >= c.created_at - interval '1 day'
   and r.created_at < c.created_at + interval '1 day'
)
select
  case
    when charge_status <> 'applied' then 'charge_not_applied:' || charge_status
    when request_id is null then 'charge_without_request_row'
    when request_rows > 1 then 'charge_linked_to_multiple_rows'
    when not success then 'charge_on_unsuccessful_row'
    when request_cost_nanos is distinct from charged_nanos then 'amount_mismatch'
    else 'matched'
  end as outcome,
  count(distinct (workspace_id, billing_request_id)) as charges,
  sum(charged_nanos) as charged_nanos
from linked
group by 1
order by 1;

-- 2. Paid request rows in the window and whether a charge exists for them.
--    Expected: `charged` for billable rows. `not_linked` rows predate the link or were
--    billed through wallet reservations (batch, realtime) and are reconciled separately.
with params as (
  select timestamptz '2026-11-01 00:00:00+00' as from_at, timestamptz '2026-11-08 00:00:00+00' as to_at
)
select
  coalesce(r.detail_metadata ->> 'testing_mode', 'false') = 'true' as testing_mode,
  case
    when r.billing_request_id is null then 'not_linked'
    when c.request_id is null then 'no_charge'
    when c.cost_nanos <> r.cost_nanos then 'amount_mismatch'
    else 'charged'
  end as outcome,
  count(*) as request_rows,
  sum(r.cost_nanos) as request_cost_nanos,
  sum(c.cost_nanos) as charged_nanos
from public.gateway_requests r
cross join params p
left join public.gateway_request_charges c
  on c.workspace_id = r.workspace_id
 and c.request_id = r.billing_request_id
where r.created_at >= p.from_at and r.created_at < p.to_at
  and r.success
  and not r.byok
  and r.cost_nanos > 0
group by 1, 2
order by 1, 2;

-- 3. Customer-side totals per provider, executed model, UTC day and price meter, to set
--    against the provider's own usage/cost export for the same window. Pricing lines carry
--    the exact meter quantities and the nanos charged for each.
with params as (
  select timestamptz '2026-11-01 00:00:00+00' as from_at, timestamptz '2026-11-08 00:00:00+00' as to_at
)
select
  r.provider,
  coalesce(r.api_model_id, r.model_id) as provider_model,
  date_trunc('day', r.created_at at time zone 'UTC')::date as usage_day,
  line ->> 'dimension' as meter,
  count(distinct r.request_id) as requests,
  sum((line ->> 'quantity')::numeric) as quantity,
  sum((line ->> 'line_nanos')::numeric) as charged_nanos
from public.gateway_requests r
cross join params p
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(r.pricing_lines) = 'array' then r.pricing_lines else '[]'::jsonb end
) as line
where r.created_at >= p.from_at and r.created_at < p.to_at
  and r.success
  and not r.byok
  and coalesce(r.detail_metadata ->> 'testing_mode', 'false') <> 'true'
group by 1, 2, 3, 4
order by 1, 2, 3, 4;
