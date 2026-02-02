declare
  credit_status       jsonb;
  key_status          jsonb;
  key_limit_status    jsonb;
  min_balance_nanos   bigint := 1000000000; -- 1.00 USD

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

  -- Preset handling
  is_preset           boolean := false;
  preset_name         text := null;

  -- Resolve model from alias if exists
  resolved_model      text := gateway_fetch_request_context.model;
  base_model          text;
begin
  base_model := gateway_fetch_request_context.model;
  -- hard requirement: key must be provided
  if gateway_fetch_request_context.api_key_id is null then
    raise exception using errcode = '22023', message = 'missing_api_key', detail = 'api_key_id is required';
  end if;

  -- Check if model is a preset (starts with @)
  if base_model like '@%' then
    is_preset := true;
    preset_name := substring(base_model from 2); -- Remove @ prefix

    -- Fetch preset configuration
    select
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'config', p.config,
        'visibility', p.visibility
      )
    into preset_data
    from public.presets p
    where p.name = preset_name
      and p.team_id = gateway_fetch_request_context.team_id
      and (
        p.visibility = 'public'
        or p.visibility = 'team'
        or p.created_by in (
          select u.user_id
          from public.users u
          where u.id = gateway_fetch_request_context.team_id
        )
      )
    limit 1;

    if preset_data is null then
      raise exception using
        errcode = '22023',
        message = 'preset_not_found',
        detail = format('Preset "%s" not found or not accessible', preset_name);
    end if;

    -- Extract model from preset config (fallback to preset's default model)
    base_model := coalesce(
      preset_data->'config'->>'defaultModel',
      preset_data->'config'->>'model'
    );

    if base_model is null then
      raise exception using
        errcode = '22023',
        message = 'preset_no_model',
        detail = format('Preset "%s" has no model configured', preset_name);
    end if;
  end if;

  -- Resolve alias if present
  resolved_model := coalesce(
    (
      select a.api_model_id
      from public.data_api_model_aliases a
      where a.alias_slug = base_model
        and a.is_enabled = true
        and a.api_model_id is not null
      limit 1
    ),
    base_model
  );

  -- validate key row, status, and team
  select
    (k.status = 'active'),
    (k.team_id = gateway_fetch_request_context.team_id),
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
  where k.id = gateway_fetch_request_context.api_key_id
  limit 1;

  if v_key_active is null then
    raise exception using errcode = '22023', message = 'api_key_not_found', detail = 'key id does not exist';
  end if;
  if not v_key_team_ok then
    raise exception using errcode = '22023', message = 'api_key_wrong_team', detail = 'key does not belong to provided team_id';
  end if;
  if not v_key_active then
    raise exception using errcode = '22023', message = 'api_key_inactive', detail = 'key status is not active';
  end if;

  key_status := jsonb_build_object('ok', true, 'mode', 'first_party');

  -- credit check
  credit_status :=
    coalesce((
      select case
        when coalesce(w.balance_nanos, 0)::bigint >= min_balance_nanos then
          jsonb_build_object('ok', true,  'balance_nanos', w.balance_nanos)
        else
          jsonb_build_object('ok', false, 'reason', 'insufficient_funds', 'balance_nanos', coalesce(w.balance_nanos, 0))
      end
      from public.wallets w
      where w.team_id = gateway_fetch_request_context.team_id
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
  where gr.key_id  = gateway_fetch_request_context.api_key_id
    and gr.team_id = gateway_fetch_request_context.team_id
    and gr.success is true;

  if v_soft_blocked then within_limits := false; limit_reason := 'key_limit_soft_blocked'; end if;
  if within_limits and v_day_req_limit > 0 and used_day_reqs >= v_day_req_limit then within_limits := false; limit_reason := 'daily_request_limit_reached'; end if;
  if within_limits and v_wk_req_limit  > 0 and used_wk_reqs  >= v_wk_req_limit  then within_limits := false; limit_reason := 'weekly_request_limit_reached'; end if;
  if within_limits and v_mo_req_limit  > 0 and used_mo_reqs  >= v_mo_req_limit  then within_limits := false; limit_reason := 'monthly_request_limit_reached'; end if;
  if within_limits and v_day_cost_limit > 0 and used_day_cost >= v_day_cost_limit then within_limits := false; limit_reason := 'daily_cost_limit_reached'; end if;
  if within_limits and v_wk_cost_limit  > 0 and used_wk_cost  >= v_wk_cost_limit  then within_limits := false; limit_reason := 'weekly_cost_limit_reached'; end if;
  if within_limits and v_mo_cost_limit  > 0 and used_mo_cost  >= v_mo_cost_limit  then within_limits := false; limit_reason := 'monthly_cost_limit_reached'; end if;

  key_limit_status :=
    jsonb_build_object(
      'ok', within_limits,
      'reason', limit_reason,
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
  declare
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

    -- Key aggregates
    key_name text;
    key_created_at timestamptz;
    key_total_requests bigint;
    key_total_spend_nanos bigint;
  begin
    -- Team metadata & wallet
    select
      t.created_at,
      coalesce(t.tier, 'basic'),
      coalesce(w.balance_nanos, 0)
    into
      team_created_at,
      team_tier,
      team_balance_nanos
    from public.teams t
    left join public.wallets w on w.team_id = t.id
    where t.id = gateway_fetch_request_context.team_id
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
    where gr.team_id = gateway_fetch_request_context.team_id
      and gr.success is true;

    -- Calculate tier dynamically based on rolling 30-day spend with grace period
    -- This updates the team's tier in the database if it changed
    team_tier := calculate_tier_with_grace(gateway_fetch_request_context.team_id, team_spend_30d_nanos);

    team_enrichment := jsonb_build_object(
      'tier', team_tier,
      'created_at', to_jsonb(team_created_at),
      'account_age_days', extract(epoch from (now_utc - team_created_at)) / 86400,
      'balance_nanos', team_balance_nanos,
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
    where k.id = gateway_fetch_request_context.api_key_id
    limit 1;

    select
      count(*),
      coalesce(sum(gr.cost_nanos), 0)::bigint
    into
      key_total_requests,
      key_total_spend_nanos
    from public.gateway_requests gr
    where gr.key_id = gateway_fetch_request_context.api_key_id
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
  end;

  -- provider candidates (BYOK) + pricing, fully qualifying params
  with provider_rows as (
    select distinct on (m.provider_api_model_id)
      m.provider_api_model_id,
      m.provider_id,
      m.provider_model_slug,
      c.params as capability_params,
      c.max_input_tokens,
      c.max_output_tokens
    from public.data_api_provider_models m
    join public.data_api_provider_model_capabilities c
      on c.provider_api_model_id = m.provider_api_model_id
    where m.api_model_id = resolved_model
      and c.capability_id = gateway_fetch_request_context.endpoint
      and c.status = 'active'
      and m.is_active_gateway
      and (m.effective_from is null or m.effective_from <= now() at time zone 'utc')
      and (m.effective_to   is null or (now() at time zone 'utc') < m.effective_to)
    order by m.provider_api_model_id, coalesce(c.updated_at, c.created_at) desc
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'provider_id', pr.provider_id,
          'provider_model_slug', pr.provider_model_slug,
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
            where bk.team_id    = gateway_fetch_request_context.team_id
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
            from public.data_api_pricing_rules r
            where r.model_key =
              pr.provider_id || ':' || resolved_model || ':' || gateway_fetch_request_context.endpoint
              and r.capability_id = gateway_fetch_request_context.endpoint
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
                  'currency', r.currency,
                  'tiering_mode', r.tiering_mode,
                  'match', r.match,
                  'priority', r.priority
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
            'endpoint', gateway_fetch_request_context.endpoint,
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
    'team_id', gateway_fetch_request_context.team_id,
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
