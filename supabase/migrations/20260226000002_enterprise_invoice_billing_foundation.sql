-- Enterprise post-usage invoicing foundation.
-- Adds team billing mode, invoicing profile/config, invoice records, and
-- a helper RPC for "next invoice amount" preview in the dashboard.

alter table public.teams
  add column if not exists billing_mode text not null default 'wallet';

alter table public.teams
  drop constraint if exists teams_billing_mode_check;

alter table public.teams
  add constraint teams_billing_mode_check
  check (billing_mode in ('wallet', 'invoice'));

create table if not exists public.team_invoice_profiles (
  team_id uuid primary key references public.teams(id) on delete cascade,
  enabled boolean not null default false,
  billing_day integer not null default 1,
  invoice_limit_nanos bigint null,
  payment_terms_days integer not null default 30,
  created_at timestamptz not null default (now() at time zone 'utc'),
  updated_at timestamptz not null default (now() at time zone 'utc'),
  constraint team_invoice_profiles_billing_day_check
    check (billing_day between 1 and 28),
  constraint team_invoice_profiles_payment_terms_days_check
    check (payment_terms_days between 1 and 90),
  constraint team_invoice_profiles_invoice_limit_nanos_check
    check (invoice_limit_nanos is null or invoice_limit_nanos >= 0)
);

create table if not exists public.team_invoices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  amount_nanos bigint not null,
  currency text not null default 'USD',
  status text not null default 'draft',
  stripe_invoice_id text null,
  stripe_invoice_number text null,
  due_at timestamptz null,
  issued_at timestamptz null,
  paid_at timestamptz null,
  created_at timestamptz not null default (now() at time zone 'utc'),
  updated_at timestamptz not null default (now() at time zone 'utc'),
  constraint team_invoices_period_check
    check (period_end > period_start),
  constraint team_invoices_amount_nanos_check
    check (amount_nanos >= 0),
  constraint team_invoices_status_check
    check (status in ('draft', 'open', 'paid', 'void', 'uncollectible'))
);

create unique index if not exists team_invoices_team_period_unique
  on public.team_invoices(team_id, period_start, period_end);

create unique index if not exists team_invoices_stripe_invoice_id_unique
  on public.team_invoices(stripe_invoice_id)
  where stripe_invoice_id is not null;

create index if not exists team_invoices_team_status_idx
  on public.team_invoices(team_id, status, period_end desc);

alter table public.team_invoice_profiles enable row level security;
alter table public.team_invoices enable row level security;

drop policy if exists team_invoice_profiles_select_own_team on public.team_invoice_profiles;
drop policy if exists team_invoice_profiles_insert_own_team on public.team_invoice_profiles;
drop policy if exists team_invoice_profiles_update_own_team on public.team_invoice_profiles;
drop policy if exists team_invoice_profiles_delete_own_team on public.team_invoice_profiles;

create policy team_invoice_profiles_select_own_team
  on public.team_invoice_profiles
  for select
  to authenticated
  using (public.is_team_member(team_id));

create policy team_invoice_profiles_insert_own_team
  on public.team_invoice_profiles
  for insert
  to authenticated
  with check (public.is_team_admin(team_id));

create policy team_invoice_profiles_update_own_team
  on public.team_invoice_profiles
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy team_invoice_profiles_delete_own_team
  on public.team_invoice_profiles
  for delete
  to authenticated
  using (public.is_team_admin(team_id));

drop policy if exists team_invoices_select_own_team on public.team_invoices;
create policy team_invoices_select_own_team
  on public.team_invoices
  for select
  to authenticated
  using (public.is_team_member(team_id));

create or replace function public.get_team_invoice_preview(p_team_id uuid)
returns table (
  billing_mode text,
  team_tier text,
  billing_day integer,
  cycle_start timestamptz,
  cycle_end timestamptz,
  next_invoice_amount_nanos bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := (now() at time zone 'utc');
  v_mode text := 'wallet';
  v_tier text := 'basic';
  v_day integer := 1;
  v_candidate timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_amount bigint := 0;
begin
  if auth.uid() is not null and not public.is_team_member(p_team_id) then
    raise exception using errcode = '42501', message = 'forbidden', detail = 'team access denied';
  end if;

  select
    coalesce(t.billing_mode, 'wallet'),
    coalesce(t.tier, 'basic')
  into
    v_mode,
    v_tier
  from public.teams t
  where t.id = p_team_id
  limit 1;

  if v_mode is null then
    return;
  end if;

  select coalesce(p.billing_day, 1)
  into v_day
  from public.team_invoice_profiles p
  where p.team_id = p_team_id
  limit 1;

  if v_day < 1 then v_day := 1; end if;
  if v_day > 28 then v_day := 28; end if;

  v_candidate := make_timestamptz(
    extract(year from v_now)::int,
    extract(month from v_now)::int,
    v_day,
    0, 0, 0,
    'UTC'
  );

  if v_now < v_candidate then
    v_start := v_candidate - interval '1 month';
  else
    v_start := v_candidate;
  end if;
  v_end := v_start + interval '1 month';

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_amount
  from public.gateway_requests gr
  where gr.team_id = p_team_id
    and gr.success is true
    and gr.created_at >= v_start
    and gr.created_at < v_end;

  return query
    select
      v_mode,
      v_tier,
      v_day,
      v_start,
      v_end,
      v_amount;
end;
$$;

revoke all on function public.get_team_invoice_preview(uuid) from public;
grant execute on function public.get_team_invoice_preview(uuid) to authenticated, service_role;

