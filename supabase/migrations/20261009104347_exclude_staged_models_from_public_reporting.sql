-- Public reporting requires a released model and an enabled public route.
-- Internal request history remains private even after the model is released.
create or replace function public.public_reporting_route_is_visible(
  p_model_slug text, p_provider_model_id text default null,
  p_provider_slug text default null, p_occurred_at timestamptz default now()
)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.v2_models model
    join public.v2_model_provider_routes route on route.model_slug = model.model_slug
    where model.model_slug = p_model_slug
      and model.hidden = false
      and model.status not in ('disabled', 'not_ready', 'coming_soon', 'testing', 'draft', 'pending')
      and (model.released_at is null or model.released_at <= p_occurred_at)
      and route.access_scope = 'public'
      and route.phaseo_status = 'enabled'
      and route.routing_enabled = true
      and route.status in ('active', 'degraded')
      and route.is_stealth = false
      and route.provider_availability_status in ('available', 'preview', 'limited_access')
      and (p_provider_model_id is null or route.provider_model_id = p_provider_model_id)
      and (p_provider_slug is null or route.provider_slug = p_provider_slug)
      and (route.effective_from is null or route.effective_from <= p_occurred_at)
      and (route.effective_to is null or route.effective_to > p_occurred_at)
  );
$$;
revoke all on function public.public_reporting_route_is_visible(text,text,text,timestamptz) from public;
grant execute on function public.public_reporting_route_is_visible(text,text,text,timestamptz) to anon, authenticated, service_role;

-- Preserve existing history without an unbounded request-fact backfill. New
-- rows are always classified by the trigger, never by a caller-supplied flag.
alter table public.v2_request_facts add column public_reporting_allowed boolean not null default true;
alter table public.v2_request_facts alter column public_reporting_allowed set default false;
alter table public.data_contributions add column public_reporting_allowed boolean not null default true;
alter table public.data_contributions alter column public_reporting_allowed set default false;

create or replace function private.set_request_public_reporting_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.public_reporting_allowed := new.provider_model_id is not null
    and public.public_reporting_route_is_visible(
      coalesce(new.routed_model_slug, new.requested_model_slug), new.provider_model_id, null, new.occurred_at
    )
    and coalesce(new.safe_metadata->>'testing_mode', 'false') <> 'true';
  if tg_op = 'UPDATE' then
    new.public_reporting_allowed := old.public_reporting_allowed and new.public_reporting_allowed;
  end if;
  return new;
end;
$$;
create trigger set_public_reporting_scope before insert or update on public.v2_request_facts
for each row execute function private.set_request_public_reporting_scope();

create or replace function private.set_contribution_public_reporting_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.public_reporting_allowed := new.provider_slug is not null
    and public.public_reporting_route_is_visible(new.model_slug, null, new.provider_slug, new.occurred_at);
  if tg_op = 'UPDATE' then
    new.public_reporting_allowed := old.public_reporting_allowed and new.public_reporting_allowed;
  end if;
  return new;
end;
$$;
create trigger set_public_reporting_scope before insert or update on public.data_contributions
for each row execute function private.set_contribution_public_reporting_scope();
revoke all on function private.set_request_public_reporting_scope(), private.set_contribution_public_reporting_scope() from public, anon, authenticated;

-- These views are the common reporting boundary, including for service-role
-- consumers that bypass RLS. Raw facts and private rollups remain unchanged.
create view public.reporting_request_facts with (security_invoker = true) as
select fact.* from public.v2_request_facts fact
where fact.public_reporting_allowed
  and public.public_reporting_route_is_visible(coalesce(fact.routed_model_slug, fact.requested_model_slug), fact.provider_model_id);
create view public.reporting_usage_daily with (security_invoker = true) as
select usage.* from public.v2_public_usage_daily usage
where public.public_reporting_route_is_visible(usage.model_slug, usage.provider_model_id);
create view public.reporting_usage_hourly with (security_invoker = true) as
select usage.* from public.v2_public_usage_hourly usage
where public.public_reporting_route_is_visible(usage.model_slug, usage.provider_model_id);
create view public.reporting_model_user_usage_daily with (security_invoker = true) as
select usage.* from public.public_model_user_usage_daily usage
where public.public_reporting_route_is_visible(usage.model_id, null, usage.provider_id);
create view public.reporting_model_workspace_usage_weekly with (security_invoker = true) as
select usage.* from public.public_model_workspace_usage_weekly usage
where public.public_reporting_route_is_visible(usage.model_id);
create view public.reporting_model_task_daily with (security_invoker = true) as
select usage.* from public.public_model_task_daily usage
where public.public_reporting_route_is_visible(usage.model_slug, null, usage.provider_slug);

-- Keep public counts alongside private classification counts. Contributions
-- expire, so public reports must retain the aggregate rather than rescan them.
alter table public.request_classification_daily add column public_request_count bigint;
alter table public.request_classification_daily add column public_input_tokens bigint;
alter table public.request_classification_daily add column public_output_tokens bigint;
create view public.reporting_classification_daily with (security_invoker = true) as
select usage_date, workspace_id, classifier_id, primary_category, model_slug, provider_slug,
  coalesce(public_request_count, request_count) as request_count,
  coalesce(public_input_tokens, input_tokens) as input_tokens,
  coalesce(public_output_tokens, output_tokens) as output_tokens, updated_at
from public.request_classification_daily
where coalesce(public_request_count, request_count) > 0
  and public.public_reporting_route_is_visible(model_slug, null, provider_slug);
create view public.reporting_effective_pricing_daily with (security_invoker = true) as
select usage.* from public.v2_public_effective_pricing_daily usage
where public.public_reporting_route_is_visible(usage.model_slug, null, usage.provider_id);
create view public.reporting_provider_health_daily with (security_invoker = true) as
select usage.* from public.v2_public_provider_health_daily usage
where public.public_reporting_route_is_visible(usage.model_slug, usage.provider_model_id);
revoke all on public.reporting_request_facts, public.reporting_usage_daily, public.reporting_usage_hourly,
  public.reporting_model_user_usage_daily, public.reporting_model_workspace_usage_weekly,
  public.reporting_model_task_daily, public.reporting_classification_daily,
  public.reporting_effective_pricing_daily, public.reporting_provider_health_daily from public, anon, authenticated;
grant select on public.reporting_request_facts, public.reporting_usage_daily, public.reporting_usage_hourly,
  public.reporting_model_user_usage_daily, public.reporting_model_workspace_usage_weekly,
  public.reporting_model_task_daily, public.reporting_classification_daily,
  public.reporting_effective_pricing_daily, public.reporting_provider_health_daily to service_role;

-- A caller must not bypass the public task-report boundary with a direct read.
create policy public_task_model_visibility on public.public_model_task_daily as restrictive
for select to anon, authenticated
using (public.public_reporting_route_is_visible(model_slug, null, provider_slug));
create policy public_usage_model_visibility on public.v2_public_usage_daily as restrictive
for select to anon, authenticated using (public.public_reporting_route_is_visible(model_slug, provider_model_id));
create policy public_usage_model_visibility on public.v2_public_usage_hourly as restrictive
for select to anon, authenticated using (public.public_reporting_route_is_visible(model_slug, provider_model_id));
create policy public_pricing_model_visibility on public.v2_public_effective_pricing_daily as restrictive
for select to anon, authenticated using (public.public_reporting_route_is_visible(model_slug, null, provider_id));
create policy public_health_model_visibility on public.v2_public_provider_health_daily as restrictive
for select to anon, authenticated using (public.public_reporting_route_is_visible(model_slug, provider_model_id));
create policy public_usage_meter_visibility on public.v2_public_usage_daily_meters as restrictive
for select to anon, authenticated using (exists (
  select 1 from public.v2_public_usage_daily usage where usage.rollup_id = v2_public_usage_daily_meters.rollup_id
));
create policy public_usage_meter_visibility on public.v2_public_usage_hourly_meters as restrictive
for select to anon, authenticated using (exists (
  select 1 from public.v2_public_usage_hourly usage where usage.rollup_id = v2_public_usage_hourly_meters.rollup_id
));

-- Retarget the named reporting readers while retaining their signatures,
-- grants, security mode, metric definitions and deployed performance fixes.
-- This is deliberately scoped; workspace/private reporting is not rewritten.
do $migration$
declare
  target record;
  definition text;
  source_name text;
  target_name text;
begin
  for target in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'get_public_market_share', 'get_public_market_share_timeseries', 'get_public_model_rankings',
      'get_public_model_retention_rankings', 'get_public_period_leaderboard', 'get_public_provider_usage_summary',
      'get_public_ranking_usage_window', 'get_public_summary_stats', 'get_public_tool_call_timeseries',
      'get_public_trending_models', 'get_public_unique_user_timeseries', 'get_public_context_length_distribution',
      'get_public_geography_usage', 'get_model_performance_overview', 'get_v2_model_apps',
      'get_v2_model_performance_colos_unfiltered', 'get_v2_model_performance_overview',
      'get_v2_model_performance_metrics_unsuppressed', 'get_v2_model_provider_health_metrics_unfiltered',
      'get_v2_model_usage_daily', 'get_v2_model_effective_pricing_daily', 'get_v2_model_provider_health',
      'get_v2_public_model_weekly_metrics', 'get_v2_public_model_weekly_metrics_base',
      'get_free_router_usage_summary', 'get_model_token_trajectory', 'get_v2_model_cached_input_metrics',
      'get_v2_model_provider_30m_performance_v1', 'get_v2_model_provider_hourly_performance_v1',
      'get_v2_model_provider_hourly_performance_v2', 'get_v2_model_provider_percentile_series',
      'get_v2_model_provider_percentile_series_v2_unsuppressed', 'get_v2_model_provider_tier_health_metrics',
      'get_v2_model_quality_hourly_v1',
      'refresh_public_model_task_daily', 'refresh_public_model_user_usage_daily', 'refresh_public_model_workspace_usage_weekly'
    ])
  loop
    definition := pg_get_functiondef(target.oid);
    for source_name, target_name in select * from (values
      ('v2_request_facts', 'reporting_request_facts'),
      ('v2_public_usage_daily', 'reporting_usage_daily'),
      ('v2_public_usage_hourly', 'reporting_usage_hourly'),
      ('public_model_user_usage_daily', 'reporting_model_user_usage_daily'),
      ('public_model_workspace_usage_weekly', 'reporting_model_workspace_usage_weekly'),
      ('public_model_task_daily', 'reporting_model_task_daily'),
      ('request_classification_daily', 'reporting_classification_daily'),
      ('v2_public_effective_pricing_daily', 'reporting_effective_pricing_daily'),
      ('v2_public_provider_health_daily', 'reporting_provider_health_daily')
    ) mapping loop
      -- Only FROM/JOIN sources: refresh functions still write the base tables.
      definition := regexp_replace(definition,
        '(from|join)([[:space:]]+)(public[.])?' || source_name || '\M',
        '\1\2public.' || target_name, 'gi');
      definition := regexp_replace(definition,
        '(delete[[:space:]]+from[[:space:]]+)public[.]' || target_name || '\M',
        '\1public.' || source_name, 'gi');
    end loop;
    execute definition;
  end loop;
end;
$migration$;

-- Only the public loops use eligible facts. Private accounting and usage still
-- include every request, including internal tests.
do $migration$
declare
  definition text := pg_get_functiondef('public.process_v2_analytics_outbox(integer)'::regprocedure);
  boundary integer;
begin
  boundary := strpos(definition, 'insert into public.v2_public_usage_daily (');
  if boundary = 0 then raise exception 'Public analytics loop not found'; end if;
  definition := left(definition, boundary - 1) || regexp_replace(substring(definition from boundary),
    '(from|join)([[:space:]]+)public[.]v2_request_facts\M', '\1\2public.reporting_request_facts', 'gi');
  execute definition;
end;
$migration$;

-- Existing public usage compatibility views need the same service-role filter.
-- Pricing and provider-health writers also exclude staged facts at source.
do $migration$
declare target regprocedure; signature text; definition text;
begin
  foreach signature in array array[
    'public.sync_v2_public_effective_pricing_daily()',
    'public.refresh_v2_provider_health_for_attempt()',
    'private.drain_provider_health_refresh(integer)'
  ] loop
    target := to_regprocedure(signature);
    -- The queue worker exists only after the provider-health queue migration.
    if target is null and signature = 'private.drain_provider_health_refresh(integer)' then continue; end if;
    if target is null then raise exception 'Required reporting writer missing: %', signature; end if;
    definition := pg_get_functiondef(target);
    definition := regexp_replace(definition, '(from|join)([[:space:]]+)public[.]v2_request_facts\M', '\1\2public.reporting_request_facts', 'gi');
    execute definition;
  end loop;
  definition := pg_get_functiondef('public.sync_v2_public_effective_pricing_fact_update()'::regprocedure);
  if strpos(definition, 'target_model := coalesce(source_fact.routed_model_slug, source_fact.requested_model_slug);') = 0 then
    raise exception 'Effective pricing fact-update boundary not found';
  end if;
  definition := replace(definition, 'target_model := coalesce(source_fact.routed_model_slug, source_fact.requested_model_slug);',
    'if not source_fact.public_reporting_allowed then return new; end if;
  target_model := coalesce(source_fact.routed_model_slug, source_fact.requested_model_slug);');
  execute definition;
end;
$migration$;

do $migration$
declare target text; definition text;
begin
  foreach target in array array['v2_web_public_usage_daily', 'v2_web_public_usage_hourly', 'v2_rpc_gateway_model_usage_daily'] loop
    definition := pg_get_viewdef(('public.' || target)::regclass, true);
    definition := regexp_replace(definition, '(public[.])?v2_public_usage_daily\M', 'public.reporting_usage_daily', 'gi');
    definition := regexp_replace(definition, '(public[.])?v2_public_usage_hourly\M', 'public.reporting_usage_hourly', 'gi');
    execute 'create or replace view public.' || quote_ident(target) || ' with (security_invoker = true) as ' || definition;
  end loop;
end;
$migration$;
-- Preserve invoker view access where the base aggregate already permits it.
grant select on public.reporting_usage_daily, public.reporting_usage_hourly to anon, authenticated;
CREATE OR REPLACE FUNCTION public.refresh_request_classification_rollup(p_contribution_id uuid, p_classifier_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_contribution public.data_contributions%rowtype;
  v_category text;
begin
  select * into v_contribution
  from public.data_contributions
  where id = p_contribution_id;
  if not found then return; end if;

  select primary_category into v_category
  from public.request_classifications
  where contribution_id = p_contribution_id
    and classifier_id = p_classifier_id;
  if not found then return; end if;

  if not exists (
    select 1 from public.workspace_classifiers where id = p_classifier_id
  ) then
    return;
  end if;

  insert into public.request_classification_daily (
    usage_date, workspace_id, classifier_id, primary_category, model_slug,
    provider_slug, request_count, input_tokens, output_tokens, public_request_count, public_input_tokens, public_output_tokens, updated_at
  )
  select
    contribution.occurred_at::date,
    contribution.workspace_id,
    classification.classifier_id,
    classification.primary_category,
    contribution.model_slug,
    coalesce(contribution.provider_slug, ''),
    count(*),
    coalesce(sum(contribution.input_tokens), 0),
    coalesce(sum(contribution.output_tokens), 0),
    count(*) filter (where contribution.public_reporting_allowed),
    coalesce(sum(contribution.input_tokens) filter (where contribution.public_reporting_allowed), 0),
    coalesce(sum(contribution.output_tokens) filter (where contribution.public_reporting_allowed), 0),
    now()
  from public.request_classifications classification
  join public.data_contributions contribution on contribution.id = classification.contribution_id
  where contribution.workspace_id = v_contribution.workspace_id
    and contribution.occurred_at::date = v_contribution.occurred_at::date
    and classification.classifier_id = p_classifier_id
    and classification.primary_category = v_category
    and contribution.model_slug = v_contribution.model_slug
    and coalesce(contribution.provider_slug, '') = coalesce(v_contribution.provider_slug, '')
  group by contribution.occurred_at::date, contribution.workspace_id,
    classification.classifier_id, classification.primary_category,
    contribution.model_slug, coalesce(contribution.provider_slug, '')
  on conflict (usage_date, workspace_id, classifier_id, primary_category, model_slug, provider_slug)
  do update set
    request_count = excluded.request_count,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    public_request_count = excluded.public_request_count,
    public_input_tokens = excluded.public_input_tokens,
    public_output_tokens = excluded.public_output_tokens,
    updated_at = excluded.updated_at;
end;
$function$
;
notify pgrst, 'reload schema';
