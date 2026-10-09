SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.enforce_workspace_enterprise_subscription_capacity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('enterprise-member-limit:' || new.workspace_id::text, 0)
  );
  if new.addon_key = 'identity' and new.included_members < 100000
    and (new.status in ('active', 'trialing')
      or (new.status = 'past_due' and new.grace_until > pg_catalog.now()))
    and (select pg_catalog.count(*) from public.workspace_members member
      where member.workspace_id = new.workspace_id) > new.included_members then
    raise exception using errcode = '23514', message = 'workspace_enterprise_member_limit_reached';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.gateway_compiled_context_access (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  credit_status       jsonb;
  key_status          jsonb;
  key_limit_status    jsonb;
  min_balance_nanos bigint := case when endpoint like 'video.%' or endpoint like 'batch%' then 1000000000 else 100000000 end; -- 1.00 USD

  providers           jsonb;
  pricing             jsonb;
  preset_data         jsonb := null;

  -- key row fields
  v_key_active        boolean;
  v_key_team_ok       boolean;
  v_soft_blocked      boolean;

  v_day_req_limit     bigint;
  v_wk_req_limit      bigint;
  v_mo_req_limit      bigint;
  v_day_cost_limit    bigint;
  v_wk_cost_limit     bigint;
  v_mo_cost_limit     bigint;

  now_utc             timestamptz := (now() at time zone 'utc');
  day_start           timestamptz := date_trunc('day',  now_utc);
  week_start          timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start         timestamptz := date_trunc('month', now_utc);

  used_day_reqs       bigint;
  used_wk_reqs        bigint;
  used_mo_reqs        bigint;
  used_day_cost       bigint;
  used_wk_cost        bigint;
  used_mo_cost        bigint;

  within_limits       boolean := true;
  limit_reason        text := null;
  limit_window        text := null;
  limit_metric        text := null;
  current_value       bigint := null;
  limit_value         bigint := null;
  limit_reset_at      timestamptz := null;

  -- Preset handling
  is_preset           boolean := false;
  preset_name         text := null;
  preset_publisher    text := null;

  -- Resolve model from alias if exists
  resolved_model      text := gateway_compiled_context_access.model;
  base_model          text;

  team_enrichment     jsonb;
  key_enrichment      jsonb;

  -- Team aggregates
  team_total_requests bigint;
  team_total_spend_nanos bigint;
  team_spend_24h_nanos bigint;
  team_spend_7d_nanos bigint;
  team_spend_30d_nanos bigint;
  team_requests_1h bigint;
  team_requests_24h bigint;
  team_created_at timestamptz;
  team_tier text;
  team_balance_nanos bigint;
  team_reserved_nanos bigint;

  -- Key aggregates
  key_name text;
  key_created_at timestamptz;
  key_total_requests bigint;
  key_total_spend_nanos bigint;
begin
  base_model := gateway_compiled_context_access.model;
  -- hard requirement: key must be provided
  if gateway_compiled_context_access.api_key_id is null then
    raise exception using errcode = '22023', message = 'missing_api_key', detail = 'api_key_id is required';
  end if;

  -- Check if model is a preset (starts with @)
  if base_model like '@%' then
    is_preset := true;
    preset_name := substring(base_model from 2); -- Remove @ prefix

    -- Fetch preset configuration. Qualified references resolve a
    -- public publisher globally; unqualified references remain workspace-local.
    if position('/' in preset_name) > 0 then
      preset_publisher := split_part(preset_name, '/', 1);
      preset_name := substring(preset_name from position('/' in preset_name) + 1);
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'config', p.config, 'visibility', p.visibility, 'publisher', w.publisher_handle
      ) into preset_data
      from public.presets p
      join public.workspaces w on w.id = p.workspace_id
      where p.archived_at is null and lower(p.slug) = lower(preset_name)
        and p.visibility = 'public'
        and true
        and (lower(w.publisher_handle) = lower(preset_publisher) or exists (select 1 from public.workspace_publisher_handle_aliases alias where alias.workspace_id = w.id and alias.handle = lower(preset_publisher)))
      limit 1;
    else
      select jsonb_build_object(
        'id', p.id, 'name', p.name,
        'slug', coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', '')),
        'description', p.description, 'config', p.config, 'visibility', p.visibility
      ) into preset_data
      from public.presets p
      where p.archived_at is null and lower(coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', ''))) = lower(preset_name)
        and p.workspace_id = gateway_compiled_context_access.workspace_id
        and (
          p.visibility in ('public', 'team')
          or p.created_by = (
            select ak.created_by from public.keys ak
            where ak.id = gateway_compiled_context_access.api_key_id
              and ak.workspace_id = gateway_compiled_context_access.workspace_id
              and ak.status = 'active'
          )
        )
      limit 1;
    end if;

    if preset_data is null then
      raise exception using
        errcode = '22023',
        message = 'preset_not_found',
        detail = format('Preset "%s" not found or not accessible', preset_name);
    end if;

    -- Extract model from preset config (fallback to default/default_model/model/first models entry)
    base_model := coalesce(
      preset_data->'config'->>'defaultModel',
      preset_data->'config'->>'default_model',
      preset_data->'config'->>'model',
      preset_data->'config'->'models'->>0,
      preset_data->'config'->'allowedModels'->>0,
      preset_data->'config'->'allowed_models'->>0
    );

    if base_model is null then
      raise exception using
        errcode = '22023',
        message = 'preset_no_model',
        detail = format('Preset "%s" has no model configured', preset_name);
    end if;
  end if;

  resolved_model := base_model;

  -- validate key row, status, and team
  select
    (k.status = 'active'),
    (k.workspace_id = gateway_compiled_context_access.workspace_id),
    k.soft_blocked,
    k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
    k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
  into
    v_key_active,
    v_key_team_ok,
    v_soft_blocked,
    v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
    v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit
  from public.keys k
  where k.id = gateway_compiled_context_access.api_key_id
  limit 1;

  if v_key_active is null then
    raise exception using errcode = '22023', message = 'api_key_not_found', detail = 'key id does not exist';
  end if;
  if not v_key_team_ok then
    raise exception using errcode = '22023', message = 'api_key_wrong_team', detail = 'key does not belong to provided workspace_id';
  end if;
  if not v_key_active then
    raise exception using errcode = '22023', message = 'api_key_inactive', detail = 'key status is not active';
  end if;

  key_status := jsonb_build_object('ok', true, 'mode', 'first_party');

  -- credit check
  credit_status :=
    coalesce((
      select case
        when greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0) >= min_balance_nanos then
          jsonb_build_object(
            'ok', true,
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
        else
          jsonb_build_object(
            'ok', false,
            'reason', 'insufficient_funds',
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
      end
      from public.wallets w
      where w.workspace_id = gateway_compiled_context_access.workspace_id
      limit 1
    ), jsonb_build_object('ok', false, 'reason', 'wallet_missing'));

  -- per-key limits (requests + cost)
  -- Unlimited keys need no history read. Unknown telemetry stays NULL.
  if greatest(v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
      v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit) > 0 then
  select
    count(*) filter (where gr.created_at >= day_start)                                  as used_day_reqs,
    count(*) filter (where gr.created_at >= week_start)                                 as used_wk_reqs,
    count(*) filter (where gr.created_at >= month_start)                                as used_mo_reqs,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= day_start), 0)::bigint   as used_day_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= week_start), 0)::bigint  as used_wk_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= month_start), 0)::bigint as used_mo_cost
  into
    used_day_reqs, used_wk_reqs, used_mo_reqs,
    used_day_cost, used_wk_cost, used_mo_cost
  from public.gateway_requests gr
  where gr.key_id  = gateway_compiled_context_access.api_key_id
    and gr.workspace_id = gateway_compiled_context_access.workspace_id
    and gr.success is true
    and gr.created_at >= least(week_start, month_start);
  end if;

  if v_soft_blocked then
    within_limits := false;
    limit_reason := 'key_limit_soft_blocked';
    limit_metric := 'soft_blocked';
  end if;
  if within_limits and v_day_req_limit > 0 and used_day_reqs >= v_day_req_limit then
    within_limits := false;
    limit_reason := 'daily_request_limit_reached';
    limit_window := 'daily';
    limit_metric := 'requests';
    current_value := used_day_reqs;
    limit_value := v_day_req_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_req_limit > 0 and used_wk_reqs >= v_wk_req_limit then
    within_limits := false;
    limit_reason := 'weekly_request_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'requests';
    current_value := used_wk_reqs;
    limit_value := v_wk_req_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_req_limit > 0 and used_mo_reqs >= v_mo_req_limit then
    within_limits := false;
    limit_reason := 'monthly_request_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'requests';
    current_value := used_mo_reqs;
    limit_value := v_mo_req_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;
  if within_limits and v_day_cost_limit > 0 and used_day_cost >= v_day_cost_limit then
    within_limits := false;
    limit_reason := 'daily_cost_limit_reached';
    limit_window := 'daily';
    limit_metric := 'cost';
    current_value := used_day_cost;
    limit_value := v_day_cost_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_cost_limit > 0 and used_wk_cost >= v_wk_cost_limit then
    within_limits := false;
    limit_reason := 'weekly_cost_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'cost';
    current_value := used_wk_cost;
    limit_value := v_wk_cost_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_cost_limit > 0 and used_mo_cost >= v_mo_cost_limit then
    within_limits := false;
    limit_reason := 'monthly_cost_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'cost';
    current_value := used_mo_cost;
    limit_value := v_mo_cost_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;

  key_limit_status :=
    jsonb_build_object(
      'ok', within_limits,
      'reason', limit_reason,
      'limit_window', limit_window,
      'limit_metric', limit_metric,
      'current_value', current_value,
      'limit_value', limit_value,
      'reset_at', to_jsonb(limit_reset_at),
      'now', to_jsonb(now_utc),
      'buckets', jsonb_build_object(
        'daily', jsonb_build_object(
          'window_start', to_jsonb(day_start),
          'requests_used', used_day_reqs,
          'requests_limit', v_day_req_limit,
          'cost_used_nanos', used_day_cost,
          'cost_limit_nanos', v_day_cost_limit
        ),
        'weekly', jsonb_build_object(
          'window_start', to_jsonb(week_start),
          'requests_used', used_wk_reqs,
          'requests_limit', v_wk_req_limit,
          'cost_used_nanos', used_wk_cost,
          'cost_limit_nanos', v_wk_cost_limit
        ),
        'monthly', jsonb_build_object(
          'window_start', to_jsonb(month_start),
          'requests_used', used_mo_reqs,
          'requests_limit', v_mo_req_limit,
          'cost_used_nanos', used_mo_cost,
          'cost_limit_nanos', v_mo_cost_limit
        )
      )
    );

  -- ============================================================================
  -- TEAM & KEY ENRICHMENT (Wide Event Context for Observability)
  -- Purpose: Gather user/team context for comprehensive logging (loggingsucks.com pattern)
  -- ============================================================================
  -- Team metadata & wallet
  select
    t.created_at,
    coalesce(t.tier, 'basic'),
    greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
    coalesce(w.reserved_nanos, 0)::bigint
  into
    team_created_at,
    team_tier,
    team_balance_nanos,
    team_reserved_nanos
  from public.workspaces t
  left join public.wallets w on w.workspace_id = t.id
  where t.id = gateway_compiled_context_access.workspace_id
  limit 1;

  -- Historical analytics belong in reporting, not request admission.
  -- Leave their enrichment fields NULL instead of scanning lifetime logs.

  -- Calculate tier using calendar-month qualification + lock-window grace.
  -- Function maintains team tier/counters in database when state changes.
  team_tier := public.calculate_tier_with_grace(gateway_compiled_context_access.workspace_id, team_spend_30d_nanos);

  team_enrichment := jsonb_build_object(
    'tier', team_tier,
    'created_at', to_jsonb(team_created_at),
    'account_age_days', extract(epoch from (now_utc - team_created_at)) / 86400,
    'balance_nanos', team_balance_nanos,
    'available_nanos', team_balance_nanos,
    'reserved_nanos', team_reserved_nanos,
    'balance_usd', round((team_balance_nanos::numeric / 1000000000.0)::numeric, 2),
    'balance_is_low', team_balance_nanos < min_balance_nanos,
    'total_requests', team_total_requests,
    'total_spend_nanos', team_total_spend_nanos,
    'total_spend_usd', round((team_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_24h_nanos', team_spend_24h_nanos,
    'spend_24h_usd', round((team_spend_24h_nanos::numeric / 1000000000.0)::numeric, 4),
    'spend_7d_nanos', team_spend_7d_nanos,
    'spend_7d_usd', round((team_spend_7d_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_30d_nanos', team_spend_30d_nanos,
    'spend_30d_usd', round((team_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_1h', team_requests_1h,
    'requests_24h', team_requests_24h
  );

  -- Key metadata & aggregates
  select
    k.name,
    k.created_at
  into
    key_name,
    key_created_at
  from public.keys k
  where k.id = gateway_compiled_context_access.api_key_id
  limit 1;

  -- Lifetime key analytics are not required to authenticate or enforce limits.

  key_enrichment := jsonb_build_object(
    'name', key_name,
    'created_at', to_jsonb(key_created_at),
    'key_age_days', extract(epoch from (now_utc - key_created_at)) / 86400,
    'total_requests', key_total_requests,
    'total_spend_nanos', key_total_spend_nanos,
    'total_spend_usd', round((key_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_today', used_day_reqs,
    'spend_today_nanos', used_day_cost,
    'spend_today_usd', round((used_day_cost::numeric / 1000000000.0)::numeric, 4),
    'daily_limit_pct', case
      when v_day_req_limit > 0 then round((used_day_reqs::numeric / v_day_req_limit::numeric * 100)::numeric, 1)
      else null
    end
  );

  providers := '[]'::jsonb;
  pricing := '{}'::jsonb;

  return jsonb_build_object(
    'workspace_id', gateway_compiled_context_access.workspace_id,
    'resolved_model', resolved_model,
    'preset', preset_data,
    'key_ok', key_status,
    'key_limit_ok', key_limit_status,
    'credit_ok', credit_status,
    'providers', providers,
    'pricing', pricing,
    'team_enrichment', team_enrichment,
    'key_enrichment', key_enrichment
  );
end;

$function$;

CREATE OR REPLACE FUNCTION private.gateway_context_access (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  credit_status       jsonb;
  key_status          jsonb;
  key_limit_status    jsonb;
  min_balance_nanos bigint := case when endpoint like 'video.%' or endpoint like 'batch%' then 1000000000 else 100000000 end; -- 1.00 USD

  providers           jsonb;
  pricing             jsonb;
  preset_data         jsonb := null;

  -- key row fields
  v_key_active        boolean;
  v_key_team_ok       boolean;
  v_soft_blocked      boolean;

  v_day_req_limit     bigint;
  v_wk_req_limit      bigint;
  v_mo_req_limit      bigint;
  v_day_cost_limit    bigint;
  v_wk_cost_limit     bigint;
  v_mo_cost_limit     bigint;

  now_utc             timestamptz := (now() at time zone 'utc');
  day_start           timestamptz := date_trunc('day',  now_utc);
  week_start          timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start         timestamptz := date_trunc('month', now_utc);

  used_day_reqs       bigint;
  used_wk_reqs        bigint;
  used_mo_reqs        bigint;
  used_day_cost       bigint;
  used_wk_cost        bigint;
  used_mo_cost        bigint;

  within_limits       boolean := true;
  limit_reason        text := null;
  limit_window        text := null;
  limit_metric        text := null;
  current_value       bigint := null;
  limit_value         bigint := null;
  limit_reset_at      timestamptz := null;

  -- Preset handling
  is_preset           boolean := false;
  preset_name         text := null;
  preset_publisher    text := null;

  -- Resolve model from alias if exists
  resolved_model      text := gateway_context_access.model;
  base_model          text;

  team_enrichment     jsonb;
  key_enrichment      jsonb;

  -- Team aggregates
  team_total_requests bigint;
  team_total_spend_nanos bigint;
  team_spend_24h_nanos bigint;
  team_spend_7d_nanos bigint;
  team_spend_30d_nanos bigint;
  team_requests_1h bigint;
  team_requests_24h bigint;
  team_created_at timestamptz;
  team_tier text;
  team_balance_nanos bigint;
  team_reserved_nanos bigint;

  -- Key aggregates
  key_name text;
  key_created_at timestamptz;
  key_total_requests bigint;
  key_total_spend_nanos bigint;
begin
  base_model := gateway_context_access.model;
  -- hard requirement: key must be provided
  if gateway_context_access.api_key_id is null then
    raise exception using errcode = '22023', message = 'missing_api_key', detail = 'api_key_id is required';
  end if;

  -- Check if model is a preset (starts with @)
  if base_model like '@%' then
    is_preset := true;
    preset_name := substring(base_model from 2); -- Remove @ prefix

    -- Fetch preset configuration. Qualified references resolve a
    -- public publisher globally; unqualified references remain workspace-local.
    if position('/' in preset_name) > 0 then
      preset_publisher := split_part(preset_name, '/', 1);
      preset_name := substring(preset_name from position('/' in preset_name) + 1);
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'config', p.config, 'visibility', p.visibility, 'publisher', w.publisher_handle
      ) into preset_data
      from public.presets p
      join public.workspaces w on w.id = p.workspace_id
      where p.archived_at is null and lower(p.slug) = lower(preset_name)
        and p.visibility = 'public'
        and true
        and (lower(w.publisher_handle) = lower(preset_publisher) or exists (select 1 from public.workspace_publisher_handle_aliases alias where alias.workspace_id = w.id and alias.handle = lower(preset_publisher)))
      limit 1;
    else
      select jsonb_build_object(
        'id', p.id, 'name', p.name,
        'slug', coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', '')),
        'description', p.description, 'config', p.config, 'visibility', p.visibility
      ) into preset_data
      from public.presets p
      where p.archived_at is null and lower(coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', ''))) = lower(preset_name)
        and p.workspace_id = gateway_context_access.workspace_id
        and (
          p.visibility in ('public', 'team')
          or p.created_by = (
            select ak.created_by from public.keys ak
            where ak.id = gateway_context_access.api_key_id
              and ak.workspace_id = gateway_context_access.workspace_id
              and ak.status = 'active'
          )
        )
      limit 1;
    end if;

    if preset_data is null then
      raise exception using
        errcode = '22023',
        message = 'preset_not_found',
        detail = format('Preset "%s" not found or not accessible', preset_name);
    end if;

    -- Extract model from preset config (fallback to default/default_model/model/first models entry)
    base_model := coalesce(
      preset_data->'config'->>'defaultModel',
      preset_data->'config'->>'default_model',
      preset_data->'config'->>'model',
      preset_data->'config'->'models'->>0,
      preset_data->'config'->'allowedModels'->>0,
      preset_data->'config'->'allowed_models'->>0
    );

    if base_model is null then
      raise exception using
        errcode = '22023',
        message = 'preset_no_model',
        detail = format('Preset "%s" has no model configured', preset_name);
    end if;
  end if;

  -- Resolve alias/model indirection:
  -- 1) explicit alias table (`v2_model_aliases`)
  -- 2) provider-scoped slug form (`provider/provider_model_slug`)
  resolved_model := coalesce(
    (
      select a.api_model_id
      from (select alias_slug, model_slug as api_model_id, enabled as is_enabled from public.v2_model_aliases) a
      where a.alias_slug = base_model
        and a.is_enabled = true
        and a.api_model_id is not null
      limit 1
    ),
    (
      select m.api_model_id
      from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at from public.v2_model_provider_routes) m
      where position('/' in base_model) > 0
        and m.provider_id = split_part(base_model, '/', 1)
        and m.provider_model_slug = regexp_replace(base_model, '^[^/]+/', '')
        and m.is_active_gateway
        and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
        and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
      order by coalesce(m.effective_from, to_timestamp(0)) desc, m.provider_api_model_id
      limit 1
    ),
    base_model
  );

  -- validate key row, status, and team
  select
    (k.status = 'active'),
    (k.workspace_id = gateway_context_access.workspace_id),
    k.soft_blocked,
    k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
    k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
  into
    v_key_active,
    v_key_team_ok,
    v_soft_blocked,
    v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
    v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit
  from public.keys k
  where k.id = gateway_context_access.api_key_id
  limit 1;

  if v_key_active is null then
    raise exception using errcode = '22023', message = 'api_key_not_found', detail = 'key id does not exist';
  end if;
  if not v_key_team_ok then
    raise exception using errcode = '22023', message = 'api_key_wrong_team', detail = 'key does not belong to provided workspace_id';
  end if;
  if not v_key_active then
    raise exception using errcode = '22023', message = 'api_key_inactive', detail = 'key status is not active';
  end if;

  key_status := jsonb_build_object('ok', true, 'mode', 'first_party');

  -- credit check
  credit_status :=
    coalesce((
      select case
        when greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0) >= min_balance_nanos then
          jsonb_build_object(
            'ok', true,
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
        else
          jsonb_build_object(
            'ok', false,
            'reason', 'insufficient_funds',
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
      end
      from public.wallets w
      where w.workspace_id = gateway_context_access.workspace_id
      limit 1
    ), jsonb_build_object('ok', false, 'reason', 'wallet_missing'));

  -- per-key limits (requests + cost)
  -- Unlimited keys need no history read. Unknown telemetry stays NULL.
  if greatest(v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
      v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit) > 0 then
  select
    count(*) filter (where gr.created_at >= day_start)                                  as used_day_reqs,
    count(*) filter (where gr.created_at >= week_start)                                 as used_wk_reqs,
    count(*) filter (where gr.created_at >= month_start)                                as used_mo_reqs,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= day_start), 0)::bigint   as used_day_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= week_start), 0)::bigint  as used_wk_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= month_start), 0)::bigint as used_mo_cost
  into
    used_day_reqs, used_wk_reqs, used_mo_reqs,
    used_day_cost, used_wk_cost, used_mo_cost
  from public.gateway_requests gr
  where gr.key_id  = gateway_context_access.api_key_id
    and gr.workspace_id = gateway_context_access.workspace_id
    and gr.success is true
    and gr.created_at >= least(week_start, month_start);
  end if;

  if v_soft_blocked then
    within_limits := false;
    limit_reason := 'key_limit_soft_blocked';
    limit_metric := 'soft_blocked';
  end if;
  if within_limits and v_day_req_limit > 0 and used_day_reqs >= v_day_req_limit then
    within_limits := false;
    limit_reason := 'daily_request_limit_reached';
    limit_window := 'daily';
    limit_metric := 'requests';
    current_value := used_day_reqs;
    limit_value := v_day_req_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_req_limit > 0 and used_wk_reqs >= v_wk_req_limit then
    within_limits := false;
    limit_reason := 'weekly_request_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'requests';
    current_value := used_wk_reqs;
    limit_value := v_wk_req_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_req_limit > 0 and used_mo_reqs >= v_mo_req_limit then
    within_limits := false;
    limit_reason := 'monthly_request_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'requests';
    current_value := used_mo_reqs;
    limit_value := v_mo_req_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;
  if within_limits and v_day_cost_limit > 0 and used_day_cost >= v_day_cost_limit then
    within_limits := false;
    limit_reason := 'daily_cost_limit_reached';
    limit_window := 'daily';
    limit_metric := 'cost';
    current_value := used_day_cost;
    limit_value := v_day_cost_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_cost_limit > 0 and used_wk_cost >= v_wk_cost_limit then
    within_limits := false;
    limit_reason := 'weekly_cost_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'cost';
    current_value := used_wk_cost;
    limit_value := v_wk_cost_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_cost_limit > 0 and used_mo_cost >= v_mo_cost_limit then
    within_limits := false;
    limit_reason := 'monthly_cost_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'cost';
    current_value := used_mo_cost;
    limit_value := v_mo_cost_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;

  key_limit_status :=
    jsonb_build_object(
      'ok', within_limits,
      'reason', limit_reason,
      'limit_window', limit_window,
      'limit_metric', limit_metric,
      'current_value', current_value,
      'limit_value', limit_value,
      'reset_at', to_jsonb(limit_reset_at),
      'now', to_jsonb(now_utc),
      'buckets', jsonb_build_object(
        'daily', jsonb_build_object(
          'window_start', to_jsonb(day_start),
          'requests_used', used_day_reqs,
          'requests_limit', v_day_req_limit,
          'cost_used_nanos', used_day_cost,
          'cost_limit_nanos', v_day_cost_limit
        ),
        'weekly', jsonb_build_object(
          'window_start', to_jsonb(week_start),
          'requests_used', used_wk_reqs,
          'requests_limit', v_wk_req_limit,
          'cost_used_nanos', used_wk_cost,
          'cost_limit_nanos', v_wk_cost_limit
        ),
        'monthly', jsonb_build_object(
          'window_start', to_jsonb(month_start),
          'requests_used', used_mo_reqs,
          'requests_limit', v_mo_req_limit,
          'cost_used_nanos', used_mo_cost,
          'cost_limit_nanos', v_mo_cost_limit
        )
      )
    );

  -- ============================================================================
  -- TEAM & KEY ENRICHMENT (Wide Event Context for Observability)
  -- Purpose: Gather user/team context for comprehensive logging (loggingsucks.com pattern)
  -- ============================================================================
  -- Team metadata & wallet
  select
    t.created_at,
    coalesce(t.tier, 'basic'),
    greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
    coalesce(w.reserved_nanos, 0)::bigint
  into
    team_created_at,
    team_tier,
    team_balance_nanos,
    team_reserved_nanos
  from public.workspaces t
  left join public.wallets w on w.workspace_id = t.id
  where t.id = gateway_context_access.workspace_id
  limit 1;

  -- Historical analytics belong in reporting, not request admission.
  -- Leave their enrichment fields NULL instead of scanning lifetime logs.

  -- Calculate tier using calendar-month qualification + lock-window grace.
  -- Function maintains team tier/counters in database when state changes.
  team_tier := public.calculate_tier_with_grace(gateway_context_access.workspace_id, team_spend_30d_nanos);

  team_enrichment := jsonb_build_object(
    'tier', team_tier,
    'created_at', to_jsonb(team_created_at),
    'account_age_days', extract(epoch from (now_utc - team_created_at)) / 86400,
    'balance_nanos', team_balance_nanos,
    'available_nanos', team_balance_nanos,
    'reserved_nanos', team_reserved_nanos,
    'balance_usd', round((team_balance_nanos::numeric / 1000000000.0)::numeric, 2),
    'balance_is_low', team_balance_nanos < min_balance_nanos,
    'total_requests', team_total_requests,
    'total_spend_nanos', team_total_spend_nanos,
    'total_spend_usd', round((team_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_24h_nanos', team_spend_24h_nanos,
    'spend_24h_usd', round((team_spend_24h_nanos::numeric / 1000000000.0)::numeric, 4),
    'spend_7d_nanos', team_spend_7d_nanos,
    'spend_7d_usd', round((team_spend_7d_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_30d_nanos', team_spend_30d_nanos,
    'spend_30d_usd', round((team_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_1h', team_requests_1h,
    'requests_24h', team_requests_24h
  );

  -- Key metadata & aggregates
  select
    k.name,
    k.created_at
  into
    key_name,
    key_created_at
  from public.keys k
  where k.id = gateway_context_access.api_key_id
  limit 1;

  -- Lifetime key analytics are not required to authenticate or enforce limits.

  key_enrichment := jsonb_build_object(
    'name', key_name,
    'created_at', to_jsonb(key_created_at),
    'key_age_days', extract(epoch from (now_utc - key_created_at)) / 86400,
    'total_requests', key_total_requests,
    'total_spend_nanos', key_total_spend_nanos,
    'total_spend_usd', round((key_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_today', used_day_reqs,
    'spend_today_nanos', used_day_cost,
    'spend_today_usd', round((used_day_cost::numeric / 1000000000.0)::numeric, 4),
    'daily_limit_pct', case
      when v_day_req_limit > 0 then round((used_day_reqs::numeric / v_day_req_limit::numeric * 100)::numeric, 1)
      else null
    end
  );

  providers := '[]'::jsonb;
  pricing := '{}'::jsonb;

  return jsonb_build_object(
    'workspace_id', gateway_context_access.workspace_id,
    'resolved_model', resolved_model,
    'preset', preset_data,
    'key_ok', key_status,
    'key_limit_ok', key_limit_status,
    'credit_ok', credit_status,
    'providers', providers,
    'pricing', pricing,
    'team_enrichment', team_enrichment,
    'key_enrichment', key_enrichment
  );
end;

$function$;

CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_without_workspace_budget (
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
  credit_status       jsonb;
  key_status          jsonb;
  key_limit_status    jsonb;
  min_balance_nanos bigint := case when endpoint like 'video.%' or endpoint like 'batch%' then 1000000000 else 100000000 end; -- 1.00 USD

  providers           jsonb;
  pricing             jsonb;
  preset_data         jsonb := null;

  -- key row fields
  v_key_active        boolean;
  v_key_team_ok       boolean;
  v_soft_blocked      boolean;

  v_day_req_limit     bigint;
  v_wk_req_limit      bigint;
  v_mo_req_limit      bigint;
  v_day_cost_limit    bigint;
  v_wk_cost_limit     bigint;
  v_mo_cost_limit     bigint;

  now_utc             timestamptz := (now() at time zone 'utc');
  day_start           timestamptz := date_trunc('day',  now_utc);
  week_start          timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start         timestamptz := date_trunc('month', now_utc);

  used_day_reqs       bigint;
  used_wk_reqs        bigint;
  used_mo_reqs        bigint;
  used_day_cost       bigint;
  used_wk_cost        bigint;
  used_mo_cost        bigint;

  within_limits       boolean := true;
  limit_reason        text := null;
  limit_window        text := null;
  limit_metric        text := null;
  current_value       bigint := null;
  limit_value         bigint := null;
  limit_reset_at      timestamptz := null;

  -- Preset handling
  is_preset           boolean := false;
  preset_name         text := null;
  preset_publisher    text := null;

  -- Resolve model from alias if exists
  resolved_model      text := gateway_fetch_request_context_without_workspace_budget.model;
  base_model          text;

  team_enrichment     jsonb;
  key_enrichment      jsonb;

  -- Team aggregates
  team_total_requests bigint;
  team_total_spend_nanos bigint;
  team_spend_24h_nanos bigint;
  team_spend_7d_nanos bigint;
  team_spend_30d_nanos bigint;
  team_requests_1h bigint;
  team_requests_24h bigint;
  team_created_at timestamptz;
  team_tier text;
  team_balance_nanos bigint;
  team_reserved_nanos bigint;

  -- Key aggregates
  key_name text;
  key_created_at timestamptz;
  key_total_requests bigint;
  key_total_spend_nanos bigint;
begin
  base_model := gateway_fetch_request_context_without_workspace_budget.model;
  -- hard requirement: key must be provided
  if gateway_fetch_request_context_without_workspace_budget.api_key_id is null then
    raise exception using errcode = '22023', message = 'missing_api_key', detail = 'api_key_id is required';
  end if;

  -- Check if model is a preset (starts with @)
  if base_model like '@%' then
    is_preset := true;
    preset_name := substring(base_model from 2); -- Remove @ prefix

    -- Fetch preset configuration. Qualified references resolve a
    -- public publisher globally; unqualified references remain workspace-local.
    if position('/' in preset_name) > 0 then
      preset_publisher := split_part(preset_name, '/', 1);
      preset_name := substring(preset_name from position('/' in preset_name) + 1);
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'config', p.config, 'visibility', p.visibility, 'publisher', w.publisher_handle
      ) into preset_data
      from public.presets p
      join public.workspaces w on w.id = p.workspace_id
      where p.archived_at is null and lower(p.slug) = lower(preset_name)
        and p.visibility = 'public'
        and true
        and (lower(w.publisher_handle) = lower(preset_publisher) or exists (select 1 from public.workspace_publisher_handle_aliases alias where alias.workspace_id = w.id and alias.handle = lower(preset_publisher)))
      limit 1;
    else
      select jsonb_build_object(
        'id', p.id, 'name', p.name,
        'slug', coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', '')),
        'description', p.description, 'config', p.config, 'visibility', p.visibility
      ) into preset_data
      from public.presets p
      where p.archived_at is null and lower(coalesce(nullif(p.slug, ''), regexp_replace(p.name, '^@', ''))) = lower(preset_name)
        and p.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
        and (
          p.visibility in ('public', 'team')
          or p.created_by = (
            select ak.created_by from public.keys ak
            where ak.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
              and ak.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and ak.status = 'active'
          )
        )
      limit 1;
    end if;

    if preset_data is null then
      raise exception using
        errcode = '22023',
        message = 'preset_not_found',
        detail = format('Preset "%s" not found or not accessible', preset_name);
    end if;

    -- Extract model from preset config (fallback to default/default_model/model/first models entry)
    base_model := coalesce(
      preset_data->'config'->>'defaultModel',
      preset_data->'config'->>'default_model',
      preset_data->'config'->>'model',
      preset_data->'config'->'models'->>0,
      preset_data->'config'->'allowedModels'->>0,
      preset_data->'config'->'allowed_models'->>0
    );

    if base_model is null then
      raise exception using
        errcode = '22023',
        message = 'preset_no_model',
        detail = format('Preset "%s" has no model configured', preset_name);
    end if;
  end if;

  -- Resolve alias/model indirection:
  -- 1) explicit alias table (`v2_model_aliases`)
  -- 2) provider-scoped slug form (`provider/provider_model_slug`)
  resolved_model := coalesce(
    (
      select a.api_model_id
      from (select alias_slug, model_slug as api_model_id, enabled as is_enabled from public.v2_model_aliases) a
      where a.alias_slug = base_model
        and a.is_enabled = true
        and a.api_model_id is not null
      limit 1
    ),
    (
      select m.api_model_id
      from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at, metadata from public.v2_model_provider_routes) m
      where position('/' in base_model) > 0
        and m.provider_id = split_part(base_model, '/', 1)
        and m.provider_model_slug = regexp_replace(base_model, '^[^/]+/', '')
        and m.is_active_gateway
        and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
        and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
      order by coalesce(m.effective_from, to_timestamp(0)) desc, m.provider_api_model_id
      limit 1
    ),
    base_model
  );

  -- validate key row, status, and team
  select
    (k.status = 'active'),
    (k.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id),
    k.soft_blocked,
    k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
    k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
  into
    v_key_active,
    v_key_team_ok,
    v_soft_blocked,
    v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
    v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit
  from public.keys k
  where k.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
  limit 1;

  if v_key_active is null then
    raise exception using errcode = '22023', message = 'api_key_not_found', detail = 'key id does not exist';
  end if;
  if not v_key_team_ok then
    raise exception using errcode = '22023', message = 'api_key_wrong_team', detail = 'key does not belong to provided workspace_id';
  end if;
  if not v_key_active then
    raise exception using errcode = '22023', message = 'api_key_inactive', detail = 'key status is not active';
  end if;

  key_status := jsonb_build_object('ok', true, 'mode', 'first_party');

  -- credit check
  credit_status :=
    coalesce((
      select case
        when greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0) >= min_balance_nanos then
          jsonb_build_object(
            'ok', true,
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
        else
          jsonb_build_object(
            'ok', false,
            'reason', 'insufficient_funds',
            'balance_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
            'raw_balance_nanos', coalesce(w.balance_nanos, 0)::bigint,
            'reserved_nanos', coalesce(w.reserved_nanos, 0)::bigint,
            'available_nanos', greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0)
          )
      end
      from public.wallets w
      where w.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
      limit 1
    ), jsonb_build_object('ok', false, 'reason', 'wallet_missing'));

  -- per-key limits (requests + cost)
  -- Unlimited keys need no history read. Unknown telemetry stays NULL.
  if greatest(v_day_req_limit, v_wk_req_limit, v_mo_req_limit,
      v_day_cost_limit, v_wk_cost_limit, v_mo_cost_limit) > 0 then
  select
    count(*) filter (where gr.created_at >= day_start)                                  as used_day_reqs,
    count(*) filter (where gr.created_at >= week_start)                                 as used_wk_reqs,
    count(*) filter (where gr.created_at >= month_start)                                as used_mo_reqs,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= day_start), 0)::bigint   as used_day_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= week_start), 0)::bigint  as used_wk_cost,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= month_start), 0)::bigint as used_mo_cost
  into
    used_day_reqs, used_wk_reqs, used_mo_reqs,
    used_day_cost, used_wk_cost, used_mo_cost
  from public.gateway_requests gr
  where gr.key_id  = gateway_fetch_request_context_without_workspace_budget.api_key_id
    and gr.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
    and gr.success is true
    and gr.created_at >= least(week_start, month_start);
  end if;

  if v_soft_blocked then
    within_limits := false;
    limit_reason := 'key_limit_soft_blocked';
    limit_metric := 'soft_blocked';
  end if;
  if within_limits and v_day_req_limit > 0 and used_day_reqs >= v_day_req_limit then
    within_limits := false;
    limit_reason := 'daily_request_limit_reached';
    limit_window := 'daily';
    limit_metric := 'requests';
    current_value := used_day_reqs;
    limit_value := v_day_req_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_req_limit > 0 and used_wk_reqs >= v_wk_req_limit then
    within_limits := false;
    limit_reason := 'weekly_request_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'requests';
    current_value := used_wk_reqs;
    limit_value := v_wk_req_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_req_limit > 0 and used_mo_reqs >= v_mo_req_limit then
    within_limits := false;
    limit_reason := 'monthly_request_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'requests';
    current_value := used_mo_reqs;
    limit_value := v_mo_req_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;
  if within_limits and v_day_cost_limit > 0 and used_day_cost >= v_day_cost_limit then
    within_limits := false;
    limit_reason := 'daily_cost_limit_reached';
    limit_window := 'daily';
    limit_metric := 'cost';
    current_value := used_day_cost;
    limit_value := v_day_cost_limit;
    limit_reset_at := day_start + interval '1 day';
  end if;
  if within_limits and v_wk_cost_limit > 0 and used_wk_cost >= v_wk_cost_limit then
    within_limits := false;
    limit_reason := 'weekly_cost_limit_reached';
    limit_window := 'weekly';
    limit_metric := 'cost';
    current_value := used_wk_cost;
    limit_value := v_wk_cost_limit;
    limit_reset_at := week_start + interval '1 week';
  end if;
  if within_limits and v_mo_cost_limit > 0 and used_mo_cost >= v_mo_cost_limit then
    within_limits := false;
    limit_reason := 'monthly_cost_limit_reached';
    limit_window := 'monthly';
    limit_metric := 'cost';
    current_value := used_mo_cost;
    limit_value := v_mo_cost_limit;
    limit_reset_at := month_start + interval '1 month';
  end if;

  key_limit_status :=
    jsonb_build_object(
      'ok', within_limits,
      'reason', limit_reason,
      'limit_window', limit_window,
      'limit_metric', limit_metric,
      'current_value', current_value,
      'limit_value', limit_value,
      'reset_at', to_jsonb(limit_reset_at),
      'now', to_jsonb(now_utc),
      'buckets', jsonb_build_object(
        'daily', jsonb_build_object(
          'window_start', to_jsonb(day_start),
          'requests_used', used_day_reqs,
          'requests_limit', v_day_req_limit,
          'cost_used_nanos', used_day_cost,
          'cost_limit_nanos', v_day_cost_limit
        ),
        'weekly', jsonb_build_object(
          'window_start', to_jsonb(week_start),
          'requests_used', used_wk_reqs,
          'requests_limit', v_wk_req_limit,
          'cost_used_nanos', used_wk_cost,
          'cost_limit_nanos', v_wk_cost_limit
        ),
        'monthly', jsonb_build_object(
          'window_start', to_jsonb(month_start),
          'requests_used', used_mo_reqs,
          'requests_limit', v_mo_req_limit,
          'cost_used_nanos', used_mo_cost,
          'cost_limit_nanos', v_mo_cost_limit
        )
      )
    );

  -- ============================================================================
  -- TEAM & KEY ENRICHMENT (Wide Event Context for Observability)
  -- Purpose: Gather user/team context for comprehensive logging (loggingsucks.com pattern)
  -- ============================================================================
  -- Team metadata & wallet
  select
    t.created_at,
    coalesce(t.tier, 'basic'),
    greatest(coalesce(w.balance_nanos, 0)::bigint - coalesce(w.reserved_nanos, 0)::bigint, 0),
    coalesce(w.reserved_nanos, 0)::bigint
  into
    team_created_at,
    team_tier,
    team_balance_nanos,
    team_reserved_nanos
  from public.workspaces t
  left join public.wallets w on w.workspace_id = t.id
  where t.id = gateway_fetch_request_context_without_workspace_budget.workspace_id
  limit 1;

  -- Historical analytics belong in reporting, not request admission.
  -- Leave their enrichment fields NULL instead of scanning lifetime logs.

  -- Calculate tier using calendar-month qualification + lock-window grace.
  -- Function maintains team tier/counters in database when state changes.
  team_tier := calculate_tier_with_grace(gateway_fetch_request_context_without_workspace_budget.workspace_id, team_spend_30d_nanos);

  team_enrichment := jsonb_build_object(
    'tier', team_tier,
    'created_at', to_jsonb(team_created_at),
    'account_age_days', extract(epoch from (now_utc - team_created_at)) / 86400,
    'balance_nanos', team_balance_nanos,
    'available_nanos', team_balance_nanos,
    'reserved_nanos', team_reserved_nanos,
    'balance_usd', round((team_balance_nanos::numeric / 1000000000.0)::numeric, 2),
    'balance_is_low', team_balance_nanos < min_balance_nanos,
    'total_requests', team_total_requests,
    'total_spend_nanos', team_total_spend_nanos,
    'total_spend_usd', round((team_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_24h_nanos', team_spend_24h_nanos,
    'spend_24h_usd', round((team_spend_24h_nanos::numeric / 1000000000.0)::numeric, 4),
    'spend_7d_nanos', team_spend_7d_nanos,
    'spend_7d_usd', round((team_spend_7d_nanos::numeric / 1000000000.0)::numeric, 2),
    'spend_30d_nanos', team_spend_30d_nanos,
    'spend_30d_usd', round((team_spend_30d_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_1h', team_requests_1h,
    'requests_24h', team_requests_24h
  );

  -- Key metadata & aggregates
  select
    k.name,
    k.created_at
  into
    key_name,
    key_created_at
  from public.keys k
  where k.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
  limit 1;

  -- Lifetime key analytics are not required to authenticate or enforce limits.

  key_enrichment := jsonb_build_object(
    'name', key_name,
    'created_at', to_jsonb(key_created_at),
    'key_age_days', extract(epoch from (now_utc - key_created_at)) / 86400,
    'total_requests', key_total_requests,
    'total_spend_nanos', key_total_spend_nanos,
    'total_spend_usd', round((key_total_spend_nanos::numeric / 1000000000.0)::numeric, 2),
    'requests_today', used_day_reqs,
    'spend_today_nanos', used_day_cost,
    'spend_today_usd', round((used_day_cost::numeric / 1000000000.0)::numeric, 4),
    'daily_limit_pct', case
      when v_day_req_limit > 0 then round((used_day_reqs::numeric / v_day_req_limit::numeric * 100)::numeric, 1)
      else null
    end
  );

  -- provider candidates (BYOK) + pricing, fully qualifying params
  with provider_rows as (
    select distinct on (m.provider_api_model_id)
      m.provider_api_model_id,
      m.provider_id,
      m.api_model_id,
      m.provider_model_slug, coalesce((select route.metadata -> 'availability' from public.v2_model_provider_routes route where route.provider_model_id = m.provider_api_model_id and jsonb_typeof(route.metadata -> 'availability') = 'object' and (route.metadata -> 'availability' ->> 'mode') in ('allowlist', 'blocklist') and jsonb_typeof(route.metadata -> 'availability' -> 'countries') = 'array'), p.metadata -> 'availability') as availability,
      m.routing_status as model_status,
      coalesce((m.metadata->>'external_routing_override')::boolean, false) as external_routing_override,
      m.input_modalities,
      m.output_modalities,
      p.prompt_training_policy,
      p.data_policy_tier,
      p.data_policy_confidence,
      p.data_policy_contract_mode,
	  p.data_policy_variant,
      c.status as capability_status,
      c.params as capability_params,
      c.max_input_tokens,
      c.max_output_tokens
    from (select provider_model_id as provider_api_model_id, provider_slug as provider_id, model_slug as api_model_id, model_slug as model_id, provider_model_slug, routing_enabled as is_active_gateway, status as routing_status, input_modalities, output_modalities, context_length, max_output_tokens, effective_from, effective_to, created_at, updated_at, metadata from public.v2_model_provider_routes) m
    join (select model_slug as model_id, lab_slug as organisation_id, name, description, status, hidden, announced_at as announcement_date, released_at as release_date, deprecated_at as deprecation_date, retired_at as retirement_date, previous_model_slug as previous_model_id, input_modalities as input_types, output_modalities as output_types, metadata, created_at, updated_at from public.v2_models) dm
      on dm.model_id = coalesce(m.model_id, m.api_model_id)
    join public.v2_providers p
      on p.provider_slug = m.provider_id
    join (select provider_model_id as provider_api_model_id, capability_id, status, params, max_input_tokens, max_output_tokens, effective_from, effective_to, created_at, updated_at from public.v2_route_capabilities) c
      on c.provider_api_model_id = m.provider_api_model_id
    where m.api_model_id = resolved_model
      and coalesce(dm.hidden, false) = false
      and (dm.status is null or lower(dm.status) in ('active', 'available', 'deprecated'))
      and (dm.retirement_date is null or dm.retirement_date > now() at time zone 'utc')
      and c.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
      and c.status in ('active', 'deranked', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3')
      and m.is_active_gateway
      and (
        p.status <> 'external'
        or coalesce((m.metadata->>'external_routing_override')::boolean, false)
      )
      and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
      and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
    order by m.provider_api_model_id, coalesce(c.updated_at, c.created_at) desc
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'provider_id', pr.provider_id,
          'api_model_id', pr.api_model_id,
          'pricing_key', pr.provider_id,
          'provider_model_slug', pr.provider_model_slug, 'availability', pr.availability,
          'model_status', pr.model_status,
          'external_routing_override', pr.external_routing_override,
          'input_modalities', pr.input_modalities,
          'output_modalities', pr.output_modalities,
          'prompt_training_policy', coalesce(pr.prompt_training_policy, 'unknown'),
          'data_policy_tier', coalesce(pr.data_policy_tier, 'unknown'),
          'data_policy_confidence', coalesce(pr.data_policy_confidence, 'unknown'),
          'data_policy_contract_mode', coalesce(pr.data_policy_contract_mode, 'none'),
		  'data_policy_variant', coalesce(pr.data_policy_variant, 'standard'),
          'capability_status', pr.capability_status,
          'capability_params', coalesce(pr.capability_params, '{}'::jsonb),
          'max_input_tokens', pr.max_input_tokens,
          'max_output_tokens', pr.max_output_tokens,
          'supports_endpoint', true,
          'base_weight', 1,
          'byok_meta', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'provider_id', bk.provider_id,
                'id', bk.id,
                'name', bk.name,
                'fingerprint_sha256', bk.fingerprint_sha256,
                'key_version', bk.key_version,
                'always_use', bk.always_use
              )
            )
            from public.byok_keys bk
            where bk.workspace_id    = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and bk.provider_id = pr.provider_id
              and bk.enabled     = true
          ), '[]'::jsonb)
        )
      ), '[]'::jsonb
    ) as provider_payload,
    coalesce(
      jsonb_object_agg(
        pr.provider_id,
        (
          with rules as (
            select r.*
            from (select meter.sku_meter_id::text as rule_id, route.provider_slug as provider_id, route.model_slug as api_model_id, route.provider_slug || ':' || route.model_slug || ':' || sku.operation as model_key, sku.operation as capability_id, coalesce(sku.service_tier_slug, 'standard') as pricing_plan, meter.meter_key as meter, meter.unit, meter.unit_quantity as unit_size, meter.price_nanos / 1000000000.0 as price_per_unit, coalesce(nullif(meter.metadata->>'included_quantity', '')::numeric, nullif(sku.metadata->>'included_quantity', '')::numeric, 0) as included_quantity, sku.currency, coalesce(nullif(meter.metadata->>'priority', '')::integer, meter.meter_order, 100) as priority, sku.effective_from, sku.effective_to, coalesce(sku.metadata->'match', meter.metadata->'match', '[]'::jsonb) as match, coalesce(sku.metadata->>'billing_timestamp_basis', 'request_start') as billing_timestamp_basis, coalesce(sku.metadata->'time_windows', '[]'::jsonb) as time_windows, greatest(sku.updated_at, meter.updated_at) as updated_at from public.v2_pricing_skus sku join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id where sku.status = 'active' and meter.billable) r
            -- TODO: Redesign pricing selection to key on provider_api_model_id or
            -- explicit variant metadata so provider-only SKUs (for example CrofAI
            -- precision tiers) can share a parent internal model without forcing
            -- distinct api_model_id values just to preserve pricing separation.
            where r.model_key =
              pr.provider_id || ':' || resolved_model || ':' || gateway_fetch_request_context_without_workspace_budget.endpoint
              and r.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
              and (r.effective_from is null or r.effective_from <= now() at time zone 'utc')
              and (r.effective_to   is null or (now() at time zone 'utc') < r.effective_to)
          ),
          ordered_rules as (
            select
              jsonb_agg(
                jsonb_build_object(
                  'id', r.rule_id,
                  'pricing_plan', r.pricing_plan,
                  'meter', r.meter,
                  'unit', r.unit,
                  'unit_size', r.unit_size,
                  'price_per_unit', r.price_per_unit,
                  'included_quantity', r.included_quantity,
                  'currency', r.currency,
                  'match', r.match,
                  'priority', r.priority,
                  'billing_timestamp_basis', coalesce(r.billing_timestamp_basis, 'request_start'),
                  'time_windows', coalesce(r.time_windows, '[]'::jsonb)
                )
                order by r.priority desc, coalesce(r.effective_from, now() at time zone 'utc') desc
              ) as items,
              max(r.updated_at) as version_ts,
              min(r.effective_from) as effective_from,
              min(r.effective_to) as effective_to
            from rules r
          )
          select jsonb_build_object(
            'provider', pr.provider_id,
            'model', resolved_model,
            'endpoint', gateway_fetch_request_context_without_workspace_budget.endpoint,
            'effective_from', to_jsonb(o.effective_from),
            'effective_to',   to_jsonb(o.effective_to),
            'currency', 'USD',
            'version', to_jsonb(o.version_ts),
            'rules', coalesce(o.items, '[]'::jsonb)
          )
          from ordered_rules o
        )
      ),
      '{}'::jsonb
    ) as pricing_payload
  into providers, pricing
  from provider_rows pr;

  return jsonb_build_object(
    'workspace_id', gateway_fetch_request_context_without_workspace_budget.workspace_id,
    'resolved_model', resolved_model,
    'preset', preset_data,
    'key_ok', key_status,
    'key_limit_ok', key_limit_status,
    'credit_ok', credit_status,
    'providers', providers,
    'pricing', pricing,
    'team_enrichment', team_enrichment,
    'key_enrichment', key_enrichment
  );
end;

$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_cached_input_metrics (
  p_model_slug      text,
  p_cloudflare_colo text DEFAULT NULL::text,
  p_stream_mode     text DEFAULT 'all'::text,
  p_context_bucket  text DEFAULT 'all'::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
with params as (
  select
    lower(trim(p_model_slug)) model_slug,
    nullif(upper(trim(p_cloudflare_colo)), '') cloudflare_colo,
    case when lower(p_stream_mode) in ('stream', 'non_stream') then lower(p_stream_mode) else 'all' end stream_mode,
    case when lower(p_context_bucket) in ('lte_4k', '4k_16k', '16k_64k', 'gt_64k') then lower(p_context_bucket) else 'all' end context_bucket,
    now() now_ts
),
visible_model as (
  select model.model_slug
  from public.v2_models model
  cross join params
  where model.model_slug = params.model_slug
    and model.hidden = false
    and model.status <> 'disabled'
),
scoped_facts as (
  select
    fact.request_event_id,
    fact.occurred_at,
    fact.stream,
    fact.cloudflare_colo,
    fact.safe_metadata,
    route.provider_slug provider_id
  from public.v2_request_facts fact
  join visible_model on visible_model.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
  left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
  cross join params
  where fact.occurred_at >= params.now_ts - interval '7 days'
    and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
    and (params.stream_mode = 'all' or fact.stream = (params.stream_mode = 'stream'))
),
usage_by_request as (
  select
    usage.request_event_id,
    sum(usage.quantity) filter (where usage.meter_key = 'input_tokens')::numeric input_tokens,
    sum(usage.quantity) filter (where usage.meter_key = 'cached_input_tokens')::numeric cached_input_tokens,
    bool_or(usage.meter_key = 'cached_input_tokens') cache_telemetry_observed
  from scoped_facts fact
  join public.v2_request_usage usage on usage.request_event_id = fact.request_event_id
  where usage.meter_key in ('input_tokens', 'cached_input_tokens')
  group by usage.request_event_id
),
classified as (
  select
    date_trunc('hour', fact.occurred_at) bucket_start,
    fact.occurred_at::date usage_day,
    fact.provider_id,
    usage.input_tokens,
    usage.cached_input_tokens,
    usage.cache_telemetry_observed,
    -- Existing observations predate this metadata bit and came from
    -- OpenAI-compatible responses, where cached tokens are a subset of input.
    coalesce((fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean, true) cached_input_is_subset,
    case
      when usage.input_tokens is null then null
      when coalesce((fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean, true)
        then usage.input_tokens
      else usage.input_tokens + coalesce(usage.cached_input_tokens, 0)
    end context_input_tokens
  from scoped_facts fact
  left join usage_by_request usage on usage.request_event_id = fact.request_event_id
  cross join params
),
base as (
  select classified.*
  from classified
  cross join params
  where (
      params.context_bucket = 'all'
      or (params.context_bucket = 'lte_4k' and context_input_tokens <= 4096)
      or (params.context_bucket = '4k_16k' and context_input_tokens > 4096 and context_input_tokens <= 16384)
      or (params.context_bucket = '16k_64k' and context_input_tokens > 16384 and context_input_tokens <= 65536)
      or (params.context_bucket = 'gt_64k' and context_input_tokens > 65536)
    )
),
hourly as (
  select
    bucket_start,
    count(*)::bigint requests,
    count(*) filter (where cache_telemetry_observed)::bigint telemetry_requests,
    sum(input_tokens + case when cached_input_is_subset then 0 else coalesce(cached_input_tokens, 0) end)
      filter (where cache_telemetry_observed and input_tokens > 0)::numeric input_tokens,
    sum(cached_input_tokens) filter (where cache_telemetry_observed and input_tokens > 0)::numeric cached_input_tokens
  from base
  where bucket_start >= (select now_ts from params) - interval '24 hours'
  group by bucket_start
),
provider_daily as (
  select
    usage_day,
    provider_id,
    count(*)::bigint requests,
    count(*) filter (where cache_telemetry_observed)::bigint telemetry_requests,
    sum(input_tokens + case when cached_input_is_subset then 0 else coalesce(cached_input_tokens, 0) end)
      filter (where cache_telemetry_observed and input_tokens > 0)::numeric input_tokens,
    sum(cached_input_tokens) filter (where cache_telemetry_observed and input_tokens > 0)::numeric cached_input_tokens
  from base
  where provider_id is not null
  group by usage_day, provider_id
)
select jsonb_build_object(
  'hourly_24h', coalesce((
    select jsonb_agg(jsonb_build_object(
      'bucket', bucket_start,
      'requests', requests,
      'telemetry_requests', telemetry_requests,
      'effective_input_tokens', input_tokens,
      'cached_input_tokens', cached_input_tokens,
      'cached_input_pct', case when input_tokens > 0 then least(100, cached_input_tokens * 100.0 / input_tokens) else null end
    ) order by bucket_start)
    from hourly
    where requests >= 20 and telemetry_requests > 0
  ), '[]'::jsonb),
  'provider_daily_7d', coalesce((
    select jsonb_agg(jsonb_build_object(
      'day', daily.usage_day,
      'provider', daily.provider_id,
      'provider_name', provider.name,
      'requests', daily.requests,
      'telemetry_requests', daily.telemetry_requests,
      'effective_input_tokens', daily.input_tokens,
      'cached_input_tokens', daily.cached_input_tokens,
      'cached_input_pct', case when daily.input_tokens > 0 then least(100, daily.cached_input_tokens * 100.0 / daily.input_tokens) else null end
    ) order by daily.usage_day, daily.provider_id)
    from provider_daily daily
    join public.v2_providers provider on provider.provider_slug = daily.provider_id
    where daily.requests >= 20 and daily.telemetry_requests > 0
  ), '[]'::jsonb)
);
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_performance_colos (
  p_model_slug text
)
  RETURNS TABLE (
    cloudflare_colo text,
    request_count   bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
select colos.*
from public.v2_models model
cross join lateral public.get_v2_model_performance_colos_unfiltered(model.model_slug) colos
where model.model_slug = lower(trim(p_model_slug))
  and model.hidden = false
  and model.status <> 'disabled'
  and colos.request_count >= 20;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_performance_metrics (
  p_model_slug      text,
  p_cloudflare_colo text    DEFAULT NULL::text,
  p_percentile      numeric DEFAULT 0.5,
  p_stream_mode     text    DEFAULT 'all'::text,
  p_context_bucket  text    DEFAULT 'all'::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
with raw as materialized (
  select public.get_v2_model_performance_metrics_unsuppressed(
    model.model_slug, p_cloudflare_colo, p_percentile, p_stream_mode, p_context_bucket
  ) payload
  from public.v2_models model
  where model.model_slug = lower(trim(p_model_slug))
    and model.hidden = false
    and model.status <> 'disabled'
), redacted as materialized (
  select
    jsonb_set(
      jsonb_set(
        payload,
        '{provider_uptime_24h}',
        coalesce((
          select jsonb_agg(
            case when exists (
              select 1 from public.v2_model_provider_routes route
              where route.model_slug = lower(trim(p_model_slug))
                and route.provider_slug = entry ->> 'provider'
                and route.is_stealth = true
            ) then entry || jsonb_build_object('provider', 'stealth', 'provider_name', 'stealth')
            else entry end
            order by entry ->> 'provider'
          )
          from jsonb_array_elements(coalesce(payload -> 'provider_uptime_24h', '[]'::jsonb)) entry
        ), '[]'::jsonb)
      ),
      '{provider_daily_7d}',
      coalesce((
        select jsonb_agg(
          case when exists (
            select 1 from public.v2_model_provider_routes route
            where route.model_slug = lower(trim(p_model_slug))
              and route.provider_slug = entry ->> 'provider'
              and route.is_stealth = true
          ) then entry || jsonb_build_object('provider', 'stealth', 'provider_name', 'stealth')
          else entry end
          order by entry ->> 'day', entry ->> 'provider'
        )
        from jsonb_array_elements(coalesce(payload -> 'provider_daily_7d', '[]'::jsonb)) entry
      ), '[]'::jsonb)
    ) payload
  from raw
), suppressed as (
  select
    case when coalesce((payload #>> '{last_24h,total_requests}')::bigint, 0) >= 20
      then payload -> 'last_24h' else '{}'::jsonb end last_24h,
    case when coalesce((payload #>> '{prev_24h,total_requests}')::bigint, 0) >= 20
      then payload -> 'prev_24h' else '{}'::jsonb end prev_24h,
    coalesce((select jsonb_agg(entry order by entry ->> 'bucket')
      from jsonb_array_elements(coalesce(payload -> 'hourly_24h', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 20), '[]'::jsonb) hourly_24h,
    coalesce((select jsonb_agg(entry order by entry ->> 'day', entry ->> 'provider')
      from jsonb_array_elements(coalesce(payload -> 'provider_daily_7d', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 20), '[]'::jsonb) provider_daily_7d,
    coalesce((select jsonb_agg(entry order by entry ->> 'provider')
      from jsonb_array_elements(coalesce(payload -> 'provider_uptime_24h', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 20), '[]'::jsonb) provider_uptime_24h,
    payload
  from redacted
)
select jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(payload, '{last_24h}', last_24h),
        '{prev_24h}', prev_24h
      ),
      '{hourly_24h}', hourly_24h
    ),
    '{provider_daily_7d}', provider_daily_7d
  ),
  '{provider_uptime_24h}', provider_uptime_24h
)
from suppressed;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_provider_30m_performance_v1 (
  p_model_slug      text,
  p_cloudflare_colo text    DEFAULT NULL::text,
  p_percentile      numeric DEFAULT 0.5,
  p_stream_mode     text    DEFAULT 'all'::text,
  p_context_bucket  text    DEFAULT 'all'::text
)
  RETURNS TABLE (
    bucket                     timestamp with time zone,
    provider_id                text,
    provider_name              text,
    requests                   bigint,
    gateway_ttft_ms            numeric,
    gateway_e2e_ms             numeric,
    provider_duration_ms       numeric,
    effective_throughput_tps   numeric,
    output_speed_tps           numeric,
    phaseo_overhead_ms         numeric,
    tpot_ms                    numeric,
    itl_ms                     numeric,
    tool_call_requests         bigint,
    tool_call_errors           bigint,
    structured_output_requests bigint,
    structured_output_errors   bigint,
    cache_telemetry_requests   bigint,
    cache_hit_requests         bigint,
    effective_input_tokens     numeric,
    cached_input_tokens        numeric,
    cached_input_pct           numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
with params as (
  select
    lower(trim(p_model_slug)) model_slug,
    nullif(upper(trim(p_cloudflare_colo)), '') cloudflare_colo,
    greatest(0.01, least(0.99, coalesce(p_percentile, 0.5)))::double precision percentile,
    case when lower(p_stream_mode) in ('stream', 'non_stream') then lower(p_stream_mode) else 'all' end stream_mode,
    case when lower(p_context_bucket) in ('lte_4k', '4k_16k', '16k_64k', 'gt_64k') then lower(p_context_bucket) else 'all' end context_bucket,
    now() now_ts
),
visible_model as (
  select model.model_slug
  from public.v2_models model
  cross join params
  where model.model_slug = params.model_slug
    and model.hidden = false
    and model.status <> 'disabled'
),
scoped_facts as (
  select
    fact.request_event_id,
    fact.occurred_at,
    fact.success,
    fact.stream,
    fact.cloudflare_colo,
    fact.safe_metadata,
    fact.gateway_ttft_ms,
    fact.time_to_first_token_ms,
    fact.gateway_total_ms,
    fact.generation_ms provider_duration_ms,
    fact.phaseo_overhead_ms,
    fact.throughput effective_throughput_tps,
    fact.output_speed_tps,
    fact.tpot_ms,
    fact.itl_ms,
    fact.tool_call_count,
    fact.tool_call_succeeded,
    fact.structured_output_attempted,
    fact.structured_output_succeeded,
    route.provider_slug provider_id
  from public.v2_request_facts fact
  join visible_model
    on visible_model.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
  left join public.v2_model_provider_routes route
    on route.provider_model_id = fact.provider_model_id
  cross join params
  where fact.occurred_at >= params.now_ts - interval '1 day'
    and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
    and (params.stream_mode = 'all' or fact.stream = (params.stream_mode = 'stream'))
),
usage_by_request as (
  select
    usage.request_event_id,
    sum(usage.quantity) filter (
      where usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
    )::numeric input_tokens,
    sum(usage.quantity) filter (
      where usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')
    )::numeric cached_input_tokens,
    bool_or(usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')) cache_telemetry_observed
  from scoped_facts fact
  join public.v2_request_usage usage on usage.request_event_id = fact.request_event_id
  where usage.meter_key in (
    'input_tokens',
    'input_text_tokens',
    'prompt_tokens',
    'cached_input_tokens',
    'cached_read_tokens'
  )
  group by usage.request_event_id
),
classified as (
  select
    date_bin(interval '30 minutes', fact.occurred_at, timestamptz '2001-01-01 00:00:00+00') bucket_start,
    fact.provider_id,
    fact.success,
    coalesce(fact.gateway_ttft_ms, fact.time_to_first_token_ms) gateway_ttft_ms,
    fact.gateway_total_ms gateway_e2e_ms,
    fact.provider_duration_ms,
    fact.phaseo_overhead_ms,
    fact.effective_throughput_tps,
    fact.output_speed_tps,
    fact.tpot_ms,
    fact.itl_ms,
    fact.tool_call_count,
    fact.tool_call_succeeded,
    fact.structured_output_attempted,
    fact.structured_output_succeeded,
    usage.input_tokens,
    usage.cached_input_tokens,
    usage.cache_telemetry_observed,
    coalesce((fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean, true) cached_input_is_subset,
    case
      when usage.input_tokens is null then null
      when coalesce((fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean, true)
        then usage.input_tokens
      else usage.input_tokens + coalesce(usage.cached_input_tokens, 0)
    end context_input_tokens
  from scoped_facts fact
  left join usage_by_request usage on usage.request_event_id = fact.request_event_id
  cross join params
),
base as (
  select classified.*
  from classified
  cross join params
  where classified.provider_id is not null
    and (
      params.context_bucket = 'all'
      or (params.context_bucket = 'lte_4k' and classified.context_input_tokens <= 4096)
      or (params.context_bucket = '4k_16k' and classified.context_input_tokens > 4096 and classified.context_input_tokens <= 16384)
      or (params.context_bucket = '16k_64k' and classified.context_input_tokens > 16384 and classified.context_input_tokens <= 65536)
      or (params.context_bucket = 'gt_64k' and classified.context_input_tokens > 65536)
    )
),
hourly as (
  select
    base.bucket_start,
    base.provider_id,
    count(*)::bigint requests,
    percentile_cont((select percentile from params)) within group (order by base.gateway_ttft_ms)
      filter (where base.success and base.gateway_ttft_ms is not null)::numeric gateway_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by base.gateway_e2e_ms)
      filter (where base.success and base.gateway_e2e_ms is not null)::numeric gateway_e2e_ms,
    percentile_cont((select percentile from params)) within group (order by base.provider_duration_ms)
      filter (where base.success and base.provider_duration_ms is not null)::numeric provider_duration_ms,
    percentile_cont((select percentile from params)) within group (order by base.effective_throughput_tps)
      filter (where base.success and base.effective_throughput_tps is not null)::numeric effective_throughput_tps,
    percentile_cont((select percentile from params)) within group (order by base.output_speed_tps)
      filter (where base.success and base.output_speed_tps is not null)::numeric output_speed_tps,
    percentile_cont((select percentile from params)) within group (order by base.phaseo_overhead_ms)
      filter (where base.success and base.phaseo_overhead_ms is not null)::numeric phaseo_overhead_ms,
    percentile_cont((select percentile from params)) within group (order by base.tpot_ms)
      filter (where base.success and base.tpot_ms is not null)::numeric tpot_ms,
    percentile_cont((select percentile from params)) within group (order by base.itl_ms)
      filter (where base.success and base.itl_ms is not null)::numeric itl_ms,
    count(*) filter (
      where base.tool_call_count > 0 and base.tool_call_succeeded is not null
    )::bigint tool_call_requests,
    count(*) filter (
      where base.tool_call_count > 0 and base.tool_call_succeeded = false
    )::bigint tool_call_errors,
    count(*) filter (where base.structured_output_attempted)::bigint structured_output_requests,
    count(*) filter (
      where base.structured_output_attempted and base.structured_output_succeeded = false
    )::bigint structured_output_errors,
    count(*) filter (where base.cache_telemetry_observed)::bigint cache_telemetry_requests,
    count(*) filter (
      where base.cache_telemetry_observed and coalesce(base.cached_input_tokens, 0) > 0
    )::bigint cache_hit_requests,
    sum(
      base.input_tokens + case when base.cached_input_is_subset then 0 else coalesce(base.cached_input_tokens, 0) end
    ) filter (where base.cache_telemetry_observed and base.input_tokens > 0)::numeric effective_input_tokens,
    sum(base.cached_input_tokens)
      filter (where base.cache_telemetry_observed and base.input_tokens > 0)::numeric cached_input_tokens
  from base
  group by base.bucket_start, base.provider_id
)
select
  hourly.bucket_start bucket,
  hourly.provider_id,
  provider.name provider_name,
  hourly.requests,
  hourly.gateway_ttft_ms,
  hourly.gateway_e2e_ms,
  hourly.provider_duration_ms,
  hourly.effective_throughput_tps,
  hourly.output_speed_tps,
  hourly.phaseo_overhead_ms,
  hourly.tpot_ms,
  hourly.itl_ms,
  hourly.tool_call_requests,
  hourly.tool_call_errors,
  hourly.structured_output_requests,
  hourly.structured_output_errors,
  hourly.cache_telemetry_requests,
  hourly.cache_hit_requests,
  case when hourly.cache_telemetry_requests >= 20 then hourly.effective_input_tokens else null end,
  case when hourly.cache_telemetry_requests >= 20 then hourly.cached_input_tokens else null end,
  case
    when hourly.cache_telemetry_requests >= 20 and hourly.effective_input_tokens > 0
      then least(100, hourly.cached_input_tokens * 100.0 / hourly.effective_input_tokens)
    else null
  end cached_input_pct
from hourly
join public.v2_providers provider on provider.provider_slug = hourly.provider_id
order by hourly.bucket_start, hourly.provider_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_provider_hourly_performance_v2 (
  p_model_slug      text,
  p_cloudflare_colo text    DEFAULT NULL::text,
  p_percentile      numeric DEFAULT 0.5,
  p_stream_mode     text    DEFAULT 'all'::text,
  p_context_bucket  text    DEFAULT 'all'::text
)
  RETURNS TABLE (
    bucket                     timestamp with time zone,
    provider_id                text,
    provider_name              text,
    requests                   bigint,
    gateway_ttft_ms            numeric,
    gateway_e2e_ms             numeric,
    provider_duration_ms       numeric,
    effective_throughput_tps   numeric,
    output_speed_tps           numeric,
    phaseo_overhead_ms         numeric,
    tpot_ms                    numeric,
    itl_ms                     numeric,
    tool_call_requests         bigint,
    tool_call_errors           bigint,
    structured_output_requests bigint,
    structured_output_errors   bigint,
    cache_telemetry_requests   bigint,
    cache_hit_requests         bigint,
    effective_input_tokens     numeric,
    cached_input_tokens        numeric,
    cached_input_pct           numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
with params as (
  select
    lower(trim(p_model_slug)) model_slug,
    nullif(upper(trim(p_cloudflare_colo)), '') cloudflare_colo,
    greatest(0.01, least(0.99, coalesce(p_percentile, 0.5)))::double precision percentile,
    case when lower(p_stream_mode) in ('stream', 'non_stream') then lower(p_stream_mode) else 'all' end stream_mode,
    case when lower(p_context_bucket) in ('lte_4k', '4k_16k', '16k_64k', 'gt_64k') then lower(p_context_bucket) else 'all' end context_bucket,
    now() now_ts
),
visible_model as (
  select model.model_slug
  from public.v2_models model
  cross join params
  where model.model_slug = params.model_slug
    and model.hidden = false
    and model.status <> 'disabled'
),
scoped_facts as (
  select
    fact.request_event_id,
    fact.occurred_at,
    fact.success,
    fact.stream,
    fact.cloudflare_colo,
    fact.safe_metadata,
    fact.gateway_ttft_ms,
    fact.time_to_first_token_ms,
    fact.gateway_total_ms,
    fact.generation_ms provider_duration_ms,
    fact.phaseo_overhead_ms,
    fact.throughput effective_throughput_tps,
    fact.output_speed_tps,
    fact.tpot_ms,
    fact.itl_ms,
    fact.tool_call_count,
    fact.tool_call_succeeded,
    fact.structured_output_attempted,
    fact.structured_output_succeeded,
    route.provider_slug provider_id
  from public.v2_request_facts fact
  join visible_model
    on visible_model.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
  left join public.v2_model_provider_routes route
    on route.provider_model_id = fact.provider_model_id
  cross join params
  where fact.occurred_at >= params.now_ts - interval '7 days'
    and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
    and (params.stream_mode = 'all' or fact.stream = (params.stream_mode = 'stream'))
),
usage_by_request as (
  select
    usage.request_event_id,
    sum(usage.quantity) filter (
      where usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
    )::numeric input_tokens,
    sum(usage.quantity) filter (
      where usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')
    )::numeric cached_input_tokens,
    bool_or(usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')) cache_telemetry_observed
  from scoped_facts fact
  join public.v2_request_usage usage on usage.request_event_id = fact.request_event_id
  where usage.meter_key in (
    'input_tokens',
    'input_text_tokens',
    'prompt_tokens',
    'cached_input_tokens',
    'cached_read_tokens'
  )
  group by usage.request_event_id
),
classified as (
  select
    date_trunc('hour', fact.occurred_at) bucket_start,
    fact.provider_id,
    fact.success,
    coalesce(fact.gateway_ttft_ms, fact.time_to_first_token_ms) gateway_ttft_ms,
    fact.gateway_total_ms gateway_e2e_ms,
    fact.provider_duration_ms,
    fact.phaseo_overhead_ms,
    fact.effective_throughput_tps,
    fact.output_speed_tps,
    fact.tpot_ms,
    fact.itl_ms,
    fact.tool_call_count,
    fact.tool_call_succeeded,
    fact.structured_output_attempted,
    fact.structured_output_succeeded,
    usage.input_tokens,
    usage.cached_input_tokens,
    usage.cache_telemetry_observed,
    coalesce((fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean, true) cached_input_is_subset,
    case
      when usage.input_tokens is null then null
      when coalesce((fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean, true)
        then usage.input_tokens
      else usage.input_tokens + coalesce(usage.cached_input_tokens, 0)
    end context_input_tokens
  from scoped_facts fact
  left join usage_by_request usage on usage.request_event_id = fact.request_event_id
  cross join params
),
base as (
  select classified.*
  from classified
  cross join params
  where classified.provider_id is not null
    and (
      params.context_bucket = 'all'
      or (params.context_bucket = 'lte_4k' and classified.context_input_tokens <= 4096)
      or (params.context_bucket = '4k_16k' and classified.context_input_tokens > 4096 and classified.context_input_tokens <= 16384)
      or (params.context_bucket = '16k_64k' and classified.context_input_tokens > 16384 and classified.context_input_tokens <= 65536)
      or (params.context_bucket = 'gt_64k' and classified.context_input_tokens > 65536)
    )
),
hourly as (
  select
    base.bucket_start,
    base.provider_id,
    count(*)::bigint requests,
    percentile_cont((select percentile from params)) within group (order by base.gateway_ttft_ms)
      filter (where base.success and base.gateway_ttft_ms is not null)::numeric gateway_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by base.gateway_e2e_ms)
      filter (where base.success and base.gateway_e2e_ms is not null)::numeric gateway_e2e_ms,
    percentile_cont((select percentile from params)) within group (order by base.provider_duration_ms)
      filter (where base.success and base.provider_duration_ms is not null)::numeric provider_duration_ms,
    percentile_cont((select percentile from params)) within group (order by base.effective_throughput_tps)
      filter (where base.success and base.effective_throughput_tps is not null)::numeric effective_throughput_tps,
    percentile_cont((select percentile from params)) within group (order by base.output_speed_tps)
      filter (where base.success and base.output_speed_tps is not null)::numeric output_speed_tps,
    percentile_cont((select percentile from params)) within group (order by base.phaseo_overhead_ms)
      filter (where base.success and base.phaseo_overhead_ms is not null)::numeric phaseo_overhead_ms,
    percentile_cont((select percentile from params)) within group (order by base.tpot_ms)
      filter (where base.success and base.tpot_ms is not null)::numeric tpot_ms,
    percentile_cont((select percentile from params)) within group (order by base.itl_ms)
      filter (where base.success and base.itl_ms is not null)::numeric itl_ms,
    count(*) filter (
      where base.tool_call_count > 0 and base.tool_call_succeeded is not null
    )::bigint tool_call_requests,
    count(*) filter (
      where base.tool_call_count > 0 and base.tool_call_succeeded = false
    )::bigint tool_call_errors,
    count(*) filter (where base.structured_output_attempted)::bigint structured_output_requests,
    count(*) filter (
      where base.structured_output_attempted and base.structured_output_succeeded = false
    )::bigint structured_output_errors,
    count(*) filter (where base.cache_telemetry_observed)::bigint cache_telemetry_requests,
    count(*) filter (
      where base.cache_telemetry_observed and coalesce(base.cached_input_tokens, 0) > 0
    )::bigint cache_hit_requests,
    sum(
      base.input_tokens + case when base.cached_input_is_subset then 0 else coalesce(base.cached_input_tokens, 0) end
    ) filter (where base.cache_telemetry_observed and base.input_tokens > 0)::numeric effective_input_tokens,
    sum(base.cached_input_tokens)
      filter (where base.cache_telemetry_observed and base.input_tokens > 0)::numeric cached_input_tokens
  from base
  group by base.bucket_start, base.provider_id
)
select
  hourly.bucket_start bucket,
  hourly.provider_id,
  provider.name provider_name,
  hourly.requests,
  hourly.gateway_ttft_ms,
  hourly.gateway_e2e_ms,
  hourly.provider_duration_ms,
  hourly.effective_throughput_tps,
  hourly.output_speed_tps,
  hourly.phaseo_overhead_ms,
  hourly.tpot_ms,
  hourly.itl_ms,
  hourly.tool_call_requests,
  hourly.tool_call_errors,
  hourly.structured_output_requests,
  hourly.structured_output_errors,
  hourly.cache_telemetry_requests,
  hourly.cache_hit_requests,
  case when hourly.cache_telemetry_requests >= 20 then hourly.effective_input_tokens else null end,
  case when hourly.cache_telemetry_requests >= 20 then hourly.cached_input_tokens else null end,
  case
    when hourly.cache_telemetry_requests >= 20 and hourly.effective_input_tokens > 0
      then least(100, hourly.cached_input_tokens * 100.0 / hourly.effective_input_tokens)
    else null
  end cached_input_pct
from hourly
join public.v2_providers provider on provider.provider_slug = hourly.provider_id
order by hourly.bucket_start, hourly.provider_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_quality_hourly_v1 (
  p_model_slug      text,
  p_cloudflare_colo text DEFAULT NULL::text,
  p_stream_mode     text DEFAULT 'all'::text,
  p_context_bucket  text DEFAULT 'all'::text
)
  RETURNS TABLE (
    bucket                            timestamp with time zone,
    requests                          bigint,
    tool_call_responses               bigint,
    tool_call_errors                  bigint,
    tool_invalid_json_errors          bigint,
    tool_schema_mismatch_errors       bigint,
    tool_unknown_name_errors          bigint,
    structured_output_responses       bigint,
    structured_output_errors          bigint,
    structured_invalid_json_errors    bigint,
    structured_schema_mismatch_errors bigint,
    structured_missing_output_errors  bigint,
    cache_telemetry_requests          bigint,
    input_tokens                      numeric,
    cached_read_tokens                numeric,
    cache_read_pct                    numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
with params as not materialized (
  select
    lower(trim(p_model_slug)) model_slug,
    nullif(upper(trim(p_cloudflare_colo)), '') cloudflare_colo,
    case when lower(p_stream_mode) in ('stream', 'non_stream') then lower(p_stream_mode) else 'all' end stream_mode,
    case when lower(p_context_bucket) in ('lte_4k', '4k_16k', '16k_64k', 'gt_64k') then lower(p_context_bucket) else 'all' end context_bucket,
    now() now_ts
),
visible_model as (
  select model.model_slug
  from public.v2_models model
  cross join params
  where model.model_slug = params.model_slug
    and model.hidden = false
    and model.status <> 'disabled'
),
scoped_facts as (
  select
    fact.request_event_id,
    fact.workspace_id,
    fact.request_id,
    fact.occurred_at,
    fact.stream,
    fact.cloudflare_colo,
    fact.safe_metadata,
    fact.tool_call_count,
    fact.tool_call_succeeded,
    fact.structured_output_attempted,
    fact.structured_output_succeeded
  from public.v2_request_facts fact
  join visible_model
    on visible_model.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
  cross join params
  where fact.occurred_at >= params.now_ts - interval '7 days'
    and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
    and (params.stream_mode = 'all' or fact.stream = (params.stream_mode = 'stream'))
),
usage_by_request as (
  select
    fact.*,
    coalesce(
      meters.input_tokens,
      legacy.usage_input_tokens::numeric
    )::numeric input_tokens,
    coalesce(
      meters.cached_read_tokens,
      legacy.usage_cached_read_tokens::numeric
    )::numeric cached_read_tokens,
    coalesce(meters.cache_telemetry_observed, false) or legacy.request_id is not null cache_telemetry_observed
  from scoped_facts fact
  left join lateral (
    select
      coalesce(
        sum(usage.quantity) filter (where usage.meter_key = 'input_tokens'),
        sum(usage.quantity) filter (where usage.meter_key = 'prompt_tokens'),
        sum(usage.quantity) filter (
          where usage.meter_key in (
            'input_text_tokens',
            'input_image_tokens',
            'input_audio_tokens',
            'input_video_tokens'
          )
        )
      )::numeric input_tokens,
      sum(usage.quantity) filter (
        where usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')
      )::numeric cached_read_tokens,
      bool_or(usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')) cache_telemetry_observed
    from public.v2_request_usage usage
    where usage.request_event_id = fact.request_event_id
  ) meters on true
  left join lateral (
    select
      request.request_id,
      request.usage_input_tokens,
      request.usage_cached_read_tokens
    from public.gateway_requests request
    where request.workspace_id = fact.workspace_id
      and request.request_id = fact.request_id
    order by abs(extract(epoch from request.created_at - fact.occurred_at))
    limit 1
  ) legacy on true
),
classified as (
  select
    date_trunc('hour', fact.occurred_at) bucket_start,
    fact.input_tokens,
    fact.cached_read_tokens,
    fact.cache_telemetry_observed,
    case
      when fact.safe_metadata #>> '{tool_call_validation,totalCalls}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,totalCalls}')::bigint
      when fact.tool_call_count > 0 then fact.tool_call_count::bigint
      else 0
    end tool_call_responses,
    case
      when fact.safe_metadata #>> '{tool_call_validation,invalidCalls}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,invalidCalls}')::bigint
      when fact.tool_call_count > 0 and fact.tool_call_succeeded = false
        then fact.tool_call_count::bigint
      else 0
    end tool_call_errors,
    case
      when fact.safe_metadata #>> '{tool_call_validation,invalidJson}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,invalidJson}')::bigint
      else 0
    end tool_invalid_json_errors,
    case
      when fact.safe_metadata #>> '{tool_call_validation,schemaMismatch}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,schemaMismatch}')::bigint
      else 0
    end tool_schema_mismatch_errors,
    case
      when fact.safe_metadata #>> '{tool_call_validation,unknownToolName}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,unknownToolName}')::bigint
      else 0
    end tool_unknown_name_errors,
    coalesce(
      fact.safe_metadata ->> 'structured_output_error_reason',
      case
        when fact.structured_output_attempted and fact.structured_output_succeeded then 'none'
        when fact.structured_output_attempted then 'legacy_error'
        else null
      end
    ) structured_error_reason,
    case
      when fact.input_tokens is null then null
      else fact.input_tokens
    end context_input_tokens
  from usage_by_request fact
),
base as (
  select classified.*
  from classified
  cross join params
  where
    params.context_bucket = 'all'
    or (params.context_bucket = 'lte_4k' and classified.context_input_tokens <= 4096)
    or (params.context_bucket = '4k_16k' and classified.context_input_tokens > 4096 and classified.context_input_tokens <= 16384)
    or (params.context_bucket = '16k_64k' and classified.context_input_tokens > 16384 and classified.context_input_tokens <= 65536)
    or (params.context_bucket = 'gt_64k' and classified.context_input_tokens > 65536)
),
hourly as (
  select
    base.bucket_start,
    count(*)::bigint requests,
    sum(base.tool_call_responses)::bigint tool_call_responses,
    sum(base.tool_call_errors)::bigint tool_call_errors,
    sum(base.tool_invalid_json_errors)::bigint tool_invalid_json_errors,
    sum(base.tool_schema_mismatch_errors)::bigint tool_schema_mismatch_errors,
    sum(base.tool_unknown_name_errors)::bigint tool_unknown_name_errors,
    count(*) filter (
      where base.structured_error_reason in ('none', 'invalid_json', 'schema_mismatch', 'missing_output', 'legacy_error')
    )::bigint structured_output_responses,
    count(*) filter (
      where base.structured_error_reason in ('invalid_json', 'schema_mismatch', 'missing_output', 'legacy_error')
    )::bigint structured_output_errors,
    count(*) filter (where base.structured_error_reason = 'invalid_json')::bigint structured_invalid_json_errors,
    count(*) filter (where base.structured_error_reason = 'schema_mismatch')::bigint structured_schema_mismatch_errors,
    count(*) filter (where base.structured_error_reason = 'missing_output')::bigint structured_missing_output_errors,
    count(*) filter (where base.cache_telemetry_observed)::bigint cache_telemetry_requests,
    sum(base.input_tokens) filter (
      where base.cache_telemetry_observed and base.input_tokens > 0
    )::numeric input_tokens,
    sum(base.cached_read_tokens) filter (
      where base.cache_telemetry_observed and base.input_tokens > 0
    )::numeric cached_read_tokens
  from base
  group by base.bucket_start
)
select
  hourly.bucket_start bucket,
  hourly.requests,
  hourly.tool_call_responses,
  hourly.tool_call_errors,
  hourly.tool_invalid_json_errors,
  hourly.tool_schema_mismatch_errors,
  hourly.tool_unknown_name_errors,
  hourly.structured_output_responses,
  hourly.structured_output_errors,
  hourly.structured_invalid_json_errors,
  hourly.structured_schema_mismatch_errors,
  hourly.structured_missing_output_errors,
  hourly.cache_telemetry_requests,
  case when hourly.cache_telemetry_requests >= 20 then hourly.input_tokens else null end,
  case when hourly.cache_telemetry_requests >= 20 then hourly.cached_read_tokens else null end,
  case
    when hourly.cache_telemetry_requests >= 20 and hourly.input_tokens > 0
      then least(100, coalesce(hourly.cached_read_tokens, 0) * 100.0 / hourly.input_tokens)
    else null
  end cache_read_pct
from hourly
order by hourly.bucket_start;
$function$;

CREATE OR REPLACE FUNCTION public.promote_provider_catalog_candidate (
  p_run_id               uuid,
  p_submitted_model_slug text
)
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  candidate public.provider_catalog_route_candidates%rowtype;
  base_candidate public.provider_catalog_route_candidates%rowtype;
  tier_offer jsonb;
  tier_name text;
  any_route_enabled boolean := false;
  provider_model_id_value text;
  capability jsonb;
  price jsonb;
  sku_id_value uuid;
  sku_version_value integer;
  variant_id_value uuid;
  route_status text;
  provider_availability text;
  phaseo_status_value text;
  access_scope_value text;
  route_enabled boolean;
  release_due boolean;
  provider_approved boolean;
  provider_ready boolean;
  route_blocked boolean := false;
  pricing_changed boolean := true;
  pricing_hash text;
  pricing_operation text;
  sku_code_value text;
begin
  select * into candidate from public.provider_catalog_route_candidates
  where run_id = p_run_id and submitted_model_slug = p_submitted_model_slug for update;
  if not found then raise exception 'provider_catalog_candidate_not_found'; end if;
  select case when p.metadata ? 'self_serve'
    then p.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved'
    else coalesce((select sub.provider_review_status = 'approved'
      from public.provider_onboarding_submissions sub join public.provider_catalog_sources source
        on source.provider_slug = sub.provider_slug and source.created_by = sub.submitted_by
      where source.provider_slug = p.provider_slug order by sub.created_at desc limit 1),
      p.status in ('active', 'beta', 'alpha', 'deprecated')) end,
    coalesce((p.metadata ->> 'adapter_ready')::boolean, false)
      and coalesce((p.metadata ->> 'credentials_ready')::boolean, false)
      and nullif(btrim(p.base_url), '') is not null
    into provider_approved, provider_ready
  from public.v2_providers p where p.provider_slug = candidate.provider_slug for update;
  if not coalesce(provider_approved, false) then raise exception 'provider_catalog_provider_not_approved'; end if;
  if not exists (select 1 from public.provider_catalog_sources s where s.provider_slug = candidate.provider_slug and s.status = 'active') then raise exception 'provider_catalog_source_inactive'; end if;
  if not exists (select 1 from public.v2_models m where m.model_slug = candidate.canonical_model_slug
    and (not m.hidden or (m.metadata ->> 'provider_catalog_owner' = candidate.provider_slug and m.released_at is null))) then raise exception 'provider_catalog_model_unavailable'; end if;
  if candidate.status = 'promoted' then
    select provider_model_id into provider_model_id_value from public.v2_model_provider_routes
    where provider_slug = candidate.provider_slug and model_slug = candidate.canonical_model_slug
      and provider_model_slug = candidate.provider_model_slug order by created_at limit 1;
    return provider_model_id_value;
  end if;
  if candidate.status not in ('pending_probe', 'probe_passed') then raise exception 'provider_catalog_candidate_invalid'; end if;
  if jsonb_array_length(candidate.capabilities) = 0 then raise exception 'provider_catalog_capability_required'; end if;
  base_candidate := candidate;
  for tier_offer in select value from jsonb_array_elements(case when jsonb_array_length(candidate.service_tiers)>0
    then candidate.service_tiers else jsonb_build_array(jsonb_build_object('serviceTier','standard','providerModelSlug',candidate.provider_model_slug,'pricing',candidate.pricing,'availability',candidate.availability)) end)
  loop
  candidate := base_candidate;
  tier_name := tier_offer->>'serviceTier';
  if tier_name not in ('standard','fast','ultrafast','flex','batch') or tier_name is null then raise exception 'provider_catalog_service_tier_invalid'; end if;
  candidate.provider_model_slug := tier_offer->>'providerModelSlug';
  candidate.pricing := coalesce(tier_offer->'pricing','[]'::jsonb);
  candidate.availability := coalesce(tier_offer->>'availability',candidate.availability);
  if exists (
    select 1 from public.provider_catalog_sync_runs newer
    join public.provider_catalog_sync_runs current_run on current_run.id = candidate.run_id
    where newer.provider_slug = candidate.provider_slug and newer.status = 'applied'
      and newer.created_at > current_run.created_at
  ) then raise exception 'provider_catalog_candidate_superseded'; end if;
  if exists (select 1 from jsonb_array_elements(candidate.pricing) p where jsonb_array_length(coalesce(p -> 'conditions', '[]'::jsonb)) > 0) then
    raise exception 'provider_catalog_conditional_pricing_not_supported';
  end if;

  pricing_hash := md5(candidate.pricing::text || coalesce(candidate.available_from::text, '') ||
    coalesce((select string_agg(operation, ',' order by operation) from
      (select distinct public.canonical_routing_capability_id(value ->> 'id') as operation
        from jsonb_array_elements(candidate.capabilities)) operations), ''));
  select route.provider_model_id, route.phaseo_status in ('blocked', 'unsupported'),
      route.metadata ->> 'catalog_pricing_hash' is distinct from pricing_hash
        or exists (select 1 from jsonb_array_elements(candidate.capabilities) cap where not exists (
          select 1 from public.v2_pricing_skus sku where sku.provider_model_id = route.provider_model_id
            and sku.metadata ->> 'managed_by' = 'provider_catalog' and sku.status = 'active'
            and sku.operation = public.canonical_routing_capability_id(cap ->> 'id')))
    into provider_model_id_value, route_blocked, pricing_changed
  from public.v2_model_provider_routes route
  where route.provider_slug = candidate.provider_slug
    and route.model_slug = candidate.canonical_model_slug
    and route.provider_model_slug = candidate.provider_model_slug
    and coalesce(route.metadata->>'catalog_service_tier','standard')=tier_name
  order by route.created_at limit 1 for update of route;
  if provider_model_id_value is null then
    provider_model_id_value := candidate.provider_slug || ':catalog:' || gen_random_uuid()::text;
  end if;

  release_due := (candidate.available_from is null or candidate.available_from <= now())
    and (candidate.shutdown_at is null or candidate.shutdown_at > now());

  route_status := case
    when not release_due and candidate.availability in ('ready', 'degraded') then 'disabled'
    when candidate.availability = 'ready' then 'active'
    when candidate.availability = 'degraded' then 'degraded'
    when candidate.availability = 'retired' then 'disabled'
    else 'disabled'
  end;
  provider_availability := case
    when candidate.availability = 'ready' and release_due then 'available'
    when candidate.availability = 'degraded' and release_due then 'preview'
    when candidate.availability = 'deprecated' then 'deprecated'
    when candidate.availability = 'retired' then 'removed'
    else 'coming_soon'
  end;
  phaseo_status_value := case
    when candidate.availability in ('ready', 'degraded') and release_due then 'enabled'
    when candidate.availability = 'deprecated' then 'disabled'
    when candidate.availability = 'retired' then 'disabled'
    else 'testing'
  end;
  access_scope_value := case when candidate.availability in ('ready', 'degraded') and release_due then 'public' else 'internal' end;
  route_enabled := candidate.availability in ('ready', 'degraded') and release_due and provider_ready and not coalesce(route_blocked, false)
    and jsonb_array_length(candidate.pricing) > 0
    and exists (select 1 from public.v2_models m where m.model_slug = candidate.canonical_model_slug
      and (not m.hidden or (m.metadata ->> 'provider_catalog_owner' = candidate.provider_slug and m.released_at is null)))
    and exists (
      select 1 from public.v2_providers p
      where p.provider_slug = candidate.provider_slug
        and (
          (
            p.metadata ? 'self_serve'
            and p.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved'
            and (p.status = 'not_ready' or (p.status <> 'disabled' and p.routable and p.routing_enabled))
          )
          or (
            not (p.metadata ? 'self_serve')
            and (p.status = 'not_ready' or (p.status <> 'disabled' and p.routable and p.routing_enabled))
          )
        )
    )
    and not exists (select 1 from public.v2_model_provider_routes r
      where r.model_slug = candidate.canonical_model_slug and r.is_stealth);
  any_route_enabled := any_route_enabled or coalesce(route_enabled,false);
  if not route_enabled then
    phaseo_status_value := case when route_blocked then 'blocked' when candidate.available_from > now() then 'testing' else 'planned' end;
    access_scope_value := case when candidate.available_from > now() then 'internal' else 'public' end;
    if route_blocked then route_status := 'disabled'; end if;
  end if;

  insert into public.v2_model_provider_routes (
    provider_model_id, model_slug, provider_slug, provider_model_slug, status,
    routing_enabled, provider_availability_status, phaseo_status, access_scope,
    input_modalities, output_modalities, context_length, max_output_tokens,
    effective_from, effective_to, metadata, updated_at
  ) values (
    provider_model_id_value, candidate.canonical_model_slug, candidate.provider_slug,
    candidate.provider_model_slug, route_status, route_enabled,
    provider_availability, phaseo_status_value, access_scope_value,
    candidate.input_modalities, candidate.output_modalities, candidate.context_length,
    candidate.max_output_tokens, candidate.available_from, candidate.shutdown_at,
    jsonb_build_object(
      'managed_by', 'provider_catalog',
      'source_run_id', candidate.run_id,
      'catalog_pricing_hash', pricing_hash,
      'catalog_service_tier', tier_name,
      'catalog_upstream_service_tier', tier_offer->>'upstreamServiceTier',
      'deprecated_at', candidate.deprecated_at,
      'release_scheduled', candidate.available_from > now() and candidate.availability in ('ready', 'degraded') and not coalesce(route_blocked, false),
      'release_at', candidate.available_from
    ), now()
  )
  on conflict (provider_model_id) do update set
    provider_model_slug = excluded.provider_model_slug, status = excluded.status,
    routing_enabled = excluded.routing_enabled,
    provider_availability_status = excluded.provider_availability_status,
    phaseo_status = excluded.phaseo_status, access_scope = excluded.access_scope,
    input_modalities = excluded.input_modalities, output_modalities = excluded.output_modalities,
    context_length = excluded.context_length, max_output_tokens = excluded.max_output_tokens,
    effective_from = excluded.effective_from, effective_to = excluded.effective_to,
    metadata = public.v2_model_provider_routes.metadata || excluded.metadata, updated_at = now()
  where public.v2_model_provider_routes.provider_slug = excluded.provider_slug
    and public.v2_model_provider_routes.model_slug = excluded.model_slug
    and public.v2_model_provider_routes.provider_model_slug = excluded.provider_model_slug
    and coalesce(public.v2_model_provider_routes.metadata->>'catalog_service_tier','standard') = tier_name
  returning provider_model_id into provider_model_id_value;
  if provider_model_id_value is null then raise exception 'provider_catalog_route_identity_conflict'; end if;

  update public.v2_route_capabilities set status = 'disabled', updated_at = now()
  where provider_model_id = provider_model_id_value
    and capability_id = public.canonical_routing_capability_id(capability_id);

  for capability in
    select jsonb_build_object('id', public.canonical_routing_capability_id(cap.value ->> 'id'),
      'parameters', coalesce(jsonb_agg(distinct param.value) filter (where param.value is not null), '[]'::jsonb))
    from jsonb_array_elements(candidate.capabilities) cap
    left join lateral jsonb_array_elements_text(coalesce(cap.value -> 'parameters', '[]'::jsonb)) param on true
    group by public.canonical_routing_capability_id(cap.value ->> 'id')
  loop
    insert into public.v2_route_capabilities (
      provider_model_id, capability_id, status, max_output_tokens, params,
      effective_from, effective_to, metadata, updated_at
    ) values (
      provider_model_id_value, capability ->> 'id',
      case when route_enabled and candidate.availability = 'ready' then 'active'
           when route_enabled and candidate.availability = 'degraded' then 'degraded'
           when candidate.availability in ('deprecated', 'retired') then 'disabled'
           else 'internal_testing' end,
      candidate.max_output_tokens,
      coalesce((select jsonb_object_agg(p.value, true) from jsonb_array_elements_text(coalesce(capability -> 'parameters', '[]'::jsonb)) as p(value)), '{}'::jsonb)
        || case when tier_offer->>'upstreamServiceTier' is not null then '{"service_tier":true}'::jsonb else '{}'::jsonb end
        || case when jsonb_array_length(base_candidate.service_tiers)>0
          then jsonb_build_object('service_tier', jsonb_build_object('type','string','enum',
            case when tier_name='fast' then '["fast","priority"]'::jsonb
              when tier_name='standard' then '["standard","default"]'::jsonb else jsonb_build_array(tier_name) end,
            'provider_catalog',jsonb_build_object('name',tier_name,'upstream',tier_offer->>'upstreamServiceTier')))
          else '{}'::jsonb end,
      candidate.available_from, candidate.shutdown_at,
      jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id), now()
    )
    on conflict (provider_model_id, capability_id) do update set
      status = excluded.status, max_output_tokens = excluded.max_output_tokens,
      params = excluded.params, effective_from = excluded.effective_from,
      effective_to = excluded.effective_to,
      metadata = public.v2_route_capabilities.metadata || excluded.metadata, updated_at = now();
  end loop;

  insert into public.v2_route_variants (
    provider_model_id, variant_key, service_tier_slug, status,
    routing_enabled, endpoint_label, metadata, updated_at
  ) values (
    provider_model_id_value, 'global:' || tier_name, tier_name,
    case when route_enabled then route_status else 'disabled' end,
    route_enabled, initcap(tier_name),
    jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id), now()
  )
  on conflict (provider_model_id, variant_key) do update set
    service_tier_slug = excluded.service_tier_slug,
    status = excluded.status,
    routing_enabled = excluded.routing_enabled,
    endpoint_label = excluded.endpoint_label,
    metadata = public.v2_route_variants.metadata || excluded.metadata,
    updated_at = now()
  returning variant_id into variant_id_value;

  if coalesce(pricing_changed, true) then
  update public.v2_pricing_skus
  set status = case when effective_from >= now() then 'disabled' else 'deprecated' end,
      effective_to = case when effective_from < now() then now() else effective_to end, updated_at = now()
  where provider_model_id = provider_model_id_value
    and status = 'active' and (
      metadata ->> 'managed_by' = 'provider_catalog'
      or (coalesce(service_tier_slug, 'standard') = 'standard' and region is null
        and (operation = 'inference' or operation in (select public.canonical_routing_capability_id(value ->> 'id') from jsonb_array_elements(candidate.capabilities))))
    );
  if jsonb_array_length(candidate.pricing) > 0 then
  for pricing_operation in select distinct public.canonical_routing_capability_id(value ->> 'id') from jsonb_array_elements(candidate.capabilities)
  loop
  sku_code_value := 'provider-catalog-' || pricing_operation;
  select coalesce(max(version), 0) + 1 into sku_version_value
  from public.v2_pricing_skus where provider_model_id = provider_model_id_value and sku_code = sku_code_value;
  insert into public.v2_pricing_skus (
    provider_model_id, route_variant_id, service_tier_slug, sku_code, version, operation, status, display_name,
    currency, effective_from, metadata
  ) values (
    provider_model_id_value, variant_id_value, tier_name, sku_code_value, sku_version_value,
    pricing_operation, 'active', 'Provider catalog pricing', 'USD', greatest(coalesce(candidate.available_from, now()), now()),
    jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id, 'release_scheduled', not release_due)
  ) returning sku_id into sku_id_value;
  for price in select value from jsonb_array_elements(candidate.pricing)
  loop
    insert into public.v2_pricing_sku_meters (
      sku_id, meter_key, modality, direction, unit, unit_quantity,
      price_nanos, display_label, display_unit, metadata
    ) values (
      sku_id_value, price ->> 'meterKey', price ->> 'modality', nullif(price ->> 'direction', ''),
      price ->> 'unit', (price ->> 'unitQuantity')::numeric,
      (price ->> 'priceNanos')::numeric, price ->> 'displayLabel', price ->> 'displayUnit',
      jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id)
    );
  end loop;
  end loop;
  end if;
  end if;

  update public.v2_providers
  set status = case
        when route_enabled
          and (status = 'not_ready' or (status = 'disabled' and metadata -> 'self_serve' ->> 'status' = 'submitted'))
          then 'beta'
        else status
      end,
      routable = case when route_enabled then true else routable end,
      routing_enabled = case when route_enabled then true else routing_enabled end,
      updated_at = now()
  where provider_slug = candidate.provider_slug;

  if candidate.availability in ('ready', 'degraded') and release_due then
    update public.v2_models
    set hidden = false,
        released_at = coalesce(released_at, coalesce(candidate.available_from, now())),
        updated_at = now()
    where model_slug = candidate.canonical_model_slug
      and metadata ->> 'provider_catalog_owner' = candidate.provider_slug
      and not exists (select 1 from public.v2_model_provider_routes r where r.model_slug = candidate.canonical_model_slug and r.is_stealth);

    update public.v2_labs lab
    set status = case when lab.status = 'disabled' then 'active' else lab.status end,
        updated_at = now()
    where lab.lab_slug = (select model.lab_slug from public.v2_models model where model.model_slug = candidate.canonical_model_slug)
      and lab.metadata ->> 'created_from_provider_proposal' = 'true';
  end if;

  update public.provider_catalog_route_candidates
  set status = 'promoted', promoted_at = now(), updated_at = now()
  where run_id = p_run_id and submitted_model_slug = p_submitted_model_slug;

  update public.provider_catalog_sync_models
  set route_projection_status = case when route_enabled then 'enabled' else 'staged' end,
      route_projection_error = null
  where run_id = p_run_id and model_slug = p_submitted_model_slug;

  end loop;

  update public.provider_catalog_sync_models
  set route_projection_status = case when any_route_enabled then 'enabled' else 'staged' end
  where run_id=p_run_id and model_slug=p_submitted_model_slug;
  return provider_model_id_value;
end;
$function$;

CREATE TRIGGER workspace_enterprise_subscription_capacity
  BEFORE INSERT OR UPDATE ON public.workspace_addon_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_workspace_enterprise_subscription_capacity();

COMMENT ON FUNCTION "public"."get_v2_model_cached_input_metrics"(text, text, text, text) IS 'Token-weighted cached input percentage over time and by provider, suppressed below twenty aggregated requests.';

COMMENT ON FUNCTION "public"."get_v2_model_provider_30m_performance_v1"(text, text, numeric, text, text) IS 'Thirty-minute provider performance percentiles for the trailing day, suppressed below twenty aggregated requests.';

COMMENT ON FUNCTION "public"."get_v2_model_provider_hourly_performance_v2"(text, text, numeric, text, text) IS 'Hourly provider performance, quality success rates, token counts, and cache telemetry, suppressed below twenty aggregated requests.';

COMMENT ON FUNCTION "public"."get_v2_model_quality_hourly_v1"(text, text, text, text) IS 'Hourly tool-calling, structured-output, token, and cache aggregates, suppressed below twenty aggregated requests.';

REVOKE ALL ON FUNCTION "private"."enforce_workspace_enterprise_subscription_capacity"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enforce_workspace_enterprise_subscription_capacity"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enforce_workspace_enterprise_subscription_capacity"() TO "postgres";
