CREATE OR REPLACE FUNCTION public.enqueue_mobile_push_deliveries (
  p_event_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Fans one catalogue event out to the active devices of users who switched push on, in a
-- single statement. A device gets the event when one of its user's enabled notify rules
-- matches and none of their enabled mute rules does. Inside the user's quiet hours (in
-- the device's time zone) the push is deferred until they end; past the user's daily cap
-- it is recorded as suppressed. A device already told about a model's release is not told
-- again that the same model reached Phaseo, and vice versa. Events more than two days old
-- or about a model that is no longer public are closed without sending.
declare
  v_event public.catalogue_notification_events%rowtype;
  v_result jsonb;
begin
  select * into v_event from public.catalogue_notification_events e where e.id = p_event_id for update;
  if v_event.id is null or v_event.fanned_out_at is not null then
    return jsonb_build_object('queued', 0, 'deferred', 0, 'suppressed', 0);
  end if;

  if v_event.occurred_at > now() - interval '2 days'
    and (v_event.model_slug is null or public.catalog_model_is_public(v_event.model_slug)) then
    with model as (
      select
        m.input_modalities,
        m.output_modalities,
        exists (
          select 1 from public.v2_model_provider_routes r
          where r.model_slug = m.model_slug and r.routing_enabled and r.access_scope = 'public'
            and not r.is_stealth and r.status in ('active', 'degraded')
        ) as on_phaseo
      from (select 1) one
      left join public.v2_models m on m.model_slug = v_event.model_slug
    ),
    candidates as (
      select
        d.id as device_id,
        d.user_id,
        coalesce(d.time_zone, 'UTC') as time_zone,
        p.quiet_start,
        p.quiet_end,
        p.daily_cap,
        (
          select r.id from public.mobile_notification_rules r
          where r.user_id = p.user_id and r.action = 'notify'
            and private.mobile_notification_rule_matches(r, v_event.kind, v_event.lab_slug, v_event.provider_slug,
              v_event.model_slug, model.input_modalities, model.output_modalities, model.on_phaseo)
          order by r."position", r.created_at, r.id
          limit 1
        ) as rule_id
      from public.mobile_notification_preferences p
      join public.mobile_push_devices d on d.user_id = p.user_id and d.status = 'active'
      cross join model
      where p.enabled
        and not exists (
          select 1 from public.mobile_notification_rules r
          where r.user_id = p.user_id and r.action = 'mute'
            and private.mobile_notification_rule_matches(r, v_event.kind, v_event.lab_slug, v_event.provider_slug,
              v_event.model_slug, model.input_modalities, model.output_modalities, model.on_phaseo)
        )
        and not (
          v_event.kind in ('model_released', 'gateway_available')
          and exists (
            select 1
            from public.mobile_push_deliveries x
            join public.catalogue_notification_events e on e.id = x.event_id
            where x.device_id = d.id and x.created_at > now() - interval '1 day' and x.status <> 'failed'
              and e.model_slug = v_event.model_slug and e.kind in ('model_released', 'gateway_available')
          )
        )
    ),
    scheduled as (
      select
        c.*,
        sent.recent,
        case
          when c.quiet_start is null or c.quiet_end is null or c.quiet_start = c.quiet_end then null
          when c.quiet_start < c.quiet_end then
            case when wall.clock_time >= c.quiet_start and wall.clock_time < c.quiet_end then wall.calendar_day + c.quiet_end end
          when wall.clock_time >= c.quiet_start then (wall.calendar_day + 1) + c.quiet_end
          when wall.clock_time < c.quiet_end then wall.calendar_day + c.quiet_end
        end as release_local
      from candidates c
      cross join lateral (select now() at time zone c.time_zone as moment) here
      cross join lateral (select here.moment::time as clock_time, here.moment::date as calendar_day) wall
      cross join lateral (
        select count(distinct x.event_id) as recent
        from public.mobile_push_deliveries x
        where x.user_id = c.user_id and x.created_at > now() - interval '1 day'
          and x.status in ('pending', 'processing', 'sent', 'deferred')
      ) sent
      where c.rule_id is not null
    ),
    inserted as (
      insert into public.mobile_push_deliveries as x (event_id, device_id, user_id, rule_id, status, not_before, error_code)
      select
        v_event.id,
        s.device_id,
        s.user_id,
        s.rule_id,
        case when s.recent >= s.daily_cap then 'suppressed' when s.release_local is not null then 'deferred' else 'pending' end,
        case when s.recent < s.daily_cap and s.release_local is not null then s.release_local at time zone s.time_zone else now() end,
        case when s.recent >= s.daily_cap then 'daily_cap' end
      from scheduled s
      on conflict (event_id, device_id) do nothing
      returning x.status
    )
    select jsonb_build_object(
      'queued', count(*) filter (where i.status = 'pending'),
      'deferred', count(*) filter (where i.status = 'deferred'),
      'suppressed', count(*) filter (where i.status = 'suppressed')
    ) into v_result
    from inserted i;
  end if;

  update public.catalogue_notification_events set fanned_out_at = now() where id = v_event.id;
  return coalesce(v_result, jsonb_build_object('queued', 0, 'deferred', 0, 'suppressed', 0));
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enqueue_mobile_push_deliveries"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_mobile_push_deliveries"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_mobile_push_deliveries"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_mobile_push_deliveries"(uuid) FROM PUBLIC, "anon", "authenticated";
