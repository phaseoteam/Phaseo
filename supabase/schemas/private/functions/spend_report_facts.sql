CREATE OR REPLACE FUNCTION private.spend_report_facts (
  p_workspace_id uuid,
  p_cadence      text,
  p_now          timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Everything one workspace's spend report says, for the last complete daily, weekly or monthly
  -- period before p_now in its billing_time_zone (private.spend_report_period). Every figure is
  -- summed here; the email and the routed message only format it.
  --   * Totals (spend, requests, tokens) and top keys and models: the dashboard's exact usage
  --     overview (public.get_private_usage_overview, rollup plus hours the outbox has yet to
  --     rebuild), so they match the usage page and the weekly mobile digest. The period before
  --     comes from private.mobile_week_usage, the digest's own summary of the same overview.
  --   * Top members and departments: attributed the way spend rules count them (rollup by
  --     actor_user_id plus successful async jobs and realtime sessions; departments through
  --     private.spend_department_totals, which follows department_spend_attribution, so a person
  --     in two departments counts toward both unless the workspace counts primary ones only).
  --   * Forecast: the current billing month (in billing_time_zone) projected the way forecast spend
  --     rules project it (private.spend_rule_values): spend so far x month length / time elapsed,
  --     from 72 hours into the month; 0 without spend.
  --   * Runway: the available balance (balance - reserved) over the burn of the last 7 days, the
  --     way balance spend rules compute it (private.spend_balance_rule_values). Null without a
  --     wallet; runway_days null without spend.
  --   * Alerts: spend_alert events queued in the period, per rule. Blocks: spend blocks started in
  --     the period or active at any point of it.
  -- Null when the workspace does not exist or the cadence is not daily, weekly or monthly.
  with ws as (
    select
      workspace.id,
      coalesce(nullif(btrim(workspace.name), ''), 'Your workspace') as name,
      coalesce(settings.billing_time_zone, 'UTC') as time_zone,
      coalesce(settings.department_spend_attribution, 'all') as attribution
    from public.workspaces workspace
    left join public.workspace_settings settings on settings.workspace_id = workspace.id
    where workspace.id = p_workspace_id
  ),
  period as materialized (
    select ws.*, report.period_start, report.period_end, report.previous_start, report.previous_end,
      month.period_start as month_start, month.period_end as month_end
    from ws
    cross join lateral private.spend_report_period(p_cadence, ws.time_zone, p_now) report
    cross join lateral private.spend_rule_period('month', ws.time_zone, p_now) month
  ),
  cells as materialized (
    select
      nullif(overview.cell ->> 'modelId', '') as model_id,
      nullif(overview.cell ->> 'keyId', '')::uuid as key_id,
      coalesce((overview.cell ->> 'requests')::numeric, 0) as requests,
      coalesce((overview.cell ->> 'successfulRequests')::numeric, 0) as successful_requests,
      coalesce((overview.cell ->> 'costNanos')::numeric, 0) as cost_nanos,
      coalesce((overview.cell ->> 'tokens')::numeric, 0) as tokens,
      coalesce((overview.cell ->> 'inputTokens')::numeric, 0) as input_tokens,
      coalesce((overview.cell ->> 'outputTokens')::numeric, 0) as output_tokens
    from period
    -- The overview's upper bound is inclusive, as private.mobile_week_usage calls it.
    cross join lateral jsonb_array_elements(public.get_private_usage_overview(
      p_workspace_id, period.period_start, period.period_end - interval '1 microsecond', null, period.time_zone
    )) as overview(cell)
  ),
  totals as (
    select
      coalesce(sum(cells.cost_nanos), 0) as spend_nanos,
      coalesce(sum(cells.requests), 0) as requests,
      coalesce(sum(cells.successful_requests), 0) as successful_requests,
      coalesce(sum(cells.tokens), 0) as tokens,
      coalesce(sum(cells.input_tokens), 0) as input_tokens,
      coalesce(sum(cells.output_tokens), 0) as output_tokens
    from cells
  ),
  previous as (
    select
      coalesce((usage.summary ->> 'spendNanos')::numeric, 0) as spend_nanos,
      coalesce((usage.summary ->> 'requests')::numeric, 0) as requests,
      coalesce((usage.summary ->> 'tokens')::numeric, 0) as tokens
    from period
    cross join lateral (
      select private.mobile_week_usage(p_workspace_id, period.previous_start, period.previous_end, period.time_zone) as summary
    ) usage
  ),
  top_keys as (
    select keyed.key_id, key.name, keyed.spend_nanos, keyed.requests
    from (
      select cells.key_id, sum(cells.cost_nanos) as spend_nanos, sum(cells.requests) as requests
      from cells
      group by cells.key_id
      having sum(cells.cost_nanos) > 0
    ) keyed
    left join public.keys key on key.id = keyed.key_id and key.workspace_id = p_workspace_id
    order by keyed.spend_nanos desc, keyed.requests desc, keyed.key_id nulls last
    limit 5
  ),
  top_models as (
    select modelled.model_id, coalesce(catalogue.name, modelled.model_id) as name, modelled.spend_nanos, modelled.requests
    from (
      select cells.model_id, sum(cells.cost_nanos) as spend_nanos, sum(cells.requests) as requests
      from cells
      where cells.model_id is not null
      group by cells.model_id
      having sum(cells.cost_nanos) > 0
    ) modelled
    left join public.v2_models catalogue on catalogue.model_slug = modelled.model_id
    order by modelled.spend_nanos desc, modelled.requests desc, modelled.model_id
    limit 5
  ),
  spend as materialized (
    -- One read of the spend spend rules count (rollup plus successful async jobs and realtime
    -- sessions), from the earliest of the report period, the billing month and the last 7 days,
    -- up to p_now. Members, the month so far and the 7-day burn are all summed from it.
    select usage.at, usage.actor_user_id, usage.cost_nanos, usage.requests
    from period
    cross join lateral (
      select rollup.bucket_start as at, rollup.actor_user_id, rollup.cost_nanos, rollup.requests::numeric as requests
      from public.v2_private_usage_15m rollup
      where rollup.workspace_id = p_workspace_id
        and rollup.bucket_start >= least(period.period_start, period.month_start, p_now - interval '168 hours')
        and rollup.bucket_start < p_now
      union all
      -- gateway_requests_async_spend_idx
      select request.created_at, coalesce(request.oauth_user_id, key.oauth_user_id, key.created_by), coalesce(request.cost_nanos, 0)::numeric, 1::numeric
      from public.gateway_requests request
      left join public.keys key on key.id = request.key_id
      where request.success is true
        and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
        and request.workspace_id = p_workspace_id
        and request.created_at >= least(period.period_start, period.month_start, p_now - interval '168 hours')
        and request.created_at < p_now
    ) usage
  ),
  member_usage as (
    select spend.actor_user_id, sum(spend.cost_nanos) as spend_nanos, sum(spend.requests) as requests
    from spend
    cross join period
    where spend.actor_user_id is not null
      and spend.at >= period.period_start
      and spend.at < period.period_end
    group by spend.actor_user_id
    having sum(spend.cost_nanos) > 0
  ),
  spend_sums as materialized (
    select
      coalesce(sum(spend.cost_nanos) filter (where spend.at >= period.month_start), 0) as month_nanos,
      coalesce(sum(spend.cost_nanos) filter (where spend.at >= p_now - interval '168 hours'), 0) as burn_nanos
    from period
    left join spend on true
    group by period.month_start
  ),
  top_members as (
    select member_usage.actor_user_id, nullif(btrim(person.display_name), '') as display_name,
      nullif(btrim(account.email), '') as email, member_usage.spend_nanos, member_usage.requests
    from member_usage
    left join public.users person on person.user_id = member_usage.actor_user_id
    left join auth.users account on account.id = member_usage.actor_user_id
    order by member_usage.spend_nanos desc, member_usage.requests desc, member_usage.actor_user_id
    limit 5
  ),
  top_departments as (
    select totals.department_id, department.name, totals.cost_nanos as spend_nanos, totals.requests
    from period
    cross join lateral private.spend_department_totals(p_workspace_id, period.period_start, period.period_end) totals
    left join public.workspace_departments department
      on department.id = totals.department_id and department.workspace_id = p_workspace_id
    where totals.cost_nanos > 0
    order by totals.cost_nanos desc, totals.requests desc, totals.department_id
    limit 5
  ),
  month_spend as (
    select period.month_start, period.month_end, spend_sums.month_nanos as spend_nanos,
      period.month_start + interval '72 hours' as forecast_from,
      (extract(epoch from p_now) - extract(epoch from period.month_start)) * 1000 as elapsed_ms,
      (extract(epoch from period.month_end) - extract(epoch from period.month_start)) * 1000 as length_ms
    from period
    cross join spend_sums
  ),
  forecast as materialized (
    select month_spend.*,
      case
        when p_now < month_spend.forecast_from then null
        when month_spend.spend_nanos <= 0 then 0::numeric
        else round(month_spend.spend_nanos * month_spend.length_ms / month_spend.elapsed_ms)
      end as projected_nanos
    from month_spend
  ),
  runway as materialized (
    select wallet.balance_nanos, wallet.reserved_nanos, wallet.available_nanos, burned.burn_nanos,
      burned.burn_nanos * 24 / 168 as burn_per_day_nanos,
      case when burned.burn_nanos > 0 then round(wallet.available_nanos / (burned.burn_nanos * 24 / 168), 2) end as runway_days
    from (
      select w.balance_nanos, coalesce(w.reserved_nanos, 0) as reserved_nanos,
        greatest(w.balance_nanos - coalesce(w.reserved_nanos, 0), 0) as available_nanos
      from public.wallets w
      where w.workspace_id = p_workspace_id
    ) wallet
    cross join (select spend_sums.burn_nanos from spend_sums) burned
  ),
  alerts as (
    -- email_outbox_workspace_id_idx
    select event.payload ->> 'rule_id' as rule_id, max(event.payload ->> 'rule_name') as rule_name,
      max(event.payload ->> 'metric') as metric, count(*) as fired, max(event.created_at) as last_at,
      (array_agg(coalesce(event.payload ->> 'title', event.subject) order by event.created_at desc, event.id desc))[1] as last_title
    from period
    join public.email_outbox event
      on event.workspace_id = p_workspace_id
      and event.kind = 'spend_alert'
      and event.created_at >= period.period_start
      and event.created_at < period.period_end
    group by event.payload ->> 'rule_id'
  ),
  blocks as (
    select block.id, block.rule_id, coalesce(rule.name, 'Deleted rule') as rule_name, block.scope_type, block.scope_id,
      private.spend_scope_label(p_workspace_id, block.scope_type, block.scope_id) as scope_label,
      block.started_at, block.lifted_at, block.lift_reason, block.resets_at, block.limit_nanos,
      block.lifted_at is null as active_now,
      block.started_at >= period.period_start as started_in_period
    from period
    join public.workspace_spend_blocks block
      on block.workspace_id = p_workspace_id
      and block.started_at < period.period_end
      and (block.lifted_at is null or block.lifted_at >= period.period_start)
    left join public.workspace_spend_rules rule on rule.id = block.rule_id
  ),
  facts as (
    select
      period.*,
      totals.*,
      previous.spend_nanos as previous_spend_nanos,
      previous.requests as previous_requests,
      previous.tokens as previous_tokens,
      case when previous.spend_nanos > 0 then round((totals.spend_nanos - previous.spend_nanos) * 100 / previous.spend_nanos, 1) end
        as spend_change_percent,
      (period.period_start at time zone period.time_zone) as local_start,
      (period.period_end at time zone period.time_zone) as local_end,
      case p_cadence when 'daily' then 'day' when 'weekly' then 'week' else 'month' end as unit
    from period
    cross join totals
    cross join previous
  ),
  labelled as (
    select facts.*,
      case p_cadence
        when 'daily' then to_char(facts.local_start, 'Mon FMDD, YYYY')
        when 'weekly' then to_char(facts.local_start, 'Mon FMDD') || ' – ' || to_char(facts.local_end - interval '1 day', 'Mon FMDD, YYYY')
        else to_char(facts.local_start, 'FMMonth YYYY')
      end as label,
      to_char(forecast.month_start at time zone facts.time_zone, 'FMMonth') as month_label,
      to_char(forecast.forecast_from at time zone facts.time_zone, 'Mon FMDD') as forecast_from_label
    from facts
    cross join forecast
  ),
  body as (
    select labelled.*,
      labelled.name || ' ' || case p_cadence when 'daily' then 'daily' when 'weekly' then 'weekly' else 'monthly' end
        || ' spend: ' || private.workspace_push_usd(labelled.spend_nanos) || ' (' || labelled.label || ')' as title,
      concat_ws(E'\n',
        'Spent ' || private.workspace_push_usd(labelled.spend_nanos)
          || case p_cadence when 'daily' then ' on ' when 'weekly' then ' in the week of ' else ' in ' end || labelled.label
          || case
            when labelled.spend_change_percent is null then ', with no spend the ' || labelled.unit || ' before.'
            when labelled.spend_change_percent > 0 then ', up ' || trim_scale(labelled.spend_change_percent) || '% on the ' || labelled.unit || ' before ('
              || private.workspace_push_usd(labelled.previous_spend_nanos) || ').'
            when labelled.spend_change_percent < 0 then ', down ' || trim_scale(abs(labelled.spend_change_percent)) || '% on the ' || labelled.unit || ' before ('
              || private.workspace_push_usd(labelled.previous_spend_nanos) || ').'
            else ', the same as the ' || labelled.unit || ' before.'
          end
          || ' ' || private.mobile_push_compact_number(labelled.requests) || case when labelled.requests = 1 then ' request, ' else ' requests, ' end
          || private.mobile_push_compact_number(labelled.tokens) || ' tokens.',
        (select 'Top models: ' || string_agg(top_models.name || ' ' || private.workspace_push_usd(top_models.spend_nanos), ', '
            order by top_models.spend_nanos desc, top_models.requests desc, top_models.model_id) || '.'
          from (select * from top_models order by spend_nanos desc, requests desc, model_id limit 3) top_models
          having count(*) > 0),
        (select 'Top keys: ' || string_agg(coalesce(top_keys.name, 'No API key') || ' ' || private.workspace_push_usd(top_keys.spend_nanos), ', '
            order by top_keys.spend_nanos desc, top_keys.requests desc, top_keys.key_id nulls last) || '.'
          from (select * from top_keys order by spend_nanos desc, requests desc, key_id nulls last limit 3) top_keys
          having count(*) > 0),
        (select case
            when forecast.projected_nanos is null then labelled.month_label || ' forecast: from ' || labelled.forecast_from_label
              || ' (' || private.workspace_push_usd(forecast.spend_nanos) || ' so far).'
            else labelled.month_label || ' forecast: ' || private.workspace_push_usd(forecast.projected_nanos)
              || ' (' || private.workspace_push_usd(forecast.spend_nanos) || ' so far).'
          end from forecast),
        (select 'Balance: ' || private.workspace_push_usd(runway.available_nanos)
            || case when runway.runway_days is not null
              then ', about ' || trim_scale(round(runway.runway_days, case when runway.runway_days < 10 then 1 else 0 end)) || ' days at the last 7 days'' pace.'
              else '.' end
          from runway),
        (select 'Spend alerts: ' || sum(alerts.fired) || ' fired.' from alerts having count(*) > 0),
        (select 'Spend blocks: ' || count(*) filter (where blocks.active_now) || ' active, '
            || count(*) filter (where blocks.started_in_period) || ' started.'
          from blocks having count(*) > 0),
        'Usage: https://phaseo.app/settings/usage/overview'
      ) as message
    from labelled
  )
  select jsonb_build_object(
    'version', 1,
    'workspace_id', body.id,
    'workspace_name', body.name,
    'cadence', p_cadence,
    'time_zone', body.time_zone,
    'title', body.title,
    'message', body.message,
    'period', jsonb_build_object('start', body.period_start, 'end', body.period_end, 'label', body.label,
      'local_start', to_char(body.local_start, 'YYYY-MM-DD'), 'local_end', to_char(body.local_end - interval '1 day', 'YYYY-MM-DD')),
    'previous_period', jsonb_build_object('start', body.previous_start, 'end', body.previous_end),
    'totals', jsonb_build_object('spend_nanos', body.spend_nanos, 'requests', body.requests, 'successful_requests', body.successful_requests,
      'tokens', body.tokens, 'input_tokens', body.input_tokens, 'output_tokens', body.output_tokens),
    'previous_totals', jsonb_build_object('spend_nanos', body.previous_spend_nanos, 'requests', body.previous_requests, 'tokens', body.previous_tokens),
    'change', jsonb_build_object('spend_nanos', body.spend_nanos - body.previous_spend_nanos, 'spend_percent', body.spend_change_percent),
    'top_keys', coalesce((select jsonb_agg(jsonb_build_object('id', top_keys.key_id, 'name', top_keys.name,
        'spend_nanos', top_keys.spend_nanos, 'requests', top_keys.requests)
      order by top_keys.spend_nanos desc, top_keys.requests desc, top_keys.key_id nulls last) from top_keys), '[]'::jsonb),
    'top_models', coalesce((select jsonb_agg(jsonb_build_object('id', top_models.model_id, 'name', top_models.name,
        'spend_nanos', top_models.spend_nanos, 'requests', top_models.requests)
      order by top_models.spend_nanos desc, top_models.requests desc, top_models.model_id) from top_models), '[]'::jsonb),
    'top_members', coalesce((select jsonb_agg(jsonb_build_object('user_id', top_members.actor_user_id,
        'name', coalesce(top_members.display_name, top_members.email), 'email', top_members.email,
        'spend_nanos', top_members.spend_nanos, 'requests', top_members.requests)
      order by top_members.spend_nanos desc, top_members.requests desc, top_members.actor_user_id) from top_members), '[]'::jsonb),
    'top_departments', coalesce((select jsonb_agg(jsonb_build_object('id', top_departments.department_id, 'name', top_departments.name,
        'spend_nanos', top_departments.spend_nanos, 'requests', top_departments.requests)
      order by top_departments.spend_nanos desc, top_departments.requests desc, top_departments.department_id) from top_departments), '[]'::jsonb),
    'department_attribution', body.attribution,
    'forecast', (select jsonb_build_object('month_start', forecast.month_start, 'month_end', forecast.month_end,
        'month_label', body.month_label, 'from', forecast.forecast_from, 'spend_nanos', forecast.spend_nanos,
        'projected_nanos', forecast.projected_nanos) from forecast),
    'runway', (select jsonb_build_object('balance_nanos', runway.balance_nanos, 'reserved_nanos', runway.reserved_nanos,
        'available_nanos', runway.available_nanos, 'window_hours', 168, 'burn_nanos', runway.burn_nanos,
        'burn_per_day_nanos', round(runway.burn_per_day_nanos), 'runway_days', runway.runway_days,
        'auto_top_up', private.workspace_auto_top_up_covers(p_workspace_id)) from runway),
    'alerts', jsonb_build_object(
      'fired', coalesce((select sum(alerts.fired) from alerts), 0),
      'rules', coalesce((select jsonb_agg(jsonb_build_object('rule_id', alerts.rule_id, 'rule_name', alerts.rule_name, 'metric', alerts.metric,
          'fired', alerts.fired, 'last_at', alerts.last_at, 'last_title', alerts.last_title)
        order by alerts.fired desc, alerts.last_at desc, alerts.rule_id)
        from (select * from alerts order by fired desc, last_at desc, rule_id limit 5) alerts), '[]'::jsonb)),
    'blocks', jsonb_build_object(
      'active', (select count(*) filter (where blocks.active_now) from blocks),
      'started', (select count(*) filter (where blocks.started_in_period) from blocks),
      'items', coalesce((select jsonb_agg(jsonb_build_object('block_id', blocks.id, 'rule_id', blocks.rule_id, 'rule_name', blocks.rule_name,
          'scope_type', blocks.scope_type, 'scope_label', blocks.scope_label, 'started_at', blocks.started_at, 'lifted_at', blocks.lifted_at,
          'lift_reason', blocks.lift_reason, 'resets_at', blocks.resets_at, 'limit_nanos', blocks.limit_nanos, 'active', blocks.active_now)
        order by blocks.active_now desc, blocks.started_at desc, blocks.id)
        from (select * from blocks order by active_now desc, started_at desc, id limit 5) blocks), '[]'::jsonb)),
    'url', 'https://phaseo.app/settings/usage/overview',
    'settings_url', 'https://phaseo.app/settings/notifications#spend-alerts',
    'generated_at', p_now
  )
  from body;
$function$;

COMMENT ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) IS 'One workspace''s spend report for the last complete daily, weekly or monthly period before p_now in its billing_time_zone: totals and change (the usage overview), top keys, models, members and departments, the month forecast, runway, spend alerts and blocks, plus the routed title and message. Every figure is aggregated in SQL.';

REVOKE ALL ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) TO "service_role";
