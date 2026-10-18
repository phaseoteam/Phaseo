-- Rule-based mobile push. Catalogue changes become channel-neutral notification events
-- (releases, Phaseo availability, price changes, deprecations, new providers); each event is
-- matched against users' notify and mute rules in one statement and queued per device with
-- quiet hours and a daily cap. Nothing sends until the gateway job is enabled.
--
-- The mobile tables from the August 2026 attempt already exist in production, so they are
-- altered rather than created. Users who opted in to new-model pushes keep them as a default
-- rule. The old queue is closed and its trigger removed: it fired on any insert (rumoured
-- rows, free variants, renames) and nothing ever read it.
-- phaseo:allow-destructive-migration reason: register_mobile_push_device deletes the stale device row when an Expo token or installation moves to another account; this migration drops no table, column or stored data.
SET local check_function_bodies = off;

ALTER TABLE "public"."mobile_push_devices"
  ADD COLUMN "time_zone" text,
  ADD COLUMN "device_name" text,
  ADD COLUMN "app_version" text,
  ADD CONSTRAINT "mobile_push_devices_app_version_check" CHECK (((app_version IS NULL) OR ((char_length(app_version) >= 1) AND (char_length(app_version) <= 40)))),
  ADD CONSTRAINT "mobile_push_devices_device_name_check" CHECK (((device_name IS NULL) OR ((char_length(device_name) >= 1) AND (char_length(device_name) <= 100)))),
  ADD CONSTRAINT "mobile_push_devices_time_zone_check" CHECK (((time_zone IS NULL) OR ((char_length(time_zone) >= 1) AND (char_length(time_zone) <= 64))));

COMMENT ON COLUMN "public"."mobile_push_devices"."time_zone" IS 'IANA time zone reported by the app, used for quiet hours. Null means UTC.';

ALTER TABLE "public"."mobile_notification_preferences"
  ADD COLUMN "enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "quiet_start" time without time zone,
  ADD COLUMN "quiet_end" time without time zone,
  ADD COLUMN "daily_cap" integer NOT NULL DEFAULT 10,
  ADD COLUMN "test_push_sent_at" timestamp with time zone[] NOT NULL DEFAULT '{}'::timestamp with time zone[],
  ADD CONSTRAINT "mobile_notification_preferences_daily_cap_check" CHECK (((daily_cap >= 1) AND (daily_cap <= 100))),
  ADD CONSTRAINT "mobile_notification_preferences_quiet_hours_check"
    CHECK ((((quiet_start IS NULL) AND (quiet_end IS NULL)) OR ((quiet_start IS NOT NULL) AND (quiet_end IS NOT NULL) AND (quiet_start <> quiet_end)))),
  ADD CONSTRAINT "mobile_notification_preferences_test_push_sent_at_check" CHECK ((cardinality(test_push_sent_at) <= 10));

COMMENT ON COLUMN "public"."mobile_notification_preferences"."daily_cap" IS 'Most catalogue notifications a user receives in any 24 hours; later ones are recorded as suppressed.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."enabled" IS 'Master switch for mobile push. Which events notify is decided by mobile_notification_rules.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."new_model_releases_enabled" IS 'Legacy opt-in from the August 2026 attempt. Superseded by enabled and mobile_notification_rules; nothing reads it.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."quiet_end" IS 'Local time, in each device''s time zone, when held notifications are released.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."quiet_start" IS 'Local time, in each device''s time zone, from which notifications are held. A start later than the end wraps past midnight.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."test_push_sent_at" IS 'Recent test pushes, used to rate limit them.';

COMMENT ON TABLE "public"."mobile_notification_preferences" IS 'Per-user mobile push settings: master switch, quiet hours and daily cap.';

CREATE TABLE "public"."mobile_notification_rules" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"               uuid                     NOT NULL,
  "name"                  text,
  "enabled"               boolean                  NOT NULL DEFAULT true,
  "action"                text                     NOT NULL DEFAULT 'notify'::text,
  "event_kinds"           text[]                   NOT NULL,
  "lab_mode"              text                     NOT NULL DEFAULT 'all'::text,
  "lab_slugs"             text[]                   NOT NULL DEFAULT '{}'::text[],
  "provider_mode"         text                     NOT NULL DEFAULT 'all'::text,
  "provider_slugs"        text[]                   NOT NULL DEFAULT '{}'::text[],
  "model_slugs"           text[]                   NOT NULL DEFAULT '{}'::text[],
  "input_modalities"      text[]                   NOT NULL DEFAULT '{}'::text[],
  "output_modalities"     text[]                   NOT NULL DEFAULT '{}'::text[],
  "only_on_phaseo"        boolean                  NOT NULL DEFAULT false,
  "include_free_variants" boolean                  NOT NULL DEFAULT false,
  "position"              integer                  NOT NULL DEFAULT 0,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mobile_notification_rules_action_check" CHECK ((action = ANY (ARRAY['notify'::text, 'mute'::text]))),
  CONSTRAINT "mobile_notification_rules_event_kinds_check"
    CHECK
    (((cardinality(event_kinds) > 0) AND (event_kinds <@ ARRAY['model_released'::text, 'gateway_available'::text, 'price_changed'::text, 'deprecation_announced'::text,
    'provider_added'::text]))),
  CONSTRAINT "mobile_notification_rules_lab_mode_check" CHECK ((lab_mode = ANY (ARRAY['all'::text, 'only'::text, 'except'::text]))),
  CONSTRAINT "mobile_notification_rules_lists_check"
    CHECK
    (((cardinality(lab_slugs) <= 200) AND (cardinality(provider_slugs) <= 200) AND (cardinality(model_slugs) <= 200) AND (cardinality(input_modalities) <= 20) AND
    (cardinality(output_modalities) <= 20))),
  CONSTRAINT "mobile_notification_rules_name_check" CHECK (((name IS NULL) OR ((char_length(name) >= 1) AND (char_length(name) <= 80)))),
  CONSTRAINT "mobile_notification_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "mobile_notification_rules_position_check" CHECK ((("position" >= 0) AND ("position" <= 10000))),
  CONSTRAINT "mobile_notification_rules_provider_mode_check" CHECK ((provider_mode = ANY (ARRAY['all'::text, 'only'::text, 'except'::text]))),
  CONSTRAINT "mobile_notification_rules_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mobile_notification_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_notification_rules_user_idx ON public.mobile_notification_rules USING btree (user_id, "position", created_at);

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_notification_rules"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."mobile_notification_rules" IS 'User-written mobile push rules. A device is notified when one enabled notify rule matches an event and no enabled mute rule does. Lists left empty match anything; at most 50 rules per user, enforced by the API.';

REVOKE ALL ON TABLE "public"."mobile_notification_rules" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mobile_notification_rules" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_notification_rules" FROM "anon", "authenticated";

-- Users who opted in to new-model pushes keep them: push on, with one rule for every lab.
INSERT INTO public.mobile_notification_rules (user_id, name, event_kinds)
SELECT p.user_id, 'New models', ARRAY['model_released']
FROM public.mobile_notification_preferences p
WHERE p.new_model_releases_enabled
  AND NOT EXISTS (SELECT 1 FROM public.mobile_notification_rules r WHERE r.user_id = p.user_id);

UPDATE public.mobile_notification_preferences
SET enabled = true, updated_at = now()
WHERE new_model_releases_enabled AND NOT enabled;

CREATE TABLE "public"."catalogue_notification_events" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "kind"                    text                     NOT NULL,
  "dedupe_key"              text                     NOT NULL,
  "model_slug"              text,
  "lab_slug"                text,
  "provider_slug"           text,
  "title"                   text                     NOT NULL,
  "body"                    text                     NOT NULL,
  "href"                    text                     NOT NULL,
  "payload"                 jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "source_history_event_id" bigint,
  "occurred_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "fanned_out_at"           timestamp with time zone,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalogue_notification_events_body_check" CHECK ((char_length(body) <= 1000)),
  CONSTRAINT "catalogue_notification_events_dedupe_key_key" UNIQUE (dedupe_key),
  CONSTRAINT "catalogue_notification_events_kind_check"
    CHECK ((kind = ANY (ARRAY['model_released'::text, 'gateway_available'::text, 'price_changed'::text, 'deprecation_announced'::text, 'provider_added'::text]))),
  CONSTRAINT "catalogue_notification_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "catalogue_notification_events_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 300)))
);

ALTER TABLE "public"."catalogue_notification_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX catalogue_notification_events_model_idx ON public.catalogue_notification_events USING btree (model_slug, created_at DESC);

CREATE INDEX catalogue_notification_events_unfanned_idx ON public.catalogue_notification_events USING btree (created_at, id)
  WHERE (fanned_out_at IS NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."catalogue_notification_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."catalogue_notification_events" IS 'Channel-neutral public catalogue events (releases, Phaseo availability, price changes, deprecations, new providers), one per dedupe key. Mobile push fans them out to devices; other channels can read them too.';

REVOKE ALL ON TABLE "public"."catalogue_notification_events" FROM "service_role";

GRANT SELECT ON TABLE "public"."catalogue_notification_events" TO "service_role";

REVOKE ALL ON TABLE "public"."catalogue_notification_events" FROM "anon", "authenticated";

CREATE TABLE "public"."catalogue_notification_cursors" (
  "source"                text                     NOT NULL,
  "last_history_event_id" bigint                   NOT NULL DEFAULT 0,
  "checkpoint_event_id"   bigint,
  "checkpoint_xmax"       bigint,
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalogue_notification_cursors_checkpoint_check" CHECK (((checkpoint_event_id IS NULL) = (checkpoint_xmax IS NULL))),
  CONSTRAINT "catalogue_notification_cursors_pkey" PRIMARY KEY (source)
);

ALTER TABLE "public"."catalogue_notification_cursors"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."catalogue_notification_cursors"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."catalogue_notification_cursors"."checkpoint_event_id" IS 'History sequence position recorded by the previous capture. Rows up to it are read once every transaction older than checkpoint_xmax has finished, so rows committed out of id order are never skipped.';

COMMENT ON TABLE "public"."catalogue_notification_cursors" IS 'Read positions of capture_catalogue_notification_events in its append-only sources.';

REVOKE ALL ON TABLE "public"."catalogue_notification_cursors" FROM "service_role";

GRANT SELECT ON TABLE "public"."catalogue_notification_cursors" TO "service_role";

REVOKE ALL ON TABLE "public"."catalogue_notification_cursors" FROM "anon", "authenticated";

CREATE TABLE "public"."catalogue_notification_skipped_transactions" (
  "transaction_id"         bigint                   NOT NULL,
  "model_count"            integer                  NOT NULL,
  "row_count"              integer                  NOT NULL,
  "first_history_event_id" bigint                   NOT NULL,
  "recorded_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalogue_notification_skipped_transactions_pkey" PRIMARY KEY (transaction_id)
);

ALTER TABLE "public"."catalogue_notification_skipped_transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."catalogue_notification_skipped_transactions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."catalogue_notification_skipped_transactions" IS 'Catalogue transactions that touched too many models to be news (bulk syncs, backfills). Their history rows produce no notification events.';

REVOKE ALL ON TABLE "public"."catalogue_notification_skipped_transactions" FROM "service_role";

GRANT SELECT ON TABLE "public"."catalogue_notification_skipped_transactions" TO "service_role";

REVOKE ALL ON TABLE "public"."catalogue_notification_skipped_transactions" FROM "anon", "authenticated";

CREATE TABLE "public"."mobile_push_deliveries" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"           uuid                     NOT NULL,
  "device_id"          uuid                     NOT NULL,
  "user_id"            uuid                     NOT NULL,
  "rule_id"            uuid,
  "status"             text                     NOT NULL DEFAULT 'pending'::text,
  "not_before"         timestamp with time zone NOT NULL DEFAULT now(),
  "attempts"           integer                  NOT NULL DEFAULT 0,
  "claim_token"        uuid,
  "claimed_at"         timestamp with time zone,
  "expo_ticket_id"     text,
  "receipt_checked_at" timestamp with time zone,
  "error_code"         text,
  "error_message"      text,
  "sent_at"            timestamp with time zone,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mobile_push_deliveries_attempts_check" CHECK ((attempts >= 0)),
  CONSTRAINT "mobile_push_deliveries_event_id_device_id_key" UNIQUE (event_id, device_id),
  CONSTRAINT "mobile_push_deliveries_pkey" PRIMARY KEY (id),
  CONSTRAINT "mobile_push_deliveries_status_check"
    CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'deferred'::text, 'suppressed'::text]))),
  CONSTRAINT "mobile_push_deliveries_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.mobile_push_devices(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.catalogue_notification_events(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES public.mobile_notification_rules(id) ON DELETE SET NULL,
  CONSTRAINT "mobile_push_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mobile_push_deliveries"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_push_deliveries_device_idx ON public.mobile_push_deliveries USING btree (device_id, created_at DESC);

CREATE INDEX mobile_push_deliveries_due_idx ON public.mobile_push_deliveries USING btree (not_before, created_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'deferred'::text]));

CREATE INDEX mobile_push_deliveries_processing_idx ON public.mobile_push_deliveries USING btree (claimed_at)
  WHERE (status = 'processing'::text);

CREATE INDEX mobile_push_deliveries_receipts_idx ON public.mobile_push_deliveries USING btree (sent_at)
  WHERE ((status = 'sent'::text) AND (expo_ticket_id IS NOT NULL) AND (receipt_checked_at IS NULL));

CREATE INDEX mobile_push_deliveries_rule_idx ON public.mobile_push_deliveries USING btree (rule_id)
  WHERE (rule_id IS NOT NULL);

CREATE INDEX mobile_push_deliveries_user_created_idx ON public.mobile_push_deliveries USING btree (user_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_push_deliveries"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."mobile_push_deliveries" IS 'One mobile push per catalogue event and device. Deferred rows wait for quiet hours to end; suppressed rows were over the daily cap or no longer wanted. Claimed with a token so overlapping runs never send twice.';

REVOKE ALL ON TABLE "public"."mobile_push_deliveries" FROM "service_role";

GRANT SELECT ON TABLE "public"."mobile_push_deliveries" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_push_deliveries" FROM "anon", "authenticated";

-- Close the legacy queue so nothing can ever send from it, and stop filling it.
DROP TRIGGER IF EXISTS enqueue_public_model_release_push ON public.v2_models;

DROP FUNCTION IF EXISTS public.enqueue_public_model_release_push();

UPDATE public.model_release_push_events
SET status = 'failed',
    last_error = 'expired: superseded by catalogue_notification_events',
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
WHERE status IN ('pending', 'processing');

UPDATE public.model_release_push_attempts
SET status = 'failed', error_code = 'expired', error_message = 'superseded by mobile_push_deliveries', updated_at = now()
WHERE status = 'pending';

COMMENT ON TABLE "public"."model_release_push_events" IS 'Legacy model release push queue from the August 2026 attempt. Superseded by catalogue_notification_events and mobile_push_deliveries; nothing writes or reads it.';

COMMENT ON TABLE "public"."model_release_push_attempts" IS 'Legacy per-device state for model_release_push_events. Superseded by mobile_push_deliveries; nothing writes or reads it.';

CREATE OR REPLACE FUNCTION private.catalogue_notification_usd (
  p_amount numeric
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Plain dollar amounts for notification text: $15, $2.50, $0.28, $0.075.
  select '$' || case
    when p_amount is null then '?'
    when p_amount = trunc(p_amount) then trunc(p_amount)::text
    when round(p_amount, 2) = p_amount then to_char(p_amount, 'FM999999999990.00')
    else trim_scale(round(p_amount, 8))::text
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."catalogue_notification_usd"(numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."catalogue_notification_usd"(numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."catalogue_notification_usd"(numeric) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_notification_rule_matches (
  p_rule              public.mobile_notification_rules,
  p_kind              text,
  p_lab_slug          text,
  p_provider_slug     text,
  p_model_slug        text,
  p_input_modalities  text[],
  p_output_modalities text[],
  p_on_phaseo         boolean
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Lists left empty match anything. An event without a lab or provider matches "all" and
  -- "except" but never "only". Modality lists are all required. Mute rules ignore
  -- include_free_variants, so muting a lab also mutes its free variants.
  select p_rule.enabled
    and p_kind = any (p_rule.event_kinds)
    and (
      p_rule.lab_mode = 'all'
      or (p_rule.lab_mode = 'only' and coalesce(p_lab_slug = any (p_rule.lab_slugs), false))
      or (p_rule.lab_mode = 'except' and not coalesce(p_lab_slug = any (p_rule.lab_slugs), false))
    )
    and (
      p_rule.provider_mode = 'all'
      or (p_rule.provider_mode = 'only' and coalesce(p_provider_slug = any (p_rule.provider_slugs), false))
      or (p_rule.provider_mode = 'except' and not coalesce(p_provider_slug = any (p_rule.provider_slugs), false))
    )
    and (cardinality(p_rule.model_slugs) = 0 or coalesce(p_model_slug = any (p_rule.model_slugs), false))
    and (cardinality(p_rule.input_modalities) = 0 or coalesce(p_input_modalities @> p_rule.input_modalities, false))
    and (cardinality(p_rule.output_modalities) = 0 or coalesce(p_output_modalities @> p_rule.output_modalities, false))
    and (not p_rule.only_on_phaseo or coalesce(p_on_phaseo, false))
    and (p_rule.action = 'mute' or p_rule.include_free_variants or p_model_slug is null or p_model_slug !~ ':free$');
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_notification_rule_matches"(public.mobile_notification_rules, text, text, text, text, text[], text[], boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_notification_rule_matches"(public.mobile_notification_rules, text, text, text, text, text[], text[], boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_notification_rule_matches"(public.mobile_notification_rules, text, text, text, text, text[], text[], boolean) TO "postgres";

CREATE OR REPLACE FUNCTION private.record_model_released_notification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The public announcer marks a model announced once it is public and available or in
-- preview, after its public post went out. That transition is the release signal; a
-- model is only ever released once, however often it is announced again.
begin
  insert into public.catalogue_notification_events (kind, dedupe_key, model_slug, lab_slug, title, body, href, payload, occurred_at)
  select
    'model_released',
    'model_released:' || m.model_slug,
    m.model_slug,
    m.lab_slug,
    left(coalesce(nullif(btrim(l.name), ''), m.lab_slug) || ' released ' || coalesce(nullif(btrim(m.name), ''), m.model_slug), 300),
    case
      when exists (
        select 1 from public.v2_model_provider_routes r
        where r.model_slug = m.model_slug and r.routing_enabled and r.access_scope = 'public'
          and not r.is_stealth and r.status in ('active', 'degraded')
      ) then 'You can use it on Phaseo now.'
      else 'See the details on Phaseo.'
    end,
    '/models/' || m.model_slug,
    jsonb_build_object('modelName', m.name, 'labName', l.name, 'catalogueStatus', m.catalogue_status),
    coalesce(new.announced_at, now())
  from public.v2_models m
  left join public.v2_labs l on l.lab_slug = m.lab_slug
  where m.model_slug = new.model_slug
    and public.catalog_model_is_public(m.model_slug)
  on conflict (dedupe_key) do nothing;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."record_model_released_notification"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."record_model_released_notification"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."record_model_released_notification"() TO "postgres";

CREATE TRIGGER record_model_released_notification
  AFTER UPDATE OF status ON public.model_discovery_public_announcements
  FOR EACH ROW
  WHEN (((new.status = 'announced'::text) AND (old.status IS DISTINCT FROM 'announced'::text)))
  EXECUTE FUNCTION private.record_model_released_notification();

CREATE OR REPLACE FUNCTION public.capture_catalogue_notification_events (
  p_limit                      integer DEFAULT 2000,
  p_max_models_per_transaction integer DEFAULT 20
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Turns new v2_catalogue_row_history rows about public models into notification events:
--   gateway_available      the first public route Phaseo routes for a model
--   provider_added         a further provider routed for a model already on Phaseo
--   price_changed          a standard, global price of a public route changed, in place or
--                          through a new SKU version (one event per model, provider and transaction)
--   deprecation_announced  a model newly marked deprecated or retired
-- model_released comes from the public announcer (private.record_model_released_notification).
--
-- Rows are read in id order, but only up to the sequence position the previous call recorded
-- and only once every transaction older than that call has finished, so a long transaction
-- that commits after later ids cannot be skipped. A transaction touching more than
-- p_max_models_per_transaction models is a bulk sync or backfill: it is recorded and skipped.
-- Rows older than two days only move the cursor, so resuming the job sends no stale news.
declare
  v_source constant text := 'v2_catalogue_row_history';
  v_cursor public.catalogue_notification_cursors%rowtype;
  v_sequence bigint;
  v_xmin bigint;
  v_xmax bigint;
  v_upper bigint;
  v_last bigint;
  v_ids bigint[] := '{}';
  v_relevant bigint[] := '{}';
  v_scanned integer := 0;
  v_skipped integer := 0;
  v_emitted integer := 0;
  v_count integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid_catalogue_notification_capture_limit';
  end if;
  if p_max_models_per_transaction is null or p_max_models_per_transaction < 1 then
    raise exception 'invalid_catalogue_notification_bulk_threshold';
  end if;

  select * into v_cursor from public.catalogue_notification_cursors c where c.source = v_source for update;

  -- Sequence first, then the snapshot: any transaction that takes a history id after this
  -- read was given its transaction id after the snapshot, so it is at or above v_xmax.
  v_sequence := coalesce(pg_catalog.pg_sequence_last_value(
    pg_catalog.pg_get_serial_sequence('public.v2_catalogue_row_history', 'event_id')::regclass), 0);
  v_xmin := pg_catalog.pg_snapshot_xmin(pg_catalog.pg_current_snapshot())::text::bigint;
  v_xmax := pg_catalog.pg_snapshot_xmax(pg_catalog.pg_current_snapshot())::text::bigint;

  if v_cursor.source is null then
    -- First run: start from now rather than replaying the whole history.
    insert into public.catalogue_notification_cursors (source, last_history_event_id, checkpoint_event_id, checkpoint_xmax)
    values (v_source, v_sequence, v_sequence, v_xmax)
    on conflict (source) do nothing;
    return jsonb_build_object('initialized', true, 'scanned', 0, 'emitted', 0, 'skippedTransactions', 0, 'cursor', v_sequence);
  end if;

  if v_cursor.checkpoint_xmax is not null and v_xmin >= v_cursor.checkpoint_xmax then
    v_upper := v_cursor.checkpoint_event_id;
  end if;

  if v_upper is not null and v_upper > v_cursor.last_history_event_id then
    select coalesce(array_agg(w.event_id order by w.event_id), '{}'), max(w.event_id), count(*)
      into v_ids, v_last, v_scanned
    from (
      select h.event_id
      from public.v2_catalogue_row_history h
      where h.event_id > v_cursor.last_history_event_id and h.event_id <= v_upper
      order by h.event_id
      limit p_limit
    ) w;
    if v_scanned < p_limit then
      v_last := v_upper;
    end if;

    insert into public.catalogue_notification_skipped_transactions as s (transaction_id, model_count, row_count, first_history_event_id)
    select h.transaction_id, count(distinct h.model_slug)::integer, count(*)::integer, min(h.event_id)
    from public.v2_catalogue_row_history h
    where h.event_id = any (v_ids) and h.operation <> 'BASELINE'
    group by h.transaction_id
    having count(distinct h.model_slug) > p_max_models_per_transaction
    on conflict (transaction_id) do update
      set model_count = greatest(s.model_count, excluded.model_count),
          row_count = s.row_count + excluded.row_count,
          first_history_event_id = least(s.first_history_event_id, excluded.first_history_event_id);
    get diagnostics v_skipped = row_count;

    select coalesce(array_agg(h.event_id), '{}') into v_relevant
    from public.v2_catalogue_row_history h
    where h.event_id = any (v_ids)
      and h.operation in ('INSERT', 'UPDATE')
      and h.table_name in ('v2_models', 'v2_model_provider_routes', 'v2_pricing_sku_meters')
      and h.model_slug is not null
      and h.recorded_at > now() - interval '2 days'
      and not exists (
        select 1 from public.catalogue_notification_skipped_transactions s where s.transaction_id = h.transaction_id
      );

    -- Routing switched on for a public route.
    insert into public.catalogue_notification_events (
      kind, dedupe_key, model_slug, lab_slug, provider_slug, title, body, href, payload, source_history_event_id, occurred_at
    )
    select distinct on (c.dedupe_key)
      c.kind,
      c.dedupe_key,
      c.model_slug,
      c.lab_slug,
      c.provider_slug,
      left(case
        when c.kind = 'gateway_available' then c.model_name || ' is now on Phaseo'
        else c.model_name || ' is now available from ' || c.provider_name
      end, 300),
      left(case
        when c.kind = 'gateway_available' then 'You can now use it through Phaseo, served by ' || c.provider_name || '.'
        else c.provider_name || ' is now a provider for ' || c.model_name || ' on Phaseo.'
      end, 1000),
      '/models/' || c.model_slug,
      jsonb_build_object('modelName', c.model_name, 'labName', c.lab_name, 'providerName', c.provider_name, 'providerModelId', c.provider_model_id),
      c.event_id,
      c.recorded_at
    from (
      select
        h.event_id,
        h.recorded_at,
        r.model_slug,
        r.provider_slug,
        r.provider_model_id,
        m.lab_slug,
        coalesce(nullif(btrim(m.name), ''), m.model_slug) as model_name,
        coalesce(nullif(btrim(l.name), ''), m.lab_slug) as lab_name,
        coalesce(nullif(btrim(p.name), ''), r.provider_slug) as provider_name,
        case when routed_before.model_on_phaseo then 'provider_added' else 'gateway_available' end as kind,
        case
          when routed_before.model_on_phaseo then 'provider_added:' || r.model_slug || ':' || r.provider_slug
          else 'gateway_available:' || r.model_slug
        end as dedupe_key,
        routed_before.provider_on_phaseo
      from public.v2_catalogue_row_history h
      join public.v2_model_provider_routes r on r.provider_model_id = h.after_state ->> 'provider_model_id'
      join public.v2_models m on m.model_slug = r.model_slug
      left join public.v2_labs l on l.lab_slug = m.lab_slug
      left join public.v2_providers p on p.provider_slug = r.provider_slug
      cross join lateral (
        -- Routed before: by an earlier transaction in the history, or by another route that is
        -- routed now and was not switched on in this same transaction.
        select
          exists (
            select 1 from public.v2_catalogue_row_history e
            where e.model_slug = r.model_slug and e.event_id < h.event_id and e.transaction_id <> h.transaction_id
              and e.table_name = 'v2_model_provider_routes'
              and e.after_state ->> 'routing_enabled' = 'true'
              and coalesce(e.after_state ->> 'access_scope', 'public') = 'public'
              and coalesce(e.after_state ->> 'is_stealth', 'false') <> 'true'
          ) or exists (
            select 1 from public.v2_model_provider_routes o
            where o.model_slug = r.model_slug and o.provider_model_id <> r.provider_model_id
              and o.routing_enabled and o.access_scope = 'public' and not o.is_stealth
              and not exists (
                select 1 from public.v2_catalogue_row_history t
                where t.model_slug = r.model_slug and t.transaction_id = h.transaction_id
                  and t.table_name = 'v2_model_provider_routes' and t.after_state ->> 'provider_model_id' = o.provider_model_id
              )
          ) as model_on_phaseo,
          exists (
            select 1 from public.v2_catalogue_row_history e
            where e.model_slug = r.model_slug and e.event_id < h.event_id and e.transaction_id <> h.transaction_id
              and e.table_name = 'v2_model_provider_routes'
              and e.after_state ->> 'provider_slug' = r.provider_slug
              and e.after_state ->> 'routing_enabled' = 'true'
              and coalesce(e.after_state ->> 'access_scope', 'public') = 'public'
              and coalesce(e.after_state ->> 'is_stealth', 'false') <> 'true'
          ) or exists (
            select 1 from public.v2_model_provider_routes o
            where o.model_slug = r.model_slug and o.provider_slug = r.provider_slug and o.provider_model_id <> r.provider_model_id
              and o.routing_enabled and o.access_scope = 'public' and not o.is_stealth
              and not exists (
                select 1 from public.v2_catalogue_row_history t
                where t.model_slug = r.model_slug and t.transaction_id = h.transaction_id
                  and t.table_name = 'v2_model_provider_routes' and t.after_state ->> 'provider_model_id' = o.provider_model_id
              )
          ) as provider_on_phaseo
      ) routed_before
      where h.event_id = any (v_relevant)
        and h.table_name = 'v2_model_provider_routes'
        and h.after_state ->> 'routing_enabled' = 'true'
        and coalesce(h.before_state ->> 'routing_enabled', 'false') <> 'true'
        and r.routing_enabled and r.access_scope = 'public' and not r.is_stealth and r.status in ('active', 'degraded')
        and public.catalog_model_is_public(r.model_slug)
    ) c
    where not c.provider_on_phaseo
    order by c.dedupe_key, c.event_id
    on conflict (dedupe_key) do nothing;
    get diagnostics v_count = row_count;
    v_emitted := v_emitted + v_count;

    -- Price changes on the standard global price of a public route.
    with changed as (
      select
        h.event_id,
        h.transaction_id,
        h.recorded_at,
        s.provider_model_id,
        s.effective_from,
        h.after_state ->> 'meter_key' as meter_key,
        h.after_state ->> 'modality' as modality,
        h.after_state ->> 'direction' as direction,
        h.after_state ->> 'unit' as unit,
        nullif(btrim(h.after_state ->> 'display_unit'), '') as display_unit,
        nullif(btrim(h.after_state ->> 'display_label'), '') as display_label,
        coalesce((h.after_state ->> 'meter_order')::integer, 100) as meter_order,
        (h.after_state ->> 'unit_quantity')::numeric as unit_quantity,
        (h.after_state ->> 'price_nanos')::numeric / (h.after_state ->> 'unit_quantity')::numeric as new_per_unit,
        previous.price_nanos / nullif(previous.unit_quantity, 0) as old_per_unit
      from public.v2_catalogue_row_history h
      join public.v2_pricing_skus s on s.sku_id = (h.after_state ->> 'sku_id')::uuid
      cross join lateral (
        -- The price this row replaced: its own previous value, or the same meter on the
        -- previous version of the SKU.
        select (h.before_state ->> 'price_nanos')::numeric as price_nanos, (h.before_state ->> 'unit_quantity')::numeric as unit_quantity
        where h.operation = 'UPDATE'
        union all
        select * from (
          select pm.price_nanos, pm.unit_quantity
          from public.v2_pricing_skus ps
          join public.v2_pricing_sku_meters pm on pm.sku_id = ps.sku_id and pm.meter_key = h.after_state ->> 'meter_key' and pm.billable
          where h.operation = 'INSERT' and ps.provider_model_id = s.provider_model_id and ps.sku_code = s.sku_code and ps.version < s.version
          order by ps.version desc
          limit 1
        ) previous_version
      ) previous
      where h.event_id = any (v_relevant)
        and h.table_name = 'v2_pricing_sku_meters'
        and coalesce(h.after_state ->> 'billable', 'true') = 'true'
        and (h.after_state ->> 'meter_key') !~ 'cache'
        and (h.after_state ->> 'unit_quantity')::numeric > 0
        and s.region is null and coalesce(s.service_tier_slug, 'standard') = 'standard'
        -- The SKU was live when the price changed; one superseded since still reports it.
        and s.status in ('active', 'deprecated')
        and (s.effective_to is null or s.effective_to > h.recorded_at)
    ),
    described as (
      select distinct on (r.model_slug, r.provider_slug, c.transaction_id, c.meter_key)
        c.*,
        r.model_slug,
        r.provider_slug,
        case when c.modality = 'text' and c.direction = 'input' then 0 when c.modality = 'text' and c.direction = 'output' then 1 else 2 end as headline_rank,
        case
          when c.modality = 'text' and c.direction in ('input', 'output') then c.direction
          else lower(coalesce(c.display_label, c.meter_key))
        end as label,
        case when c.unit = 'token' then '1M tokens' else coalesce(c.display_unit, c.unit) end as unit_label,
        case when c.unit = 'token' then c.old_per_unit / 1000 else c.old_per_unit * c.unit_quantity / 1000000000 end as old_amount,
        case when c.unit = 'token' then c.new_per_unit / 1000 else c.new_per_unit * c.unit_quantity / 1000000000 end as new_amount
      from changed c
      join public.v2_model_provider_routes r on r.provider_model_id = c.provider_model_id
      where c.old_per_unit is not null and c.old_per_unit <> c.new_per_unit
        and r.access_scope = 'public' and not r.is_stealth and r.status in ('active', 'degraded')
        and public.catalog_model_is_public(r.model_slug)
      order by r.model_slug, r.provider_slug, c.transaction_id, c.meter_key, c.event_id
    ),
    grouped as (
      select
        d.model_slug,
        d.provider_slug,
        d.transaction_id,
        min(d.event_id) as event_id,
        max(d.recorded_at) as recorded_at,
        max(d.effective_from) as effective_from,
        jsonb_agg(jsonb_build_object(
          'meter', d.meter_key, 'label', d.label, 'unit', d.unit_label, 'old', d.old_amount, 'new', d.new_amount,
          'direction', case when d.new_amount < d.old_amount then 'down' else 'up' end
        ) order by d.headline_rank, d.meter_order, d.meter_key) as changes
      from described d
      group by d.model_slug, d.provider_slug, d.transaction_id
    )
    insert into public.catalogue_notification_events (
      kind, dedupe_key, model_slug, lab_slug, provider_slug, title, body, href, payload, source_history_event_id, occurred_at
    )
    select
      'price_changed',
      'price_changed:' || g.model_slug || ':' || g.provider_slug || ':' || g.transaction_id,
      g.model_slug,
      m.lab_slug,
      g.provider_slug,
      left(v.model_name || ' ' || (g.changes -> 0 ->> 'label') || ' price '
        || case
          when v.scheduled then case when g.changes -> 0 ->> 'direction' = 'down' then 'will fall' else 'will rise' end
          else case when g.changes -> 0 ->> 'direction' = 'down' then 'fell' else 'rose' end
        end
        || ' from ' || private.catalogue_notification_usd((g.changes -> 0 ->> 'old')::numeric)
        || ' to ' || private.catalogue_notification_usd((g.changes -> 0 ->> 'new')::numeric)
        || ' per ' || (g.changes -> 0 ->> 'unit')
        || case when v.scheduled then ' on ' || to_char(g.effective_from at time zone 'UTC', 'FMDD Mon YYYY') else '' end, 300),
      left('From ' || v.provider_name || '.' || coalesce((
        select string_agg(
          ' ' || upper(left(x.change ->> 'label', 1)) || substr(x.change ->> 'label', 2) || ': '
            || private.catalogue_notification_usd((x.change ->> 'old')::numeric) || ' to '
            || private.catalogue_notification_usd((x.change ->> 'new')::numeric) || ' per ' || (x.change ->> 'unit') || '.',
          '' order by x.ord)
        from jsonb_array_elements(g.changes) with ordinality as x(change, ord)
        where x.ord > 1
      ), ''), 1000),
      '/models/' || g.model_slug,
      jsonb_build_object(
        'modelName', v.model_name, 'providerName', v.provider_name, 'direction', g.changes -> 0 ->> 'direction',
        'effectiveFrom', g.effective_from, 'changes', g.changes
      ),
      g.event_id,
      g.recorded_at
    from grouped g
    join public.v2_models m on m.model_slug = g.model_slug
    left join public.v2_providers p on p.provider_slug = g.provider_slug
    cross join lateral (
      select
        coalesce(nullif(btrim(m.name), ''), m.model_slug) as model_name,
        coalesce(nullif(btrim(p.name), ''), g.provider_slug) as provider_name,
        g.effective_from > now() + interval '1 hour' as scheduled
    ) v
    on conflict (dedupe_key) do nothing;
    get diagnostics v_count = row_count;
    v_emitted := v_emitted + v_count;

    -- A model newly marked deprecated or retired, and still marked now.
    insert into public.catalogue_notification_events (
      kind, dedupe_key, model_slug, lab_slug, title, body, href, payload, source_history_event_id, occurred_at
    )
    select distinct on (m.model_slug)
      'deprecation_announced',
      'deprecation_announced:' || m.model_slug,
      m.model_slug,
      m.lab_slug,
      left(case
        when v.retires_at > now() then v.model_name || ' will be retired on ' || to_char(v.retires_at at time zone 'UTC', 'FMDD Mon YYYY')
        when v.retires_at is not null or m.status = 'retired' or m.catalogue_status = 'retired' then v.model_name || ' has been retired'
        else v.model_name || ' is deprecated'
      end, 300),
      left(v.lab_name || ' has deprecated ' || v.model_name || '.'
        || coalesce(' Suggested replacement: ' || nullif(btrim(replacement.name), '') || '.', ''), 1000),
      '/models/' || m.model_slug,
      jsonb_build_object(
        'modelName', v.model_name, 'labName', v.lab_name, 'deprecatedAt', m.deprecated_at, 'retiresAt', v.retires_at,
        'replacementModelId', replacement.model_slug
      ),
      h.event_id,
      h.recorded_at
    from public.v2_catalogue_row_history h
    join public.v2_models m on m.model_slug = h.model_slug
    left join public.v2_labs l on l.lab_slug = m.lab_slug
    left join public.v2_models replacement
      on replacement.model_slug = m.replacement_model_slug and public.catalog_model_is_public(replacement.model_slug)
    cross join lateral (
      select
        coalesce(m.retired_at, m.removal_date) as retires_at,
        coalesce(nullif(btrim(m.name), ''), m.model_slug) as model_name,
        coalesce(nullif(btrim(l.name), ''), m.lab_slug) as lab_name
    ) v
    where h.event_id = any (v_relevant)
      and h.table_name = 'v2_models'
      and h.operation = 'UPDATE'
      and not (
        coalesce(h.before_state ->> 'status', '') in ('deprecated', 'retired')
        or coalesce(h.before_state ->> 'catalogue_status', '') in ('deprecated', 'retired')
        or h.before_state ->> 'deprecated_at' is not null
        or h.before_state ->> 'retired_at' is not null
      )
      and (
        coalesce(h.after_state ->> 'status', '') in ('deprecated', 'retired')
        or coalesce(h.after_state ->> 'catalogue_status', '') in ('deprecated', 'retired')
        or h.after_state ->> 'deprecated_at' is not null
        or h.after_state ->> 'retired_at' is not null
      )
      and (
        m.status in ('deprecated', 'retired') or m.catalogue_status in ('deprecated', 'retired')
        or m.deprecated_at is not null or m.retired_at is not null
      )
      and public.catalog_model_is_public(m.model_slug)
    order by m.model_slug, h.event_id
    on conflict (dedupe_key) do nothing;
    get diagnostics v_count = row_count;
    v_emitted := v_emitted + v_count;

    update public.catalogue_notification_cursors
    set last_history_event_id = v_last, updated_at = now()
    where source = v_source;
    v_cursor.last_history_event_id := v_last;
  end if;

  -- Record the next checkpoint once the current one has been read up to.
  if v_cursor.checkpoint_xmax is null or v_cursor.last_history_event_id >= v_cursor.checkpoint_event_id then
    update public.catalogue_notification_cursors
    set checkpoint_event_id = greatest(v_sequence, v_cursor.last_history_event_id), checkpoint_xmax = v_xmax, updated_at = now()
    where source = v_source;
  end if;

  return jsonb_build_object(
    'initialized', false,
    'scanned', v_scanned,
    'emitted', v_emitted,
    'skippedTransactions', v_skipped,
    'cursor', v_cursor.last_history_event_id
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."capture_catalogue_notification_events"(integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."capture_catalogue_notification_events"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."capture_catalogue_notification_events"(integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."capture_catalogue_notification_events"(integer, integer) FROM PUBLIC, "anon", "authenticated";

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
-- has since switched push off, are closed first instead of sent.
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
      updated_at = now()
  from public.mobile_push_devices dev
  left join public.mobile_notification_preferences p on p.user_id = dev.user_id
  where dev.id = x.device_id
    and x.status in ('pending', 'deferred')
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

CREATE OR REPLACE FUNCTION public.complete_mobile_push_deliveries (
  p_claim_token uuid,
  p_results     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records one batch of Expo results: [{ "id", "status": "sent" | "failed" | "retry",
-- "ticketId", "errorCode", "errorMessage" }]. Only rows still held by this claim change.
-- Retries back off from 30 seconds to an hour and give up after five attempts.
-- DeviceNotRegistered retires the device.
declare
  v_result jsonb;
begin
  if p_claim_token is null or jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_mobile_push_results';
  end if;

  with results as (
    select distinct on (r.id)
      r.id,
      r.status,
      left(r."ticketId", 200) as ticket_id,
      left(r."errorCode", 100) as error_code,
      left(r."errorMessage", 1000) as error_message
    from jsonb_to_recordset(p_results) as r(id uuid, status text, "ticketId" text, "errorCode" text, "errorMessage" text)
    where r.id is not null and r.status in ('sent', 'failed', 'retry')
    order by r.id
  ),
  completed as (
    update public.mobile_push_deliveries x
    set status = case when r.status = 'sent' then 'sent' when r.status = 'retry' and x.attempts < 5 then 'pending' else 'failed' end,
        not_before = case
          when r.status = 'retry' and x.attempts < 5 then now() + make_interval(secs => least(3600, 30 * power(2, x.attempts)))
          else x.not_before
        end,
        expo_ticket_id = case when r.status = 'sent' then r.ticket_id end,
        sent_at = case when r.status = 'sent' then now() end,
        error_code = case when r.status = 'sent' then null else coalesce(r.error_code, 'push_failed') end,
        error_message = case when r.status = 'sent' then null else r.error_message end,
        claim_token = null,
        claimed_at = null,
        updated_at = now()
    from results r
    where x.id = r.id and x.claim_token = p_claim_token and x.status = 'processing'
    returning x.device_id, x.status, x.error_code
  ),
  invalidated as (
    update public.mobile_push_devices dev
    set status = 'invalid', invalidated_at = now(), updated_at = now()
    where dev.id in (select c.device_id from completed c where c.error_code = 'DeviceNotRegistered')
      and dev.status = 'active'
    returning dev.id
  )
  select jsonb_build_object(
    'sent', count(*) filter (where c.status = 'sent'),
    'retrying', count(*) filter (where c.status = 'pending'),
    'failed', count(*) filter (where c.status = 'failed'),
    'invalidated', (select count(*) from invalidated)
  ) into v_result
  from completed c;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."complete_mobile_push_deliveries"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."complete_mobile_push_deliveries"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."complete_mobile_push_deliveries"(uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."complete_mobile_push_deliveries"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.claim_mobile_push_receipts (
  p_limit integer
)
  RETURNS TABLE (
    id             uuid,
    expo_ticket_id text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Hands out Expo tickets whose receipts should be ready (sent 15 minutes to a day ago) and
-- marks them checked, so each receipt is fetched once. Expo keeps receipts for a day;
-- older unchecked tickets are closed without a check.
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_mobile_push_receipt_limit';
  end if;

  update public.mobile_push_deliveries x
  set receipt_checked_at = now(), updated_at = now()
  where x.status = 'sent' and x.expo_ticket_id is not null and x.receipt_checked_at is null
    and x.sent_at <= now() - interval '1 day';

  return query
  with due as (
    select x.id
    from public.mobile_push_deliveries x
    where x.status = 'sent' and x.expo_ticket_id is not null and x.receipt_checked_at is null
      and x.sent_at <= now() - interval '15 minutes'
    order by x.sent_at, x.id
    for update skip locked
    limit p_limit
  )
  update public.mobile_push_deliveries x
  set receipt_checked_at = now(), updated_at = now()
  from due
  where x.id = due.id
  returning x.id, x.expo_ticket_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_receipts"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_receipts"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_receipts"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_receipts"(integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.record_mobile_push_receipts (
  p_results jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records receipts Expo reported as errors: [{ "id", "errorCode", "errorMessage" }]. The push
-- is marked failed and DeviceNotRegistered retires the device.
declare
  v_result jsonb;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_mobile_push_receipts';
  end if;

  with results as (
    select distinct on (r.id) r.id, left(r."errorCode", 100) as error_code, left(r."errorMessage", 1000) as error_message
    from jsonb_to_recordset(p_results) as r(id uuid, "errorCode" text, "errorMessage" text)
    where r.id is not null
    order by r.id
  ),
  failed as (
    update public.mobile_push_deliveries x
    set status = 'failed',
        error_code = coalesce(r.error_code, 'receipt_error'),
        error_message = r.error_message,
        updated_at = now()
    from results r
    where x.id = r.id and x.status = 'sent'
    returning x.device_id, x.error_code
  ),
  invalidated as (
    update public.mobile_push_devices dev
    set status = 'invalid', invalidated_at = now(), updated_at = now()
    where dev.id in (select f.device_id from failed f where f.error_code = 'DeviceNotRegistered')
      and dev.status = 'active'
    returning dev.id
  )
  select jsonb_build_object('failed', count(*), 'invalidated', (select count(*) from invalidated)) into v_result
  from failed;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.register_mobile_push_device (
  p_user_id         uuid,
  p_installation_id text,
  p_expo_push_token text,
  p_platform        text,
  p_time_zone       text,
  p_device_name     text,
  p_app_version     text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- One row per installation and per Expo token. When a token or installation turns up under
-- another account (sign-out then sign-in as someone else) or another installation, the old
-- row is replaced so the device never receives the previous account's pushes. A user keeps
-- at most 20 active devices; the least recently seen ones beyond that are disabled.
declare
  v_time_zone text := nullif(btrim(p_time_zone), '');
  v_device_id uuid;
begin
  if p_user_id is null or p_installation_id is null or p_expo_push_token is null then
    raise exception 'invalid_mobile_push_device';
  end if;

  -- Keep only zones this database can convert; anything else falls back to UTC.
  if v_time_zone is not null then
    begin
      perform now() at time zone v_time_zone;
    exception when others then
      v_time_zone := null;
    end;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile_push_device:' || p_expo_push_token, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile_push_installation:' || p_installation_id, 0));

  delete from public.mobile_push_devices d
  where (d.expo_push_token = p_expo_push_token or d.installation_id = p_installation_id)
    and not (d.user_id = p_user_id and d.installation_id = p_installation_id);

  insert into public.mobile_push_devices as d (
    user_id, installation_id, expo_push_token, platform, status, time_zone, device_name, app_version,
    last_seen_at, updated_at, invalidated_at
  )
  values (
    p_user_id, p_installation_id, p_expo_push_token, p_platform, 'active', v_time_zone,
    nullif(btrim(p_device_name), ''), nullif(btrim(p_app_version), ''), now(), now(), null
  )
  on conflict (user_id, installation_id) do update
    set expo_push_token = excluded.expo_push_token,
        platform = excluded.platform,
        status = 'active',
        time_zone = excluded.time_zone,
        device_name = excluded.device_name,
        app_version = excluded.app_version,
        last_seen_at = now(),
        updated_at = now(),
        invalidated_at = null
  returning d.id into v_device_id;

  update public.mobile_push_devices d
  set status = 'disabled', updated_at = now()
  where d.id in (
    select o.id from public.mobile_push_devices o
    where o.user_id = p_user_id and o.status = 'active' and o.id <> v_device_id
    order by o.last_seen_at desc, o.id
    offset 19
  );

  return v_device_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.reorder_mobile_notification_rules (
  p_user_id  uuid,
  p_rule_ids uuid[]
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Numbers the user's rules in the order given. The list must name each of their rules
-- exactly once; otherwise nothing changes and false is returned.
declare
  v_total integer;
begin
  if p_user_id is null or p_rule_ids is null then
    return false;
  end if;

  perform 1 from public.mobile_notification_rules r where r.user_id = p_user_id for update;
  select count(*) into v_total from public.mobile_notification_rules r where r.user_id = p_user_id;

  if cardinality(p_rule_ids) <> v_total
    or (select count(distinct x.rule_id) from unnest(p_rule_ids) as x(rule_id)) <> v_total
    or exists (
      select 1 from unnest(p_rule_ids) as x(rule_id)
      where x.rule_id is null or not exists (
        select 1 from public.mobile_notification_rules r where r.id = x.rule_id and r.user_id = p_user_id
      )
    ) then
    return false;
  end if;

  update public.mobile_notification_rules r
  set "position" = (o.ord - 1)::integer, updated_at = now()
  from unnest(p_rule_ids) with ordinality as o(rule_id, ord)
  where r.id = o.rule_id and r.user_id = p_user_id and r."position" <> (o.ord - 1)::integer;

  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."reorder_mobile_notification_rules"(uuid, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reorder_mobile_notification_rules"(uuid, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reorder_mobile_notification_rules"(uuid, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."reorder_mobile_notification_rules"(uuid, uuid[]) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.claim_mobile_push_test (
  p_user_id         uuid,
  p_installation_id text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Allows three test pushes per user in any ten minutes. Returns the device's token to send
-- to, or {"error": "device_not_registered" | "rate_limited", "retryAfterSeconds"}.
declare
  v_recent timestamp with time zone[];
  v_device_id uuid;
  v_token text;
begin
  if p_user_id is null or p_installation_id is null then
    return jsonb_build_object('error', 'device_not_registered');
  end if;

  select d.id, d.expo_push_token into v_device_id, v_token
  from public.mobile_push_devices d
  where d.user_id = p_user_id and d.installation_id = p_installation_id and d.status = 'active';
  if v_device_id is null then
    return jsonb_build_object('error', 'device_not_registered');
  end if;

  insert into public.mobile_notification_preferences (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select array(
    select t from unnest(p.test_push_sent_at) as t where t > now() - interval '10 minutes' order by t
  ) into v_recent
  from public.mobile_notification_preferences p
  where p.user_id = p_user_id
  for update;

  if cardinality(v_recent) >= 3 then
    return jsonb_build_object(
      'error', 'rate_limited',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_recent[1] + interval '10 minutes' - now()))))::integer
    );
  end if;

  update public.mobile_notification_preferences
  set test_push_sent_at = v_recent || now(), updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object('deviceId', v_device_id, 'expoPushToken', v_token);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) FROM PUBLIC, "anon", "authenticated";
