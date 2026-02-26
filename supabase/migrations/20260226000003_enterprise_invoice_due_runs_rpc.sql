-- Returns due enterprise invoice runs for a specific UTC timestamp.
-- Used by the daily worker job to create Stripe invoices.

create or replace function public.get_due_enterprise_invoice_runs(
  p_run_at timestamptz default (now() at time zone 'utc')
)
returns table (
  team_id uuid,
  stripe_customer_id text,
  billing_day integer,
  payment_terms_days integer,
  period_start timestamptz,
  period_end timestamptz,
  amount_nanos bigint
)
language sql
security definer
set search_path = public
as $$
with params as (
  select (p_run_at at time zone 'utc')::timestamptz as run_at
),
due_profiles as (
  select
    p.team_id,
    p.billing_day,
    p.payment_terms_days,
    p.invoice_limit_nanos,
    w.stripe_customer_id
  from public.team_invoice_profiles p
  join public.teams t
    on t.id = p.team_id
  left join public.wallets w
    on w.team_id = p.team_id
  cross join params pa
  where p.enabled = true
    and p.billing_day = extract(day from pa.run_at)::int
    and coalesce(t.tier, 'basic') = 'enterprise'
    and coalesce(t.billing_mode, 'wallet') = 'invoice'
    and w.stripe_customer_id is not null
),
windows as (
  select
    d.*,
    pa.run_at,
    make_timestamptz(
      extract(year from pa.run_at)::int,
      extract(month from pa.run_at)::int,
      d.billing_day,
      0, 0, 0,
      'UTC'
    ) as this_cycle_end
  from due_profiles d
  cross join params pa
),
periods as (
  select
    w.team_id,
    w.stripe_customer_id,
    w.billing_day,
    w.payment_terms_days,
    w.invoice_limit_nanos,
    case
      when w.run_at < w.this_cycle_end
        then w.this_cycle_end - interval '1 month'
      else w.this_cycle_end
    end as period_start,
    case
      when w.run_at < w.this_cycle_end
        then w.this_cycle_end
      else w.this_cycle_end + interval '1 month'
    end as period_end
  from windows w
),
aggregated as (
  select
    p.team_id,
    p.stripe_customer_id,
    p.billing_day,
    p.payment_terms_days,
    p.period_start,
    p.period_end,
    p.invoice_limit_nanos,
    coalesce(sum(gr.cost_nanos), 0)::bigint as amount_nanos
  from periods p
  left join public.gateway_requests gr
    on gr.team_id = p.team_id
   and gr.success is true
   and gr.created_at >= p.period_start
   and gr.created_at < p.period_end
  group by
    p.team_id,
    p.stripe_customer_id,
    p.billing_day,
    p.payment_terms_days,
    p.period_start,
    p.period_end,
    p.invoice_limit_nanos
)
select
  a.team_id,
  a.stripe_customer_id,
  a.billing_day,
  a.payment_terms_days,
  a.period_start,
  a.period_end,
  case
    when a.invoice_limit_nanos is not null
      then least(a.amount_nanos, a.invoice_limit_nanos)
    else a.amount_nanos
  end as amount_nanos
from aggregated a
where not exists (
  select 1
  from public.team_invoices i
  where i.team_id = a.team_id
    and i.period_start = a.period_start
    and i.period_end = a.period_end
);
$$;

revoke all on function public.get_due_enterprise_invoice_runs(timestamptz) from public;
grant execute on function public.get_due_enterprise_invoice_runs(timestamptz) to service_role;

