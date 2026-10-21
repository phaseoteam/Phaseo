CREATE OR REPLACE FUNCTION public.queue_spend_reports (
  p_now   timestamp with time zone DEFAULT now(),
  p_limit integer                  DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Queues the spend reports that are due at p_now. A workspace's report is due from 09:00 to 21:00
-- in its billing_time_zone on the first day after each period (private.spend_report_period):
-- daily for the day before, weekly on Monday for the previous ISO week, monthly on the 1st for the
-- previous month; spend_report_cadence 'off' sends none. Each workspace, cadence and period is
-- handled once (workspace_spend_report_runs):
--   1. Due workspaces with no spend in the rollup and no usage still waiting in the analytics
--      outbox for the period are recorded as skipped in one statement, without computing a report.
--   2. Up to p_limit of the rest get private.spend_report_facts. A report whose total spend is 0
--      (free models only) is skipped too. Otherwise it queues, in email_outbox:
--      * one routed spend_report event (the workspace's spend_report routes, delivered by the
--        notification delivery job), dedupe key spend_report:<workspace>:<cadence>:<period start>;
--      * one spend_report_email per recipient (the legacy email drain sends these): the owner and
--        every member with the owner role, plus admins when spend_report_include_admins is on,
--        less anyone who unsubscribed (workspace_spend_report_recipients.opted_out_at), dedupe key
--        <event key>:email:<user id>. Each payload carries that person's unsubscribe token.
--      Every insert is ON CONFLICT (dedupe_key) DO NOTHING, so a retry or a re-run never sends a
--      report twice.
-- One call at a time (advisory lock); a concurrent call returns skipped_locked. Runs behind
-- SPEND_REPORTS_ENABLED. Service role only.
declare
  v_lock boolean;
  v_skipped_quiet integer := 0;
  v_skipped_zero integer := 0;
  v_queued integer := 0;
  v_emails integer := 0;
  v_due integer := 0;
  v_reports jsonb := '[]'::jsonb;
  v_candidate record;
  v_facts jsonb;
  v_key text;
  v_event_id uuid;
  v_owner_email text;
  v_recipients integer;
begin
  if p_now is null then
    raise exception 'invalid_spend_report_time' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_spend_report_limit' using errcode = '22023';
  end if;

  v_lock := pg_try_advisory_xact_lock(hashtextextended('public.queue_spend_reports', 0));
  if not v_lock then
    return jsonb_build_object('skipped_locked', true, 'due', 0, 'quiet', 0, 'zero_spend', 0, 'queued', 0, 'emails', 0, 'reports', '[]'::jsonb);
  end if;

  -- 1. Quiet workspaces: nothing in the rollup and nothing waiting to be rolled up.
  with due as (
    select candidate.*
    from private.spend_report_due_workspaces(p_now) candidate
  ),
  quiet as (
    insert into public.workspace_spend_report_runs as run (workspace_id, cadence, period_start, period_end, status, spend_nanos, recipients, event_id)
    select due.workspace_id, due.cadence, due.period_start, due.period_end, 'skipped', 0, 0, null
    from due
    where not exists (
        select 1 from public.v2_private_usage_15m rollup
        where rollup.workspace_id = due.workspace_id
          and rollup.bucket_start >= due.period_start
          and rollup.bucket_start < due.period_end
          and rollup.cost_nanos > 0
      )
      and not exists (
        select 1 from public.v2_analytics_outbox outbox
        where outbox.workspace_id = due.workspace_id
          and outbox.status in ('pending', 'failed')
          and outbox.occurred_at >= due.period_start
          and outbox.occurred_at < due.period_end
      )
      and not exists (
        -- gateway_requests_async_spend_idx: async jobs count toward departments and members.
        select 1 from public.gateway_requests request
        where request.success is true
          and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
          and request.workspace_id = due.workspace_id
          and request.created_at >= due.period_start
          and request.created_at < due.period_end
          and request.cost_nanos > 0
      )
    on conflict (workspace_id, cadence) do update
      set period_start = excluded.period_start, period_end = excluded.period_end, status = 'skipped',
        spend_nanos = 0, recipients = 0, event_id = null, updated_at = now()
      where run.period_start < excluded.period_start
    returning 1
  )
  select count(*) into v_skipped_quiet from quiet;

  -- 2. The rest, oldest period first.
  for v_candidate in
    select candidate.*
    from private.spend_report_due_workspaces(p_now) candidate
    order by candidate.period_start, candidate.workspace_id
    limit p_limit
  loop
    v_due := v_due + 1;
    v_facts := private.spend_report_facts(v_candidate.workspace_id, v_candidate.cadence, p_now);

    if v_facts is null or coalesce((v_facts #>> '{totals,spend_nanos}')::numeric, 0) <= 0 then
      insert into public.workspace_spend_report_runs as run (workspace_id, cadence, period_start, period_end, status, spend_nanos, recipients, event_id)
      values (v_candidate.workspace_id, v_candidate.cadence, v_candidate.period_start, v_candidate.period_end, 'skipped', 0, 0, null)
      on conflict (workspace_id, cadence) do update
        set period_start = excluded.period_start, period_end = excluded.period_end, status = 'skipped',
          spend_nanos = 0, recipients = 0, event_id = null, updated_at = now();
      v_skipped_zero := v_skipped_zero + 1;
      continue;
    end if;

    v_key := 'spend_report:' || v_candidate.workspace_id || ':' || v_candidate.cadence || ':'
      || to_char(v_candidate.period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

    select nullif(btrim(account.email), '') into v_owner_email
    from auth.users account where account.id = v_candidate.owner_user_id;

    v_event_id := null;
    insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
    values ('spend_report', 'spend_report', coalesce(v_owner_email, ''), v_facts ->> 'title', v_candidate.workspace_id,
      v_candidate.owner_user_id, v_facts, v_key)
    on conflict (dedupe_key) do nothing
    returning id into v_event_id;

    -- Recipients get a stable unsubscribe token the first time they are emailed.
    insert into public.workspace_spend_report_recipients (workspace_id, user_id)
    select v_candidate.workspace_id, person.user_id
    from private.spend_report_people(v_candidate.workspace_id, v_candidate.include_admins) person
    on conflict (workspace_id, user_id) do nothing;

    with sent as (
      insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
      select 'spend_report_email', 'spend_report', person.email, v_facts ->> 'title', v_candidate.workspace_id, person.user_id,
        v_facts || jsonb_build_object('recipient', jsonb_build_object('user_id', person.user_id, 'role', person.role,
          'unsubscribe_token', recipient.unsubscribe_token)),
        v_key || ':email:' || person.user_id
      from private.spend_report_people(v_candidate.workspace_id, v_candidate.include_admins) person
      join public.workspace_spend_report_recipients recipient
        on recipient.workspace_id = v_candidate.workspace_id and recipient.user_id = person.user_id
      where recipient.opted_out_at is null
        and person.email is not null
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_recipients from sent;

    insert into public.workspace_spend_report_runs as run (workspace_id, cadence, period_start, period_end, status, spend_nanos, recipients, event_id)
    values (v_candidate.workspace_id, v_candidate.cadence, v_candidate.period_start, v_candidate.period_end, 'queued',
      (v_facts #>> '{totals,spend_nanos}')::numeric, v_recipients, v_event_id)
    on conflict (workspace_id, cadence) do update
      set period_start = excluded.period_start, period_end = excluded.period_end, status = 'queued',
        spend_nanos = excluded.spend_nanos, recipients = excluded.recipients, event_id = coalesce(excluded.event_id, run.event_id),
        updated_at = now();

    v_queued := v_queued + 1;
    v_emails := v_emails + v_recipients;
    v_reports := v_reports || jsonb_build_array(jsonb_build_object(
      'workspace_id', v_candidate.workspace_id, 'cadence', v_candidate.cadence, 'period_start', v_candidate.period_start,
      'event_id', v_event_id, 'dedupe_key', v_key, 'emails', v_recipients,
      'spend_nanos', (v_facts #>> '{totals,spend_nanos}')::numeric));
  end loop;

  return jsonb_build_object(
    'skipped_locked', false,
    'due', v_due + v_skipped_quiet,
    'quiet', v_skipped_quiet,
    'zero_spend', v_skipped_zero,
    'queued', v_queued,
    'emails', v_emails,
    'reports', v_reports
  );
end;
$function$;

COMMENT ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) IS 'Queues the spend reports due at p_now (09:00 to 21:00 in each workspace''s billing_time_zone on the first day after a daily, weekly or monthly period): one routed spend_report event and one spend_report_email per subscribed owner (and admin when included), skipping periods without spend. Each workspace, cadence and period is handled once; dedupe keys make retries safe. Service role only.';

REVOKE ALL ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) FROM "anon", "authenticated";
