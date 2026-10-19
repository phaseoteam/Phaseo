-- Mobile push v2: notification categories, Android channel schemes, grouped pushes and
-- providers launching on Phaseo.
--   * Devices report the notification channel scheme the app has created; pushes go to a
--     category channel only from scheme 2, and to the single model-updates channel otherwise.
--   * Users can switch categories off (mobile_notification_preferences.categories); a missing
--     key means on. Fan-out and claiming both honour it.
--   * Deliveries settle for five minutes, and a device's deliveries that share a group key
--     (release:<lab>, provider:<provider>, price:<model>) are sent as one push, which also counts
--     what was sent for that group earlier the same UTC day and replaces it on screen by tag.
--     The daily cap counts a grouped push once.
--   * A bulk transaction that gives a provider its first public routes emits one
--     provider_launched event; rules about Phaseo availability or new providers match it.
-- Deliveries from the last two days take their group key so pushes already queued are grouped.
-- phaseo:allow-destructive-migration reason: register_mobile_push_device is recreated with a channel scheme argument and still deletes the stale device row when an Expo token or installation moves to another account; this migration drops no table, column or stored data.
SET local check_function_bodies = off;

ALTER TABLE "public"."mobile_push_devices"
  ADD COLUMN "channel_scheme" smallint NOT NULL DEFAULT 1,
  ADD CONSTRAINT "mobile_push_devices_channel_scheme_check" CHECK (((channel_scheme >= 1) AND (channel_scheme <= 100)));

COMMENT ON COLUMN "public"."mobile_push_devices"."channel_scheme" IS 'Android notification channels the installed app has created: 1 is the single model-updates channel, 2 adds one channel per category. Pushes use a category channel only from 2.';

ALTER TABLE "public"."mobile_notification_preferences"
  ADD COLUMN "categories" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT "mobile_notification_preferences_categories_check" CHECK ((jsonb_typeof(categories) = 'object'::text));

COMMENT ON COLUMN "public"."mobile_notification_preferences"."categories" IS 'Category switches: new-models, prices-providers, deprecations, money, traffic, security, jobs, account and digest map to true or false. A missing key means on.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."daily_cap" IS 'Most catalogue pushes each device receives in any 24 hours, where a grouped push counts once; later ones are recorded as suppressed.';

COMMENT ON TABLE "public"."mobile_notification_preferences" IS 'Per-user mobile push settings: master switch, categories, quiet hours and daily cap.';

ALTER TABLE "public"."mobile_push_deliveries"
  ADD COLUMN "group_key" text,
  ADD COLUMN "merged_into" uuid,
  ADD CONSTRAINT "mobile_push_deliveries_merged_into_fkey" FOREIGN KEY (merged_into) REFERENCES public.mobile_push_deliveries(id) ON DELETE SET NULL;

CREATE INDEX mobile_push_deliveries_merged_into_idx ON public.mobile_push_deliveries USING btree (merged_into)
  WHERE (merged_into IS NOT NULL);

COMMENT ON COLUMN "public"."mobile_push_deliveries"."group_key" IS 'Deliveries for one device that share a key and are due together go out as one push: release:<lab> for releases and Phaseo availability, provider:<provider> for new providers of a model, price:<model> for price changes. Null is sent alone.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."merged_into" IS 'The delivery whose push carried this one. Only that delivery holds the Expo ticket.';

COMMENT ON TABLE "public"."mobile_push_deliveries" IS 'One row per catalogue event and device. Rows wait five minutes to settle, and those due for the same device and group key are sent as one push. Deferred rows wait for quiet hours to end; suppressed rows were over the daily cap or no longer wanted. Claimed with a token so overlapping runs never send twice.';

ALTER TABLE "public"."catalogue_notification_events"
  DROP CONSTRAINT "catalogue_notification_events_kind_check",
  ADD CONSTRAINT "catalogue_notification_events_kind_check"
    CHECK
    ((kind = ANY (ARRAY['model_released'::text, 'gateway_available'::text, 'price_changed'::text, 'deprecation_announced'::text, 'provider_added'::text,
    'provider_launched'::text])));

COMMENT ON TABLE "public"."catalogue_notification_events" IS 'Channel-neutral public catalogue events (releases, Phaseo availability, price changes, deprecations, new providers for a model, providers launching on Phaseo), one per dedupe key. Mobile push fans them out to devices; other channels can read them too.';

ALTER TABLE "public"."mobile_notification_rules"
  DROP CONSTRAINT "mobile_notification_rules_event_kinds_check",
  ADD CONSTRAINT "mobile_notification_rules_event_kinds_check"
    CHECK
    (((cardinality(event_kinds) > 0) AND (event_kinds <@ ARRAY['model_released'::text, 'gateway_available'::text, 'price_changed'::text, 'deprecation_announced'::text,
    'provider_added'::text, 'provider_launched'::text])));

COMMENT ON TABLE "public"."mobile_notification_rules" IS 'User-written mobile push rules. A device is notified when one enabled notify rule matches an event and no enabled mute rule does. Lists left empty match anything; a rule with gateway_available or provider_added also matches provider_launched. At most 50 rules per user, enforced by the API.';

CREATE OR REPLACE FUNCTION private.mobile_push_category (
  p_kind text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- The category of a catalogue push: the key users switch off in
  -- mobile_notification_preferences.categories, and the Android channel from channel scheme 2.
  select case
    when p_kind in ('model_released', 'gateway_available') then 'new-models'
    when p_kind in ('price_changed', 'provider_added', 'provider_launched') then 'prices-providers'
    when p_kind = 'deprecation_announced' then 'deprecations'
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_category"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_category"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_category"(text) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_push_group_key (
  p_kind          text,
  p_lab_slug      text,
  p_provider_slug text,
  p_model_slug    text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Pushes for one device that share a key and are due together are sent as one: a lab's
  -- releases and models reaching Phaseo, a provider newly serving several models, or repeated
  -- price changes to one model. Other kinds are always sent alone.
  select case
    when p_kind in ('model_released', 'gateway_available') and p_lab_slug is not null then 'release:' || p_lab_slug
    when p_kind = 'provider_added' and p_provider_slug is not null then 'provider:' || p_provider_slug
    when p_kind = 'price_changed' and p_model_slug is not null then 'price:' || p_model_slug
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_group_key"(text, text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_group_key"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_group_key"(text, text, text, text) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_push_group_message (
  p_group_key text,
  p_items     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
-- Writes the push for one group. p_items lists every event in it, oldest first, including those
-- already sent to the device since midnight UTC: the new push replaces that notification on
-- screen, so it counts them all. Items carry kind, modelSlug, labSlug, providerSlug, modelName,
-- labName, providerName, title, body and href. Returns kind, modelSlug, title, body, href and
-- count (models for release and provider groups, changes for price groups).
--   one        the event as written.
--   2 or 3     every model named: "OpenAI released GPT-6 Astra and GPT-6 Astra Pro".
--   4 or more  counted, the first three named in the body, and the lab or provider page opened:
--              "DeepSeek released 12 models", "DeepSeek V5, V5 Lite, V5 Coder and 9 more".
-- Names after the first drop a leading lab name when the model is from the first model's lab.
declare
  v_size integer := coalesce(jsonb_array_length(p_items), 0);
  v_first jsonb := p_items -> 0;
  v_last jsonb := p_items -> (coalesce(jsonb_array_length(p_items), 0) - 1);
  v_scope text := split_part(coalesce(p_group_key, ''), ':', 1);
  v_names text[];
  v_count integer;
  v_joined text;
  v_released boolean;
  v_on_phaseo boolean;
  v_owner text;
begin
  if v_size = 0 then
    return null;
  end if;

  if v_size > 1 and v_scope = 'price' then
    return jsonb_build_object(
      'kind', 'price_changed',
      'modelSlug', v_last ->> 'modelSlug',
      'title', left(coalesce(v_last ->> 'modelName', v_last ->> 'modelSlug') || ' prices changed', 300),
      'body', left(rtrim(v_last ->> 'title', '.') || coalesce(' at ' || (v_last ->> 'providerName'), '') || '. '
        || (v_size - 1) || case when v_size = 2 then ' other change today.' else ' other changes today.' end, 1000),
      'href', v_last ->> 'href',
      'count', v_size);
  end if;

  if v_size > 1 and v_scope in ('release', 'provider') then
    -- Each model once, in the order it first appeared.
    select array_agg(n.name order by n.ord), count(*)::integer
      into v_names, v_count
    from (
      select distinct on (coalesce(i.item ->> 'modelSlug', i.item ->> 'modelName'))
        i.ord,
        case
          when i.ord > 1 and (i.item ->> 'labSlug') = (v_first ->> 'labSlug') and nullif(i.item ->> 'labName', '') is not null
            and char_length(i.item ->> 'modelName') > char_length(i.item ->> 'labName') + 1
            and left(i.item ->> 'modelName', char_length(i.item ->> 'labName') + 1) = (i.item ->> 'labName') || ' '
            then substr(i.item ->> 'modelName', char_length(i.item ->> 'labName') + 2)
          else coalesce(i.item ->> 'modelName', i.item ->> 'modelSlug')
        end as name
      from jsonb_array_elements(p_items) with ordinality as i(item, ord)
      order by coalesce(i.item ->> 'modelSlug', i.item ->> 'modelName'), i.ord
    ) n;

    if v_count > 1 then
      v_joined := case
        when v_count <= 3 then array_to_string(v_names[1:v_count - 1], ', ') || ' and ' || v_names[v_count]
        else array_to_string(v_names[1:3], ', ') || ' and ' || (v_count - 3) || ' more'
      end;

      if v_scope = 'release' then
        v_owner := coalesce(nullif(v_first ->> 'labName', ''), v_first ->> 'labSlug');
        select bool_or(i ->> 'kind' = 'model_released'),
               bool_and(i ->> 'kind' = 'gateway_available' or i ->> 'body' = 'You can use it on Phaseo now.')
          into v_released, v_on_phaseo
        from jsonb_array_elements(p_items) as i;
        return jsonb_build_object(
          'kind', case when v_released then 'model_released' else 'gateway_available' end,
          'modelSlug', null,
          'title', left(case
            when v_released and v_count <= 3 then v_owner || ' released ' || v_joined
            when v_released then v_owner || ' released ' || v_count || ' models'
            when v_count <= 3 then v_joined || ' are now on Phaseo'
            else v_count || ' ' || v_owner || ' models are now on Phaseo'
          end, 300),
          'body', left(case
            when v_count > 3 then v_joined
            when not v_released then 'You can now use them through Phaseo.'
            when v_on_phaseo then 'You can use them on Phaseo now.'
            else 'See the details on Phaseo.'
          end, 1000),
          'href', '/organisations/' || (v_first ->> 'labSlug'),
          'count', v_count);
      end if;

      v_owner := coalesce(nullif(v_first ->> 'providerName', ''), v_first ->> 'providerSlug');
      return jsonb_build_object(
        'kind', 'provider_added',
        'modelSlug', null,
        'title', left(case
          when v_count <= 3 then v_joined || ' are now available from ' || v_owner
          else v_count || ' models are now available from ' || v_owner
        end, 300),
        'body', left(case when v_count <= 3 then v_owner || ' is now a provider for them on Phaseo.' else v_joined end, 1000),
        'href', '/api-providers/' || (v_first ->> 'providerSlug'),
        'count', v_count);
    end if;
  end if;

  -- One event, or one model told about twice: the newest event as written.
  return jsonb_build_object('kind', v_last ->> 'kind', 'modelSlug', v_last ->> 'modelSlug', 'title', v_last ->> 'title',
    'body', v_last ->> 'body', 'href', v_last ->> 'href', 'count', 1);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_group_message"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_group_message"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_group_message"(text, jsonb) TO "postgres";

-- Deliveries from the last two days take their group key: those still queued are grouped, and
-- today's sends count towards the next grouped push for their group.
UPDATE public.mobile_push_deliveries x
SET group_key = private.mobile_push_group_key(e.kind, e.lab_slug, e.provider_slug, e.model_slug)
FROM public.catalogue_notification_events e
WHERE e.id = x.event_id
  AND x.created_at > now() - interval '2 days'
  AND x.group_key IS NULL;

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
  -- include_free_variants, so muting a lab also mutes its free variants. A provider launching
  -- on Phaseo (provider_launched, which has no model or lab) is matched by rules about Phaseo
  -- availability or new providers, so rules written before it existed pick it up.
  select p_rule.enabled
    and (
      p_kind = any (p_rule.event_kinds)
      or (p_kind = 'provider_launched' and p_rule.event_kinds && ARRAY['gateway_available', 'provider_added'])
    )
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
--   provider_launched      a bulk transaction gave a provider its first public routes
-- model_released comes from the public announcer (private.record_model_released_notification).
--
-- Rows are read in id order, but only up to the sequence position the previous call recorded
-- and only once every transaction older than that call has finished, so a long transaction
-- that commits after later ids cannot be skipped. A transaction touching more than
-- p_max_models_per_transaction models is a bulk sync or backfill: it is recorded and its rows
-- are skipped, and it produces at most one provider_launched event per provider it brings to
-- Phaseo. It is sized by all of its unread rows before any of them is read, so a transaction
-- that spans several calls is skipped from its first row.
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
  v_transactions bigint[] := '{}';
  v_bulk bigint[] := '{}';
  v_fresh boolean := false;
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

    -- Size each transaction in this page by every unread row it wrote, not only those in the
    -- page (a primary key range scan from the cursor). Every transaction with a row up to
    -- v_upper has finished, so all of its rows are visible now; any below the cursor were read
    -- by an earlier call, which sized the whole transaction then and recorded it if it was bulk.
    -- A page that is all older than two days emits nothing and is not sized.
    select coalesce(array_agg(distinct h.transaction_id) filter (where h.operation <> 'BASELINE'), '{}'),
           coalesce(bool_or(h.recorded_at > now() - interval '2 days'), false)
      into v_transactions, v_fresh
    from public.v2_catalogue_row_history h
    where h.event_id = any (v_ids);

    if v_fresh and cardinality(v_transactions) > 0 then
      with recorded as (
        insert into public.catalogue_notification_skipped_transactions (transaction_id, model_count, row_count, first_history_event_id)
        select h.transaction_id, count(distinct h.model_slug)::integer, count(*)::integer, min(h.event_id)
        from public.v2_catalogue_row_history h
        where h.event_id > v_cursor.last_history_event_id
          and h.transaction_id = any (v_transactions)
          and h.operation <> 'BASELINE'
        group by h.transaction_id
        having count(distinct h.model_slug) > p_max_models_per_transaction
        on conflict (transaction_id) do nothing
        returning transaction_id
      )
      select coalesce(array_agg(r.transaction_id), '{}'), count(*)::integer into v_bulk, v_skipped from recorded r;
    end if;

    -- A bulk transaction that switches on public routes for a provider with none before is one
    -- piece of news: the provider launched on Phaseo, with the newest of its models named. A
    -- provider counts as already public when one of its routes is routed now and the history
    -- does not show that route switched on in this transaction or later, or when this
    -- transaction changed a route that was routed before it.
    if cardinality(v_bulk) > 0 then
      with launched_models as (
        select distinct on (h.transaction_id, r.provider_slug, r.model_slug)
          h.transaction_id,
          s.first_history_event_id,
          r.provider_slug,
          r.model_slug,
          h.event_id,
          h.recorded_at,
          coalesce(nullif(btrim(m.name), ''), m.model_slug) as model_name,
          m.released_at
        from public.catalogue_notification_skipped_transactions s
        join public.v2_catalogue_row_history h on h.event_id >= s.first_history_event_id and h.transaction_id = s.transaction_id
        join public.v2_model_provider_routes r on r.provider_model_id = h.after_state ->> 'provider_model_id'
        join public.v2_models m on m.model_slug = r.model_slug
        where s.transaction_id = any (v_bulk)
          and h.table_name = 'v2_model_provider_routes'
          and h.operation in ('INSERT', 'UPDATE')
          and h.after_state ->> 'routing_enabled' = 'true'
          and coalesce(h.before_state ->> 'routing_enabled', 'false') <> 'true'
          and h.recorded_at > now() - interval '2 days'
          and r.routing_enabled and r.access_scope = 'public' and not r.is_stealth and r.status in ('active', 'degraded')
          and public.catalog_model_is_public(r.model_slug)
        order by h.transaction_id, r.provider_slug, r.model_slug, h.event_id
      ),
      launched as (
        select
          lm.transaction_id,
          lm.provider_slug,
          min(lm.first_history_event_id) as first_event_id,
          count(*)::integer as model_count,
          (array_agg(lm.model_name order by lm.released_at desc nulls last, lm.model_name))[1:3] as names,
          (array_agg(lm.model_slug order by lm.released_at desc nulls last, lm.model_name))[1:3] as model_slugs,
          min(lm.event_id) as event_id,
          max(lm.recorded_at) as recorded_at
        from launched_models lm
        group by lm.transaction_id, lm.provider_slug
      )
      insert into public.catalogue_notification_events (
        kind, dedupe_key, provider_slug, title, body, href, payload, source_history_event_id, occurred_at
      )
      select
        'provider_launched',
        'provider_launched:' || l.provider_slug || ':' || l.transaction_id,
        l.provider_slug,
        left(v.provider_name || ' is now on Phaseo', 300),
        left(case
          when l.model_count = 1 then 'Serving ' || l.names[1] || '.'
          when l.model_count <= 3 then 'Serving ' || array_to_string(l.names[1:l.model_count - 1], ', ') || ' and ' || l.names[l.model_count] || '.'
          else l.model_count || ' models, including ' || l.names[1] || ', ' || l.names[2] || ' and ' || l.names[3] || '.'
        end, 1000),
        '/api-providers/' || l.provider_slug,
        jsonb_build_object('providerName', v.provider_name, 'modelCount', l.model_count, 'modelIds', to_jsonb(l.model_slugs)),
        l.event_id,
        l.recorded_at
      from launched l
      left join public.v2_providers p on p.provider_slug = l.provider_slug
      cross join lateral (select coalesce(nullif(btrim(p.name), ''), l.provider_slug) as provider_name) v
      where not exists (
          select 1
          from public.v2_model_provider_routes o
          where o.provider_slug = l.provider_slug
            and o.routing_enabled and o.access_scope = 'public' and not o.is_stealth and o.status in ('active', 'degraded')
            and not exists (
              select 1 from public.v2_catalogue_row_history e
              where e.model_slug = o.model_slug and e.event_id >= l.first_event_id
                and e.table_name = 'v2_model_provider_routes'
                and e.after_state ->> 'provider_model_id' = o.provider_model_id
                and e.after_state ->> 'routing_enabled' = 'true'
                and coalesce(e.before_state ->> 'routing_enabled', 'false') <> 'true'
            )
            and public.catalog_model_is_public(o.model_slug)
        )
        and not exists (
          select 1 from public.v2_catalogue_row_history b
          where b.event_id >= l.first_event_id and b.transaction_id = l.transaction_id
            and b.table_name = 'v2_model_provider_routes'
            and b.before_state ->> 'provider_slug' = l.provider_slug
            and b.before_state ->> 'routing_enabled' = 'true'
            and coalesce(b.before_state ->> 'access_scope', 'public') = 'public'
            and coalesce(b.before_state ->> 'is_stealth', 'false') <> 'true'
        )
      on conflict (dedupe_key) do nothing;
      get diagnostics v_count = row_count;
      v_emitted := v_emitted + v_count;
    end if;

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
-- Fans one catalogue event out to the active devices of users who switched push and the
-- event's category on, in a single statement. A device gets the event when one of its user's
-- enabled notify rules matches and none of their enabled mute rules does. Each push waits five
-- minutes after its event to settle, so claim_mobile_push_deliveries can send a burst for the
-- same device and group key as one push; if that moment falls in the user's quiet hours (in
-- the device's time zone) it is deferred until they end. Past the daily cap, counted per device
-- with a grouped push counting once, it is recorded as suppressed; a push that joins a group
-- already waiting for the device adds nothing to the count. A device already told about a
-- model's release is not told again that the same model reached Phaseo, and vice versa. Events
-- more than two days old or about a model that is no longer public are closed without sending.
declare
  v_event public.catalogue_notification_events%rowtype;
  v_category text;
  v_group_key text;
  v_result jsonb;
begin
  select * into v_event from public.catalogue_notification_events e where e.id = p_event_id for update;
  if v_event.id is null or v_event.fanned_out_at is not null then
    return jsonb_build_object('queued', 0, 'deferred', 0, 'suppressed', 0);
  end if;

  v_category := private.mobile_push_category(v_event.kind);
  v_group_key := private.mobile_push_group_key(v_event.kind, v_event.lab_slug, v_event.provider_slug, v_event.model_slug);

  if v_event.occurred_at > now() - interval '2 days'
    and (v_event.model_slug is null or public.catalog_model_is_public(v_event.model_slug)) then
    with model as (
      select
        m.input_modalities,
        m.output_modalities,
        v_event.kind = 'provider_launched' or exists (
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
        and (p.categories -> v_category) is distinct from 'false'::jsonb
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
        sent.joins_group,
        settle.at as settle_at,
        case
          when c.quiet_start is null or c.quiet_end is null or c.quiet_start = c.quiet_end then null
          when c.quiet_start < c.quiet_end then
            case when wall.clock_time >= c.quiet_start and wall.clock_time < c.quiet_end then wall.calendar_day + c.quiet_end end
          when wall.clock_time >= c.quiet_start then (wall.calendar_day + 1) + c.quiet_end
          when wall.clock_time < c.quiet_end then wall.calendar_day + c.quiet_end
        end as release_local
      from candidates c
      cross join lateral (select greatest(now(), v_event.occurred_at + interval '5 minutes') as at) settle
      cross join lateral (select settle.at at time zone c.time_zone as moment) here
      cross join lateral (select here.moment::time as clock_time, here.moment::date as calendar_day) wall
      cross join lateral (
        -- Pushes this device was sent or is due in the last day: a group still waiting counts
        -- once, as does a push that carried several deliveries.
        select
          count(distinct case
            when x.status in ('pending', 'deferred') and x.group_key is not null then 'group:' || x.group_key
            else coalesce(x.merged_into, x.id)::text
          end) as recent,
          coalesce(bool_or(x.status in ('pending', 'deferred') and x.group_key = v_group_key), false) as joins_group
        from public.mobile_push_deliveries x
        where x.device_id = c.device_id and x.created_at > now() - interval '1 day'
          and x.status in ('pending', 'processing', 'sent', 'deferred')
      ) sent
      where c.rule_id is not null
    ),
    inserted as (
      insert into public.mobile_push_deliveries as x (event_id, device_id, user_id, rule_id, group_key, status, not_before, error_code)
      select
        v_event.id,
        s.device_id,
        s.user_id,
        s.rule_id,
        v_group_key,
        case when s.capped then 'suppressed' when s.release_local is not null then 'deferred' else 'pending' end,
        case
          when s.capped then now()
          when s.release_local is not null then s.release_local at time zone s.time_zone
          else s.settle_at
        end,
        case when s.capped then 'daily_cap' end
      from (select s.*, not s.joins_group and s.recent >= s.daily_cap as capped from scheduled s) s
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

-- The claim now returns one row per push, with its channel scheme, category, group and tag.
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
  where x.status = 'processing' and x.claimed_at < now() - interval '10 minutes';

  return query
  with due as (
    select w.device_id, coalesce(w.group_key, w.id::text) as unit
    from public.mobile_push_deliveries w
    where w.status in ('pending', 'deferred')
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
    where x.status in ('pending', 'deferred') and x.not_before <= now()
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
-- "ticketId", "errorCode", "errorMessage" }], one per push under the id the claim returned.
-- A result applies to every row the push carried (merged_into); the ticket is kept on the
-- push's own row. Only rows still held by this claim change. Retries back off from 30 seconds
-- to an hour and give up after five attempts; a retried row is grouped again when it is next
-- due. DeviceNotRegistered retires the device. Counts are per push.
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
        expo_ticket_id = case when r.status = 'sent' and x.id = r.id then r.ticket_id end,
        sent_at = case when r.status = 'sent' then now() end,
        error_code = case when r.status = 'sent' then null else coalesce(r.error_code, 'push_failed') end,
        error_message = case when r.status = 'sent' then null else r.error_message end,
        merged_into = case when r.status = 'retry' and x.attempts < 5 then null else x.merged_into end,
        claim_token = null,
        claimed_at = null,
        updated_at = now()
    from results r
    where (x.id = r.id or x.merged_into = r.id) and x.claim_token = p_claim_token and x.status = 'processing'
    returning x.id = r.id as is_push, x.device_id, x.status, x.error_code
  ),
  invalidated as (
    update public.mobile_push_devices dev
    set status = 'invalid', invalidated_at = now(), updated_at = now()
    where dev.id in (select c.device_id from completed c where c.error_code = 'DeviceNotRegistered')
      and dev.status = 'active'
    returning dev.id
  )
  select jsonb_build_object(
    'sent', count(*) filter (where c.is_push and c.status = 'sent'),
    'retrying', count(*) filter (where c.is_push and c.status = 'pending'),
    'failed', count(*) filter (where c.is_push and c.status = 'failed'),
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

CREATE OR REPLACE FUNCTION public.record_mobile_push_receipts (
  p_results jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Closes the receipts Expo returned: [{ "id", "status": "ok" | "error", "errorCode",
-- "errorMessage" }]. An error marks the push failed, with every row it carried, and
-- DeviceNotRegistered retires the device. Tickets left out stay open, so
-- claim_mobile_push_receipts hands them out again.
declare
  v_result jsonb;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_mobile_push_receipts';
  end if;

  with results as (
    select distinct on (r.id) r.id, r.status, left(r."errorCode", 100) as error_code, left(r."errorMessage", 1000) as error_message
    from jsonb_to_recordset(p_results) as r(id uuid, status text, "errorCode" text, "errorMessage" text)
    where r.id is not null and r.status in ('ok', 'error')
    order by r.id
  ),
  checked as (
    update public.mobile_push_deliveries x
    set status = case when r.status = 'error' then 'failed' else x.status end,
        error_code = case when r.status = 'error' then coalesce(r.error_code, 'receipt_error') else x.error_code end,
        error_message = case when r.status = 'error' then r.error_message else x.error_message end,
        receipt_checked_at = now(),
        updated_at = now()
    from results r
    where x.id = r.id and x.status = 'sent' and x.receipt_checked_at is null
    returning x.id, x.device_id, x.status, x.error_code, x.error_message
  ),
  carried as (
    update public.mobile_push_deliveries x
    set status = 'failed', error_code = c.error_code, error_message = c.error_message, updated_at = now()
    from checked c
    where c.status = 'failed' and x.merged_into = c.id and x.status = 'sent'
    returning x.id
  ),
  invalidated as (
    update public.mobile_push_devices dev
    set status = 'invalid', invalidated_at = now(), updated_at = now()
    where dev.id in (select c.device_id from checked c where c.status = 'failed' and c.error_code = 'DeviceNotRegistered')
      and dev.status = 'active'
    returning dev.id
  )
  select jsonb_build_object(
    'checked', count(*),
    'failed', count(*) filter (where c.status = 'failed'),
    'invalidated', (select count(*) from invalidated)
  ) into v_result
  from checked c;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) FROM PUBLIC, "anon", "authenticated";

-- Registration takes the channel scheme the app reports.
DROP FUNCTION public.register_mobile_push_device(uuid, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.register_mobile_push_device (
  p_user_id         uuid,
  p_installation_id text,
  p_expo_push_token text,
  p_platform        text,
  p_time_zone       text,
  p_device_name     text,
  p_app_version     text,
  p_channel_scheme  integer DEFAULT 1
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- One row per installation and per Expo token. When a token or installation turns up under
-- another account (sign-out then sign-in as someone else) or another installation, the old
-- row is replaced so the device never receives the previous account's pushes. A user keeps
-- at most 20 active devices; the least recently seen ones beyond that are disabled. The app
-- reports its notification channel scheme each time it registers, so a build that only has
-- the single model-updates channel (scheme 1, the default) is never sent to a channel it lacks.
declare
  v_time_zone text := nullif(btrim(p_time_zone), '');
  v_channel_scheme smallint := least(greatest(coalesce(p_channel_scheme, 1), 1), 100);
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
    user_id, installation_id, expo_push_token, platform, status, time_zone, device_name, app_version, channel_scheme,
    last_seen_at, updated_at, invalidated_at
  )
  values (
    p_user_id, p_installation_id, p_expo_push_token, p_platform, 'active', v_time_zone,
    nullif(btrim(p_device_name), ''), nullif(btrim(p_app_version), ''), v_channel_scheme, now(), now(), null
  )
  on conflict (user_id, installation_id) do update
    set expo_push_token = excluded.expo_push_token,
        platform = excluded.platform,
        status = 'active',
        time_zone = excluded.time_zone,
        device_name = excluded.device_name,
        app_version = excluded.app_version,
        channel_scheme = excluded.channel_scheme,
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

GRANT EXECUTE ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."register_mobile_push_device"(uuid, text, text, text, text, text, text, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.claim_mobile_push_test (
  p_user_id         uuid,
  p_installation_id text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Allows three test pushes per user in any ten minutes. Returns the device's token and channel
-- scheme, or {"error": "device_not_registered" | "rate_limited", "retryAfterSeconds"}.
declare
  v_recent timestamp with time zone[];
  v_device_id uuid;
  v_token text;
  v_channel_scheme smallint;
begin
  if p_user_id is null or p_installation_id is null then
    return jsonb_build_object('error', 'device_not_registered');
  end if;

  select d.id, d.expo_push_token, d.channel_scheme into v_device_id, v_token, v_channel_scheme
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

  return jsonb_build_object('deviceId', v_device_id, 'expoPushToken', v_token, 'channelScheme', v_channel_scheme);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_mobile_push_test"(uuid, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.update_mobile_notification_categories (
  p_user_id    uuid,
  p_categories jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Merges category switches into the user's mobile push settings in one statement, creating
-- them if needed, so two devices changing different categories at once both keep their change.
-- Only known categories set to true or false are stored. Returns the stored switches.
declare
  v_patch jsonb;
  v_categories jsonb;
begin
  if p_user_id is null or jsonb_typeof(p_categories) is distinct from 'object' then
    raise exception 'invalid_mobile_notification_categories';
  end if;

  select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb) into v_patch
  from jsonb_each(p_categories) as c
  where c.key in ('new-models', 'prices-providers', 'deprecations', 'money', 'traffic', 'security', 'jobs', 'account', 'digest')
    and jsonb_typeof(c.value) = 'boolean';

  insert into public.mobile_notification_preferences as p (user_id, categories)
  values (p_user_id, v_patch)
  on conflict (user_id) do update
    set categories = p.categories || excluded.categories, updated_at = now()
  returning p.categories into v_categories;

  return v_categories;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_mobile_notification_categories"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_mobile_notification_categories"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_mobile_notification_categories"(uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_mobile_notification_categories"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";
