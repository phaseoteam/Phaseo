CREATE OR REPLACE FUNCTION public.fan_out_workspace_push_events (
  p_limit integer DEFAULT 200
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Captures new workspace events (private.capture_workspace_notification_events), then queues up
-- to p_limit open ones for the active devices of the members they concern, each with its text
-- written for the recipient (private.workspace_push_message):
--   * owners and admins get every workspace push, and an API key's creator also gets the pushes
--     about that key, even as a plain member;
--   * users who switched push or the push's category off get nothing;
--   * a push that falls in the recipient's quiet hours (in the device's time zone) waits until
--     they end, except an exposed-key alert;
--   * workspace pushes are due at once, never settle or group, and neither count towards nor wait
--     for the daily cap, which is for catalogue news.
-- Events more than two days old are closed without sending.
declare
  v_capture jsonb;
  v_event public.workspace_notification_events%rowtype;
  v_workspace_name text;
  v_events integer := 0;
  v_queued integer := 0;
  v_deferred integer := 0;
  v_pending integer;
  v_held integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_workspace_push_limit';
  end if;

  v_capture := private.capture_workspace_notification_events(5000);

  for v_event in
    select e.*
    from public.workspace_notification_events e
    where e.fanned_out_at is null
    order by e.created_at, e.id
    limit p_limit
    for update skip locked
  loop
    v_events := v_events + 1;
    if v_event.occurred_at > now() - interval '2 days' then
      select w.name into v_workspace_name from public.workspaces w where w.id = v_event.workspace_id;

      with recipients as (
        select
          m.user_id,
          exists (select 1 from public.workspace_members o where o.user_id = m.user_id and o.workspace_id <> m.workspace_id) as prefixed
        from public.workspace_members m
        where m.workspace_id = v_event.workspace_id
          and (m.role in ('owner', 'admin') or m.user_id = v_event.key_created_by)
      ),
      targets as (
        select
          d.id as device_id,
          d.user_id,
          coalesce(d.time_zone, 'UTC') as time_zone,
          p.quiet_start,
          p.quiet_end,
          private.workspace_push_message(v_event.kind, v_event.category, v_event.payload,
            r.user_id is not distinct from v_event.actor_user_id, case when r.prefixed then v_workspace_name end) as message
        from recipients r
        join public.mobile_notification_preferences p on p.user_id = r.user_id
        join public.mobile_push_devices d on d.user_id = r.user_id and d.status = 'active'
        where p.enabled
          and (p.categories -> v_event.category) is distinct from 'false'::jsonb
      ),
      scheduled as (
        select
          t.*,
          case
            when v_event.kind = 'security_leaked_key' or t.quiet_start is null or t.quiet_end is null or t.quiet_start = t.quiet_end then null
            when t.quiet_start < t.quiet_end then
              case when wall.clock_time >= t.quiet_start and wall.clock_time < t.quiet_end then wall.calendar_day + t.quiet_end end
            when wall.clock_time >= t.quiet_start then (wall.calendar_day + 1) + t.quiet_end
            when wall.clock_time < t.quiet_end then wall.calendar_day + t.quiet_end
          end as release_local
        from targets t
        cross join lateral (select now() at time zone t.time_zone as moment) here
        cross join lateral (select here.moment::time as clock_time, here.moment::date as calendar_day) wall
        where t.message is not null
      ),
      inserted as (
        insert into public.mobile_push_deliveries as x (workspace_event_id, workspace_id, device_id, user_id, message, status, not_before)
        select
          v_event.id,
          v_event.workspace_id,
          s.device_id,
          s.user_id,
          s.message,
          case when s.release_local is not null then 'deferred' else 'pending' end,
          case when s.release_local is not null then s.release_local at time zone s.time_zone else now() end
        from scheduled s
        on conflict (workspace_event_id, device_id) do nothing
        returning x.status
      )
      select count(*) filter (where i.status = 'pending'), count(*) filter (where i.status = 'deferred')
        into v_pending, v_held
      from inserted i;
      v_queued := v_queued + v_pending;
      v_deferred := v_deferred + v_held;
    end if;

    update public.workspace_notification_events set fanned_out_at = now() where id = v_event.id;
  end loop;

  return v_capture || jsonb_build_object('events', v_events, 'queued', v_queued, 'deferred', v_deferred);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."fan_out_workspace_push_events"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."fan_out_workspace_push_events"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."fan_out_workspace_push_events"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."fan_out_workspace_push_events"(integer) FROM PUBLIC, "anon", "authenticated";
