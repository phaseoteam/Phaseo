CREATE OR REPLACE FUNCTION public.claim_mobile_push_deliveries (
  p_limit       integer,
  p_claim_token uuid
)
  RETURNS TABLE (
    id              uuid,
    event_id        uuid,
    attempts        integer,
    expo_push_token text,
    kind            text,
    model_slug      text,
    title           text,
    body            text,
    href            text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Claims due pushes (pending, or deferred past quiet hours, or processing rows a crashed
-- run left behind for ten minutes) under the caller's token, skipping rows another run
-- holds. Pushes over two days old, for a device that is no longer active or for a user who
-- has since switched push off, are closed first instead of sent, including processing rows
-- about to be reclaimed.
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_mobile_push_claim_limit';
  end if;
  if p_claim_token is null then
    raise exception 'invalid_mobile_push_claim_token';
  end if;

  update public.mobile_push_deliveries x
  set status = case when x.created_at <= now() - interval '2 days' then 'failed' else 'suppressed' end,
      error_code = case
        when x.created_at <= now() - interval '2 days' then 'expired'
        when dev.status <> 'active' then 'device_inactive'
        else 'notifications_disabled'
      end,
      claim_token = null,
      claimed_at = null,
      updated_at = now()
  from public.mobile_push_devices dev
  left join public.mobile_notification_preferences p on p.user_id = dev.user_id
  where dev.id = x.device_id
    and (x.status in ('pending', 'deferred') or (x.status = 'processing' and x.claimed_at < now() - interval '10 minutes'))
    and (x.created_at <= now() - interval '2 days' or dev.status <> 'active' or not coalesce(p.enabled, false));

  return query
  with candidates as (
    select x.id
    from public.mobile_push_deliveries x
    where (x.status in ('pending', 'deferred') and x.not_before <= now())
       or (x.status = 'processing' and x.claimed_at < now() - interval '10 minutes')
    order by x.not_before, x.created_at, x.id
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.mobile_push_deliveries x
    set status = 'processing',
        claim_token = p_claim_token,
        claimed_at = now(),
        attempts = x.attempts + 1,
        updated_at = now()
    from candidates c
    where x.id = c.id
    returning x.id, x.event_id, x.device_id, x.attempts
  )
  select c.id, c.event_id, c.attempts, dev.expo_push_token, e.kind, e.model_slug, e.title, e.body, e.href
  from claimed c
  join public.mobile_push_devices dev on dev.id = c.device_id
  join public.catalogue_notification_events e on e.id = c.event_id
  order by c.id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) FROM PUBLIC, "anon", "authenticated";
