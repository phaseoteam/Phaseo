-- Make enterprise invoicing invite-only and simplify invoice profile terms.
-- - Teams must be authorized with pre_invoice before they can activate invoice mode.
-- - Invoice cap is removed (key limits are the control surface).
-- - Payment terms are restricted to Net 14 / Net 30.

alter table public.teams
  add column if not exists invoice_onboarding_status text not null default 'none';

alter table public.teams
  add column if not exists invoice_invited_at timestamptz null;

alter table public.teams
  add column if not exists invoice_terms_accepted_at timestamptz null;

alter table public.teams
  add column if not exists invoice_terms_accepted_by_user_id uuid null;

alter table public.teams
  add column if not exists invoice_terms_accepted_by_name text null;

update public.teams
set
  invoice_onboarding_status = 'completed',
  invoice_invited_at = coalesce(
    invoice_invited_at,
    invoice_mode_activated_at,
    updated_at,
    (now() at time zone 'utc')
  ),
  invoice_terms_accepted_at = coalesce(
    invoice_terms_accepted_at,
    invoice_mode_activated_at,
    updated_at,
    (now() at time zone 'utc')
  )
where coalesce(billing_mode, 'wallet') = 'invoice';

alter table public.teams
  drop constraint if exists teams_invoice_onboarding_status_check;

alter table public.teams
  add constraint teams_invoice_onboarding_status_check
  check (invoice_onboarding_status in ('none', 'pre_invoice', 'completed'));

alter table public.teams
  drop constraint if exists teams_invoice_completed_requires_invoice_mode_check;

alter table public.teams
  add constraint teams_invoice_completed_requires_invoice_mode_check
  check (invoice_onboarding_status <> 'completed' or billing_mode = 'invoice');

create or replace function public.enforce_team_invoice_onboarding_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.billing_mode = 'invoice'
     and (
       tg_op = 'insert'
       or coalesce(old.billing_mode, 'wallet') <> 'invoice'
     ) then
    if coalesce(old.invoice_onboarding_status, 'none') <> 'pre_invoice'
       and coalesce(new.invoice_onboarding_status, 'none') <> 'pre_invoice'
       and coalesce(new.invoice_onboarding_status, 'none') <> 'completed' then
      raise exception using
        errcode = '23514',
        message = 'invoice_invite_required',
        detail = 'Invoice mode activation requires pre_invoice authorization.';
    end if;
  end if;

  if new.billing_mode = 'invoice'
     and coalesce(new.invoice_onboarding_status, 'none') <> 'completed' then
    new.invoice_onboarding_status := 'completed';
  end if;

  return new;
end;
$$;

drop trigger if exists teams_invoice_onboarding_status_guard on public.teams;
create trigger teams_invoice_onboarding_status_guard
before insert or update of billing_mode, invoice_onboarding_status
on public.teams
for each row
execute function public.enforce_team_invoice_onboarding_status();

alter table public.team_invoice_profiles
  drop constraint if exists team_invoice_profiles_invoice_limit_nanos_check;

alter table public.team_invoice_profiles
  drop column if exists invoice_limit_nanos;

update public.team_invoice_profiles
set payment_terms_days = case when payment_terms_days = 14 then 14 else 30 end
where payment_terms_days not in (14, 30);

alter table public.team_invoice_profiles
  drop constraint if exists team_invoice_profiles_payment_terms_days_check;

alter table public.team_invoice_profiles
  add constraint team_invoice_profiles_payment_terms_days_check
  check (payment_terms_days in (14, 30));

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
    p.period_end
)
select
  a.team_id,
  a.stripe_customer_id,
  a.billing_day,
  a.payment_terms_days,
  a.period_start,
  a.period_end,
  a.amount_nanos
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

comment on column public.teams.invoice_onboarding_status
  is 'Invite-gated invoicing state: none, pre_invoice (authorized to onboard), completed (onboarded + invoice mode active).';
