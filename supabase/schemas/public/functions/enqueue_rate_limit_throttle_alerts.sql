CREATE OR REPLACE FUNCTION public.enqueue_rate_limit_throttle_alerts ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  SET statement_timeout TO '10s'
  SET lock_timeout TO '2s'
  AS $function$
declare
  v_window_minutes constant integer := 15;
  v_to timestamptz := date_trunc('minute', now());
  v_from timestamptz := date_trunc('minute', now()) - make_interval(mins => v_window_minutes);
  v_inserted integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('enqueue_rate_limit_throttle_alerts', 0)) then
    return 0;
  end if;

  -- Only workspaces that routed this alert to an active destination are alerted,
  -- at most once per hour each. The routed delivery job sends the event.
  with routed as (
    select distinct route.workspace_id
    from public.notification_event_destinations route
    join public.notification_destinations destination on destination.id = route.destination_id
    where route.event_kind = 'rate_limit_throttled'
      and destination.status = 'active'
  ),
  throttles as (
    select
      throttle.workspace_id,
      throttle.policy_id,
      throttle.limit_scope,
      sum(throttle.throttled_requests)::bigint as throttled_requests
    from public.workspace_rate_limit_throttles_minute throttle
    join routed on routed.workspace_id = throttle.workspace_id
    where throttle.bucket_start >= v_from
    group by throttle.workspace_id, throttle.policy_id, throttle.limit_scope
  ),
  ranked as (
    select
      throttles.*,
      row_number() over (partition by throttles.workspace_id order by throttles.throttled_requests desc, throttles.policy_id, throttles.limit_scope) as position
    from throttles
  ),
  summary as (
    select
      ranked.workspace_id,
      sum(ranked.throttled_requests)::bigint as throttled_requests,
      jsonb_agg(
        jsonb_build_object(
          'policy_id', ranked.policy_id,
          'policy_name', policy.name,
          'limit_scope', ranked.limit_scope,
          'throttled_requests', ranked.throttled_requests
        )
        order by ranked.position
      ) filter (where ranked.position <= 5) as policies
    from ranked
    left join public.workspace_rate_limit_policies policy on policy.id = ranked.policy_id
    group by ranked.workspace_id
  )
  insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
  select
    'rate_limit_throttled',
    'rate_limit_throttled',
    coalesce(owner.email, ''),
    'Rate limit alert',
    summary.workspace_id,
    workspace.owner_user_id,
    jsonb_build_object(
      'workspace_name', workspace.name,
      'throttled_requests', summary.throttled_requests,
      'window_minutes', v_window_minutes,
      'window_start', v_from,
      'window_end', v_to,
      'policies', summary.policies
    ),
    'rate_limit_throttled:' || summary.workspace_id || ':' || to_char(date_trunc('hour', now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24')
  from summary
  join public.workspaces workspace on workspace.id = summary.workspace_id
  left join auth.users owner on owner.id = workspace.owner_user_id
  where not exists (
    select 1
    from public.email_outbox previous
    where previous.workspace_id = summary.workspace_id
      and previous.kind = 'rate_limit_throttled'
      and previous.created_at > now() - interval '1 hour'
  )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

COMMENT ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() IS 'Queues one rate_limit_throttled notification event per routed workspace with policy throttles in the last 15 minutes, at most once per hour.';

GRANT EXECUTE ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() FROM PUBLIC, "anon", "authenticated";
