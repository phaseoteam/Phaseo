-- Mobile push phase 2: low balance without the email.
--   * sweep_low_balance_pushes, run by the mobile push job every five minutes before the
--     workspace fan-out, pushes a low balance once per drop to owners and admins, whatever the
--     workspace's low-balance email setting. It reads only workspaces where an owner or admin has
--     push, the money category and an active device, against the workspace's low-balance
--     threshold or $5, and keeps its state in workspace_low_balance_push_state: armed while the
--     balance is above the threshold, unarmed after a drop until it is back above, and armed on
--     first sight only if above, so a workspace that never had credits is never told.
--   * A drop while auto top-up is on and working is recorded without a push; a failed top-up has
--     its own push.
--   * The push says how long the balance lasts at the last seven days' pace, worked out only for
--     a drop that is pushed.
--   * Low balance emails are no longer read by capture_workspace_notification_events, so they are
--     never a second push. The email itself is unchanged.
SET local check_function_bodies = off;


CREATE TABLE "public"."workspace_low_balance_push_state" (
  "workspace_id"    uuid                     NOT NULL,
  "armed"           boolean                  NOT NULL,
  "balance_nanos"   bigint                   NOT NULL,
  "threshold_nanos" bigint                   NOT NULL,
  "changed_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "last_alert_at"   timestamp with time zone,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_low_balance_push_state_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_low_balance_push_state_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_low_balance_push_state"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_low_balance_push_state"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."armed" IS 'True while the balance is above the threshold. The next sweep that finds it at or below the threshold counts a drop and clears it; a sweep that finds it back above sets it again.';

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."balance_nanos" IS 'Wallet balance when armed last changed, or when the workspace was first seen.';

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."changed_at" IS 'When armed last changed, or when the workspace was first seen. A sweep writes a row only when armed changes, so an idle sweep writes nothing.';

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."last_alert_at" IS 'When the last drop was pushed. A drop while auto top-up is on and working is recorded without a push and leaves this unchanged.';

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."threshold_nanos" IS 'Threshold the balance was compared with then: the workspace''s low-balance threshold, or $5 without one.';

COMMENT ON TABLE "public"."workspace_low_balance_push_state" IS 'Low-balance push state of each workspace that sweep_low_balance_pushes has watched, that is one where an owner or admin gets money pushes. A drop to or below the threshold is pushed once, and the push is armed again only once the balance is back above it. First seen at or below the threshold, a workspace starts unarmed, so one that never had credits is never told. Rows are kept while a workspace is not watched, so a drop in the meantime is pushed when it is watched again.';

REVOKE ALL ON TABLE "public"."workspace_low_balance_push_state" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_low_balance_push_state" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_low_balance_push_state" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.workspace_push_message (
  p_kind           text,
  p_category       text,
  p_payload        jsonb,
  p_is_actor       boolean,
  p_workspace_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
-- Writes one workspace push for one recipient: kind, category, title, body, href and modelSlug,
-- or null for a kind it cannot write.
--   p_is_actor        the recipient did what the push is about: "You created API key 'prod'".
--   p_workspace_name  set when the recipient belongs to more than one workspace. The title then
--                     starts with it, and an ordinary first word is lower-cased: "Acme: balance
--                     is $3.20", but "Acme: GPT-4o retires Nov 30".
-- Money is in US format ($3.20) and dates are UTC (Nov 30). Kinds not written here carry their
-- own text in payload.push: title, body, href, modelSlug and lowerLead.
-- Low balance says how long the balance lasts at the pace of the last spend_window_days days
-- (recent_spend_nanos), as the web's credit runway does: not below a cent a day, and "more than
-- 90 days" past that.
declare
  v_number constant text := '^-?[0-9]+(\.[0-9]+)?$';
  v_title text;
  v_body text;
  v_href text;
  v_model text;
  v_lower boolean := false;
  v_name text := nullif(btrim(coalesce(p_payload ->> 'key_name', '')), '');
  v_key text;
  v_actor text := left(nullif(btrim(coalesce(p_payload ->> 'actor_name', '')), ''), 40);
  v_source text := nullif(btrim(coalesce(p_payload ->> 'reported_source', '')), '');
  v_count numeric;
  v_retires timestamptz;
  v_deprecates timestamptz;
  v_expires timestamptz;
  v_balance numeric;
  v_daily numeric;
  v_days numeric;
begin
  v_key := '''' || case when v_name is null then 'unnamed' when char_length(v_name) > 40 then left(v_name, 39) || '…' else v_name end || '''';

  if p_kind = 'low_balance' then
    v_lower := true;
    v_balance := case when p_payload ->> 'balance_nanos' ~ v_number then (p_payload ->> 'balance_nanos')::numeric end;
    v_daily := case when p_payload ->> 'recent_spend_nanos' ~ v_number and p_payload ->> 'spend_window_days' ~ '^[1-9][0-9]*$'
      then (p_payload ->> 'recent_spend_nanos')::numeric / (p_payload ->> 'spend_window_days')::numeric end;
    v_days := case when v_balance > 0 and v_daily >= 10000000 then v_balance / v_daily end;
    v_title := 'Balance is ' || coalesce(private.workspace_push_usd(greatest(0, v_balance)), 'low');
    v_body := case
        when v_days is null then ''
        when v_days < 1 then 'Less than a day left at this week''s pace. '
        when v_days > 90 then 'More than 90 days left at this week''s pace. '
        when round(v_days) = 1 then 'About 1 day left at this week''s pace. '
        else 'About ' || round(v_days) || ' days left at this week''s pace. '
      end || 'Add credits to keep requests running.';
    v_href := '/settings/credits';

  elsif p_kind = 'auto_top_up_failed' then
    v_lower := true;
    v_title := 'Auto top-up failed';
    v_body := left(coalesce(nullif(btrim(p_payload ->> 'reason'), ''), 'The saved payment method could not be charged.'), 200);
    v_href := '/settings/credits';

  elsif p_kind = 'payment_method_expiring' then
    v_lower := true;
    v_title := coalesce('Card ending ' || nullif(btrim(p_payload ->> 'last4'), '') || ' expires soon', 'Your card expires soon');
    v_body := 'Your ' || coalesce(initcap(replace(nullif(btrim(p_payload ->> 'brand'), ''), '_', ' ')), 'card')
      || ' expires ' || coalesce(nullif(btrim(p_payload ->> 'expiry'), ''), 'soon') || '. Update it to keep top-ups working.';
    v_href := '/settings/payment-methods';

  elsif p_kind = 'model_deprecation' then
    v_model := nullif(btrim(p_payload ->> 'model_id'), '');
    v_name := coalesce(nullif(btrim(p_payload ->> 'model_name'), ''), v_model, 'A model you use');
    v_retires := case when p_payload ->> 'retirement_date' ~ '^\d{4}-\d{2}-\d{2}' then (p_payload ->> 'retirement_date')::timestamptz end;
    v_deprecates := case when p_payload ->> 'deprecation_date' ~ '^\d{4}-\d{2}-\d{2}' then (p_payload ->> 'deprecation_date')::timestamptz end;
    v_title := v_name || case
      when v_retires > now() then ' retires ' || to_char(v_retires at time zone 'UTC', 'Mon FMDD')
      when v_deprecates > now() then ' is deprecated from ' || to_char(v_deprecates at time zone 'UTC', 'Mon FMDD')
      else ' is deprecated'
    end;
    v_body := coalesce('Switch to ' || nullif(btrim(coalesce(p_payload ->> 'replacement_model_name', p_payload ->> 'replacement_model_id')), '')
      || case when v_retires > now() then ' before then.' else '.' end, 'Choose a supported replacement.');
    v_href := coalesce('/models/' || v_model, '/');

  elsif p_kind = 'model_substitution' then
    v_model := nullif(btrim(p_payload ->> 'replacement_model_id'), '');
    v_name := coalesce(nullif(btrim(p_payload ->> 'model_name'), ''), nullif(btrim(p_payload ->> 'model_id'), ''), 'A retired model');
    v_title := v_name || ' requests now go to ' || coalesce(nullif(btrim(p_payload ->> 'replacement_model_name'), ''), v_model, 'its replacement');
    v_body := 'No provider serves ' || v_name || ' any more.';
    v_href := coalesce('/models/' || v_model, '/');

  elsif p_kind = 'rate_limit_throttled' then
    v_lower := true;
    v_count := case when p_payload ->> 'throttled_requests' ~ v_number then (p_payload ->> 'throttled_requests')::numeric end;
    v_title := 'Rate limits blocked ' || coalesce(to_char(v_count, 'FM999,999,999,990') || case when v_count = 1 then ' request' else ' requests' end, 'requests');
    v_body := 'In the last ' || coalesce(case when p_payload ->> 'window_minutes' ~ '^[0-9]+$' then p_payload ->> 'window_minutes' end, '15') || ' minutes.'
      || coalesce(' Most were under ''' || (
        select left(nullif(btrim(p ->> 'policy_name'), ''), 40)
        from jsonb_array_elements(case when jsonb_typeof(p_payload -> 'policies') = 'array' then p_payload -> 'policies' else '[]'::jsonb end) p
        order by case when p ->> 'throttled_requests' ~ v_number then (p ->> 'throttled_requests')::numeric end desc nulls last
        limit 1
      ) || '''.', '');
    v_href := '/settings/usage/overview';

  elsif p_kind = 'security_leaked_key' then
    v_title := case when p_payload ->> 'key_type' = 'management_key' then 'Management key ' else 'API key ' end || v_key || ' was exposed';
    v_body := coalesce('Reported by ' || case
        when v_source ~* 'github' then 'GitHub'
        when v_source ~* 'gitlab' then 'GitLab'
        else left(btrim(regexp_replace(v_source, '[_-]+', ' ', 'g')), 40)
      end || '. ', 'Reported as public. ')
      || case when p_payload ->> 'auto_revoked' = 'true' then 'It has been revoked, so replace it.' else 'Rotate it now.' end;
    v_href := case when p_payload ->> 'key_type' = 'management_key' then '/settings/management-api-keys' else '/settings/keys' end;

  elsif p_kind in ('api_key_created', 'api_key_rotated', 'api_key_deleted', 'api_key_paused', 'api_key_resumed') then
    if coalesce(p_is_actor, false) then
      v_lower := true;
      v_title := 'You ' || substr(p_kind, 9) || ' API key ' || v_key;
    elsif p_kind = 'api_key_created' then
      v_lower := true;
      v_title := 'New API key ' || v_key || ' created' || coalesce(' by ' || v_actor, '');
    else
      v_title := 'API key ' || v_key || ' ' || substr(p_kind, 9) || coalesce(' by ' || v_actor, '');
    end if;
    v_expires := case when p_payload ->> 'previous_key_expires_at' ~ '^\d{4}-\d{2}-\d{2}' then (p_payload ->> 'previous_key_expires_at')::timestamptz end;
    v_body := case p_kind
      when 'api_key_created' then case
        when nullif(btrim(p_payload ->> 'app_name'), '') is not null then 'Issued to ' || left(btrim(p_payload ->> 'app_name'), 60) || ' through OAuth.'
        when coalesce(p_is_actor, false) then 'Owners and admins get this alert too.'
        else 'Review your keys if you didn''t expect this.'
      end
      when 'api_key_rotated' then coalesce('The new key is ''' || left(nullif(btrim(p_payload ->> 'replacement_key_name'), ''), 40) || '''. ', '')
        || coalesce('The old one stops working ' || to_char(v_expires at time zone 'UTC', 'Mon FMDD, HH24:MI') || ' UTC.', 'The old one works until you delete it.')
      when 'api_key_deleted' then 'Requests using it are now rejected.'
      when 'api_key_paused' then 'Requests using it are rejected until it''s resumed.'
      else 'It can make requests again.'
    end;
    v_href := '/settings/keys';

  elsif jsonb_typeof(p_payload -> 'push') = 'object' then
    v_title := nullif(btrim(p_payload -> 'push' ->> 'title'), '');
    v_body := p_payload -> 'push' ->> 'body';
    v_href := p_payload -> 'push' ->> 'href';
    v_model := nullif(btrim(p_payload -> 'push' ->> 'modelSlug'), '');
    v_lower := coalesce(p_payload -> 'push' ->> 'lowerLead' = 'true', false);
  end if;

  if v_title is null then
    return null;
  end if;
  if nullif(btrim(p_workspace_name), '') is not null then
    v_title := left(btrim(p_workspace_name), 40) || ': '
      || case when v_lower then lower(left(v_title, 1)) || substr(v_title, 2) else v_title end;
  end if;

  return jsonb_build_object('kind', p_kind, 'category', p_category, 'title', left(v_title, 300), 'body', left(coalesce(v_body, ''), 1000),
    'href', coalesce(nullif(btrim(v_href), ''), '/'), 'modelSlug', v_model);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."workspace_push_message"(text, text, jsonb, boolean, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."workspace_push_message"(text, text, jsonb, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_push_message"(text, text, jsonb, boolean, text) TO "postgres";

CREATE OR REPLACE FUNCTION private.capture_workspace_notification_events (
  p_limit integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- Turns new workspace events into push events (workspace_notification_events), one per dedupe key:
--   email_outbox            auto_top_up_failed and payment_method_expiring (money),
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
-- Low balance emails are not read: sweep_low_balance_pushes pushes low balance once per drop
-- whatever the email setting, so an email row is never a second push. The email is unchanged.
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
  v_inserted integer;
  v_captured integer := 0;
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
        and o.kind in ('auto_top_up_failed', 'payment_method_expiring', 'model_deprecation', 'model_substitution',
          'rate_limit_throttled', 'security_leaked_key')
        and o.workspace_id is not null
      order by o.created_at, o.id
      limit p_limit
    loop
      v_read := v_read + 1;
      v_last := v_row.created_at;
      v_last_id := v_row.id;

      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, key_id, key_created_by, payload, occurred_at)
      select
        v_row.workspace_id,
        v_row.kind,
        case
          when v_row.kind in ('auto_top_up_failed', 'payment_method_expiring') then 'money'
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

  return jsonb_build_object('captured', v_captured);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."capture_workspace_notification_events"(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."capture_workspace_notification_events"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."capture_workspace_notification_events"(integer) TO "postgres";

CREATE OR REPLACE FUNCTION public.sweep_low_balance_pushes (
  p_now timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Pushes a low balance once per drop to owners and admins, whatever the workspace's low-balance
-- email setting. The mobile push job runs it every five minutes, just before the workspace fan-out.
--   * Only workspaces where an owner or admin has push on, the money category on and an active
--     device are read: the wallet balance against the workspace's low-balance threshold, or $5
--     without one (an alert switched off in the web settings stores 0).
--   * A workspace is armed while its balance is above the threshold. Found armed at or below it,
--     that is a drop: one low_balance event for the fan-out, and it stays unarmed until a sweep
--     finds the balance back above the threshold (a top-up or credit). First seen, it is armed
--     only if above, so a workspace that never had credits is never told.
--   * While auto top-up is on and working, a drop is recorded but not pushed: the gateway refills
--     the wallet, and a failed top-up has its own push. Working means enabled with at least $1 to
--     add (smaller amounts are skipped without an alert) and a trigger above $0 (a $0 trigger never
--     fires), failure alerts on (the failure push comes from that email), and no failed top-up
--     since the last card payment.
--   * The forecast for the push text, credits charged over the last seven days
--     (get_workspace_recent_credit_spend), is worked out only for a drop that is pushed.
--   * State lives in workspace_low_balance_push_state, written only when it changes, so an idle
--     sweep writes nothing.
-- Sweeps run one at a time; a call that finds another in progress returns at once.
declare
  v_default_threshold constant bigint := 5000000000;
  v_result jsonb;
begin
  if p_now is null then
    raise exception 'invalid_low_balance_sweep_time';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('sweep_low_balance_pushes', 0)) then
    return jsonb_build_object('skipped', true, 'watched', 0, 'firstSeen', 0, 'dropped', 0, 'rearmed', 0, 'coveredByTopUp', 0, 'alerted', 0);
  end if;

  with watched as (
    select distinct m.workspace_id
    from public.mobile_notification_preferences p
    join public.workspace_members m on m.user_id = p.user_id and m.role in ('owner', 'admin')
    where p.enabled
      and (p.categories -> 'money') is distinct from 'false'::jsonb
      and exists (select 1 from public.mobile_push_devices d where d.user_id = p.user_id and d.status = 'active')
  ),
  observed as (
    select
      w.workspace_id,
      w.balance_nanos,
      case when s.low_balance_email_threshold_nanos > 0 then s.low_balance_email_threshold_nanos else v_default_threshold end as threshold_nanos,
      coalesce(s.low_balance_email_threshold_nanos > 0, false) as own_threshold,
      case
        when w.auto_top_up_enabled and w.auto_top_up_amount >= 1000000000 and w.low_balance_threshold > 0
          and s.auto_top_up_failure_email_enabled is distinct from false
          then not exists (
            select 1
            from (
              select f.occurred_at
              from public.workspace_notification_events f
              where f.workspace_id = w.workspace_id and f.kind = 'auto_top_up_failed'
              order by f.occurred_at desc
              limit 1
            ) failed
            where not exists (
              select 1
              from public.credit_ledger l
              where l.workspace_id = w.workspace_id
                and l.ref_type = 'Stripe_Payment_Intent'
                and l.amount_nanos > 0
                and l.created_at > failed.occurred_at
            )
          )
        else false
      end as top_up_covers,
      st.workspace_id is not null as seen
    from watched x
    join public.wallets w on w.workspace_id = x.workspace_id
    left join public.workspace_settings s on s.workspace_id = x.workspace_id
    left join public.workspace_low_balance_push_state st on st.workspace_id = x.workspace_id
  ),
  first_seen as (
    insert into public.workspace_low_balance_push_state (workspace_id, armed, balance_nanos, threshold_nanos, changed_at, created_at)
    select o.workspace_id, o.balance_nanos > o.threshold_nanos, o.balance_nanos, o.threshold_nanos, p_now, p_now
    from observed o
    where not o.seen
    on conflict (workspace_id) do nothing
    returning workspace_id
  ),
  changed as (
    -- Only rows whose state flips: armed and now at or below the threshold, or unarmed and above.
    update public.workspace_low_balance_push_state st
    set armed = not st.armed,
        balance_nanos = o.balance_nanos,
        threshold_nanos = o.threshold_nanos,
        changed_at = p_now,
        last_alert_at = case when st.armed and not o.top_up_covers then p_now else st.last_alert_at end
    from observed o
    where o.seen
      and st.workspace_id = o.workspace_id
      and st.armed = (o.balance_nanos <= o.threshold_nanos)
    returning st.workspace_id, st.armed, o.balance_nanos, o.threshold_nanos, o.own_threshold, o.top_up_covers
  ),
  alerted as (
    insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, payload, occurred_at)
    select
      c.workspace_id,
      'low_balance',
      'money',
      'low_balance:' || c.workspace_id || ':' || to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      jsonb_build_object(
        'balance_nanos', c.balance_nanos,
        'threshold_nanos', c.threshold_nanos,
        'threshold_source', case when c.own_threshold then 'workspace' else 'default' end,
        'recent_spend_nanos', public.get_workspace_recent_credit_spend(c.workspace_id, p_now - interval '7 days'),
        'spend_window_days', 7
      ),
      p_now
    from changed c
    where not c.armed and not c.top_up_covers
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select jsonb_build_object(
    'watched', (select count(*) from observed),
    'firstSeen', (select count(*) from first_seen),
    'dropped', (select count(*) from changed c where not c.armed),
    'rearmed', (select count(*) from changed c where c.armed),
    'coveredByTopUp', (select count(*) from changed c where not c.armed and c.top_up_covers),
    'alerted', (select count(*) from alerted)
  ) into v_result;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sweep_low_balance_pushes"(timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_low_balance_pushes"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_low_balance_pushes"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_low_balance_pushes"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
