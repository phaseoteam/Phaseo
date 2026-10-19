CREATE OR REPLACE FUNCTION public.claim_mobile_push_digests (
  p_limit       integer,
  p_claim_token uuid,
  p_now         timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The weekly digest's half of the push job. Writes the digests that have come due
-- (private.build_mobile_push_digests, for up to 20 users a call, since each sums every workspace
-- the user administers; more says others are waiting), then claims up to p_limit due digest
-- pushes under the caller's token and returns them with their text:
-- { built, skipped, queued, deferred, more, closed, pushes: [{ id, attempts, expoPushToken,
-- channelScheme, title, body, href, tag, isoWeek, workspaceId, workspaceName }] }.
-- Results go to complete_mobile_push_deliveries like any other push. Before claiming, rows a
-- crashed run left processing for ten minutes become claimable again, and rows over two days
-- old, for a device that is no longer active or has gone back to an app build without the digest
-- channel (channel scheme below 2), or for a user who has since switched push or the digest off
-- are closed instead of sent; a device that changes in the meantime is skipped until the next
-- run closes its row. Digest rows are never grouped, never count against the daily cap, and are
-- never read by claim_mobile_push_deliveries. When idle, each step reads an empty partial index.
-- A backlog larger than one run sends is left pending, oldest first, for the next run.
declare
  v_built jsonb;
  v_closed integer;
  v_pushes jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_mobile_push_claim_limit';
  end if;
  if p_claim_token is null then
    raise exception 'invalid_mobile_push_claim_token';
  end if;
  if p_now is null then
    raise exception 'invalid_mobile_push_claim_time';
  end if;

  v_built := private.build_mobile_push_digests(p_now, least(p_limit, 20));

  update public.mobile_push_deliveries x
  set status = 'pending', claim_token = null, claimed_at = null, updated_at = now()
  where x.status = 'processing' and x.claimed_at < p_now - interval '10 minutes' and x.digest_id is not null;

  with closed as (
    update public.mobile_push_deliveries x
    set status = case when x.created_at <= p_now - interval '2 days' then 'failed' else 'suppressed' end,
        error_code = case
          when x.created_at <= p_now - interval '2 days' then 'expired'
          when dev.status <> 'active' then 'device_inactive'
          when dev.channel_scheme < 2 then 'channel_scheme_unsupported'
          when not coalesce(p.enabled, false) then 'notifications_disabled'
          else 'category_disabled'
        end,
        updated_at = now()
    from public.mobile_push_devices dev
    left join public.mobile_notification_preferences p on p.user_id = dev.user_id
    where dev.id = x.device_id
      and x.digest_id is not null
      and x.status in ('pending', 'deferred')
      and (
        x.created_at <= p_now - interval '2 days' or dev.status <> 'active' or dev.channel_scheme < 2
        or not coalesce(p.enabled, false) or (p.categories -> 'digest') = 'false'::jsonb
      )
    returning x.id
  )
  select count(*) into v_closed from closed;

  with due as (
    select x.id
    from public.mobile_push_deliveries x
    join public.mobile_push_devices dev on dev.id = x.device_id and dev.status = 'active' and dev.channel_scheme >= 2
    where x.digest_id is not null and x.status in ('pending', 'deferred') and x.not_before <= p_now
    order by x.not_before, x.created_at, x.id
    limit p_limit
    for update of x skip locked
  ),
  claimed as (
    update public.mobile_push_deliveries x
    set status = 'processing', claim_token = p_claim_token, claimed_at = p_now, attempts = x.attempts + 1, updated_at = now()
    from due
    where x.id = due.id
    returning x.id, x.attempts, x.device_id, x.digest_id, x.workspace_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'attempts', c.attempts,
    'expoPushToken', dev.expo_push_token,
    'channelScheme', dev.channel_scheme,
    'title', g.title,
    'body', g.body,
    'href', g.href,
    'tag', 'digest:' || g.iso_week,
    'isoWeek', g.iso_week,
    'workspaceId', c.workspace_id,
    'workspaceName', w.name
  ) order by c.id), '[]'::jsonb)
  into v_pushes
  from claimed c
  join public.mobile_push_devices dev on dev.id = c.device_id
  join public.mobile_push_digests g on g.id = c.digest_id
  left join public.workspaces w on w.id = c.workspace_id;

  return v_built || jsonb_build_object('closed', v_closed, 'pushes', v_pushes);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_digests"(integer, uuid, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_digests"(integer, uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_digests"(integer, uuid, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_digests"(integer, uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
