CREATE OR REPLACE FUNCTION private.capture_workspace_notification_events (
  p_limit integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- Turns new workspace events into push events (workspace_notification_events), one per dedupe key:
--   email_outbox            low_balance, auto_top_up_failed and payment_method_expiring (money),
--                           model_deprecation (deprecations), model_substitution and
--                           rate_limit_throttled (traffic), and security_leaked_key (security; one
--                           per exposed key, though the email has a row per recipient, with the
--                           API or management key's creator as a recipient)
--   workspace_audit_events  api_key.created, .rotated, .deleted, .paused and .resumed (security),
--                           except for the web chat's managed key
-- Each source is read from its cursor, in (created_at, id) order, up to p_limit rows per source:
--   * normally from ten minutes before the previous complete read up to the start of this call,
--     so a row whose transaction commits a little late is still read, and reading the overlap
--     again adds nothing;
--   * after a read cut short by p_limit, from just after its last row (a keyset position), so
--     each call moves on even when the overlap alone holds more than p_limit rows.
-- Nothing older than two days is read, and the first call only sets the cursors.
-- Low balance is pushed once per drop: a low_balance row is skipped while the workspace's last
-- low-balance push stands, that is until a credit (top-up, refund, grant or adjustment) lifted the
-- balance above the threshold between that push and the row, or the threshold changed. The
-- email itself is unchanged.
declare
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_now timestamptz := now();
  v_cursor public.workspace_notification_cursors%rowtype;
  v_from timestamptz;
  v_from_id uuid;
  v_last timestamptz;
  v_last_id uuid;
  v_read integer;
  v_row record;
  v_last_push record;
  v_inserted integer;
  v_captured integer := 0;
  v_repeats integer := 0;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_workspace_notification_capture_limit';
  end if;

  select c.* into v_cursor from public.workspace_notification_cursors c where c.source = 'email_outbox' for update;
  if v_cursor.source is null then
    insert into public.workspace_notification_cursors (source, read_until) values ('email_outbox', v_now) on conflict (source) do nothing;
  else
    v_read := 0;
    v_from := coalesce(v_cursor.resume_created_at, v_cursor.read_until - interval '10 minutes');
    v_from_id := coalesce(v_cursor.resume_id, '00000000-0000-0000-0000-000000000000'::uuid);
    for v_row in
      select o.id, o.created_at, o.kind, o.workspace_id, o.payload
      from public.email_outbox o
      where (o.created_at, o.id) > (v_from, v_from_id)
        and o.created_at > v_now - interval '2 days'
        and o.created_at <= v_now
        and o.kind in ('low_balance', 'auto_top_up_failed', 'payment_method_expiring', 'model_deprecation', 'model_substitution',
          'rate_limit_throttled', 'security_leaked_key')
        and o.workspace_id is not null
      order by o.created_at, o.id
      limit p_limit
    loop
      v_read := v_read + 1;
      v_last := v_row.created_at;
      v_last_id := v_row.id;

      if v_row.kind = 'low_balance' then
        continue when exists (select 1 from public.workspace_notification_events e where e.dedupe_key = 'email_outbox:' || v_row.id);
        select e.occurred_at, e.payload ->> 'threshold_nanos' as threshold into v_last_push
        from public.workspace_notification_events e
        where e.workspace_id = v_row.workspace_id and e.kind = 'low_balance' and e.occurred_at <= v_row.created_at
        order by e.occurred_at desc
        limit 1;
        if v_last_push.occurred_at is not null
          and v_last_push.threshold is not distinct from (v_row.payload ->> 'threshold_nanos')
          and not exists (
            select 1
            from public.credit_ledger l
            where l.workspace_id = v_row.workspace_id
              and l.created_at > v_last_push.occurred_at and l.created_at <= v_row.created_at
              and l.amount_nanos > 0
              and l.after_balance_nanos > case when v_row.payload ->> 'threshold_nanos' ~ '^[0-9]+$' then (v_row.payload ->> 'threshold_nanos')::numeric else 0 end
          ) then
          v_repeats := v_repeats + 1;
          continue;
        end if;
      end if;

      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, key_id, key_created_by, payload, occurred_at)
      select
        v_row.workspace_id,
        v_row.kind,
        case
          when v_row.kind in ('low_balance', 'auto_top_up_failed', 'payment_method_expiring') then 'money'
          when v_row.kind = 'model_deprecation' then 'deprecations'
          when v_row.kind = 'security_leaked_key' then 'security'
          else 'traffic'
        end,
        case
          when v_row.kind = 'security_leaked_key' then 'security_leaked_key:' || v_row.workspace_id || ':'
            || coalesce(v_row.payload ->> 'key_id', v_row.payload ->> 'key_preview', v_row.payload ->> 'key_name', '') || ':' || extract(epoch from v_row.created_at)
          else 'email_outbox:' || v_row.id
        end,
        coalesce(k.id, mk.id),
        coalesce(k.created_by, mk.created_by),
        v_row.payload - 'user_first_name',
        v_row.created_at
      from (select 1) one
      left join public.keys k
        on v_row.kind = 'security_leaked_key' and coalesce(v_row.payload ->> 'key_type', 'api_key') = 'api_key'
        and k.workspace_id = v_row.workspace_id
        and k.id = case when v_row.payload ->> 'key_id' ~* v_uuid then (v_row.payload ->> 'key_id')::uuid end
      left join public.management_keys mk
        on v_row.kind = 'security_leaked_key' and v_row.payload ->> 'key_type' = 'management_key'
        and mk.workspace_id = v_row.workspace_id
        and mk.id = case when v_row.payload ->> 'key_id' ~* v_uuid then (v_row.payload ->> 'key_id')::uuid end
      on conflict (dedupe_key) do nothing;
      get diagnostics v_inserted = row_count;
      v_captured := v_captured + v_inserted;
    end loop;

    -- A full page leaves a keyset position to carry on from; a short one completes the read.
    update public.workspace_notification_cursors
    set read_until = case when v_read < p_limit then v_now else read_until end,
        resume_created_at = case when v_read < p_limit then null else v_last end,
        resume_id = case when v_read < p_limit then null else v_last_id end,
        updated_at = v_now
    where source = 'email_outbox';
  end if;

  select c.* into v_cursor from public.workspace_notification_cursors c where c.source = 'workspace_audit_events' for update;
  if v_cursor.source is null then
    insert into public.workspace_notification_cursors (source, read_until) values ('workspace_audit_events', v_now) on conflict (source) do nothing;
  else
    v_read := 0;
    v_from := coalesce(v_cursor.resume_created_at, v_cursor.read_until - interval '10 minutes');
    v_from_id := coalesce(v_cursor.resume_id, '00000000-0000-0000-0000-000000000000'::uuid);
    for v_row in
      select a.id, a.created_at, a.workspace_id, a.actor_user_id, a.action, a.target_id, a.target_name, a.metadata
      from public.workspace_audit_events a
      where a.target_type = 'api_key'
        and (a.created_at, a.id) > (v_from, v_from_id)
        and a.created_at > v_now - interval '2 days'
        and a.created_at <= v_now
        and a.action in ('api_key.created', 'api_key.rotated', 'api_key.deleted', 'api_key.paused', 'api_key.resumed')
      order by a.created_at, a.id
      limit p_limit
    loop
      v_read := v_read + 1;
      v_last := v_row.created_at;
      v_last_id := v_row.id;

      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, actor_user_id, key_id, key_created_by, payload, occurred_at)
      select
        v_row.workspace_id,
        replace(v_row.action, '.', '_'),
        'security',
        'workspace_audit_events:' || v_row.id,
        v_row.actor_user_id,
        coalesce(k.id, case when v_row.target_id ~* v_uuid then v_row.target_id::uuid end),
        k.created_by,
        jsonb_strip_nulls(jsonb_build_object(
          'key_name', coalesce(nullif(btrim(v_row.target_name), ''), k.name),
          'actor_name', (
            select left(coalesce(nullif(btrim(u.display_name), ''), nullif(btrim(au.raw_user_meta_data ->> 'full_name'), ''),
              nullif(btrim(au.raw_user_meta_data ->> 'name'), ''), nullif(split_part(au.email, '@', 1), '')), 40)
            from auth.users au
            left join public.users u on u.user_id = au.id
            where au.id = v_row.actor_user_id
          ),
          'app_name', v_row.metadata ->> 'appName',
          'replacement_key_name', coalesce(v_row.metadata ->> 'replacementKeyName', v_row.metadata ->> 'replacement_key_name'),
          'previous_key_expires_at', coalesce(v_row.metadata ->> 'previousKeyExpiresAt', v_row.metadata ->> 'previous_key_expires_at')
        )),
        v_row.created_at
      from (select 1) one
      left join public.keys k
        on k.workspace_id = v_row.workspace_id
        and k.id = case when v_row.target_id ~* v_uuid then v_row.target_id::uuid end
      where coalesce(k.name, v_row.target_name, '') <> '__chat_route_managed_key__'
      on conflict (dedupe_key) do nothing;
      get diagnostics v_inserted = row_count;
      v_captured := v_captured + v_inserted;
    end loop;

    -- A full page leaves a keyset position to carry on from; a short one completes the read.
    update public.workspace_notification_cursors
    set read_until = case when v_read < p_limit then v_now else read_until end,
        resume_created_at = case when v_read < p_limit then null else v_last end,
        resume_id = case when v_read < p_limit then null else v_last_id end,
        updated_at = v_now
    where source = 'workspace_audit_events';
  end if;

  return jsonb_build_object('captured', v_captured, 'lowBalanceRepeats', v_repeats);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."capture_workspace_notification_events"(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."capture_workspace_notification_events"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."capture_workspace_notification_events"(integer) TO "postgres";
