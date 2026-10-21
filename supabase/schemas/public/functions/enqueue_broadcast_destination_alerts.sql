CREATE OR REPLACE FUNCTION public.enqueue_broadcast_destination_alerts ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '10s'
  SET lock_timeout TO '2s'
  AS $function$
declare
  -- A destination is failing once this many export requests in a row have
  -- failed and nothing has been delivered for the quiet period.
  v_min_failures constant integer := 5;
  v_quiet constant interval := interval '15 minutes';
  v_realert constant interval := interval '6 hours';
  v_inserted integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('enqueue_broadcast_destination_alerts', 0)) then
    return 0;
  end if;

  -- Only workspaces that routed this alert to an active destination are alerted,
  -- at most once per hour each. A destination is included once per failing
  -- streak: again only after a later success and at least six hours. The routed
  -- delivery job sends the event.
  with routed as (
    select distinct route.workspace_id
    from public.notification_event_destinations route
    join public.notification_destinations destination on destination.id = route.destination_id
    where route.event_kind = 'broadcast_destination_failing'
      and destination.status = 'active'
  ),
  candidates as (
    select
      health.destination_id,
      health.workspace_id,
      destination.name,
      destination.destination_id as destination_type,
      health.consecutive_failures,
      health.last_http_status,
      health.last_error,
      health.last_success_at,
      health.last_failure_at
    from public.broadcast_destination_health health
    join routed on routed.workspace_id = health.workspace_id
    join public.workspace_broadcast_destinations destination on destination.id = health.destination_id
    where destination.enabled
      and health.consecutive_failures >= v_min_failures
      and health.last_failure_at > now() - interval '24 hours'
      and (health.last_success_at is null or health.last_success_at < now() - v_quiet)
      and (
        health.alerted_at is null
        or (health.alerted_at < health.last_success_at and health.alerted_at < now() - v_realert)
      )
  ),
  ranked as (
    select
      candidates.*,
      row_number() over (partition by candidates.workspace_id order by candidates.consecutive_failures desc, candidates.destination_id) as position
    from candidates
  ),
  summary as (
    select
      ranked.workspace_id,
      count(*)::integer as failing_destinations,
      jsonb_agg(
        jsonb_build_object(
          'destination_id', ranked.destination_id,
          'name', ranked.name,
          'destination_type', ranked.destination_type,
          'consecutive_failures', ranked.consecutive_failures,
          'last_http_status', ranked.last_http_status,
          'last_error', ranked.last_error,
          'last_success_at', ranked.last_success_at,
          'last_failure_at', ranked.last_failure_at
        )
        order by ranked.position
      ) filter (where ranked.position <= 5) as destinations
    from ranked
    group by ranked.workspace_id
  ),
  inserted as (
    insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
    select
      'broadcast_destination_failing',
      'broadcast_destination_failing',
      coalesce(owner.email, ''),
      'Broadcast destination failing',
      summary.workspace_id,
      workspace.owner_user_id,
      jsonb_build_object(
        'workspace_name', workspace.name,
        'failing_destinations', summary.failing_destinations,
        'destinations', summary.destinations
      ),
      'broadcast_destination_failing:' || summary.workspace_id || ':' || to_char(date_trunc('hour', now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24')
    from summary
    join public.workspaces workspace on workspace.id = summary.workspace_id
    left join auth.users owner on owner.id = workspace.owner_user_id
    where not exists (
      select 1
      from public.email_outbox previous
      where previous.workspace_id = summary.workspace_id
        and previous.kind = 'broadcast_destination_failing'
        and previous.created_at > now() - interval '1 hour'
    )
    on conflict (dedupe_key) do nothing
    returning workspace_id
  ),
  marked as (
    update public.broadcast_destination_health health
    set alerted_at = now()
    from candidates
    where candidates.destination_id = health.destination_id
      and candidates.workspace_id in (select inserted.workspace_id from inserted)
    returning health.destination_id
  )
  select count(*) into v_inserted from inserted;

  return v_inserted;
end;
$function$;

COMMENT ON FUNCTION "public"."enqueue_broadcast_destination_alerts"() IS 'Queues one broadcast_destination_failing notification event per routed workspace whose enabled Broadcast destinations have failed at least five requests in a row with nothing delivered for 15 minutes, at most once per hour.';

GRANT EXECUTE ON FUNCTION "public"."enqueue_broadcast_destination_alerts"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_broadcast_destination_alerts"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_broadcast_destination_alerts"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_broadcast_destination_alerts"() FROM PUBLIC, "anon", "authenticated";
