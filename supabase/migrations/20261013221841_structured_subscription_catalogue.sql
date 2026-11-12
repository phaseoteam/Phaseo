-- Catalogue subscriptions, not customer billing. Legacy price rows remain as
-- historical evidence; all new readers use offers and their price components.
-- phaseo:allow-destructive-migration reason: Adds DELETE/TRUNCATE guards that prevent catalogue removal; this migration retains all existing rows.
alter table public.v2_subscription_plans
  add column canonical_plan_uuid uuid references public.v2_subscription_plans(plan_uuid),
  add column audience text not null default 'unknown' check (audience in ('individual','team','enterprise','unknown')),
  add column status text not null default 'active' check (status in ('active','retired','merged')),
  add column effective_from timestamptz not null default '-infinity',
  add column source_url text,
  add column verified_at timestamptz;

create table public.v2_subscription_plan_offers (
  offer_uuid uuid primary key default gen_random_uuid(),
  plan_uuid uuid not null references public.v2_subscription_plans(plan_uuid),
  legacy_plan_uuid uuid unique references public.v2_subscription_plans(plan_uuid),
  label text,
  billing_interval text check (billing_interval in ('day','week','month','year')),
  billing_interval_count integer not null default 1 check (billing_interval_count > 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  region_code text,
  minimum_seats integer check (minimum_seats > 0),
  tax_treatment text not null default 'unknown' check (tax_treatment in ('included','excluded','unknown')),
  eligibility text,
  purchase_url text,
  source_url text,
  verified_at timestamptz,
  effective_from timestamptz not null default '-infinity',
  effective_to timestamptz,
  metadata jsonb not null default '{}',
  check (effective_to is null or effective_to > effective_from),
  unique (offer_uuid,plan_uuid)
);
create index v2_subscription_offers_plan_idx on public.v2_subscription_plan_offers(plan_uuid);

create table public.v2_subscription_offer_prices (
  price_uuid uuid primary key default gen_random_uuid(),
  offer_uuid uuid not null references public.v2_subscription_plan_offers(offer_uuid),
  component_key text not null,
  pricing_type text not null check (pricing_type in ('free','fixed','starting_at','custom','usage_based','unknown')),
  amount numeric,
  charge_basis text not null default 'account' check (charge_basis in ('account','seat','unit')),
  seat_type text,
  unit text,
  unit_quantity numeric not null default 1 check (unit_quantity > 0),
  phase text not null default 'standard' check (phase in ('standard','introductory','renewal')),
  starts_at_cycle integer not null default 1 check (starts_at_cycle > 0),
  duration_cycles integer check (duration_cycles > 0),
  display_text text,
  source_url text,
  verified_at timestamptz,
  effective_from timestamptz not null default '-infinity',
  effective_to timestamptz,
  check (effective_to is null or effective_to > effective_from),
  check ((pricing_type='free' and amount=0) or
    (pricing_type in ('fixed','starting_at') and amount is not null and amount >= 0) or
    (pricing_type in ('custom','unknown') and amount is null) or
    (pricing_type='usage_based' and (amount is null or amount >= 0))),
  check (charge_basis <> 'unit' or unit is not null),
  unique (offer_uuid,component_key,phase,starts_at_cycle,effective_from)
);

create table public.v2_subscription_feature_definitions (
  feature_key text primary key,
  label text not null,
  category text not null default 'General',
  value_type text not null default 'text' check (value_type in ('boolean','number','text'))
);
alter table public.v2_subscription_plan_features
  add column feature_key text references public.v2_subscription_feature_definitions(feature_key),
  add column availability text not null default 'unknown' check (availability in ('included','limited','excluded','conditional','unknown')),
  add column value_number numeric,
  add column value_text text,
  add column conditions text,
  add column source_url text,
  add column verified_at timestamptz,
  add column effective_from timestamptz not null default '-infinity';
create index v2_subscription_features_key_idx on public.v2_subscription_plan_features(feature_key);

create table public.v2_subscription_plan_allowances (
  allowance_uuid uuid primary key default gen_random_uuid(),
  plan_uuid uuid not null references public.v2_subscription_plans(plan_uuid),
  offer_uuid uuid,
  feature_key text not null references public.v2_subscription_feature_definitions(feature_key),
  allowance_key text not null,
  allowance_kind text not null default 'quota' check (allowance_kind in ('quota','credit_grant','concurrency','relative_usage')),
  quantity numeric check (quantity >= 0),
  quantity_max numeric,
  quantity_kind text not null default 'unknown' check (quantity_kind in ('exact','up_to','approximate','estimated','unlimited','unknown','custom')),
  unit text not null,
  currency text check (currency ~ '^[A-Z]{3}$'),
  window_kind text not null default 'none' check (window_kind in ('calendar','rolling','none','unknown')),
  window_unit text check (window_unit in ('minute','hour','day','week','month','year')),
  window_count integer check (window_count > 0),
  allocation_basis text not null default 'unknown' check (allocation_basis in ('account','seat','workspace','unknown')),
  pool_scope text not null default 'unknown' check (pool_scope in ('account','workspace','organisation','payer_account','unknown')),
  pool_key text,
  grant_condition text,
  comparison_plan_uuid uuid references public.v2_subscription_plans(plan_uuid),
  comparison_feature_key text references public.v2_subscription_feature_definitions(feature_key),
  overage_policy text not null default 'unknown' check (overage_policy in ('blocked','payg','throttled','unknown')),
  overage_price numeric check (overage_price >= 0),
  overage_currency text check (overage_currency ~ '^[A-Z]{3}$'),
  overage_unit_quantity numeric check (overage_unit_quantity > 0),
  overage_source_url text,
  conditions text,
  display_text text,
  source_url text,
  verified_at timestamptz,
  effective_from timestamptz not null default '-infinity',
  effective_to timestamptz,
  metadata jsonb not null default '{}',
  foreign key (offer_uuid,plan_uuid) references public.v2_subscription_plan_offers(offer_uuid,plan_uuid),
  check (quantity_max is null or (quantity is not null and quantity_max >= quantity)),
  check (quantity_kind not in ('exact','up_to','approximate','estimated') or quantity is not null),
  check (quantity_kind <> 'unlimited' or (quantity is null and quantity_max is null)),
  check ((window_kind in ('calendar','rolling') and window_unit is not null and window_count is not null) or
    (window_kind='unknown' and ((window_unit is null and window_count is null) or (window_unit is not null and window_count is not null))) or
    (window_kind='none' and window_unit is null and window_count is null)),
  check (overage_price is null or (overage_policy='payg' and overage_currency is not null and overage_unit_quantity is not null)),
  check (effective_to is null or effective_to > effective_from)
);
create index v2_subscription_allowances_plan_idx on public.v2_subscription_plan_allowances(plan_uuid);
create index v2_subscription_allowances_offer_idx on public.v2_subscription_plan_allowances(offer_uuid);
create index v2_subscription_allowances_feature_idx on public.v2_subscription_plan_allowances(feature_key);
create index v2_subscription_allowances_comparison_idx on public.v2_subscription_plan_allowances(comparison_plan_uuid);

alter table public.v2_subscription_plan_models
  add column access_mode text not null default 'unknown' check (access_mode in ('selectable','automatic','conditional','unknown')),
  add column access_channel text,
  add column conditions text,
  add column mapping_status text not null default 'unverified' check (mapping_status in ('confirmed','example','unverified')),
  add column source_url text,
  add column verified_at timestamptz,
  add column effective_from timestamptz not null default '-infinity';

-- Select a stable canonical UUID, preferring an active monthly record.
with mapping as (
  select plan_uuid,first_value(plan_uuid) over (partition by lab_slug,plan_id order by
    (effective_to is null or effective_to > now()) desc,(frequency in ('monthly','month')) desc,plan_uuid) canonical
  from public.v2_subscription_plans
)
update public.v2_subscription_plans p set canonical_plan_uuid=m.canonical,
  status=case when p.plan_uuid<>m.canonical then 'merged' when p.effective_to<=now() then 'retired' else 'active' end,
  audience=case when p.other_info->>'plan_type' in ('individual','team','enterprise') then p.other_info->>'plan_type'
    when p.plan_id like '%enterprise%' then 'enterprise' when p.plan_id ~ '(team|business)' then 'team' else 'unknown' end,
  source_url=coalesce(p.other_info->>'source_url',p.link),
  verified_at=coalesce(p.other_info->>'verified_at',p.other_info->>'checked_on',p.other_info->>'verified_on')::timestamptz
from mapping m where p.plan_uuid=m.plan_uuid;
create unique index v2_subscription_plan_identity_idx on public.v2_subscription_plans(plan_id) where status <> 'merged';

insert into public.v2_subscription_plan_offers(offer_uuid,plan_uuid,legacy_plan_uuid,label,billing_interval,billing_interval_count,
  currency,purchase_url,source_url,verified_at,effective_to,metadata,tax_treatment,minimum_seats)
select p.plan_uuid,p.canonical_plan_uuid,p.plan_uuid,p.name||' · '||coalesce(p.frequency,'custom'),
  case lower(p.frequency) when 'daily' then 'day' when 'day' then 'day' when 'weekly' then 'week'
    when 'monthly' then 'month' when 'month' then 'month' when 'quarterly' then 'month'
    when 'yearly' then 'year' when 'annual' then 'year' when 'year' then 'year' end,
  case when p.frequency='quarterly' then 3 else 1 end,
  upper(p.currency),p.link,p.source_url,p.verified_at,p.effective_to,
  jsonb_build_object('legacy_frequency',p.frequency,'legacy_other_info',p.other_info),
  case when p.other_info->>'taxes_included'='false' then 'excluded' when p.other_info->>'taxes_included'='true' then 'included' else 'unknown' end,
  (select nullif(f.feature_value,'')::integer from public.v2_subscription_plan_features f where f.plan_uuid=p.plan_uuid
    and f.feature_name='Minimum Seats' and f.feature_value ~ '^[1-9][0-9]*$' limit 1)
from public.v2_subscription_plans p;

insert into public.v2_subscription_offer_prices(offer_uuid,component_key,pricing_type,amount,charge_basis,
  phase,starts_at_cycle,display_text,source_url,verified_at,effective_to)
select p.plan_uuid,'base',
  case when p.frequency in ('usage','custom') or p.other_info::text ~* '(consumption.based|usage.based)' then
      case when p.other_info::text ~* '(consumption.based|usage.based)' or p.frequency='usage' then 'usage_based' else 'custom' end
    when p.other_info->>'pricing_type'='custom' or exists(select 1 from public.v2_subscription_plan_features f where f.plan_uuid=p.plan_uuid and f.feature_name='Pricing' and lower(f.feature_value)='custom') then 'custom'
    when p.price is null then 'unknown' when p.other_info->>'price_is_starting_at'='true' then 'starting_at'
    when p.price=0 then 'free' else 'fixed' end,
  case when p.frequency in ('usage','custom') or p.other_info->>'pricing_type'='custom' or p.other_info::text ~* '(consumption.based|usage.based)'
    or exists(select 1 from public.v2_subscription_plan_features f where f.plan_uuid=p.plan_uuid and f.feature_name='Pricing' and lower(f.feature_value)='custom') then null else p.price end,
  case when p.other_info->>'price_basis'='per_user' or p.other_info::text ~* '(per (user|seat)|/ (user|seat))' then 'seat' else 'account' end,
  case when p.other_info::text ~* 'from 2nd' then 'renewal' else 'standard' end,
  case when p.other_info::text ~* 'from 2nd' then 2 else 1 end,
  case when jsonb_typeof(p.other_info)='string' then p.other_info#>>'{}' end,
  p.source_url,p.verified_at,p.effective_to
from public.v2_subscription_plans p;

-- Preserve annual-only feature/model facts when consolidating billing variants.
insert into public.v2_subscription_plan_features(plan_uuid,feature_name,feature_value,feature_description,other_info,effective_to)
select p.canonical_plan_uuid,f.feature_name,f.feature_value,f.feature_description,f.other_info,f.effective_to
from public.v2_subscription_plan_features f join public.v2_subscription_plans p using(plan_uuid)
where p.plan_uuid<>p.canonical_plan_uuid and (p.effective_to is null or p.effective_to>now())
order by f.plan_uuid on conflict(plan_uuid,feature_name) do nothing;
insert into public.v2_subscription_plan_models(plan_uuid,model_slug,model_info,rate_limit,other_info,effective_to)
select p.canonical_plan_uuid,m.model_slug,m.model_info,m.rate_limit,m.other_info,m.effective_to
from public.v2_subscription_plan_models m join public.v2_subscription_plans p using(plan_uuid)
where p.plan_uuid<>p.canonical_plan_uuid and (p.effective_to is null or p.effective_to>now())
order by m.plan_uuid on conflict(plan_uuid,model_slug) do nothing;

insert into public.v2_subscription_feature_definitions(feature_key,label)
select distinct 'legacy.'||md5(feature_name),feature_name from public.v2_subscription_plan_features;
update public.v2_subscription_plan_features f set feature_key='legacy.'||md5(f.feature_name),value_text=f.feature_value,
  availability=case lower(f.feature_value) when 'included' then 'included' when 'yes' then 'included' when 'unlimited' then 'included'
    when 'not included' then 'excluded' when 'no' then 'excluded' when 'limited' then 'limited' else 'unknown' end,
  source_url=coalesce(f.other_info->>'source_url',p.source_url),
  verified_at=coalesce(f.other_info->>'verified_at',f.other_info->>'verified_on')::timestamptz
from public.v2_subscription_plans p where p.plan_uuid=f.plan_uuid;
update public.v2_subscription_plan_models m set source_url=p.source_url,
  mapping_status=case when m.other_info::text ~* 'example' then 'example' else 'unverified' end
from public.v2_subscription_plans p where p.plan_uuid=m.plan_uuid;

-- Simple explicit quotas are parsed; ambiguous wording remains intact as evidence.
insert into public.v2_subscription_plan_allowances(plan_uuid,feature_key,allowance_key,quantity,quantity_kind,unit,
  window_kind,window_unit,window_count,display_text,conditions,source_url,verified_at,effective_to)
select f.plan_uuid,f.feature_key,f.feature_name,
  replace((regexp_match(f.feature_value,'^([0-9,]+) / (Day|Month)$'))[1],',','')::numeric,
  'exact',case when f.feature_name='Points' then 'poe_points' else lower(replace(f.feature_name,' ','_')) end,
  'calendar',lower((regexp_match(f.feature_value,'^([0-9,]+) / (Day|Month)$'))[2]),1,
  f.feature_value,f.feature_description,f.source_url,f.verified_at,f.effective_to
from public.v2_subscription_plan_features f join public.v2_subscription_plans p using(plan_uuid)
where p.status<>'merged' and f.feature_value ~ '^([0-9,]+) / (Day|Month)$';

-- Composite team pricing and explicit currency credit grants.
insert into public.v2_subscription_offer_prices(offer_uuid,component_key,pricing_type,amount,charge_basis,seat_type,source_url)
select o.offer_uuid,'developer_seat','fixed',40,'seat','full_developer',o.source_url
from public.v2_subscription_plan_offers o join public.v2_subscription_plans p on p.plan_uuid=o.plan_uuid
where p.plan_id='windsurf-teams' and o.billing_interval='month' and o.billing_interval_count=1
  and o.metadata::text ~* 'additional.*40';

insert into public.v2_subscription_plan_allowances(plan_uuid,feature_key,allowance_key,allowance_kind,quantity,quantity_kind,
  unit,currency,window_kind,window_unit,window_count,allocation_basis,grant_condition,display_text,conditions,source_url,effective_to)
select f.plan_uuid,f.feature_key,f.feature_name,'credit_grant',
  replace((regexp_match(f.feature_value,'^\$([0-9,.]+) /'))[1],',','')::numeric,'exact',
  'currency_credit','USD','calendar',case when f.feature_value ~* '/ Day' then 'day' else 'month' end,1,
  case when f.feature_value ~* '/ User' then 'seat' else 'account' end,
  case when f.feature_value ~* 'on login' then 'login' end,f.feature_value,f.feature_description,f.source_url,f.effective_to
from public.v2_subscription_plan_features f join public.v2_subscription_plans p using(plan_uuid)
where p.status<>'merged' and f.feature_name ~* 'credits' and f.feature_value ~ '^\$([0-9,.]+) /';

-- Other quota records retain qualifiers and original text, including unknown
-- quantitative limits. Do not interpret a marketing usage ratio as a hard cap.
insert into public.v2_subscription_plan_allowances(plan_uuid,feature_key,allowance_key,allowance_kind,
  quantity,quantity_max,quantity_kind,unit,window_kind,window_unit,window_count,allocation_basis,pool_scope,
  grant_condition,display_text,conditions,source_url,effective_to)
select f.plan_uuid,f.feature_key,f.feature_name,
  case when f.feature_value ~ '^[0-9.]+x' then 'relative_usage'
    when f.feature_name in ('Concurrency','Agent Usage') and f.feature_value ~ '^[0-9]' then 'concurrency'
    when f.feature_name ~* '(credits|points)' then 'credit_grant' else 'quota' end,
  case when f.feature_value ~ '^[0-9][0-9,.]*[–-][0-9]' then replace((regexp_match(f.feature_value,'^([0-9,.]+)'))[1],',','')::numeric
    when f.feature_value ~* '^(up to (approx\. )?)?[0-9][0-9,.]*( |x|$)' then replace((regexp_match(f.feature_value,'([0-9][0-9,.]*)'))[1],',','')::numeric end,
  case when f.feature_value ~ '^[0-9][0-9,.]*[–-][0-9]' then replace((regexp_match(f.feature_value,'[–-]([0-9,.]+)'))[1],',','')::numeric end,
  case when lower(f.feature_value)='unlimited' then 'unlimited'
    when f.feature_value ~ '^[0-9][0-9,.]*[–-][0-9]' then 'estimated'
    when f.feature_value ~* '^up to approx' then 'approximate'
    when f.feature_value ~* '^up to [0-9]' then 'up_to'
    when f.feature_value ~ '^[0-9][0-9,.]*( |x|$)' then 'exact' else 'unknown' end,
  case when f.feature_value ~ '^[0-9.]+x' then 'multiplier'
    when f.feature_name ~* 'credits' then p.lab_slug||'_credits'
    when f.feature_name='Agent Usage' then 'agents'
    when f.feature_name ~* '5.hour|weekly limit' then 'prompts'
    when f.feature_name='Video Generation' then 'clips'
    when f.feature_name='Java Transformations' then 'lines'
    when f.feature_name in ('TPM','TPD') then 'tokens'
    when f.feature_name='RPM' then 'requests'
    else lower(replace(f.feature_name,' ','_')) end,
  case when f.feature_name ~* '5.hour' then 'rolling'
    when f.feature_value ~* '/ (day|month)|monthly' or f.feature_name ~* 'weekly limit|TPM|TPD|RPM' then 'calendar' else 'none' end,
  case when f.feature_name ~* '5.hour' then 'hour' when f.feature_name ~* 'weekly limit' then 'week'
    when f.feature_name in ('TPM','RPM') then 'minute' when f.feature_name='TPD' then 'day'
    when f.feature_value ~* '/ day' then 'day' when f.feature_value ~* '/ month|monthly' then 'month' end,
  case when f.feature_name ~* '5.hour' then 5
    when f.feature_value ~* '/ (day|month)|monthly' or f.feature_name ~* 'weekly limit|TPM|TPD|RPM' then 1 end,
  case when f.feature_value ~* '/ User' then 'seat' else 'unknown' end,
  case when f.feature_description ~* 'payer.account' then 'payer_account'
    when f.feature_description ~* 'pooled across.*(organization|enterprise)' then 'organisation' else 'unknown' end,
  case when f.feature_value ~* 'on login' then 'login' end,
  f.feature_value,f.feature_description,f.source_url,f.effective_to
from public.v2_subscription_plan_features f join public.v2_subscription_plans p using(plan_uuid)
where p.status<>'merged' and (f.feature_name ~* '(credits|quota|limit|usage|requests|points|concurrency|^RPM$|^TPM$|^TPD$|video generation|java transformations)' or f.feature_value ~ '^[0-9.]+x ')
  and not exists(select 1 from public.v2_subscription_plan_allowances a where a.plan_uuid=f.plan_uuid and a.allowance_key=f.feature_name)
  and f.feature_name not in ('Minimum Seats','Model Access Priority');

update public.v2_subscription_plan_allowances a set comparison_plan_uuid=(
  select target.plan_uuid from public.v2_subscription_plans target
  join public.v2_subscription_plans owner on owner.plan_uuid=a.plan_uuid
  where target.status='active' and target.plan_uuid<>a.plan_uuid and (
    position(lower(target.name) in lower(regexp_replace(a.display_text,'^[0-9.]+x ','')))>0 or
    (target.lab_slug=owner.lab_slug and position(lower(regexp_replace(target.name,'^(ChatGPT |Google AI |Cursor |Claude |GLM Coding Plan )','')) in lower(regexp_replace(a.display_text,'^[0-9.]+x ','')))>0))
  order by (target.lab_slug=owner.lab_slug) desc,length(target.name) desc limit 1)
where a.allowance_kind='relative_usage';

-- A provider can publish multiple quota windows without an exact allowance.
insert into public.v2_subscription_plan_allowances(plan_uuid,feature_key,allowance_key,quantity_kind,unit,
  window_kind,window_unit,window_count,display_text,conditions,source_url,effective_to)
select a.plan_uuid,a.feature_key,a.allowance_key||':'||w.label,'unknown',a.unit,
  w.kind,w.unit,w.count,a.display_text,a.conditions,a.source_url,a.effective_to
from public.v2_subscription_plan_allowances a
cross join (values ('five_hour','rolling','hour',5),('weekly','unknown','week',1)) w(label,kind,unit,count)
where a.allowance_key='Quota Windows' and a.display_text='5-hour rolling and weekly';
update public.v2_subscription_plan_allowances set effective_to=now()
where allowance_key='Quota Windows' and display_text='5-hour rolling and weekly';

update public.v2_subscription_plan_allowances a set overage_policy='payg',overage_price=0.01,overage_currency='USD',overage_unit_quantity=1,
  overage_source_url=a.source_url
where a.allowance_key='GitHub AI Credits' and a.conditions ~ '0\.01 per credit';
update public.v2_subscription_plan_allowances a set overage_policy='payg',overage_price=0.003,overage_currency='USD',overage_unit_quantity=1,
  overage_source_url=a.source_url where a.allowance_key='Java Transformations' and a.conditions ~ '0\.003 per line';

-- New tables inherit catalogue public-read/backend-write rules and history.
do $$ declare t text; begin
  foreach t in array array['v2_subscription_plan_offers','v2_subscription_offer_prices','v2_subscription_feature_definitions','v2_subscription_plan_allowances'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to anon,authenticated using (true)',t||'_select',t);
    execute format('grant select on public.%I to anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
    execute format('create trigger catalogue_row_history after insert or update or delete on public.%I for each row execute function catalogue_private.record_row_history()',t);
    execute format('create trigger catalogue_no_removal before delete or truncate on public.%I for each statement execute function public.prevent_catalogue_removal()',t);
  end loop;
end $$;

-- One public contract for list/detail/model pages; timestamps apply at every layer.
create function public.get_v2_subscription_catalogue(p_plan_id text default null,p_model_slug text default null,p_include_hidden boolean default false)
returns setof jsonb language sql stable security invoker set search_path=public,pg_temp as $$
select to_jsonb(p)-'price'-'currency'-'frequency' || jsonb_build_object(
  'organisation_id',p.lab_slug,
  'organisation',case when l.lab_slug is null then null else jsonb_build_object('organisation_id',l.lab_slug,'name',l.name,'colour',l.metadata->>'colour') end,
  'offers',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('components',coalesce((select jsonb_agg(to_jsonb(c) order by c.starts_at_cycle,c.component_key)
    from v2_subscription_offer_prices c where c.offer_uuid=o.offer_uuid and c.effective_from<=now() and (c.effective_to is null or c.effective_to>now())),'[]'::jsonb)) order by o.billing_interval,o.billing_interval_count,o.offer_uuid)
    from v2_subscription_plan_offers o where o.plan_uuid=p.plan_uuid and o.effective_from<=now() and (o.effective_to is null or o.effective_to>now())),'[]'::jsonb),
  'features',coalesce((select jsonb_agg(to_jsonb(f) order by f.feature_name) from v2_subscription_plan_features f where f.plan_uuid=p.plan_uuid and f.effective_from<=now() and (f.effective_to is null or f.effective_to>now())),'[]'::jsonb),
  'allowances',coalesce((select jsonb_agg(to_jsonb(a) order by a.allowance_key) from v2_subscription_plan_allowances a where a.plan_uuid=p.plan_uuid and a.effective_from<=now() and (a.effective_to is null or a.effective_to>now()) and (a.offer_uuid is null or exists(select 1 from v2_subscription_plan_offers o where o.offer_uuid=a.offer_uuid and o.effective_from<=now() and (o.effective_to is null or o.effective_to>now())))),'[]'::jsonb),
  'models',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('model_id',m.model_slug,'model',jsonb_build_object('model_id',v.model_slug,'name',v.name,'organisation_id',v.lab_slug,'organisation_name',ml.name)) order by m.model_slug)
    from v2_subscription_plan_models m join v2_models v on v.model_slug=m.model_slug left join v2_labs ml on ml.lab_slug=v.lab_slug
    where m.plan_uuid=p.plan_uuid and (not v.hidden or p_include_hidden) and m.effective_from<=now() and (m.effective_to is null or m.effective_to>now())),'[]'::jsonb))
from v2_subscription_plans p left join v2_labs l on l.lab_slug=p.lab_slug
where p.status='active' and p.effective_from<=now() and (p.effective_to is null or p.effective_to>now())
  and (not p_include_hidden or current_user in ('postgres','service_role'))
  and (p_plan_id is null or p.plan_id=p_plan_id)
  and (p_model_slug is null or exists(select 1 from v2_subscription_plan_models m join v2_models v on v.model_slug=m.model_slug
    where m.plan_uuid=p.plan_uuid and m.model_slug=p_model_slug and (not v.hidden or p_include_hidden) and m.effective_from<=now() and (m.effective_to is null or m.effective_to>now())))
order by p.name,p.plan_id;
$$;
revoke all on function public.get_v2_subscription_catalogue(text,text,boolean) from public;
grant execute on function public.get_v2_subscription_catalogue(text,text,boolean) to anon,authenticated,service_role;

comment on column public.v2_subscription_plans.price is 'Historical legacy price; new pricing belongs to v2_subscription_offer_prices.';
comment on column public.v2_subscription_plans.frequency is 'Historical legacy frequency; new billing periods belong to v2_subscription_plan_offers.';

create function public.canonicalize_subscription_identity() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$ begin
  if tg_table_name='v2_subscription_plans' then
    new.canonical_plan_uuid:=coalesce(new.canonical_plan_uuid,new.plan_uuid);
  else
    select coalesce(canonical_plan_uuid,plan_uuid) into new.plan_uuid from v2_subscription_plans where plan_uuid=new.plan_uuid;
  end if;
  return new;
end $$;
create trigger subscription_identity before insert on public.v2_subscription_plans
for each row execute function public.canonicalize_subscription_identity();
create trigger subscription_model_identity before insert on public.v2_subscription_plan_models
for each row execute function public.canonicalize_subscription_identity();
revoke all on function public.canonicalize_subscription_identity() from public,anon,authenticated;
grant execute on function public.canonicalize_subscription_identity() to service_role;

-- Extend the existing optimistic, actor-aware registry boundary.
create or replace function public.mutate_v2_admin_registry(
  p_actor_user_id uuid, p_resource text, p_values jsonb, p_before jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_table text; v_keys text[]; v_allowed text[]; v_identity jsonb; v_existing jsonb;
  v_columns text; v_select text; v_updates text; v_result jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  case p_resource
    when 'families' then v_table:='v2_model_families'; v_keys:=array['family_slug']; v_allowed:=array['family_slug','lab_slug','name','metadata'];
    when 'service-tiers' then v_table:='v2_service_tiers'; v_keys:=array['service_tier_slug']; v_allowed:=array['service_tier_slug','display_name','description','status','metadata'];
    when 'meters' then v_table:='v2_meter_definitions'; v_keys:=array['meter_key']; v_allowed:=array['meter_key','display_name','modality','direction','unit','default_unit_quantity','description','status','metadata'];
    when 'regions' then v_table:='v2_provider_regions'; v_keys:=array['provider_region_id']; v_allowed:=array['provider_region_id','provider_slug','region_code','display_name','execution_supported','data_residency_supported','status','routing_enabled','metadata'];
    when 'variants' then v_table:='v2_route_variants'; v_keys:=array['variant_id']; v_allowed:=array['variant_id','provider_model_id','variant_key','provider_region_id','execution_region','data_region','service_tier_slug','status','routing_enabled','endpoint_label','metadata'];
    when 'plans' then v_table:='v2_subscription_plans'; v_keys:=array['plan_uuid']; v_allowed:=array['plan_uuid','plan_id','name','lab_slug','description','audience','status','link','other_info','source_url','verified_at','effective_from','effective_to'];
    when 'plan-features' then v_table:='v2_subscription_plan_features'; v_keys:=array['plan_uuid','feature_name']; v_allowed:=array['plan_uuid','feature_name','feature_value','feature_description','other_info','feature_key','availability','value_number','value_text','conditions','source_url','verified_at','effective_from','effective_to'];
    when 'plan-offers' then v_table:='v2_subscription_plan_offers'; v_keys:=array['offer_uuid']; v_allowed:=array['offer_uuid','plan_uuid','label','billing_interval','billing_interval_count','currency','region_code','minimum_seats','tax_treatment','eligibility','purchase_url','source_url','verified_at','effective_from','effective_to','metadata'];
    when 'offer-prices' then v_table:='v2_subscription_offer_prices'; v_keys:=array['price_uuid']; v_allowed:=array['price_uuid','offer_uuid','component_key','pricing_type','amount','charge_basis','seat_type','unit','unit_quantity','phase','starts_at_cycle','duration_cycles','display_text','source_url','verified_at','effective_from','effective_to'];
    when 'feature-definitions' then v_table:='v2_subscription_feature_definitions'; v_keys:=array['feature_key']; v_allowed:=array['feature_key','label','category','value_type'];
    when 'plan-allowances' then v_table:='v2_subscription_plan_allowances'; v_keys:=array['allowance_uuid']; v_allowed:=array['allowance_uuid','plan_uuid','offer_uuid','feature_key','allowance_key','allowance_kind','quantity','quantity_max','quantity_kind','unit','currency','window_kind','window_unit','window_count','allocation_basis','pool_scope','pool_key','grant_condition','comparison_plan_uuid','comparison_feature_key','overage_policy','overage_price','overage_currency','overage_unit_quantity','overage_source_url','conditions','display_text','source_url','verified_at','effective_from','effective_to','metadata'];
    when 'plan-model-access' then v_table:='v2_subscription_plan_models'; v_keys:=array['plan_uuid','model_slug']; v_allowed:=array['plan_uuid','model_slug','model_info','rate_limit','other_info','access_mode','access_channel','conditions','mapping_status','source_url','verified_at','effective_from','effective_to'];
    else raise exception 'unknown registry';
  end case;
  if p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'record must be an object'; end if;
  if p_values->'effective_from'='null'::jsonb then p_values:=p_values-'effective_from'; end if;
  if exists(select 1 from jsonb_object_keys(p_values) key where not key=any(v_allowed)) then raise exception 'unknown record field'; end if;
  if exists(select 1 from unnest(v_keys) key where nullif(p_values->>key,'') is null) then raise exception 'record identity required'; end if;
  select jsonb_object_agg(key,p_values->key) into v_identity from unnest(v_keys) key;
  if p_before is not null and not p_before @> v_identity then raise exception 'record identity cannot change'; end if;
  execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1 for update',v_table) into v_existing using v_identity;
  if v_existing is distinct from p_before then raise exception 'Record changed. Reload before saving.'; end if;
  if p_resource in ('plan-offers','plan-allowances','plan-features','plan-model-access') and not exists
    (select 1 from v2_subscription_plans p where p.plan_uuid=(p_values->>'plan_uuid')::uuid and p.status<>'merged') then
    raise exception 'Use the canonical subscription plan';
  end if;
  if v_existing is not null and p_resource in ('plan-offers','plan-allowances') and p_values->>'plan_uuid' is distinct from v_existing->>'plan_uuid' then
    raise exception 'Subscription record ownership cannot change';
  end if;
  if v_existing is not null and p_resource='offer-prices' and p_values->>'offer_uuid' is distinct from v_existing->>'offer_uuid' then
    raise exception 'Price offer ownership cannot change';
  end if;
  if p_resource='plans' and v_existing->>'status'='merged' then raise exception 'Edit the canonical plan instead'; end if;
  if p_resource='regions' and v_existing is not null and (p_values->>'provider_slug' is distinct from v_existing->>'provider_slug' or p_values->>'region_code' is distinct from v_existing->>'region_code') then raise exception 'provider region identity cannot change'; end if;
  if p_resource='variants' then
    if v_existing is not null and (p_values->>'provider_model_id' is distinct from v_existing->>'provider_model_id' or p_values->>'variant_key' is distinct from v_existing->>'variant_key') then raise exception 'route variant identity cannot change'; end if;
    if p_values->>'provider_region_id' is not null and not exists(select 1 from public.v2_provider_regions r join public.v2_model_provider_routes m on m.provider_slug=r.provider_slug where r.provider_region_id=(p_values->>'provider_region_id')::uuid and m.provider_model_id=p_values->>'provider_model_id') then raise exception 'region belongs to another provider'; end if;
  end if;
  if p_resource in ('regions','variants') and p_values->>'status' in ('disabled','retired','deprecated') then p_values:=p_values||jsonb_build_object('routing_enabled',false); end if;
  if p_resource in ('families','service-tiers','meters','regions','variants','plans') then p_values:=p_values||jsonb_build_object('updated_at',now()); end if;
  perform set_config('phaseo.catalogue_actor',p_actor_user_id::text,true);
  select string_agg(format('%I',key),','), string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',v_table,key),','), string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,v_table,key),',')
    into v_columns,v_select,v_updates from jsonb_object_keys(p_values) key;
  if v_existing is null then
    execute format('insert into public.%I (%s) select %s returning to_jsonb(%I.*)',v_table,v_columns,v_select,v_table) into v_result using p_values;
  else
    execute format('update public.%I t set %s where to_jsonb(t) @> $2 returning to_jsonb(t)',v_table,v_updates) into v_result using p_values,v_identity;
  end if;
  return v_result;
end $$;
revoke all on function public.mutate_v2_admin_registry(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_registry(uuid,text,jsonb,jsonb) to service_role;

-- The model editor creates a plan and its first offer atomically.
create function public.mutate_v2_admin_subscription_plan(p_actor_user_id uuid,p_action text,p_plan_uuid uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_before jsonb; v_plan jsonb; v_offer jsonb; v_component jsonb; v_offer_uuid uuid;
begin
  if p_action not in ('create','update') then raise exception 'Unsupported subscription action'; end if;
  select to_jsonb(p) into v_before from v2_subscription_plans p where p.plan_uuid=p_plan_uuid for update;
  if p_action='create' and v_before is not null then raise exception 'Plan already exists'; end if;
  if p_action='update' and v_before is null then raise exception 'Plan does not exist'; end if;
  v_plan:=public.mutate_v2_admin_registry(p_actor_user_id,'plans',jsonb_build_object('plan_uuid',p_plan_uuid,
    'plan_id',p_payload->>'plan_id','name',p_payload->>'name','lab_slug',p_payload->>'organisation_id',
    'description',p_payload->>'description','link',p_payload->>'link',
    'audience',coalesce(p_payload->>'audience','unknown'),'status',coalesce(p_payload->>'status','active'),
    'other_info',coalesce(p_payload->'other_info','{}'::jsonb)),v_before);
  if p_payload ? 'offer' and p_payload->'offer'<>'null'::jsonb then
    v_offer_uuid:=coalesce((p_payload->'offer'->>'offer_uuid')::uuid,gen_random_uuid());
    select to_jsonb(o) into v_before from v2_subscription_plan_offers o where o.offer_uuid=v_offer_uuid for update;
    if v_before is not null and (v_before->>'plan_uuid')::uuid<>p_plan_uuid then raise exception 'Offer belongs to another plan'; end if;
    v_offer:=public.mutate_v2_admin_registry(p_actor_user_id,'plan-offers',
      ((p_payload->'offer')-'components')||jsonb_build_object('offer_uuid',v_offer_uuid,'plan_uuid',p_plan_uuid),v_before);
    for v_component in select value from jsonb_array_elements(coalesce(p_payload->'offer'->'components','[]')) loop
      v_component:=v_component||jsonb_build_object('offer_uuid',v_offer_uuid,'price_uuid',coalesce(v_component->>'price_uuid',gen_random_uuid()::text));
      select to_jsonb(c) into v_before from v2_subscription_offer_prices c where c.price_uuid=(v_component->>'price_uuid')::uuid for update;
      if v_before is not null and (v_before->>'offer_uuid')::uuid<>v_offer_uuid then raise exception 'Price belongs to another offer'; end if;
      perform public.mutate_v2_admin_registry(p_actor_user_id,'offer-prices',v_component,v_before);
    end loop;
  end if;
  return v_plan;
end $$;
revoke all on function public.mutate_v2_admin_subscription_plan(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_subscription_plan(uuid,text,uuid,jsonb) to service_role;
