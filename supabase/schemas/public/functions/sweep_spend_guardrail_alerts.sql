CREATE OR REPLACE FUNCTION public.sweep_spend_guardrail_alerts (
  p_now timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Sends a money push to owners and admins once per spend guardrail counter, period and limit
-- value when the counter reaches 80% of the guardrail's limit (spend_guardrail_warning), and again
-- when it reaches 100% (spend_guardrail_reached). Counters are private.spend_guardrail_usage's:
-- one per assignment for a shared guardrail, one per key for an each_key guardrail. A blocking
-- guardrail is enforced by the gateway's spend-limit coordinator at 100% (batch, realtime and
-- OAuth requests excepted) without a push, so the 100% push comes from this sweep. No warning is
-- sent once the limit is reached. A limit changed mid-period can alert again. Only workspaces
-- with an enabled spend guardrail are read.
declare
  v_workspaces integer := 0;
  v_alerted integer := 0;
  v_count integer;
  v_workspace uuid;
begin
  if p_now is null then
    raise exception 'invalid_spend_guardrail_sweep_time';
  end if;

  for v_workspace in
    select distinct g.workspace_id from public.workspace_guardrails g where g.kind = 'spend' and g.enabled
  loop
    v_workspaces := v_workspaces + 1;
    with due as (
      select
        u.*,
        case when u.usage_nanos >= u.limit_nanos then 'spend_guardrail_reached' else 'spend_guardrail_warning' end as kind,
        to_char(u.period_start at time zone 'UTC', 'YYYY-MM-DD') || ':' || u.limit_nanos as period_key,
        case when char_length(u.guardrail_name) > 40 then left(u.guardrail_name, 39) || '…' else u.guardrail_name end as name,
        case u.spend_period when 'daily' then ' so far today.' when 'weekly' then ' so far this week.' else ' so far this month.' end as so_far,
        case when u.spend_counting = 'each_key' then (
          select coalesce(nullif(btrim(k.name), ''), k.prefix, 'An API key') from public.keys k where k.id = u.key_ids[1]
        ) end as key_label
      from private.spend_guardrail_usage(v_workspace, p_now) u
      where u.usage_nanos >= 0.8 * u.limit_nanos
    ),
    inserted as (
      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, payload, occurred_at)
      select
        v_workspace,
        d.kind,
        'money',
        d.kind || ':spend_guardrail:' || d.guardrail_id || ':' || d.counter || ':' || d.spend_period || ':' || d.period_key,
        jsonb_build_object(
          'push', jsonb_build_object(
            'title', case
              when d.key_label is not null and d.kind = 'spend_guardrail_reached' then d.key_label || ' has used its ' || d.spend_period || ' limit from ' || d.name
              when d.key_label is not null then d.key_label || ' is at 80% of its ' || d.spend_period || ' limit from ' || d.name
              when d.kind = 'spend_guardrail_reached' then d.name || ' has used its ' || d.spend_period || ' spend limit'
              else d.name || ' is at 80% of its ' || d.spend_period || ' spend limit' end,
            'body', private.spend_limit_amount('cost', d.usage_nanos) || ' of ' || private.spend_limit_amount('cost', d.limit_nanos)
              || d.so_far
              || case when d.kind = 'spend_guardrail_reached' and d.spend_action = 'block'
                then ' Requests it covers are now refused until the limit resets (batch jobs, realtime sessions and OAuth requests excepted).'
                else '' end,
            'href', '/settings/guardrails'
          ),
          'guardrailId', d.guardrail_id, 'counter', d.counter, 'window', d.spend_period, 'metric', 'cost',
          'action', d.spend_action, 'limit', d.limit_nanos, 'used', d.usage_nanos, 'periodStart', d.period_start, 'resetAt', d.reset_at
        ),
        p_now
      from due d
      where d.kind = 'spend_guardrail_reached'
        or not exists (
          select 1 from public.workspace_notification_events e
          where e.dedupe_key = 'spend_guardrail_reached:spend_guardrail:' || d.guardrail_id || ':' || d.counter || ':' || d.spend_period || ':' || d.period_key
        )
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_count from inserted;
    v_alerted := v_alerted + v_count;
  end loop;

  return jsonb_build_object('workspaces', v_workspaces, 'alerted', v_alerted);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_guardrail_alerts"(timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_guardrail_alerts"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_guardrail_alerts"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_guardrail_alerts"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
