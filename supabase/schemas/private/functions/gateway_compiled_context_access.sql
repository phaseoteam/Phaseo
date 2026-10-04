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
    and gr.created_at >= month_start;

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

  -- Team spend & request aggregates
  select
    count(*),
    coalesce(sum(gr.cost_nanos), 0)::bigint,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= now_utc - interval '24 hours'), 0)::bigint,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= now_utc - interval '7 days'), 0)::bigint,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= now_utc - interval '30 days'), 0)::bigint,
    count(*) filter (where gr.created_at >= now_utc - interval '1 hour'),
    count(*) filter (where gr.created_at >= now_utc - interval '24 hours')
  into
    team_total_requests,
    team_total_spend_nanos,
    team_spend_24h_nanos,
    team_spend_7d_nanos,
    team_spend_30d_nanos,
    team_requests_1h,
    team_requests_24h
  from public.gateway_requests gr
  where gr.workspace_id = gateway_compiled_context_access.workspace_id
    and gr.success is true;

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

  select
    count(*),
    coalesce(sum(gr.cost_nanos), 0)::bigint
  into
    key_total_requests,
    key_total_spend_nanos
  from public.gateway_requests gr
  where gr.key_id = gateway_compiled_context_access.api_key_id
    and gr.success is true;

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

GRANT EXECUTE ON FUNCTION "private"."gateway_compiled_context_access"(uuid, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "private"."gateway_compiled_context_access"(uuid, text, text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."gateway_compiled_context_access"(uuid, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."gateway_compiled_context_access"(uuid, text, text, uuid) TO "postgres";
