CREATE OR REPLACE FUNCTION private.build_mobile_push_digests (
  p_now   timestamp with time zone,
  p_limit integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- Writes the weekly digest of up to p_limit users once one of their devices has reached 18:00 on
-- Sunday in its own time zone (private.mobile_push_digest_week), and queues it for each of the
-- user's active devices on channel scheme 2 or later; a device in its quiet hours gets it when
-- they end. Recipients have push and the digest category on and own or administer a workspace.
-- Each user gets one digest per ISO week (mobile_push_digests_user_id_iso_week_key); a week with
-- nothing to report is recorded as skipped and sends nothing. 18:00 on Sunday reaches UTC+14 at
-- 04:00 UTC on Sunday, and the window closes at 06:00 on Monday, which UTC-12 reaches at 18:00 UTC
-- on Monday: outside those hours no device can be due and nothing is read. Inside them, one scan
-- of the active devices' time zones finds the due ones, and users already written are skipped
-- through the unique key. Overlapping runs leave building to whichever started first. more is
-- true when p_limit users were taken, so the caller knows others may still be waiting.
declare
  v_into_week interval := (p_now at time zone 'UTC') - date_trunc('week', p_now at time zone 'UTC');
  v_zone text;
  v_week record;
  v_known text[] := '{}';
  v_due_zones text[] := '{}';
  v_due_weeks text[] := '{}';
  v_due_starts timestamp with time zone[] := '{}';
  v_due_cutoffs timestamp with time zone[] := '{}';
  v_candidate record;
  v_facts jsonb;
  v_message jsonb;
  v_lead uuid;
  v_digest uuid;
  v_built integer := 0;
  v_skipped integer := 0;
  v_queued integer := 0;
  v_deferred integer := 0;
  v_taken integer := 0;
begin
  if p_now is null or p_limit is null or p_limit < 1 then
    raise exception 'invalid_mobile_push_digest_build';
  end if;
  if v_into_week >= interval '18 hours' and v_into_week < interval '6 days 4 hours' then
    return jsonb_build_object('built', 0, 'skipped', 0, 'queued', 0, 'deferred', 0, 'more', false);
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('build_mobile_push_digests', 0)) then
    return jsonb_build_object('built', 0, 'skipped', 0, 'queued', 0, 'deferred', 0, 'more', false);
  end if;

  for v_zone in
    select distinct coalesce(d.time_zone, 'UTC') from public.mobile_push_devices d
    where d.status = 'active' and d.channel_scheme >= 2
  loop
    begin
      select w.* into v_week from private.mobile_push_digest_week(v_zone, p_now) w;
    exception when invalid_parameter_value then
      -- A time zone this database does not know: its devices are never due.
      continue;
    end;
    v_known := v_known || v_zone;
    if v_week.due then
      v_due_zones := v_due_zones || v_zone;
      v_due_weeks := v_due_weeks || v_week.iso_week;
      v_due_starts := v_due_starts || v_week.week_start;
      v_due_cutoffs := v_due_cutoffs || v_week.week_cutoff;
    end if;
  end loop;

  if cardinality(v_due_zones) > 0 then
    for v_candidate in
      -- A user with devices in several due time zones takes the week of the first to reach 18:00.
      select distinct on (d.user_id) d.user_id, z.time_zone, z.iso_week, z.week_start, z.week_cutoff
      from unnest(v_due_zones, v_due_weeks, v_due_starts, v_due_cutoffs) as z(time_zone, iso_week, week_start, week_cutoff)
      join public.mobile_push_devices d
        on coalesce(d.time_zone, 'UTC') = z.time_zone and d.status = 'active' and d.channel_scheme >= 2
      join public.mobile_notification_preferences p on p.user_id = d.user_id
      where p.enabled
        and (p.categories -> 'digest') is distinct from 'false'::jsonb
        and not exists (select 1 from public.mobile_push_digests g where g.user_id = d.user_id and g.iso_week = z.iso_week)
        and (
          exists (select 1 from public.workspace_members m where m.user_id = d.user_id and m.role::text in ('owner', 'admin'))
          or exists (select 1 from public.workspaces w where w.owner_user_id = d.user_id)
        )
      order by d.user_id, z.week_cutoff, d.created_at, d.id
      limit p_limit
    loop
      v_taken := v_taken + 1;
      v_facts := private.mobile_push_digest_facts(v_candidate.user_id, v_candidate.week_start, v_candidate.week_cutoff, v_candidate.time_zone);
      v_lead := (v_facts -> 'lead' ->> 'id')::uuid;
      v_message := case when v_lead is not null then private.mobile_push_digest_message(v_facts) end;
      v_digest := null;

      insert into public.mobile_push_digests as g
        (user_id, iso_week, time_zone, week_start, week_cutoff, status, workspace_id, title, body, href, summary, created_at)
      values (
        v_candidate.user_id, v_candidate.iso_week, v_candidate.time_zone, v_candidate.week_start, v_candidate.week_cutoff,
        case when v_message is null then 'skipped' else 'queued' end,
        v_lead,
        v_message ->> 'title',
        v_message ->> 'body',
        case when v_message is not null then '/account/week?workspace=' || v_lead || '&week=' || v_candidate.iso_week end,
        v_facts,
        p_now
      )
      on conflict (user_id, iso_week) do nothing
      returning g.id into v_digest;

      -- Another run wrote this user's digest first.
      continue when v_digest is null;
      if v_message is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_built := v_built + 1;

      with inserted as (
        insert into public.mobile_push_deliveries as x (event_id, digest_id, workspace_id, device_id, user_id, status, not_before, created_at)
        select
          null,
          v_digest,
          v_lead,
          d.id,
          d.user_id,
          case when quiet.release_local is null then 'pending' else 'deferred' end,
          coalesce(quiet.release_local at time zone coalesce(d.time_zone, 'UTC'), p_now),
          p_now
        from public.mobile_push_devices d
        join public.mobile_notification_preferences p on p.user_id = d.user_id
        cross join lateral (select p_now at time zone coalesce(d.time_zone, 'UTC') as moment) here
        cross join lateral (select here.moment::time as clock_time, here.moment::date as calendar_day) wall
        cross join lateral (
          select case
            when p.quiet_start is null or p.quiet_end is null or p.quiet_start = p.quiet_end then null
            when p.quiet_start < p.quiet_end then
              case when wall.clock_time >= p.quiet_start and wall.clock_time < p.quiet_end then wall.calendar_day + p.quiet_end end
            when wall.clock_time >= p.quiet_start then (wall.calendar_day + 1) + p.quiet_end
            when wall.clock_time < p.quiet_end then wall.calendar_day + p.quiet_end
          end as release_local
        ) quiet
        where d.user_id = v_candidate.user_id and d.status = 'active' and d.channel_scheme >= 2
          and coalesce(d.time_zone, 'UTC') = any (v_known)
        on conflict do nothing
        returning x.status
      )
      select v_queued + count(*) filter (where i.status = 'pending'), v_deferred + count(*) filter (where i.status = 'deferred')
      into v_queued, v_deferred
      from inserted i;
    end loop;
  end if;

  return jsonb_build_object('built', v_built, 'skipped', v_skipped, 'queued', v_queued, 'deferred', v_deferred, 'more', v_taken >= p_limit);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."build_mobile_push_digests"(timestamp with time zone, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."build_mobile_push_digests"(timestamp with time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."build_mobile_push_digests"(timestamp with time zone, integer) TO "postgres";
