-- Mobile push phase 2: workspace alerts.
--   * workspace_notification_events holds workspace events for push, one per dedupe key:
--     money (low balance, failed auto top-up, expiring card), traffic (rate limits, model
--     substitutions), security (API key activity, exposed keys) and deprecations. They are
--     captured from email_outbox and workspace_audit_events through workspace_notification_cursors.
--   * fan_out_workspace_push_events queues each for the devices of owners and admins, and of the
--     key's creator for key events, with text written per recipient. Quiet hours apply (exposed
--     keys excepted); the daily cap is for catalogue news only.
--   * Deliveries gain workspace_event_id and message (workspace_id and a nullable event_id came
--     with the weekly digest). The claim returns the workspace and its name, closes rows for
--     workspaces the user left, and still leaves weekly digest rows to claim_mobile_push_digests.
--   * Low balance is pushed once per drop: until a credit lifts the balance above the threshold.
SET local check_function_bodies = off;


CREATE TABLE "public"."workspace_notification_events" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "kind"           text                     NOT NULL,
  "category"       text                     NOT NULL,
  "dedupe_key"     text                     NOT NULL,
  "actor_user_id"  uuid,
  "key_id"         uuid,
  "key_created_by" uuid,
  "payload"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "fanned_out_at"  timestamp with time zone,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_notification_events_category_check"
    CHECK ((category = ANY (ARRAY['money'::text, 'traffic'::text, 'security'::text, 'deprecations'::text, 'jobs'::text, 'account'::text, 'digest'::text]))),
  CONSTRAINT "workspace_notification_events_dedupe_key_key" UNIQUE (dedupe_key),
  CONSTRAINT "workspace_notification_events_payload_check" CHECK ((jsonb_typeof(payload) = 'object'::text)),
  CONSTRAINT "workspace_notification_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_notification_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_notification_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_notification_events_open_idx ON public.workspace_notification_events USING btree (created_at, id)
  WHERE (fanned_out_at IS NULL);

CREATE INDEX workspace_notification_events_workspace_kind_idx ON public.workspace_notification_events USING btree (workspace_id, kind, occurred_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_notification_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_notification_events"."actor_user_id" IS 'Who did what the event is about, when a person did it. That person is told "You …" instead of their own name.';

COMMENT ON COLUMN "public"."workspace_notification_events"."category" IS 'Mobile notification category and Android channel: money, traffic, security or deprecations so far.';

COMMENT ON COLUMN "public"."workspace_notification_events"."key_created_by" IS 'Creator of the API key the event is about. Besides owners and admins, they are told too, even as a plain member.';

COMMENT ON COLUMN "public"."workspace_notification_events"."payload" IS 'Facts the push text is written from for each recipient. Kinds that private.workspace_push_message does not write itself carry their own text in payload.push (title, body, href and lowerLead).';

COMMENT ON TABLE "public"."workspace_notification_events" IS 'Workspace events for mobile push (money, traffic, security and deprecation alerts), one per dedupe key, captured from email_outbox and workspace_audit_events or recorded directly. fan_out_workspace_push_events queues each for the devices of the members it concerns.';

REVOKE ALL ON TABLE "public"."workspace_notification_events" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_notification_events" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_notification_events" FROM "anon", "authenticated";

CREATE TABLE "public"."workspace_notification_cursors" (
  "source"     text                     NOT NULL,
  "read_until" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_notification_cursors_pkey" PRIMARY KEY (source),
  CONSTRAINT "workspace_notification_cursors_source_check" CHECK ((source = ANY (ARRAY['email_outbox'::text, 'workspace_audit_events'::text])))
);

ALTER TABLE "public"."workspace_notification_cursors"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_notification_cursors"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_notification_cursors"."read_until" IS 'Rows created up to this moment have been read. The next read starts ten minutes earlier, so a row whose transaction committed late is still seen.';

COMMENT ON TABLE "public"."workspace_notification_cursors" IS 'Read positions of capture_workspace_notification_events in email_outbox and workspace_audit_events.';

REVOKE ALL ON TABLE "public"."workspace_notification_cursors" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_notification_cursors" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_notification_cursors" FROM "anon", "authenticated";

ALTER TABLE "public"."mobile_push_deliveries"
  ADD COLUMN IF NOT EXISTS "workspace_id" uuid,
  ADD COLUMN "workspace_event_id" uuid,
  ADD COLUMN "message" jsonb,
  ADD CONSTRAINT "mobile_push_deliveries_message_check" CHECK (((event_id IS NOT NULL) OR (digest_id IS NOT NULL) OR (message IS NOT NULL))),
  ADD CONSTRAINT "mobile_push_deliveries_workspace_event_id_device_id_key" UNIQUE (workspace_event_id, device_id),
  ADD CONSTRAINT "mobile_push_deliveries_workspace_event_id_fkey" FOREIGN KEY (workspace_event_id) REFERENCES public.workspace_notification_events(id) ON DELETE CASCADE,
  ADD CONSTRAINT "mobile_push_deliveries_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX mobile_push_deliveries_workspace_idx ON public.mobile_push_deliveries USING btree (workspace_id)
  WHERE (workspace_id IS NOT NULL);

COMMENT ON COLUMN "public"."mobile_push_deliveries"."event_id" IS 'The catalogue event this push is about. Null for workspace alerts, which carry their own message, and for weekly digests (digest_id).';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."message" IS 'Text of a push that is not about a catalogue event, written for its recipient when it was queued: kind, category, title, body, href and modelSlug.';

COMMENT ON TABLE "public"."mobile_push_deliveries" IS 'One row per catalogue event and device, per workspace event and device (workspace alerts, with their own message), or per weekly digest and device (digest_id). Catalogue rows wait five minutes to settle, and those due for the same device and group key are sent as one push; workspace rows are due at once and sent alone. Deferred rows wait for quiet hours to end; suppressed rows were over the daily cap or no longer wanted. Claimed with a token so overlapping runs never send twice.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."workspace_event_id" IS 'The workspace event this push is about, for workspace alerts.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."workspace_id" IS 'Workspace a workspace alert is about. Null for catalogue news. The push names it to members of more than one workspace and is closed unsent if the recipient has left it.';

-- The capture reads both sources by creation time.
CREATE INDEX email_outbox_created_at_idx ON public.email_outbox USING btree (created_at);

CREATE INDEX workspace_audit_events_api_key_created_idx ON public.workspace_audit_events USING btree (created_at)
  WHERE (target_type = 'api_key'::text);

CREATE OR REPLACE FUNCTION private.workspace_push_usd (
  p_nanos numeric
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Dollars in US format for workspace push text: $3.20, $1,250.00. Null stays null.
  select '$' || to_char(round(p_nanos / 1000000000, 2), 'FM999,999,999,990.00');
$function$;

REVOKE ALL ON FUNCTION "private"."workspace_push_usd"(numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."workspace_push_usd"(numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_push_usd"(numeric) TO "postgres";

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
begin
  v_key := '''' || case when v_name is null then 'unnamed' when char_length(v_name) > 40 then left(v_name, 39) || '…' else v_name end || '''';

  if p_kind = 'low_balance' then
    v_lower := true;
    v_title := 'Balance is ' || coalesce(private.workspace_push_usd(greatest(0,
      case when p_payload ->> 'balance_nanos' ~ v_number then (p_payload ->> 'balance_nanos')::numeric end)), 'low');
    v_body := coalesce('Below your ' || private.workspace_push_usd(
      case when p_payload ->> 'threshold_nanos' ~ v_number then (p_payload ->> 'threshold_nanos')::numeric end) || ' alert. ', '')
      || 'Add credits to keep requests running.';
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
--   email_outbox            low_balance, auto_top_up_failed and payment_method_expiring (money),
--                           model_deprecation (deprecations), model_substitution and
--                           rate_limit_throttled (traffic), and security_leaked_key (security; one
--                           per exposed key, though the email has a row per recipient)
--   workspace_audit_events  api_key.created, .rotated, .deleted, .paused and .resumed (security),
--                           except for the web chat's managed key
-- Each source is read from its cursor: rows created from ten minutes before the previous read up
-- to the start of this call, so a row whose transaction commits a little late is still read, and
-- reading the overlap again adds nothing. Nothing older than two days is read, and the first call
-- only sets the cursors. Up to p_limit rows are read per source.
-- Low balance is pushed once per drop: a low_balance row is skipped while the workspace's last
-- low-balance push stands, that is until a credit (top-up, refund, grant or adjustment) lifted the
-- balance above the threshold between that push and the row, or the threshold changed. The
-- email itself is unchanged.
declare
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_now timestamptz := now();
  v_until timestamptz;
  v_last timestamptz;
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

  select c.read_until into v_until from public.workspace_notification_cursors c where c.source = 'email_outbox' for update;
  if v_until is null then
    insert into public.workspace_notification_cursors (source, read_until) values ('email_outbox', v_now) on conflict (source) do nothing;
  else
    v_read := 0;
    for v_row in
      select o.id, o.created_at, o.kind, o.workspace_id, o.payload
      from public.email_outbox o
      where o.created_at > greatest(v_until - interval '10 minutes', v_now - interval '2 days')
        and o.created_at <= v_now
        and o.kind in ('low_balance', 'auto_top_up_failed', 'payment_method_expiring', 'model_deprecation', 'model_substitution',
          'rate_limit_throttled', 'security_leaked_key')
        and o.workspace_id is not null
      order by o.created_at, o.id
      limit p_limit
    loop
      v_read := v_read + 1;
      v_last := v_row.created_at;

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
        k.id,
        k.created_by,
        v_row.payload - 'user_first_name',
        v_row.created_at
      from (select 1) one
      left join public.keys k
        on v_row.kind = 'security_leaked_key' and coalesce(v_row.payload ->> 'key_type', 'api_key') = 'api_key'
        and k.workspace_id = v_row.workspace_id
        and k.id = case when v_row.payload ->> 'key_id' ~* v_uuid then (v_row.payload ->> 'key_id')::uuid end
      on conflict (dedupe_key) do nothing;
      get diagnostics v_inserted = row_count;
      v_captured := v_captured + v_inserted;
    end loop;

    update public.workspace_notification_cursors
    set read_until = case when v_read < p_limit then v_now else greatest(v_until, v_last) end, updated_at = v_now
    where source = 'email_outbox';
  end if;

  select c.read_until into v_until from public.workspace_notification_cursors c where c.source = 'workspace_audit_events' for update;
  if v_until is null then
    insert into public.workspace_notification_cursors (source, read_until) values ('workspace_audit_events', v_now) on conflict (source) do nothing;
  else
    v_read := 0;
    for v_row in
      select a.id, a.created_at, a.workspace_id, a.actor_user_id, a.action, a.target_id, a.target_name, a.metadata
      from public.workspace_audit_events a
      where a.target_type = 'api_key'
        and a.created_at > greatest(v_until - interval '10 minutes', v_now - interval '2 days')
        and a.created_at <= v_now
        and a.action in ('api_key.created', 'api_key.rotated', 'api_key.deleted', 'api_key.paused', 'api_key.resumed')
      order by a.created_at, a.id
      limit p_limit
    loop
      v_read := v_read + 1;
      v_last := v_row.created_at;

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

    update public.workspace_notification_cursors
    set read_until = case when v_read < p_limit then v_now else greatest(v_until, v_last) end, updated_at = v_now
    where source = 'workspace_audit_events';
  end if;

  return jsonb_build_object('captured', v_captured, 'lowBalanceRepeats', v_repeats);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."capture_workspace_notification_events"(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."capture_workspace_notification_events"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."capture_workspace_notification_events"(integer) TO "postgres";

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

-- The claim now also returns the workspace of a workspace alert.
DROP FUNCTION public.claim_mobile_push_deliveries(integer, uuid);

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
    deliveries      integer,
    workspace_id    uuid,
    workspace_name  text
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
-- its oldest row's id; the other rows point at it through merged_into. Workspace alerts carry
-- their own message and workspace, have no group key, and so always go alone.
-- Before claiming, rows over two days old, for a device that is no longer active, for a user who
-- has since switched push or the push's category off, or for a workspace the user has left are
-- closed instead of sent, and rows a crashed run left processing for ten minutes go back to the
-- queue to be grouped again.
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
        when x.workspace_id is not null and not exists (
          select 1 from public.workspace_members m where m.workspace_id = x.workspace_id and m.user_id = x.user_id
        ) then 'not_a_member'
        else 'category_disabled'
      end,
      merged_into = null,
      claim_token = null,
      claimed_at = null,
      updated_at = now()
  from public.mobile_push_devices dev
  left join public.mobile_notification_preferences p on p.user_id = dev.user_id
  where dev.id = x.device_id
    and x.digest_id is null
    and (x.status in ('pending', 'deferred') or (x.status = 'processing' and x.claimed_at < now() - interval '10 minutes'))
    and (
      x.created_at <= now() - interval '2 days' or dev.status <> 'active' or not coalesce(p.enabled, false)
      or (p.categories -> coalesce(x.message ->> 'category',
        (select private.mobile_push_category(e.kind) from public.catalogue_notification_events e where e.id = x.event_id))) = 'false'::jsonb
      or (x.workspace_id is not null and not exists (
        select 1 from public.workspace_members m where m.workspace_id = x.workspace_id and m.user_id = x.user_id
      ))
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
    select x.id, x.device_id, x.group_key, x.event_id, x.created_at, x.attempts, x.message, x.workspace_id, d.unit
    from public.mobile_push_deliveries x
    join due d on d.device_id = x.device_id and d.unit = coalesce(x.group_key, x.id::text)
    where x.status in ('pending', 'deferred') and x.not_before <= now() and x.digest_id is null
    for update of x skip locked
  ),
  members as (
    select
      l.*,
      coalesce(e.occurred_at, l.created_at) as occurred_at,
      first_value(l.id) over (partition by l.device_id, l.unit order by l.created_at, l.id) as lead_id,
      count(*) over (partition by l.device_id, l.unit) as member_count,
      max(l.attempts) over (partition by l.device_id, l.unit) as max_attempts,
      case when e.id is null then l.message else jsonb_build_object(
        'kind', e.kind, 'modelSlug', e.model_slug, 'labSlug', e.lab_slug, 'providerSlug', e.provider_slug,
        'modelName', coalesce(nullif(btrim(e.payload ->> 'modelName'), ''), e.model_slug),
        'labName', coalesce(nullif(btrim(e.payload ->> 'labName'), ''), e.lab_slug),
        'providerName', coalesce(nullif(btrim(e.payload ->> 'providerName'), ''), e.provider_slug),
        'title', e.title, 'body', e.body, 'href', e.href
      ) end as item
    from locked l
    left join public.catalogue_notification_events e on e.id = l.event_id
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
    coalesce(m.item ->> 'category', private.mobile_push_category(c.message ->> 'kind')),
    c.message ->> 'modelSlug',
    c.message ->> 'title',
    c.message ->> 'body',
    c.message ->> 'href',
    m.group_key,
    case when m.group_key is not null then (c.message ->> 'count')::integer end,
    case when m.group_key is not null then m.group_key || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD') end,
    m.member_count::integer,
    m.workspace_id,
    ws.name
  from members m
  join composed c on c.device_id = m.device_id and c.unit = m.unit
  join public.mobile_push_devices dev on dev.id = m.device_id
  left join public.workspaces ws on ws.id = m.workspace_id
  where m.id = m.lead_id
  order by m.id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_deliveries"(integer, uuid) FROM PUBLIC, "anon", "authenticated";
