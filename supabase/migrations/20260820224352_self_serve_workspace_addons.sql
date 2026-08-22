create table public.workspace_addon_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  addon_key text not null,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  provider_price_id text,
  quote_id uuid,
  plan_key text,
  pricing_version text,
  included_members integer,
  fee_policy text,
  included_card_top_up_nanos bigint not null default 0,
  status text not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  grace_until timestamptz,
  last_provider_event_created bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, addon_key),
  unique (provider, provider_subscription_id),
  check (addon_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  check (provider in ('stripe', 'manual')),
  check (included_members is null or included_members > 0),
  check (fee_policy is null or fee_policy in ('standard_5_percent', 'included_allowance')),
  check (included_card_top_up_nanos >= 0),
  check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid')),
  check (jsonb_typeof(metadata) = 'object')
);

create table public.workspace_enterprise_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pricing_version text not null,
  member_count integer not null,
  tier_key text not null,
  expected_monthly_top_up_nanos bigint not null,
  typical_top_up_nanos bigint not null,
  payment_preference text not null,
  needs_sso boolean not null default false,
  needs_scim boolean not null default false,
  wants_slack_connect boolean not null default false,
  recommended_variant text not null,
  selected_variant text,
  plan_key text,
  monthly_price_cents integer,
  included_members integer,
  included_card_top_up_nanos bigint not null default 0,
  fee_policy text,
  stripe_checkout_session_id text unique,
  questionnaire jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_count between 1 and 500),
  check (expected_monthly_top_up_nanos >= 0),
  check (typical_top_up_nanos >= 0),
  check (payment_preference in ('card', 'ach', 'bank_transfer')),
  check (recommended_variant in ('core', 'included_payments')),
  check (selected_variant is null or selected_variant in ('core', 'included_payments')),
  check (fee_policy is null or fee_policy in ('standard_5_percent', 'included_allowance')),
  check (included_card_top_up_nanos >= 0),
  check (jsonb_typeof(questionnaire) = 'object')
);

alter table public.workspace_addon_subscriptions
  add constraint workspace_addon_subscriptions_quote_id_fkey
  foreign key (quote_id) references public.workspace_enterprise_quotes(id) on delete set null;

create table public.workspace_top_up_fee_decisions (
  stripe_payment_intent_id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start date not null,
  payment_rail text not null,
  gross_nanos bigint not null,
  fee_waived boolean not null,
  allowance_before_nanos bigint not null default 0,
  allowance_after_nanos bigint not null default 0,
  reason text not null,
  created_at timestamptz not null default now(),
  check (payment_rail in ('card', 'ach', 'bank_transfer', 'unknown')),
  check (gross_nanos >= 0),
  check (allowance_before_nanos >= 0),
  check (allowance_after_nanos >= 0)
);

create table public.workspace_addon_usage_monthly (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  addon_key text not null,
  metric_key text not null,
  period_start date not null,
  quantity bigint not null default 0,
  stripe_meter_event_id text,
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, addon_key, metric_key, period_start),
  check (addon_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  check (metric_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  check (quantity >= 0)
);

create table public.workspace_sso_monthly_active_users (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start date not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (workspace_id, period_start, auth_user_id)
);

create index workspace_addon_subscriptions_workspace_status_idx
  on public.workspace_addon_subscriptions (workspace_id, status);
create index workspace_addon_usage_unreported_idx
  on public.workspace_addon_usage_monthly (period_start, addon_key)
  where reported_at is null;
create index workspace_sso_monthly_active_users_period_idx
  on public.workspace_sso_monthly_active_users (period_start, workspace_id);
create index workspace_enterprise_quotes_workspace_created_idx
  on public.workspace_enterprise_quotes (workspace_id, created_at desc);
create index workspace_top_up_fee_decisions_workspace_period_idx
  on public.workspace_top_up_fee_decisions (workspace_id, period_start);

insert into public.workspace_addon_subscriptions (
  workspace_id,
  addon_key,
  provider,
  status,
  metadata
)
select
  workspace_id,
  'identity',
  'manual',
  'active',
  jsonb_build_object('grandfathered', true, 'reason', 'existing_scim_configuration')
from public.scim_endpoints
where enabled
on conflict (workspace_id, addon_key) do nothing;

create or replace function public.sync_workspace_addon_subscription(
  p_workspace_id uuid,
  p_addon_key text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_price_id text,
  p_quote_id uuid,
  p_plan_key text,
  p_pricing_version text,
  p_included_members integer,
  p_fee_policy text,
  p_included_card_top_up_nanos bigint,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_grace_until timestamptz,
  p_provider_event_created bigint,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_addon_subscriptions (
    workspace_id,
    addon_key,
    provider,
    provider_customer_id,
    provider_subscription_id,
    provider_price_id,
    quote_id,
    plan_key,
    pricing_version,
    included_members,
    fee_policy,
    included_card_top_up_nanos,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    grace_until,
    last_provider_event_created,
    metadata,
    updated_at
  ) values (
    p_workspace_id,
    p_addon_key,
    'stripe',
    p_provider_customer_id,
    p_provider_subscription_id,
    p_provider_price_id,
    p_quote_id,
    p_plan_key,
    p_pricing_version,
    p_included_members,
    p_fee_policy,
    coalesce(p_included_card_top_up_nanos, 0),
    p_status,
    p_current_period_start,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    p_grace_until,
    p_provider_event_created,
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (workspace_id, addon_key) do update set
    provider = 'stripe',
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    provider_price_id = excluded.provider_price_id,
    quote_id = excluded.quote_id,
    plan_key = excluded.plan_key,
    pricing_version = excluded.pricing_version,
    included_members = excluded.included_members,
    fee_policy = excluded.fee_policy,
    included_card_top_up_nanos = excluded.included_card_top_up_nanos,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    grace_until = excluded.grace_until,
    last_provider_event_created = excluded.last_provider_event_created,
    metadata = excluded.metadata,
    updated_at = now()
  where public.workspace_addon_subscriptions.last_provider_event_created <= excluded.last_provider_event_created;
end;
$$;

create or replace function public.claim_workspace_top_up_fee_policy(
  p_workspace_id uuid,
  p_stripe_payment_intent_id text,
  p_gross_nanos bigint,
  p_payment_rail text,
  p_seen_at timestamptz default now()
) returns table (
  fee_waived boolean,
  reason text,
  allowance_before_nanos bigint,
  allowance_after_nanos bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := date_trunc('month', p_seen_at at time zone 'UTC')::date;
  v_subscription public.workspace_addon_subscriptions%rowtype;
  v_used bigint := 0;
  v_waived boolean := false;
  v_reason text := 'standard_fee';
  v_before bigint := 0;
  v_after bigint := 0;
begin
  if p_gross_nanos < 0 or p_stripe_payment_intent_id is null or trim(p_stripe_payment_intent_id) = '' then
    raise exception 'invalid top-up fee claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || v_period_start::text || ':top_up_fee', 0)
  );

  return query
  select d.fee_waived, d.reason, d.allowance_before_nanos, d.allowance_after_nanos
  from public.workspace_top_up_fee_decisions d
  where d.stripe_payment_intent_id = p_stripe_payment_intent_id;
  if found then return; end if;

  select * into v_subscription
  from public.workspace_addon_subscriptions s
  where s.workspace_id = p_workspace_id
    and s.addon_key = 'identity'
    and (
      s.status in ('active', 'trialing')
      or (s.status = 'past_due' and s.grace_until > p_seen_at)
    )
  limit 1;

  if v_subscription.id is not null and v_subscription.fee_policy = 'included_allowance' then
    select coalesce(sum(d.gross_nanos), 0) into v_used
    from public.workspace_top_up_fee_decisions d
    where d.workspace_id = p_workspace_id
      and d.period_start = v_period_start
      and d.fee_waived
      and d.payment_rail <> 'bank_transfer';
    v_before := greatest(v_subscription.included_card_top_up_nanos - v_used, 0);

    if p_payment_rail = 'bank_transfer' then
      v_waived := true;
      v_reason := 'included_bank_transfer';
      v_after := v_before;
    elsif p_gross_nanos <= v_before then
      v_waived := true;
      v_reason := 'included_card_allowance';
      v_after := v_before - p_gross_nanos;
    else
      v_reason := 'allowance_exceeded';
      v_after := v_before;
    end if;
  elsif v_subscription.id is null then
    v_reason := 'no_active_subscription';
  end if;

  insert into public.workspace_top_up_fee_decisions (
    stripe_payment_intent_id, workspace_id, period_start, payment_rail,
    gross_nanos, fee_waived, allowance_before_nanos, allowance_after_nanos, reason
  ) values (
    p_stripe_payment_intent_id, p_workspace_id, v_period_start,
    case when p_payment_rail in ('card', 'ach', 'bank_transfer') then p_payment_rail else 'unknown' end,
    p_gross_nanos, v_waived, v_before, v_after, v_reason
  );

  return query select v_waived, v_reason, v_before, v_after;
end;
$$;

create or replace function public.record_workspace_sso_active_user(
  p_workspace_id uuid,
  p_auth_user_id uuid,
  p_seen_at timestamptz default now()
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := date_trunc('month', p_seen_at at time zone 'UTC')::date;
  v_quantity bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || v_period_start::text, 0)
  );

  insert into public.workspace_sso_monthly_active_users (
    workspace_id,
    period_start,
    auth_user_id,
    first_seen_at,
    last_seen_at
  ) values (
    p_workspace_id,
    v_period_start,
    p_auth_user_id,
    p_seen_at,
    p_seen_at
  )
  on conflict (workspace_id, period_start, auth_user_id) do update set
    last_seen_at = greatest(
      public.workspace_sso_monthly_active_users.last_seen_at,
      excluded.last_seen_at
    );

  select count(*)
    into v_quantity
  from public.workspace_sso_monthly_active_users
  where workspace_id = p_workspace_id
    and period_start = v_period_start;

  insert into public.workspace_addon_usage_monthly (
    workspace_id,
    addon_key,
    metric_key,
    period_start,
    quantity,
    updated_at
  ) values (
    p_workspace_id,
    'identity',
    'sso_mau',
    v_period_start,
    v_quantity,
    now()
  )
  on conflict (workspace_id, addon_key, metric_key, period_start) do update set
    quantity = excluded.quantity,
    updated_at = now();

  return v_quantity;
end;
$$;

alter table public.workspace_addon_subscriptions enable row level security;
alter table public.workspace_addon_usage_monthly enable row level security;
alter table public.workspace_sso_monthly_active_users enable row level security;
alter table public.workspace_enterprise_quotes enable row level security;
alter table public.workspace_top_up_fee_decisions enable row level security;

revoke all on public.workspace_addon_subscriptions from anon, authenticated;
revoke all on public.workspace_addon_usage_monthly from anon, authenticated;
revoke all on public.workspace_sso_monthly_active_users from anon, authenticated;
revoke all on public.workspace_enterprise_quotes from anon, authenticated;
revoke all on public.workspace_top_up_fee_decisions from anon, authenticated;

grant select, insert, update, delete on public.workspace_addon_subscriptions to service_role;
grant select, insert, update, delete on public.workspace_addon_usage_monthly to service_role;
grant select, insert, update, delete on public.workspace_sso_monthly_active_users to service_role;
grant select, insert, update, delete on public.workspace_enterprise_quotes to service_role;
grant select, insert, update, delete on public.workspace_top_up_fee_decisions to service_role;

revoke all on function public.sync_workspace_addon_subscription(uuid,text,text,text,text,uuid,text,text,integer,text,bigint,text,timestamptz,timestamptz,boolean,timestamptz,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.sync_workspace_addon_subscription(uuid,text,text,text,text,uuid,text,text,integer,text,bigint,text,timestamptz,timestamptz,boolean,timestamptz,bigint,jsonb) to service_role;
revoke all on function public.record_workspace_sso_active_user(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.record_workspace_sso_active_user(uuid,uuid,timestamptz) to service_role;
revoke all on function public.claim_workspace_top_up_fee_policy(uuid,text,bigint,text,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_workspace_top_up_fee_policy(uuid,text,bigint,text,timestamptz) to service_role;
