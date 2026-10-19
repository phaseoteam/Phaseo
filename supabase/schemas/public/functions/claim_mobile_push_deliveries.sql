CREATE OR REPLACE FUNCTION public.claim_mobile_push_deliveries (
  p_limit       integer,
  p_claim_token uuid
)
  RETURNS TABLE (
    id              uuid,
    attempts        integer,
    expo_push_token text,
    channel_scheme  smallint,
    kind            text,
    category        text,
    model_slug      text,
    title           text,
    body            text,
    href            text,
    group_key       text,
    group_count     integer,
    tag             text,
    deliveries      integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Claims up to p_limit due pushes under the caller's token, skipping rows another run holds.
-- A device's rows that share a group key go out as one push, once at least one is due and none
-- is still settling (due within the next five minutes), or once the oldest has been due for ten
-- minutes; rows waiting for quiet hours to end, or for a later retry, stay behind. A grouped push
-- also counts what the device was sent for that group since midnight UTC, and its tag (the group
-- key and the UTC date) makes it replace that earlier notification. Each push is returned under
-- its oldest row's id; the other rows point at it through merged_into.
-- Before claiming, rows over two days old, for a device that is no longer active, or for a user
-- who has since switched push or the push's category off are closed instead of sent, and rows a
-- crashed run left processing for ten minutes go back to the queue to be grouped again.
-- Claims run one at a time: a call that finds another claim in progress returns nothing, and
-- the next run picks the work up. Otherwise two overlapping calls could each lock part of the
-- same group and send it as two pushes. The lock ends with the transaction; claimed rows are
-- processing by then, so a later claim cannot take them.
-- Weekly digest rows (digest_id) are never read here, so a backlog of them cannot use up
-- p_limit; claim_mobile_push_digests claims, closes and requeues them.
#variable_conflict use_column
declare
  v_day_start timestamp with time zone := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_mobile_push_claim_limit';
  end if;
  if p_claim_token is null then
    raise exception 'invalid_mobile_push_claim_token';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('claim_mobile_push_deliveries', 0)) then
    return;
  end if;

  update public.mobile_push_deliveries x
  set status = case when x.created_at <= now() - interval '2 days' then 'failed' else 'suppressed' end,
      error_code = case
        when x.created_at <= now() - interval '2 days' then 'expired'
        when dev.status <> 'active' then 'device_inactive'
        when not coalesce(p.enabled, false) then 'notifications_disabled'
        else 'category_disabled'
      end,
      merged_into = null,
      claim_token = null,
      claimed_at = null,
      updated_at = now()
  from public.mobile_push_devices dev
  left join public.mobile_notification_preferences p on p.user_id = dev.user_id
  cross join public.catalogue_notification_events e
  where dev.id = x.device_id
    and e.id = x.event_id
    and (x.status in ('pending', 'deferred') or (x.status = 'processing' and x.claimed_at < now() - interval '10 minutes'))
    and (
      x.created_at <= now() - interval '2 days' or dev.status <> 'active' or not coalesce(p.enabled, false)
      or (p.categories -> private.mobile_push_category(e.kind)) = 'false'::jsonb
    );

  update public.mobile_push_deliveries x
  set status = 'pending', merged_into = null, claim_token = null, claimed_at = null, updated_at = now()
  where x.status = 'processing' and x.claimed_at < now() - interval '10 minutes' and x.digest_id is null;

  return query
  with due as (
    select w.device_id, coalesce(w.group_key, w.id::text) as unit
    from public.mobile_push_deliveries w
    where w.status in ('pending', 'deferred') and w.digest_id is null
    group by w.device_id, coalesce(w.group_key, w.id::text)
    having min(w.not_before) <= now()
      and (
        not bool_or(w.not_before > now() and w.not_before <= now() + interval '5 minutes')
        or min(w.not_before) <= now() - interval '10 minutes'
      )
    order by min(w.not_before), min(w.created_at)
    limit p_limit
  ),
  locked as (
    select x.id, x.device_id, x.group_key, x.event_id, x.created_at, x.attempts, d.unit
    from public.mobile_push_deliveries x
    join due d on d.device_id = x.device_id and d.unit = coalesce(x.group_key, x.id::text)
    where x.status in ('pending', 'deferred') and x.not_before <= now() and x.digest_id is null
    for update of x skip locked
  ),
  members as (
    select
      l.*,
      e.occurred_at,
      first_value(l.id) over (partition by l.device_id, l.unit order by l.created_at, l.id) as lead_id,
      count(*) over (partition by l.device_id, l.unit) as member_count,
      max(l.attempts) over (partition by l.device_id, l.unit) as max_attempts,
      jsonb_build_object(
        'kind', e.kind, 'modelSlug', e.model_slug, 'labSlug', e.lab_slug, 'providerSlug', e.provider_slug,
        'modelName', coalesce(nullif(btrim(e.payload ->> 'modelName'), ''), e.model_slug),
        'labName', coalesce(nullif(btrim(e.payload ->> 'labName'), ''), e.lab_slug),
        'providerName', coalesce(nullif(btrim(e.payload ->> 'providerName'), ''), e.provider_slug),
        'title', e.title, 'body', e.body, 'href', e.href
      ) as item
    from locked l
    join public.catalogue_notification_events e on e.id = l.event_id
  ),
  sent_today as (
    select g.device_id, g.unit, e.occurred_at, x.created_at, x.id,
      jsonb_build_object(
        'kind', e.kind, 'modelSlug', e.model_slug, 'labSlug', e.lab_slug, 'providerSlug', e.provider_slug,
        'modelName', coalesce(nullif(btrim(e.payload ->> 'modelName'), ''), e.model_slug),
        'labName', coalesce(nullif(btrim(e.payload ->> 'labName'), ''), e.lab_slug),
        'providerName', coalesce(nullif(btrim(e.payload ->> 'providerName'), ''), e.provider_slug),
        'title', e.title, 'body', e.body, 'href', e.href
      ) as item
    from (select distinct m.device_id, m.unit, m.group_key from members m where m.group_key is not null) g
    join public.mobile_push_deliveries x
      on x.device_id = g.device_id and x.group_key = g.group_key and x.status = 'sent'
      and x.sent_at >= v_day_start and x.created_at > now() - interval '2 days'
    join public.catalogue_notification_events e on e.id = x.event_id
  ),
  composed as (
    -- What the device was already shown comes first, then what is new, each oldest first.
    select
      i.device_id,
      i.unit,
      private.mobile_push_group_message(max(i.group_key), jsonb_agg(i.item order by i.is_new, i.occurred_at, i.created_at, i.id)) as message
    from (
      select m.device_id, m.unit, m.group_key, true as is_new, m.occurred_at, m.created_at, m.id, m.item from members m
      union all
      select s.device_id, s.unit, s.unit, false, s.occurred_at, s.created_at, s.id, s.item from sent_today s
    ) i
    group by i.device_id, i.unit
  ),
  claimed as (
    update public.mobile_push_deliveries x
    set status = 'processing',
        claim_token = p_claim_token,
        claimed_at = now(),
        attempts = x.attempts + 1,
        merged_into = nullif(m.lead_id, x.id),
        updated_at = now()
    from members m
    where x.id = m.id
    returning x.id
  )
  select
    m.id,
    (m.max_attempts + 1)::integer,
    dev.expo_push_token,
    dev.channel_scheme,
    c.message ->> 'kind',
    private.mobile_push_category(c.message ->> 'kind'),
    c.message ->> 'modelSlug',
    c.message ->> 'title',
    c.message ->> 'body',
    c.message ->> 'href',
    m.group_key,
    case when m.group_key is not null then (c.message ->> 'count')::integer end,
    case when m.group_key is not null then m.group_key || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD') end,
    m.member_count::integer
  from members m
  join composed c on c.device_id = m.device_id and c.unit = m.unit
  join public.mobile_push_devices dev on dev.id = m.device_id
  where m.id = m.lead_id
  order by m.id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) FROM PUBLIC, "anon", "authenticated";
