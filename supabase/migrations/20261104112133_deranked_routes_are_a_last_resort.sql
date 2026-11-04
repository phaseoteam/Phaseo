-- phaseo:allow-destructive-migration reason: the only matches are the two existing DELETE statements inside public.mutate_v2_admin_model_graph, which this migration recreates unchanged apart from its derank mapping; they remove a model's details and links only when an admin edits that model. No data is deleted by this migration.
-- A deranked route or capability (stored as 'degraded') is routable as a last resort instead of
-- being excluded, the public catalogue reports it as a single 'deranked' status, and the admin
-- editor's single 'deranked' option is stored as 'degraded'. The routing-candidates query accepts
-- a deranked capability too. Grants are unchanged.

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
  preset_ref          text := null;
  pinned_version      jsonb := null;

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
    -- "@slug@ref" and "@handle/slug@ref" pin a published version: its label
    -- (v3, 1.2.0, 2026.10.27) or a named label such as production.
    if position('@' in preset_name) > 0 then
      preset_ref := substring(preset_name from position('@' in preset_name) + 1);
      preset_name := substring(preset_name from 1 for position('@' in preset_name) - 1);
    end if;

    -- Fetch preset configuration. Qualified references resolve a
    -- public publisher globally; unqualified references remain workspace-local.
    if position('/' in preset_name) > 0 then
      preset_publisher := split_part(preset_name, '/', 1);
      preset_name := substring(preset_name from position('/' in preset_name) + 1);
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'slug', p.slug, 'description', p.description,
        'config', p.config, 'visibility', p.visibility, 'publisher', w.publisher_handle,
        'version_id', p.active_version_id,
        'version_label', (select v.version_label from public.preset_versions v where v.id = p.active_version_id)
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
        'description', p.description, 'config', p.config, 'visibility', p.visibility,
        'version_id', p.active_version_id,
        'version_label', (select v.version_label from public.preset_versions v where v.id = p.active_version_id)
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

    if preset_ref is not null then
      -- An exact version label (v3, 1.2.0, 2026.10.27) wins; otherwise a named
      -- label points at a version. Labels never look like version labels.
      -- Public references reach public versions only; workspace references
      -- apply the preset access rule to the pinned version's visibility.
      select jsonb_build_object(
        'name', v.name, 'slug', v.slug, 'description', v.description,
        'config', v.config, 'visibility', v.visibility,
        'version_id', v.id, 'version_label', v.version_label, 'ref', preset_ref
      ) into pinned_version
      from public.preset_versions v
      where v.preset_id = (preset_data->>'id')::uuid
        and v.id = coalesce(
          (select exact.id from public.preset_versions exact
            where exact.preset_id = v.preset_id and exact.version_label = preset_ref),
          (select l.version_id from public.preset_version_labels l
            where l.preset_id = v.preset_id and l.label = lower(preset_ref))
        )
        and case
          when preset_publisher is not null then v.visibility = 'public'
          else v.visibility in ('public', 'team') or exists (
            select 1 from public.presets p
            join public.keys ak on ak.created_by = p.created_by
            where p.id = v.preset_id
              and ak.id = gateway_fetch_request_context_without_workspace_budget.api_key_id
              and ak.workspace_id = gateway_fetch_request_context_without_workspace_budget.workspace_id
              and ak.status = 'active'
          )
        end;
      if pinned_version is null then
        raise exception using
          errcode = '22023',
          message = 'preset_version_not_found',
          detail = format('Version "%s" of preset "%s" not found', preset_ref, preset_name);
      end if;
      preset_data := preset_data || pinned_version;
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
      coalesce(c.params,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('data_policy',public.resolve_catalog_data_policy(m.provider_api_model_id,c.capability_id))) as capability_params,
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
      and (dm.status is null or lower(dm.status) in ('active', 'available', 'deprecated', 'retired'))
      and c.capability_id = gateway_fetch_request_context_without_workspace_budget.endpoint
      and c.status in ('active', 'degraded', 'deranked', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3')
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

CREATE OR REPLACE FUNCTION public.gateway_fetch_public_catalog_at (
  p_model     text,
  p_endpoints text[],
  p_at        timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_at timestamptz := p_at;
  v_endpoint text;
  v_model text;
  v_providers jsonb;
  v_pricing jsonb;
  v_variants jsonb := '[]'::jsonb;
  v_provider_rows jsonb;
  v_route_modes jsonb;
  v_until timestamptz;
  v_boundary timestamptz;
begin
  if p_model is null or length(p_model) > 512 or p_model like '@%'
    or cardinality(p_endpoints) not between 1 and 2
    or not (p_endpoints <@ array['text.generate','responses','chat.completions','messages']::text[]) then
    raise exception 'invalid_public_catalog_request' using errcode = '22023';
  end if;
  -- Snapshots are evaluated now or at an upcoming boundary so the gateway can
  -- switch to the next catalogue state exactly on time without a database read.
  if v_at is null or v_at < now() - interval '1 minute' or v_at > now() + interval '1 day' then
    raise exception 'invalid_public_catalog_time' using errcode = '22023';
  end if;
  v_until := v_at + interval '5 minutes';
  v_model := coalesce(
    (select a.model_slug from public.v2_model_aliases a where a.alias_slug=p_model and a.enabled limit 1),
    (select r.model_slug from public.v2_model_provider_routes r
      where position('/' in p_model)>0 and r.provider_slug=split_part(p_model,'/',1)
        and r.provider_model_slug=regexp_replace(p_model,'^[^/]+/','') and r.routing_enabled
        and (r.effective_from is null or r.effective_from<=v_at) and (r.effective_to is null or v_at<r.effective_to)
      order by coalesce(r.effective_from,to_timestamp(0)) desc,r.provider_model_id limit 1), p_model);

  foreach v_endpoint in array p_endpoints loop
    with provider_rows as (
      select distinct on (r.provider_model_id)
        r.*, c.status as capability_status,coalesce(c.params,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('data_policy',public.resolve_catalog_data_policy(r.provider_model_id,c.capability_id))) as params,c.max_input_tokens as cap_input,c.max_output_tokens as cap_output,
        coalesce(case when jsonb_typeof(r.metadata->'availability') = 'object' and (r.metadata->'availability'->>'mode') in ('allowlist','blocklist') and jsonb_typeof(r.metadata->'availability'->'countries') = 'array' then r.metadata->'availability' end,p.metadata->'availability') as availability,
        p.prompt_training_policy,p.data_policy_tier,p.data_policy_confidence,p.data_policy_contract_mode,p.data_policy_variant
      from public.v2_model_provider_routes r
      join public.v2_models m on m.model_slug=r.model_slug
      join public.v2_providers p on p.provider_slug=r.provider_slug
      join public.v2_route_capabilities c on c.provider_model_id=r.provider_model_id
      where r.model_slug=v_model and not coalesce(m.hidden,false)
        -- Retirement is informational: a retired model is served while any
        -- provider route stays enabled. Disable routes to stop traffic.
        and (m.status is null or lower(m.status) in ('active','available','deprecated','retired'))
        and c.capability_id=v_endpoint and c.status in ('active','degraded','deranked','deranked_lvl1','deranked_lvl2','deranked_lvl3')
        and r.routing_enabled
        and (p.status <> 'external' or coalesce(r.metadata->>'external_routing_override', 'false') = 'true')
        and (r.effective_from is null or r.effective_from<=v_at)
        and (r.effective_to is null or v_at<r.effective_to)
        and (c.effective_from is null or c.effective_from<=v_at)
        and (c.effective_to is null or v_at<c.effective_to)
      order by r.provider_model_id,coalesce(c.updated_at,c.created_at) desc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'provider_id',r.provider_slug,'api_model_id',r.model_slug,'pricing_key',r.provider_slug,
      'provider_model_slug',r.provider_model_slug,'availability',r.availability,'model_status',r.status,
      'external_routing_override',coalesce((r.metadata->>'external_routing_override')::boolean,false),
      'input_modalities',r.input_modalities,'output_modalities',r.output_modalities,
      'prompt_training_policy',coalesce(r.prompt_training_policy,'unknown'),
      'data_policy_tier',coalesce(r.data_policy_tier,'unknown'),'data_policy_confidence',coalesce(r.data_policy_confidence,'unknown'),
      'data_policy_contract_mode',coalesce(r.data_policy_contract_mode,'none'),'data_policy_variant',coalesce(r.data_policy_variant,'standard'),
      'capability_status',r.capability_status,'capability_params',coalesce(r.params,'{}'::jsonb),
      'max_input_tokens',r.cap_input,'max_output_tokens',r.cap_output,'supports_endpoint',true,'base_weight',1,'byok_meta','[]'::jsonb
    ) order by r.provider_model_id),'[]'::jsonb),
    coalesce(jsonb_object_agg(r.provider_slug,(
      select jsonb_build_object('provider',r.provider_slug,'model',v_model,'endpoint',v_endpoint,
        'effective_from',min(pr.effective_from),'effective_to',min(pr.effective_to),'currency','USD','version',max(pr.updated_at),
        'rules',coalesce(jsonb_agg(jsonb_build_object(
          'id',pr.rule_id,'pricing_plan',pr.pricing_plan,'meter',pr.meter,'unit',pr.unit,'unit_size',pr.unit_size,
          'price_per_unit',pr.price_per_unit,'included_quantity',pr.included_quantity,'currency',pr.currency,
          'match',pr.match,'priority',pr.priority,'billing_timestamp_basis',coalesce(pr.billing_timestamp_basis,'request_start'),
          'time_windows',coalesce(pr.time_windows,'[]'::jsonb)
        ) order by pr.priority desc,coalesce(pr.effective_from,v_at) desc),'[]'::jsonb))
      from (
        select meter.sku_meter_id::text as rule_id,route.provider_slug||':'||route.model_slug||':'||sku.operation as model_key,
          sku.operation as capability_id,coalesce(sku.service_tier_slug,'standard') as pricing_plan,meter.meter_key as meter,
          meter.unit,meter.unit_quantity as unit_size,meter.price_nanos/1000000000.0 as price_per_unit,
          coalesce(nullif(meter.metadata->>'included_quantity','')::numeric,nullif(sku.metadata->>'included_quantity','')::numeric,0) as included_quantity,
          sku.currency,coalesce(nullif(meter.metadata->>'priority','')::integer,meter.meter_order,100) as priority,
          sku.effective_from,sku.effective_to,coalesce(sku.metadata->'match',meter.metadata->'match','[]'::jsonb) as match,
          coalesce(sku.metadata->>'billing_timestamp_basis','request_start') as billing_timestamp_basis,
          coalesce(sku.metadata->'time_windows','[]'::jsonb) as time_windows,greatest(sku.updated_at,meter.updated_at) as updated_at
        from public.v2_pricing_skus sku join public.v2_model_provider_routes route using(provider_model_id)
          join public.v2_pricing_sku_meters meter using(sku_id) where sku.status='active' and meter.billable
      ) pr
      where pr.model_key=r.provider_slug||':'||v_model||':'||v_endpoint and pr.capability_id=v_endpoint
        and (pr.effective_from is null or pr.effective_from<=v_at) and (pr.effective_to is null or v_at<pr.effective_to)
    )),'{}'::jsonb) into v_providers,v_pricing from provider_rows r;
    v_variants := v_variants || jsonb_build_array(jsonb_build_object('endpoint',v_endpoint,'providers',v_providers,'pricing',v_pricing));
  end loop;

  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into v_provider_rows from (
    select provider_slug,status,routing_enabled,routable,credential_mode,provider_family_slug,offer_scope,offer_label,
      residency_mode,default_execution_regions,default_data_regions,zero_data_retention,prompt_training_policy,
      data_policy_tier,data_policy_confidence,data_policy_contract_mode,data_policy_variant,stream_cancellation_support,
      stream_cancellation_stops_provider_billing,stream_cancellation_usage_recovery,stream_cancellation_evidence_kind,
      stream_cancellation_source_url,jsonb_build_object('availability',metadata->'availability') as metadata
    from public.v2_providers where provider_slug in (
      select item->>'provider_id' from jsonb_array_elements(v_variants) variant,
        lateral jsonb_array_elements(variant->'providers') item)
  ) p;
  select coalesce(jsonb_agg(jsonb_build_object('provider_slug',provider_slug,'credential_mode',credential_mode)),'[]'::jsonb)
    into v_route_modes from public.v2_model_provider_routes where model_slug=v_model and routing_enabled and status in ('active','degraded');

  -- The next scheduled change covers future route/capability/price activation,
  -- not only currently selected price cards. KV's physical TTL is not freshness.
  select min(boundary) into v_boundary from (
    select effective_from as boundary from public.v2_model_provider_routes where model_slug=v_model
    union all select effective_to from public.v2_model_provider_routes where model_slug=v_model
    union all select c.effective_from from public.v2_route_capabilities c join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model
    union all select c.effective_to from public.v2_route_capabilities c join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model
    union all select s.effective_from from public.v2_pricing_skus s join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model and s.status='active'
    union all select s.effective_to from public.v2_pricing_skus s join public.v2_model_provider_routes r using(provider_model_id) where r.model_slug=v_model and s.status='active'
  ) boundaries where boundary>v_at;
  v_until := least(v_until,coalesce(v_boundary,v_until));
  return jsonb_build_object('version',1,'model',p_model,'resolvedModel',v_model,'endpoints',p_endpoints,
    'checkedAt',floor(extract(epoch from v_at)*1000),'expiresAt',floor(extract(epoch from v_until)*1000),
    'variants',v_variants,'providerRows',v_provider_rows,'routeModes',v_route_modes,
    'revision',public.gateway_catalogue_revision(),
    'boundaryAt',case when v_boundary is null then null else floor(extract(epoch from v_boundary)*1000) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_model_successor_routing (
  p_model_slug text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_model public.v2_models%rowtype; v_successor public.v2_models%rowtype; v_state public.v2_model_successor_routing%rowtype;
  v_missing_in text[]; v_missing_out text[]; v_context integer; v_successor_context integer; v_served boolean;
  v_blocking text[] := '{}'; v_warnings text[] := '{}'; v_compatibility jsonb;
begin
  select * into v_model from public.v2_models where model_slug=p_model_slug;
  if not found then raise exception 'model % does not exist', p_model_slug; end if;
  select * into v_state from public.v2_model_successor_routing where model_slug=p_model_slug;

  if v_model.replacement_model_slug is not null then
    select * into v_successor from public.v2_models where model_slug=v_model.replacement_model_slug;
  end if;
  if v_successor.model_slug is not null then
    select coalesce(array_agg(x),'{}') into v_missing_in from unnest(v_model.input_modalities) x where not x = any(v_successor.input_modalities);
    select coalesce(array_agg(x),'{}') into v_missing_out from unnest(v_model.output_modalities) x where not x = any(v_successor.output_modalities);
    select max(context_length) into v_context from public.v2_model_provider_routes where model_slug=v_model.model_slug;
    -- The successor only offers the context of routes that can serve it now;
    -- the old model keeps its historical maximum, since none may serve it.
    select max(r.context_length) into v_successor_context
    from public.v2_model_provider_routes r
    join public.v2_providers p on p.provider_slug=r.provider_slug
    where r.model_slug=v_successor.model_slug
      and r.routing_enabled
      and p.routing_enabled
      and (p.status <> 'external' or coalesce(r.metadata->>'external_routing_override', 'false') = 'true')
      and (r.effective_from is null or r.effective_from<=now())
      and (r.effective_to is null or now()<r.effective_to)
      and exists (
        select 1 from public.v2_route_capabilities c
        where c.provider_model_id=r.provider_model_id
          and c.status in ('active','degraded','deranked','deranked_lvl1','deranked_lvl2','deranked_lvl3')
          and (c.effective_from is null or c.effective_from<=now())
          and (c.effective_to is null or now()<c.effective_to));
    v_served := public.v2_model_has_routable_route(v_successor.model_slug);

    -- Blocking issues can never be approved; warnings need an explicit override.
    if v_model.variant_kind='free' and v_successor.variant_kind<>'free' then v_blocking := v_blocking || 'free_to_paid'::text; end if;
    if v_successor.hidden then v_blocking := v_blocking || 'successor_hidden'::text; end if;
    if v_successor.status not in ('active','deprecated','retired') then v_blocking := v_blocking || 'successor_inactive'::text; end if;
    if cardinality(v_missing_in) > 0 then v_warnings := v_warnings || 'missing_input_modalities'::text; end if;
    if cardinality(v_missing_out) > 0 then v_warnings := v_warnings || 'missing_output_modalities'::text; end if;
    if v_context is not null and (v_successor_context is null or v_successor_context < v_context) then v_warnings := v_warnings || 'smaller_context'::text; end if;
    if not v_served then v_warnings := v_warnings || 'successor_not_served'::text; end if;

    v_compatibility := jsonb_build_object(
      'successor', v_successor.model_slug, 'successor_status', v_successor.status, 'successor_served', v_served,
      'missing_input_modalities', to_jsonb(v_missing_in), 'missing_output_modalities', to_jsonb(v_missing_out),
      'context_length', v_context, 'successor_context_length', v_successor_context,
      'blocking', to_jsonb(v_blocking), 'warnings', to_jsonb(v_warnings));
  end if;

  return jsonb_build_object(
    'model_slug', v_model.model_slug,
    'replacement_model_slug', v_model.replacement_model_slug,
    'unserved_since', v_state.unserved_since,
    'auto_route_enabled', coalesce(v_state.auto_route_enabled, false),
    'approved_successor_slug', v_state.approved_successor_slug,
    'approved_by', v_state.approved_by,
    'approved_at', v_state.approved_at,
    'approval_source', v_state.approval_source,
    'auto_approval_blocked', coalesce(v_state.auto_approval_blocked, false),
    'approved_compatibility', coalesce(v_state.compatibility, '{}'::jsonb),
    'notes', v_state.notes,
    -- An approval only covers the successor that was reviewed.
    'approval_current', coalesce(v_state.auto_route_enabled, false) and v_state.approved_successor_slug is not distinct from v_model.replacement_model_slug,
    'compatibility', v_compatibility);
end $function$;

CREATE OR REPLACE FUNCTION public.v2_model_has_routable_route (
  p_model_slug text,
  p_at         timestamp with time zone DEFAULT now()
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  -- Mirrors the route filter in gateway_fetch_public_catalog_at for any endpoint,
  -- ignoring model status: this asks whether a provider still serves the model.
  -- BYOK-only routes count as served.
  select exists (
    select 1
    from public.v2_model_provider_routes r
    join public.v2_providers p on p.provider_slug=r.provider_slug
    join public.v2_route_capabilities c on c.provider_model_id=r.provider_model_id
    where r.model_slug=p_model_slug
      and r.routing_enabled
      and p.routing_enabled
      and (p.status <> 'external' or coalesce(r.metadata->>'external_routing_override', 'false') = 'true')
      and (r.effective_from is null or r.effective_from<=p_at)
      and (r.effective_to is null or p_at<r.effective_to)
      and c.status in ('active','degraded','deranked','deranked_lvl1','deranked_lvl2','deranked_lvl3')
      and (c.effective_from is null or c.effective_from<=p_at)
      and (c.effective_to is null or p_at<c.effective_to)
  )
$function$;

CREATE OR REPLACE FUNCTION public.mutate_v2_admin_model_graph (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_payload       jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_before jsonb; v_after jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  perform set_config('phaseo.catalogue_actor', p_actor_user_id::text, true);
  select to_jsonb(t) into v_before from public.v2_models t where model_slug=p_model_slug for update;
  if v_before is null then raise exception 'model not found'; end if;

  update public.v2_models set
    name=coalesce(p_payload->>'name',name), lab_slug=coalesce(p_payload->>'organisation_id',lab_slug),
    status=coalesce(lower(p_payload->>'status'),status), hidden=coalesce((p_payload->>'hidden')::boolean,hidden),
    family_slug=case when p_payload ? 'family_id' then nullif(p_payload->>'family_id','') else family_slug end,
    input_modalities=case when p_payload ? 'input_types' then string_to_array(coalesce(p_payload->>'input_types',''),',') else input_modalities end,
    output_modalities=case when p_payload ? 'output_types' then string_to_array(coalesce(p_payload->>'output_types',''),',') else output_modalities end,
    announced_at=case when p_payload ? 'announcement_date' then nullif(p_payload->>'announcement_date','')::timestamptz else announced_at end,
    released_at=case when p_payload ? 'release_date' then nullif(p_payload->>'release_date','')::timestamptz else released_at end,
    deprecated_at=case when p_payload ? 'deprecation_date' then nullif(p_payload->>'deprecation_date','')::timestamptz else deprecated_at end,
    retired_at=case when p_payload ? 'retirement_date' then nullif(p_payload->>'retirement_date','')::timestamptz else retired_at end,
    metadata=metadata||jsonb_strip_nulls(jsonb_build_object('license',p_payload->>'license','previous_model_id',p_payload->>'previous_model_id','source','admin')),updated_at=now()
  where model_slug=p_model_slug;

  if p_payload ? 'family' then
    insert into public.v2_model_families(family_slug,lab_slug,name,metadata,updated_at)
    values(p_payload->'family'->>'family_id',(select lab_slug from public.v2_models where model_slug=p_model_slug),p_payload->'family'->>'family_name',jsonb_strip_nulls(jsonb_build_object('description',p_payload->'family'->>'family_description','source','admin')),now())
    on conflict(family_slug) do update set name=excluded.name,metadata=public.v2_model_families.metadata||excluded.metadata,updated_at=now();
    update public.v2_models set family_slug=p_payload->'family'->>'family_id',updated_at=now() where model_slug=p_model_slug;
  end if;

  if p_payload ? 'model_details' then
    delete from public.v2_model_details where model_slug=p_model_slug;
    insert into public.v2_model_details(model_slug,detail_name,detail_value,detail_order)
    select p_model_slug,x->>'detail_name',coalesce(x->'detail_value',to_jsonb(x->>'detail_value')),100+row_number() over()
    from jsonb_array_elements(p_payload->'model_details') x;
  end if;
  if p_payload ? 'links' then
    delete from public.v2_model_links where model_slug=p_model_slug;
    insert into public.v2_model_links(model_slug,link_kind,title,url,metadata)
    select p_model_slug,coalesce(nullif(x->>'kind',''),x->>'platform'),coalesce(nullif(x->>'title',''),x->>'platform'),x->>'url',jsonb_build_object('source','admin') from jsonb_array_elements(p_payload->'links') x;
  end if;
  if p_payload ? 'benchmark_results' then
    if exists(select 1 from jsonb_array_elements(p_payload->'benchmark_results') x
      join public.v2_benchmark_results r on r.result_id::text=x->>'id' where r.model_slug<>p_model_slug)
      then raise exception 'benchmark result belongs to another model'; end if;
    insert into public.v2_benchmark_results(result_id,model_slug,benchmark_id,score,score_numeric,is_self_reported,other_info,source_link,variant,effective_to,updated_at)
    select coalesce(nullif(x->>'id','')::uuid,gen_random_uuid()),p_model_slug,x->>'benchmark_id',x->>'score',
      case when (x->>'score')~'^[-+]?[0-9]*\.?[0-9]+$' then (x->>'score')::numeric end,
      coalesce((x->>'is_self_reported')::boolean,false),nullif(x->>'other_info',''),nullif(x->>'source_link',''),nullif(x->>'variant',''),nullif(x->>'effective_to','')::timestamptz,now()
    from jsonb_array_elements(p_payload->'benchmark_results') x
    on conflict(result_id) do update set benchmark_id=excluded.benchmark_id,score=excluded.score,score_numeric=excluded.score_numeric,
      is_self_reported=excluded.is_self_reported,other_info=excluded.other_info,source_link=excluded.source_link,variant=excluded.variant,effective_to=excluded.effective_to,updated_at=now();
  end if;
  if p_payload ? 'subscription_plan_models' then
    insert into public.v2_subscription_plan_models(plan_uuid,model_slug,model_info,rate_limit,other_info,effective_to)
    select (x->>'plan_uuid')::uuid,p_model_slug,coalesce(x->'model_info','{}'::jsonb),coalesce(x->'rate_limit','{}'::jsonb),coalesce(x->'other_info','{}'::jsonb),nullif(x->>'effective_to','')::timestamptz
    from jsonb_array_elements(p_payload->'subscription_plan_models') x
    on conflict(plan_uuid,model_slug) do update set model_info=excluded.model_info,rate_limit=excluded.rate_limit,other_info=excluded.other_info,effective_to=excluded.effective_to;
  end if;
  if p_payload ? 'provider_models' then
    if exists(select 1 from jsonb_array_elements(p_payload->'provider_models') x
      join public.v2_model_provider_routes r on r.provider_model_id=x->>'id'
      where r.model_slug<>p_model_slug) then raise exception 'provider route belongs to another model'; end if;
    insert into public.v2_model_provider_routes(provider_model_id,model_slug,provider_slug,provider_model_slug,status,routing_enabled,input_modalities,output_modalities,context_length,max_output_tokens,effective_from,effective_to,metadata,updated_at)
    select
      case when coalesce(x->>'id','') like 'new-%' or coalesce(x->>'id','')='' then (x->>'provider_id')||':'||p_model_slug||':'||coalesce(nullif(x->>'provider_model_slug',''),x->>'api_model_id') else x->>'id' end,
      p_model_slug,x->>'provider_id',coalesce(nullif(x->>'provider_model_slug',''),x->>'api_model_id'),'active',coalesce((x->>'is_active_gateway')::boolean,false),
      case when jsonb_typeof(x->'input_modalities')='array' then array(select jsonb_array_elements_text(x->'input_modalities')) else string_to_array(coalesce(x->>'input_modalities',''),',') end,
      case when jsonb_typeof(x->'output_modalities')='array' then array(select jsonb_array_elements_text(x->'output_modalities')) else string_to_array(coalesce(x->>'output_modalities',''),',') end,
      nullif(x->>'context_length','')::integer,nullif(x->>'max_output_tokens','')::integer,nullif(x->>'effective_from','')::timestamptz,nullif(x->>'effective_to','')::timestamptz,
      jsonb_strip_nulls(jsonb_build_object('prompt_training_policy_override',x->>'prompt_training_policy_override','prompt_training_override_notes',x->>'prompt_training_override_notes','prompt_training_override_source_url',x->>'prompt_training_override_source_url','quantization_scheme',x->>'quantization_scheme','source','admin')),now()
    from (
      select distinct on (
        case when coalesce(entry.value->>'id','') like 'new-%' or coalesce(entry.value->>'id','')=''
          then (entry.value->>'provider_id')||':'||p_model_slug||':'||coalesce(nullif(entry.value->>'provider_model_slug',''),entry.value->>'api_model_id')
          else entry.value->>'id' end
      ) entry.value
      from jsonb_array_elements(p_payload->'provider_models') with ordinality entry(value, position)
      order by
        case when coalesce(entry.value->>'id','') like 'new-%' or coalesce(entry.value->>'id','')=''
          then (entry.value->>'provider_id')||':'||p_model_slug||':'||coalesce(nullif(entry.value->>'provider_model_slug',''),entry.value->>'api_model_id')
          else entry.value->>'id' end,
        entry.position desc
    ) deduplicated(x)
    on conflict(provider_model_id) do update set provider_slug=excluded.provider_slug,provider_model_slug=excluded.provider_model_slug,status=public.v2_model_provider_routes.status,routing_enabled=excluded.routing_enabled,input_modalities=excluded.input_modalities,output_modalities=excluded.output_modalities,context_length=excluded.context_length,max_output_tokens=excluded.max_output_tokens,effective_from=excluded.effective_from,effective_to=excluded.effective_to,metadata=public.v2_model_provider_routes.metadata||excluded.metadata,updated_at=now();
  end if;
  if p_payload ? 'provider_capabilities' then
    if exists (
      select 1 from jsonb_array_elements(p_payload->'provider_capabilities') x
      where not exists (
        select 1 from public.v2_model_provider_routes route
        where route.model_slug=p_model_slug and route.provider_slug=x->>'provider_id'
          and route.provider_model_slug=coalesce(nullif(x->>'provider_model_slug',''),x->>'api_model_id') and (nullif(x->>'provider_model_id','') is null or route.provider_model_id=x->>'provider_model_id')
      )
    ) then raise exception 'provider capability does not match a model route'; end if;
    insert into public.v2_route_capabilities(provider_model_id,capability_id,status,params,effective_from,effective_to,metadata,updated_at)
    select route.provider_model_id,x->>'capability_id',case when x->>'status' like 'deranked%' then 'degraded' else coalesce(nullif(x->>'status',''),'active') end,coalesce(x->'params','{}'::jsonb),nullif(x->>'effective_from','')::timestamptz,nullif(x->>'effective_to','')::timestamptz,jsonb_build_object('editor_status',x->>'status','source','admin'),now()
    from jsonb_array_elements(p_payload->'provider_capabilities') x join public.v2_model_provider_routes route on route.model_slug=p_model_slug and route.provider_slug=x->>'provider_id' and route.provider_model_slug=coalesce(nullif(x->>'provider_model_slug',''),x->>'api_model_id') and (nullif(x->>'provider_model_id','') is null or route.provider_model_id=x->>'provider_model_id')
    on conflict(provider_model_id,capability_id) do update set status=excluded.status,params=excluded.params,
      effective_from=excluded.effective_from,effective_to=excluded.effective_to,
      metadata=public.v2_route_capabilities.metadata||excluded.metadata,updated_at=now();
  end if;
  select to_jsonb(t) into v_after from public.v2_models t where model_slug=p_model_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,'model_graph',p_model_slug,'save',v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values('model',p_model_slug,'database_managed',p_actor_user_id,p_model_slug,now()) on conflict(source_type,source_key) do update set disposition='database_managed',actor_user_id=excluded.actor_user_id,updated_at=now();
  return jsonb_build_object('model',v_after);
end $function$;

CREATE OR REPLACE FUNCTION public.get_public_model_catalogue_rows (
  p_include_hidden boolean DEFAULT false
)
  RETURNS TABLE (
    model_id                           text,
    name                               text,
    organisation_id                    text,
    organisation_name                  text,
    organisation_colour                text,
    primary_date                       date,
    primary_timestamp                  numeric,
    primary_group_key                  text,
    gateway_status                     text,
    gateway_provider_count             integer,
    gateway_active_provider_count      integer,
    gateway_endpoints                  text[],
    gateway_input_modalities           text[],
    gateway_output_modalities          text[],
    gateway_features                   text[],
    gateway_provider_names             text[],
    gateway_active_provider_names      text[],
    gateway_provider_details           jsonb,
    gateway_api_model_ids              text[],
    context_lengths                    integer[],
    supported_parameters               text[],
    lowest_input_price                 numeric,
    lowest_output_price                numeric,
    lowest_standard_input_price        numeric,
    lowest_standard_output_price       numeric,
    lowest_standard_input_price_label  text,
    lowest_standard_input_price_unit   text,
    lowest_standard_output_price_label text,
    lowest_standard_output_price_unit  text,
    lowest_from_price                  numeric,
    lowest_from_price_unit             text,
    pricing_detail_rows                jsonb,
    popularity_tokens_week             numeric,
    throughput_week                    numeric,
    latency_week                       numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with source_rows as (
    select
      r.*,
      case
        when lower(coalesce(r.capability_status, '')) = 'disabled' then 'disabled'
        when lower(coalesce(r.capability_status, '')) in ('degraded', 'deranked', 'de_ranked', 'deranked_lvl1', 'deranked_lvl_1', 'deranked_lvl2', 'deranked_lvl_2', 'deranked_lvl3', 'deranked_lvl_3')
          then case when coalesce(r.is_active_gateway, false) then 'deranked' else 'inactive' end
        when lower(coalesce(r.capability_status, '')) in ('coming_soon', 'comingsoon') then 'coming_soon'
        when lower(coalesce(r.capability_status, '')) = 'inactive' then 'inactive'
        when coalesce(r.is_active_gateway, false) then 'active'
        else 'inactive'
      end as normalized_gateway_status
    from public.get_monitor_model_rows(p_include_hidden) r
    where r.model_id is not null
      and btrim(r.model_id) <> ''
  ),
  model_provider_status as (
    select
      sr.model_id,
      sr.provider_id,
      max(sr.api_provider_name) as api_provider_name,
      min(
        case sr.normalized_gateway_status
          when 'active' then 1
          when 'coming_soon' then 2
          when 'deranked' then 3
          when 'inactive' then 6
          when 'disabled' then 7
          else 8
        end
      ) as status_rank
    from source_rows sr
    where sr.provider_id is not null
      and btrim(sr.provider_id) <> ''
    group by sr.model_id, sr.provider_id
  ),
  provider_details as (
    select
      mps.model_id,
      jsonb_agg(
        jsonb_build_object(
          'id', mps.provider_id,
          'name', coalesce(nullif(mps.api_provider_name, ''), mps.provider_id),
          'status',
            case mps.status_rank
              when 1 then 'active'
              when 2 then 'coming_soon'
              when 3 then 'deranked'
              when 6 then 'inactive'
              when 7 then 'disabled'
              else 'inactive'
            end,
          'is_active', mps.status_rank in (1, 3, 4, 5)
        )
        order by mps.status_rank asc, coalesce(nullif(mps.api_provider_name, ''), mps.provider_id) asc
      ) as details
    from model_provider_status mps
    group by mps.model_id
  ),
  model_features as (
    select
      sr.model_id,
      array_remove(array[
        case when bool_or(coalesce(sr.is_free_variant, false)) then 'free' end,
        case when bool_or(coalesce(sr.capability_params::text, '') ilike '%reasoning%' or coalesce(sr.capability_params::text, '') ilike '%thinking%') then 'reasoning' end,
        case when bool_or(coalesce(sr.capability_params::text, '') ilike '%tool%' or coalesce(sr.capability_params::text, '') ilike '%function_call%') then 'tools' end,
        case when bool_or(coalesce(sr.capability_params::text, '') ilike '%structured_output%' or coalesce(sr.capability_params::text, '') ilike '%response_format%' or coalesce(sr.capability_params::text, '') ilike '%json_schema%') then 'structured_outputs' end,
        case when bool_or(coalesce(sr.capability_params::text, '') ilike '%web_search%' or coalesce(sr.capability_params::text, '') ilike '%websearch%' or coalesce(sr.capability_params::text, '') ilike '%native_web_search%') then 'web_search' end
      ], null) as features
    from source_rows sr
    group by sr.model_id
  ),
  model_supported_parameters as (
    select
      sr.model_id,
      coalesce(
        array_agg(distinct key order by key) filter (
          where key is not null
            and length(key) >= 2
            and key not in ('type', 'title', 'description', 'default', 'minimum', 'maximum', 'enum', 'oneof', 'anyof', 'allof', 'items', 'properties', 'required', 'nullable', 'additionalproperties', '$schema', '$id', 'strict')
        ),
        array[]::text[]
      ) as supported_parameters
    from source_rows sr
    left join lateral jsonb_object_keys(
      case
        when jsonb_typeof(sr.capability_params) = 'object' then sr.capability_params
        else '{}'::jsonb
      end
    ) as keys(key) on true
    group by sr.model_id
  ),
  grouped as (
    select
      sr.model_id,
      max(sr.model_name) as name,
      max(sr.organisation_id) as organisation_id,
      max(sr.organisation_name) as organisation_name,
      max(org.colour) as organisation_colour,
      max(sr.model_release_date) as primary_date,
      max(extract(epoch from sr.model_release_date::timestamptz) * 1000) as primary_timestamp,
      max(to_char(sr.model_release_date, 'YYYY-MM')) as primary_group_key,
      count(distinct sr.provider_id) filter (where sr.provider_id is not null and btrim(sr.provider_id) <> '')::integer as gateway_provider_count,
      count(distinct sr.provider_id) filter (
        where sr.provider_id is not null
          and btrim(sr.provider_id) <> ''
          and sr.normalized_gateway_status in ('active', 'deranked')
      )::integer as gateway_active_provider_count,
      bool_or(sr.normalized_gateway_status = 'coming_soon') as has_coming_soon_provider,
      array_agg(distinct sr.capability_id order by sr.capability_id) filter (where sr.capability_id is not null and btrim(sr.capability_id) <> '') as gateway_endpoints,
      array_agg(distinct input_modality order by input_modality) filter (where input_modality is not null and btrim(input_modality) <> '') as gateway_input_modalities,
      array_agg(distinct output_modality order by output_modality) filter (where output_modality is not null and btrim(output_modality) <> '') as gateway_output_modalities,
      array_agg(distinct coalesce(nullif(sr.api_provider_name, ''), sr.provider_id) order by coalesce(nullif(sr.api_provider_name, ''), sr.provider_id)) filter (where sr.provider_id is not null and btrim(sr.provider_id) <> '') as gateway_provider_names,
      array_agg(distinct coalesce(nullif(sr.api_provider_name, ''), sr.provider_id) order by coalesce(nullif(sr.api_provider_name, ''), sr.provider_id)) filter (
        where sr.provider_id is not null
          and btrim(sr.provider_id) <> ''
          and sr.normalized_gateway_status in ('active', 'deranked')
      ) as gateway_active_provider_names,
      array_agg(distinct sr.api_model_id order by sr.api_model_id) filter (where sr.api_model_id is not null and btrim(sr.api_model_id) <> '') as gateway_api_model_ids,
      array_agg(distinct coalesce(sr.context_length, sr.capability_max_input_tokens) order by coalesce(sr.context_length, sr.capability_max_input_tokens)) filter (where coalesce(sr.context_length, sr.capability_max_input_tokens) > 0) as context_lengths,
      min(sr.input_price) filter (where sr.normalized_gateway_status in ('active', 'deranked') and sr.input_price > 0) as lowest_input_price,
      min(sr.output_price) filter (where sr.normalized_gateway_status in ('active', 'deranked') and sr.output_price > 0) as lowest_output_price,
      min(sr.standard_input_price) filter (where sr.normalized_gateway_status in ('active', 'deranked') and sr.standard_input_price > 0) as lowest_standard_input_price,
      min(sr.standard_output_price) filter (where sr.normalized_gateway_status in ('active', 'deranked') and sr.standard_output_price > 0) as lowest_standard_output_price,
      min(sr.standard_input_price_label) filter (where sr.standard_input_price_label is not null) as lowest_standard_input_price_label,
      min(sr.standard_input_price_unit) filter (where sr.standard_input_price_unit is not null) as lowest_standard_input_price_unit,
      min(sr.standard_output_price_label) filter (where sr.standard_output_price_label is not null) as lowest_standard_output_price_label,
      min(sr.standard_output_price_unit) filter (where sr.standard_output_price_unit is not null) as lowest_standard_output_price_unit,
      min(sr.from_price) filter (where sr.normalized_gateway_status in ('active', 'deranked') and sr.from_price >= 0) as lowest_from_price,
      case
        when count(distinct sr.from_price_unit) filter (where sr.from_price_unit is not null and btrim(sr.from_price_unit) <> '') = 1
          then min(sr.from_price_unit) filter (where sr.from_price_unit is not null and btrim(sr.from_price_unit) <> '')
        else null
      end as lowest_from_price_unit,
      max(sr.weekly_tokens_model)::numeric as popularity_tokens_week,
      max(sr.weekly_throughput_model)::numeric as throughput_week,
      max(sr.weekly_latency_model)::numeric as latency_week
    from source_rows sr
    left join private.v2_rpc_labs_compat org
      on org.organisation_id = sr.organisation_id
    left join lateral unnest(coalesce(sr.input_modalities, array[]::text[])) as input_values(input_modality) on true
    left join lateral unnest(coalesce(sr.output_modalities, array[]::text[])) as output_values(output_modality) on true
    group by sr.model_id
  )
  select
    g.model_id,
    coalesce(nullif(g.name, ''), g.model_id) as name,
    coalesce(g.organisation_id, split_part(g.model_id, '/', 1)) as organisation_id,
    g.organisation_name,
    g.organisation_colour,
    g.primary_date,
    g.primary_timestamp,
    g.primary_group_key,
    case
      when g.gateway_active_provider_count > 0 then 'active'
      when g.has_coming_soon_provider then 'coming_soon'
      when g.gateway_provider_count > 0 then 'inactive'
      else 'not_listed'
    end as gateway_status,
    g.gateway_provider_count,
    g.gateway_active_provider_count,
    coalesce(g.gateway_endpoints, array[]::text[]) as gateway_endpoints,
    coalesce(g.gateway_input_modalities, array[]::text[]) as gateway_input_modalities,
    coalesce(g.gateway_output_modalities, array[]::text[]) as gateway_output_modalities,
    coalesce(mf.features, array[]::text[]) as gateway_features,
    coalesce(g.gateway_provider_names, array[]::text[]) as gateway_provider_names,
    coalesce(g.gateway_active_provider_names, array[]::text[]) as gateway_active_provider_names,
    coalesce(pd.details, '[]'::jsonb) as gateway_provider_details,
    coalesce(g.gateway_api_model_ids, array[]::text[]) as gateway_api_model_ids,
    coalesce(g.context_lengths, array[]::integer[]) as context_lengths,
    coalesce(msp.supported_parameters, array[]::text[]) as supported_parameters,
    g.lowest_input_price,
    g.lowest_output_price,
    g.lowest_standard_input_price,
    g.lowest_standard_output_price,
    g.lowest_standard_input_price_label,
    g.lowest_standard_input_price_unit,
    g.lowest_standard_output_price_label,
    g.lowest_standard_output_price_unit,
    g.lowest_from_price,
    g.lowest_from_price_unit,
    '[]'::jsonb as pricing_detail_rows,
    g.popularity_tokens_week,
    g.throughput_week,
    g.latency_week
  from grouped g
  left join provider_details pd on pd.model_id = g.model_id
  left join model_features mf on mf.model_id = g.model_id
  left join model_supported_parameters msp on msp.model_id = g.model_id
  order by g.primary_timestamp desc nulls last, g.organisation_name asc nulls last, g.name asc;
$function$;

CREATE OR REPLACE FUNCTION catalogue_private.apply_v2_admin_model_capabilities (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_capabilities  jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_capability jsonb;
  v_route_id text;
  v_provider_model_id text;
  v_provider_model_slug text;
  v_capability_id text;
  v_previous_capability_id text;
  v_existing_capability_id text;
  v_existing_effective_to timestamptz;
  v_has_previous boolean;
  v_has_target boolean;
begin
  if not exists (
    select 1
    from public.users
    where user_id = p_actor_user_id
      and lower(coalesce(role::text, '')) = 'admin'
  ) then
    raise exception 'actor must have the admin role';
  end if;

  if jsonb_typeof(coalesce(p_capabilities, '[]'::jsonb)) <> 'array' then
    raise exception 'provider capabilities must be an array';
  end if;

  if not exists (
    select 1 from public.v2_models where model_slug = p_model_slug
  ) then
    raise exception 'model not found';
  end if;

  -- The graph mutation locks the model before calling this helper. Reject
  -- duplicate target keys here so the error is deterministic before the
  -- per-row upserts run.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_capabilities, '[]'::jsonb)) as payload(value)
    join public.v2_model_provider_routes route
      on route.model_slug = p_model_slug
      and route.provider_slug = nullif(trim(payload.value->>'provider_id'), '')
      and route.provider_model_slug = coalesce(
        nullif(trim(payload.value->>'provider_model_slug'), ''),
        nullif(trim(payload.value->>'api_model_id'), '')
      )
      and (
        nullif(trim(payload.value->>'provider_model_id'), '') is null
        or route.provider_model_id = trim(payload.value->>'provider_model_id')
      )
    group by route.provider_model_id, lower(trim(payload.value->>'capability_id'))
    having count(*) > 1
  ) then
    raise exception 'a provider model cannot have duplicate capabilities';
  end if;

  for v_capability in
    select value
    from jsonb_array_elements(coalesce(p_capabilities, '[]'::jsonb))
  loop
    v_provider_model_id := nullif(trim(v_capability->>'provider_model_id'), '');
    v_provider_model_slug := coalesce(
      nullif(trim(v_capability->>'provider_model_slug'), ''),
      nullif(trim(v_capability->>'api_model_id'), '')
    );
    v_capability_id := nullif(lower(trim(v_capability->>'capability_id')), '');
    v_previous_capability_id := nullif(lower(trim(v_capability->>'previous_capability_id')), '');

    if v_capability_id is null then
      raise exception 'provider capability id is required';
    end if;

    select route.provider_model_id
    into v_route_id
    from public.v2_model_provider_routes route
    where route.model_slug = p_model_slug
      and route.provider_slug = nullif(trim(v_capability->>'provider_id'), '')
      and route.provider_model_slug = v_provider_model_slug
      and (v_provider_model_id is null or route.provider_model_id = v_provider_model_id)
    order by route.provider_model_id
    limit 1;

    if v_route_id is null then
      raise exception 'provider capability does not match a model route';
    end if;

    select exists (
      select 1
      from public.v2_route_capabilities capability
      where capability.provider_model_id = v_route_id
        and lower(capability.capability_id) = v_capability_id
    )
    into v_has_target;

    v_existing_capability_id := null;
    v_existing_effective_to := null;
    v_has_previous := false;
    select capability.capability_id, capability.effective_to
    into v_existing_capability_id, v_existing_effective_to
    from public.v2_route_capabilities capability
    where capability.provider_model_id = v_route_id
      and lower(capability.capability_id) = coalesce(v_previous_capability_id, v_capability_id)
    for update;

    v_has_previous := v_existing_capability_id is not null;
    -- Historical rows are immutable even when the editor keeps the same
    -- capability identity. Lock and validate the source before any upsert.
    if v_has_previous and v_existing_effective_to is not null
       and v_existing_effective_to <= now() then
      raise exception 'historical capabilities cannot be changed';
    end if;

    if v_previous_capability_id is not null
       and v_previous_capability_id <> v_capability_id then
      if v_has_previous and v_has_target then
        raise exception 'provider model already has capability %', v_capability_id;
      end if;

      -- A historical row is immutable. An active or future row can be
      -- reassigned in place, which is the operation the editor needs.
      if v_has_previous and exists (
        select 1
        from public.v2_route_parameter_support support
        where support.provider_model_id = v_route_id
          and lower(support.capability_id) = lower(v_existing_capability_id)
      ) then
        raise exception 'capability has parameter support records and cannot be reassigned';
      end if;

      if v_has_previous and exists (
        select 1
        from public.v2_execution_plans plan
        where plan.provider_model_id = v_route_id
          and lower(plan.capability_id) = lower(v_existing_capability_id)
      ) then
        raise exception 'capability has execution plans and cannot be reassigned';
      end if;

      if v_has_previous then
        update public.v2_route_capabilities
        set capability_id = v_capability_id,
            updated_at = now()
        where provider_model_id = v_route_id
          and capability_id = v_existing_capability_id;
      end if;
    end if;

    insert into public.v2_route_capabilities(
      provider_model_id,
      capability_id,
      status,
      params,
      effective_from,
      effective_to,
      metadata,
      updated_at
    )
    values (
      v_route_id,
      v_capability_id,
      case
        when coalesce(v_capability->>'status', '') like 'deranked%' then 'degraded'
        else coalesce(nullif(trim(v_capability->>'status'), ''), 'active')
      end,
      coalesce(v_capability->'params', '{}'::jsonb),
      nullif(v_capability->>'effective_from', '')::timestamptz,
      nullif(v_capability->>'effective_to', '')::timestamptz,
      jsonb_build_object('editor_status', v_capability->>'status', 'source', 'admin'),
      now()
    )
    on conflict (provider_model_id, capability_id) do update set
      status = excluded.status,
      params = excluded.params,
      effective_from = excluded.effective_from,
      effective_to = excluded.effective_to,
      metadata = public.v2_route_capabilities.metadata || excluded.metadata,
      updated_at = now();
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_routing_candidates_raw (
  p_model_slug    text,
  p_capability_id text DEFAULT NULL::text,
  p_region        text DEFAULT NULL::text,
  p_service_tier  text DEFAULT 'standard'::text
)
  RETURNS TABLE (
    provider_model_id   text,
    provider_slug       text,
    provider_name       text,
    model_slug          text,
    provider_model_slug text,
    variant_id          uuid,
    service_tier_slug   text,
    execution_region    text,
    data_region         text,
    route_status        text,
    provider_status     text,
    capability_status   text,
    routing_enabled     boolean
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    route.provider_model_id,
    route.provider_slug,
    provider.name,
    route.model_slug,
    route.provider_model_slug,
    variant.variant_id,
    variant.service_tier_slug,
    variant.execution_region,
    variant.data_region,
    route.status,
    provider.status,
    coalesce(capability.status, 'active'),
    route.routing_enabled and provider.routing_enabled and variant.routing_enabled
  from public.v2_model_provider_routes route
  join public.v2_providers provider on provider.provider_slug = route.provider_slug
  join public.v2_route_variants variant on variant.provider_model_id = route.provider_model_id
  left join lateral (
    select capability.status
    from public.v2_route_capabilities capability
    where capability.provider_model_id = route.provider_model_id
      and (p_capability_id is null or capability.capability_id = p_capability_id)
    order by case when capability.status = 'active' then 0 else 1 end, capability.capability_id
    limit 1
  ) capability on true
  where route.model_slug = lower(p_model_slug)
    and route.status in ('active', 'degraded')
    and provider.status not in ('disabled', 'deprecated')
    and variant.status in ('active', 'degraded')
    and (route.effective_from is null or route.effective_from <= now())
    and (route.effective_to is null or route.effective_to > now())
    and (
      route.provider_availability_status in ('available', 'preview', 'limited_access')
      or (
        route.provider_availability_status = 'deprecated'
        and route.effective_to is not null
        and route.effective_to > now()
      )
    )
    and (
      p_capability_id is null
      or capability.status in ('active', 'degraded')
    )
    and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
    and (
      p_region is null
      or lower(p_region) = lower(coalesce(variant.execution_region, ''))
      or lower(p_region) = lower(coalesce(variant.data_region, ''))
    )
  order by (route.routing_enabled and provider.routing_enabled and variant.routing_enabled) desc,
    case route.status when 'active' then 0 else 1 end,
    provider.name,
    route.provider_model_id;
$function$;
