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
