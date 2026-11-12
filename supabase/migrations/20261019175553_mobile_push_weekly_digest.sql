-- Weekly "Your Phaseo week" digest push for the Phaseo app.
--   * mobile_push_digests holds one digest per user and ISO week, written when one of the user's
--     devices reaches 18:00 on Sunday in its time zone, with its text and the figures behind it.
--   * Digests are sent through mobile_push_deliveries: a digest row has no catalogue event
--     (event_id becomes nullable), points at its digest (digest_id) and carries the workspace it
--     opens (workspace_id). claim_mobile_push_digests writes the due digests and claims their
--     pushes; complete_mobile_push_deliveries records them like any other push.
--   * The daily cap counts catalogue pushes only, so a digest never uses it up, and
--     claim_mobile_push_deliveries skips digest rows before its limit, so a digest backlog
--     never holds catalogue pushes back.
--   * get_mobile_week_summary backs the app's "Your week" screen: one workspace's week, the week
--     before, its days, top models and the releases the user's rules match.
-- Figures are summed in SQL from get_private_usage_overview; nothing is fetched to sum.
SET local check_function_bodies = off;

CREATE TABLE "public"."mobile_push_digests" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "iso_week"     text                     NOT NULL,
  "time_zone"    text                     NOT NULL,
  "week_start"   timestamp with time zone NOT NULL,
  "week_cutoff"  timestamp with time zone NOT NULL,
  "status"       text                     NOT NULL,
  "workspace_id" uuid,
  "title"        text,
  "body"         text,
  "href"         text,
  "summary"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mobile_push_digests_iso_week_check" CHECK ((iso_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'::text)),
  CONSTRAINT "mobile_push_digests_message_check"
    CHECK (((status = 'skipped'::text) OR ((title IS NOT NULL) AND (body IS NOT NULL) AND (href IS NOT NULL)))),
  CONSTRAINT "mobile_push_digests_pkey" PRIMARY KEY (id),
  CONSTRAINT "mobile_push_digests_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'skipped'::text]))),
  CONSTRAINT "mobile_push_digests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_digests_user_id_iso_week_key" UNIQUE (user_id, iso_week),
  CONSTRAINT "mobile_push_digests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL
);

ALTER TABLE "public"."mobile_push_digests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_push_digests_workspace_idx ON public.mobile_push_digests USING btree (workspace_id)
  WHERE (workspace_id IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_push_digests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."mobile_push_digests"."iso_week" IS 'ISO week the digest covers (YYYY-Www) in time_zone. One digest per user and week.';

COMMENT ON COLUMN "public"."mobile_push_digests"."summary" IS 'The figures the text was written from: spend, requests and tokens summed over the user''s owner and admin workspaces, the previous week''s spend over the same span, the active workspaces, the top model and the matching releases.';

COMMENT ON COLUMN "public"."mobile_push_digests"."week_cutoff" IS '18:00 on the Sunday in time_zone, when the digest became due. Figures cover week_start up to this moment.';

COMMENT ON COLUMN "public"."mobile_push_digests"."workspace_id" IS 'The workspace the push leads with and opens: the user''s most active one that week, or the one they used last when none was active.';

COMMENT ON TABLE "public"."mobile_push_digests" IS 'Weekly "Your Phaseo week" digests, one per user and ISO week, written when one of the user''s devices reaches 18:00 on Sunday. Queued digests are sent through mobile_push_deliveries (digest_id); skipped ones had nothing to report. Written only by build_mobile_push_digests.';

REVOKE ALL ON TABLE "public"."mobile_push_digests" FROM "service_role";

GRANT SELECT ON TABLE "public"."mobile_push_digests" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_push_digests" FROM "anon", "authenticated";

ALTER TABLE "public"."mobile_push_deliveries"
  ALTER COLUMN "event_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "workspace_id" uuid,
  ADD COLUMN "digest_id" uuid,
  ADD CONSTRAINT "mobile_push_deliveries_digest_id_fkey" FOREIGN KEY (digest_id) REFERENCES public.mobile_push_digests(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX mobile_push_deliveries_digest_device_key ON public.mobile_push_deliveries USING btree (digest_id, device_id)
  WHERE (digest_id IS NOT NULL);

CREATE INDEX mobile_push_deliveries_digest_due_idx ON public.mobile_push_deliveries USING btree (not_before, created_at)
  WHERE ((digest_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'deferred'::text])));

COMMENT ON COLUMN "public"."mobile_push_deliveries"."digest_id" IS 'The weekly digest this row sends; such rows have no catalogue event. Claimed by claim_mobile_push_digests, never by claim_mobile_push_deliveries, and never counted against the daily cap.';

COMMENT ON TABLE "public"."mobile_push_deliveries" IS 'One row per catalogue event and device, or per weekly digest and device (digest_id, no event). Catalogue rows wait five minutes to settle, and those due for the same device and group key are sent as one push. Deferred rows wait for quiet hours to end; suppressed rows were over the daily cap or no longer wanted. Claimed with a token so overlapping runs never send twice.';

CREATE INDEX catalogue_notification_events_releases_idx ON public.catalogue_notification_events USING btree (occurred_at)
  WHERE (kind = ANY (ARRAY['model_released'::text, 'gateway_available'::text]));

CREATE OR REPLACE FUNCTION private.mobile_push_digest_week (
  p_time_zone text,
  p_now       timestamp with time zone
)
  RETURNS TABLE (
    due         boolean,
    iso_week    text,
    week_start  timestamp with time zone,
    week_cutoff timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Where p_now falls for the weekly digest in p_time_zone. The digest is due from 18:00 on
  -- Sunday until 06:00 on Monday, local time, so a late or missed run still sends it that
  -- evening or night. It covers the ISO week from Monday 00:00 up to that Sunday 18:00. Moving
  -- the clock on six hours turns the window into the first twelve hours of the next ISO week.
  select
    shifted.local_time < monday.next_start + interval '12 hours',
    to_char(monday.next_start - interval '7 days', 'IYYY-"W"IW'),
    (monday.next_start - interval '7 days') at time zone p_time_zone,
    (monday.next_start - interval '6 hours') at time zone p_time_zone
  from (select (p_now at time zone p_time_zone) + interval '6 hours' as local_time) shifted
  cross join lateral (select date_trunc('week', shifted.local_time) as next_start) monday;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_week"(text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_week"(text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_digest_week"(text, timestamp with time zone) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_iso_week_monday (
  p_week text
)
  RETURNS date
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- The Monday that starts ISO week p_week, written "2026-W43", or null when there is no such
  -- week (a malformed value, or week 53 of a year with 52).
  select case when candidate.monday is not null and to_char(candidate.monday, 'IYYY-"W"IW') = p_week then candidate.monday end
  from (
    select case
      when p_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' and left(p_week, 4) >= '1000' then
        make_date(left(p_week, 4)::integer, 1, 4)
          - (extract(isodow from make_date(left(p_week, 4)::integer, 1, 4))::integer - 1)
          + (right(p_week, 2)::integer - 1) * 7
    end as monday
  ) candidate;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_iso_week_monday"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_iso_week_monday"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_iso_week_monday"(text) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_push_compact_number (
  p_value numeric
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Counts for push text: whole numbers with commas below 100,000 ("12,340"), then "124K",
  -- "18.2M", "124M", "1.2B", with one decimal below 100 of a unit.
  select case
    when n.value < 100000 then to_char(n.value, 'FM999,990')
    when n.value < 999500 then to_char(round(n.value / 1e3), 'FM990') || 'K'
    when n.value < 99950000 then trim_scale(round(n.value / 1e6, 1))::text || 'M'
    when n.value < 999500000 then to_char(round(n.value / 1e6), 'FM990') || 'M'
    when n.value < 99950000000 then trim_scale(round(n.value / 1e9, 1))::text || 'B'
    else to_char(round(n.value / 1e9), 'FM999,999,990') || 'B'
  end
  from (select round(greatest(coalesce(p_value, 0), 0)) as value) n;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_compact_number"(numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_compact_number"(numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_compact_number"(numeric) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_push_digest_message (
  p_facts jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The weekly digest's title and body from private.mobile_push_digest_facts, or null when the
  -- week had neither usage nor a release the user's rules match. Money is in US dollars
  -- ("$42.18") and counts are compact ("18.2M").
  --   * Usage: "Your Phaseo week: $42.18 spent, up 12%", with the change only when both weeks
  --     had spend, and "12,340 requests · 18.2M tokens · Top model: Claude Sonnet 5.5 · 6 new
  --     models launched". A user with more than one workspace is told which were active, most
  --     active first: "Acme: …" or "Acme and 2 other workspaces: …".
  --   * No usage: "Your Phaseo week" and "A quiet week: 6 new models launched, including A and B".
  select case
    when f.requests = 0 and f.spend_nanos = 0 and f.releases = 0 then null
    when f.requests = 0 and f.spend_nanos = 0 then jsonb_build_object(
      'title', 'Your Phaseo week',
      'body', 'A quiet week: ' || f.releases
        || case when f.releases = 1 then ' new model launched, ' else ' new models launched, ' end
        || case
          when f.releases = 1 or f.second_release is null then f.first_release
          when f.releases = 2 then f.first_release || ' and ' || f.second_release
          else 'including ' || f.first_release || ' and ' || f.second_release
        end)
    else jsonb_build_object(
      'title', 'Your Phaseo week' || case when f.spend_nanos > 0 then ': ' || f.money || ' spent' || coalesce(', ' || f.change, '') else '' end,
      'body', f.scope || array_to_string(f.parts, ' · '))
  end
  from (
    select
      t.requests,
      t.spend_nanos,
      t.releases,
      coalesce(t.release_names ->> 0, 'new models') as first_release,
      t.release_names ->> 1 as second_release,
      case
        when t.spend_nanos < 5000000 then 'under $0.01'
        else '$' || to_char(round(t.spend_nanos / 1e9, 2), 'FM999,999,999,990.00')
      end as money,
      case when t.spend_nanos > 0 and t.previous_spend_nanos > 0 then
        case sign(change.percent)
          when 1 then 'up ' || to_char(change.percent, 'FM999,999,990') || '%'
          when -1 then 'down ' || to_char(-change.percent, 'FM999,999,990') || '%'
          else 'same as last week'
        end
      end as change,
      case when t.workspace_count > 1 and t.active_count > 0 then
        coalesce(nullif(btrim(t.active -> 0 ->> 'name'), ''), 'Your workspace')
          || case
            when t.active_count = 2 then ' and 1 other workspace'
            when t.active_count > 2 then ' and ' || (t.active_count - 1) || ' other workspaces'
            else ''
          end
          || ': '
      else '' end as scope,
      array_remove(array[
        private.mobile_push_compact_number(t.requests) || case when t.requests = 1 then ' request' else ' requests' end,
        case when round(t.tokens) > 0 then private.mobile_push_compact_number(t.tokens) || case when round(t.tokens) = 1 then ' token' else ' tokens' end end,
        'Top model: ' || t.top_model,
        case when t.releases > 0 then t.releases || case when t.releases = 1 then ' new model launched' else ' new models launched' end end
      ], null) as parts
    from (
      select
        coalesce((p_facts ->> 'requests')::numeric, 0) as requests,
        coalesce((p_facts ->> 'spendNanos')::numeric, 0) as spend_nanos,
        coalesce((p_facts ->> 'previousSpendNanos')::numeric, 0) as previous_spend_nanos,
        coalesce((p_facts ->> 'tokens')::numeric, 0) as tokens,
        coalesce((p_facts ->> 'workspaceCount')::integer, 0) as workspace_count,
        coalesce(p_facts -> 'activeWorkspaces', '[]'::jsonb) as active,
        coalesce(jsonb_array_length(p_facts -> 'activeWorkspaces'), 0) as active_count,
        nullif(btrim(p_facts -> 'topModel' ->> 'name'), '') as top_model,
        coalesce((p_facts ->> 'releaseCount')::integer, 0) as releases,
        coalesce(p_facts -> 'releaseNames', '[]'::jsonb) as release_names
    ) t
    cross join lateral (
      select round((t.spend_nanos - t.previous_spend_nanos) * 100 / nullif(t.previous_spend_nanos, 0)) as percent
    ) change
  ) f;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_message"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_message"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_digest_message"(jsonb) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_week_usage (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_time_zone    text,
  p_days         boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- One workspace's usage from p_from up to, but not including, p_to, summed from the exact usage
-- overview (public.get_private_usage_overview, which fills hours the rollup has yet to rebuild
-- from the requests): totals, every model with its requests and spend, most requests first,
-- and with p_days the same totals per local day in p_time_zone. Spend is in nanodollars.
with cells as materialized (
  select
    (overview.cell ->> 'bucket')::timestamp with time zone as bucket,
    nullif(overview.cell ->> 'modelId', '') as model_id,
    coalesce((overview.cell ->> 'requests')::numeric, 0) as requests,
    coalesce((overview.cell ->> 'successfulRequests')::numeric, 0) as successful_requests,
    coalesce((overview.cell ->> 'costNanos')::numeric, 0) as cost_nanos,
    coalesce((overview.cell ->> 'tokens')::numeric, 0) as tokens,
    coalesce((overview.cell ->> 'inputTokens')::numeric, 0) as input_tokens,
    coalesce((overview.cell ->> 'outputTokens')::numeric, 0) as output_tokens
  from jsonb_array_elements(case
    when p_to > p_from then public.get_private_usage_overview(p_workspace_id, p_from, p_to - interval '1 microsecond',
      case when p_days then 'day' end, p_time_zone)
    else '[]'::jsonb
  end) as overview(cell)
)
select jsonb_build_object(
  'requests', coalesce(sum(c.requests), 0),
  'successfulRequests', coalesce(sum(c.successful_requests), 0),
  'spendNanos', coalesce(sum(c.cost_nanos), 0),
  'tokens', coalesce(sum(c.tokens), 0),
  'inputTokens', coalesce(sum(c.input_tokens), 0),
  'outputTokens', coalesce(sum(c.output_tokens), 0),
  'models', coalesce((
    select jsonb_agg(jsonb_build_object('modelId', m.model_id, 'requests', m.requests, 'spendNanos', m.cost_nanos)
      order by m.requests desc, m.cost_nanos desc, m.model_id)
    from (
      select model.model_id, sum(model.requests) as requests, sum(model.cost_nanos) as cost_nanos
      from cells model
      where model.model_id is not null
      group by model.model_id
    ) m
  ), '[]'::jsonb),
  'days', coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', d.day, 'requests', d.requests, 'successfulRequests', d.successful_requests, 'spendNanos', d.cost_nanos,
      'tokens', d.tokens, 'inputTokens', d.input_tokens, 'outputTokens', d.output_tokens
    ) order by d.day)
    from (
      select
        (day.bucket at time zone p_time_zone)::date as day,
        sum(day.requests) as requests,
        sum(day.successful_requests) as successful_requests,
        sum(day.cost_nanos) as cost_nanos,
        sum(day.tokens) as tokens,
        sum(day.input_tokens) as input_tokens,
        sum(day.output_tokens) as output_tokens
      from cells day
      where day.bucket is not null
      group by 1
    ) d
  ), '[]'::jsonb)
)
from cells c;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_week_usage"(uuid, timestamp with time zone, timestamp with time zone, text, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_week_usage"(uuid, timestamp with time zone, timestamp with time zone, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_week_usage"(uuid, timestamp with time zone, timestamp with time zone, text, boolean) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_week_releases (
  p_user_id uuid,
  p_from    timestamp with time zone,
  p_to      timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- Models released, or newly available on Phaseo, from p_from up to but not including p_to that
-- one of the user's enabled notify rules matches and none of their enabled mute rules does, as
-- fan-out would judge them today: each model once, newest first. Models no longer public are
-- left out.
with events as (
  select
    e.kind,
    e.model_slug,
    e.lab_slug,
    e.provider_slug,
    e.occurred_at,
    e.href,
    coalesce(nullif(btrim(e.payload ->> 'modelName'), ''), m.name, e.model_slug) as model_name,
    coalesce(nullif(btrim(e.payload ->> 'labName'), ''), lab.name, e.lab_slug) as lab_name,
    m.input_modalities,
    m.output_modalities,
    e.kind = 'gateway_available' or exists (
      select 1 from public.v2_model_provider_routes r
      where r.model_slug = e.model_slug and r.routing_enabled and r.access_scope = 'public'
        and not r.is_stealth and r.status in ('active', 'degraded')
    ) as on_phaseo
  from public.catalogue_notification_events e
  left join public.v2_models m on m.model_slug = e.model_slug
  left join public.v2_labs lab on lab.lab_slug = e.lab_slug
  where e.kind in ('model_released', 'gateway_available')
    and e.occurred_at >= p_from and e.occurred_at < p_to
    and e.model_slug is not null
    and public.catalog_model_is_public(e.model_slug)
),
matched as (
  select distinct on (ev.model_slug) ev.*
  from events ev
  where exists (
      select 1 from public.mobile_notification_rules r
      where r.user_id = p_user_id and r.action = 'notify'
        and private.mobile_notification_rule_matches(r, ev.kind, ev.lab_slug, ev.provider_slug, ev.model_slug,
          ev.input_modalities, ev.output_modalities, ev.on_phaseo)
    )
    and not exists (
      select 1 from public.mobile_notification_rules r
      where r.user_id = p_user_id and r.action = 'mute'
        and private.mobile_notification_rule_matches(r, ev.kind, ev.lab_slug, ev.provider_slug, ev.model_slug,
          ev.input_modalities, ev.output_modalities, ev.on_phaseo)
    )
  order by ev.model_slug, ev.occurred_at, ev.kind desc
)
select coalesce(jsonb_agg(jsonb_build_object(
  'modelId', matched.model_slug,
  'name', matched.model_name,
  'labId', matched.lab_slug,
  'labName', matched.lab_name,
  'kind', matched.kind,
  'occurredAt', to_char(matched.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'href', matched.href
) order by matched.occurred_at desc, matched.model_slug), '[]'::jsonb)
from matched;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_week_releases"(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_week_releases"(uuid, timestamp with time zone, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_week_releases"(uuid, timestamp with time zone, timestamp with time zone) TO "postgres";

CREATE OR REPLACE FUNCTION private.mobile_push_digest_facts (
  p_user_id   uuid,
  p_from      timestamp with time zone,
  p_to        timestamp with time zone,
  p_time_zone text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- What one user's weekly digest reports, summed over every workspace they own or administer:
-- spend, requests and tokens from p_from up to p_to, spend over the same local span a week
-- earlier, the workspaces with usage (most requests first, then spend), the model with the
-- most requests, and the releases their rules match. The lead workspace is the most active
-- one, or the one the user opened last when none had usage.
with spans as (
  select
    ((p_from at time zone p_time_zone) - interval '7 days') at time zone p_time_zone as previous_from,
    ((p_to at time zone p_time_zone) - interval '7 days') at time zone p_time_zone as previous_to
),
administered as (
  select m.workspace_id as id from public.workspace_members m
  where m.user_id = p_user_id and m.role::text in ('owner', 'admin')
  union
  select w.id from public.workspaces w where w.owner_user_id = p_user_id
),
usage as materialized (
  select
    w.id,
    w.name,
    w.created_at,
    member.last_accessed_at,
    private.mobile_week_usage(w.id, p_from, p_to, p_time_zone) as current_week,
    private.mobile_week_usage(w.id, spans.previous_from, spans.previous_to, p_time_zone) as previous_week
  from administered a
  join public.workspaces w on w.id = a.id
  left join public.workspace_members member on member.workspace_id = w.id and member.user_id = p_user_id
  cross join spans
),
ranked as (
  select
    u.*,
    (u.current_week ->> 'requests')::numeric as requests,
    (u.current_week ->> 'spendNanos')::numeric as spend_nanos,
    row_number() over (
      order by (u.current_week ->> 'requests')::numeric desc, (u.current_week ->> 'spendNanos')::numeric desc,
        u.last_accessed_at desc nulls last, u.created_at, u.id
    ) as position
  from usage u
),
models as (
  select model ->> 'modelId' as model_id, sum((model ->> 'requests')::numeric) as requests, sum((model ->> 'spendNanos')::numeric) as spend_nanos
  from usage u
  cross join lateral jsonb_array_elements(u.current_week -> 'models') model
  group by 1
),
releases as (
  select private.mobile_week_releases(p_user_id, p_from, p_to) as items
)
select jsonb_build_object(
  'workspaceCount', (select count(*) from ranked),
  'lead', (select jsonb_build_object('id', r.id, 'name', r.name) from ranked r where r.position = 1),
  'activeWorkspaces', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'requests', r.requests, 'spendNanos', r.spend_nanos) order by r.position)
    from ranked r where r.requests > 0 or r.spend_nanos > 0
  ), '[]'::jsonb),
  'requests', (select coalesce(sum(r.requests), 0) from ranked r),
  'spendNanos', (select coalesce(sum(r.spend_nanos), 0) from ranked r),
  'previousSpendNanos', (select coalesce(sum((r.previous_week ->> 'spendNanos')::numeric), 0) from ranked r),
  'tokens', (select coalesce(sum((r.current_week ->> 'tokens')::numeric), 0) from ranked r),
  'inputTokens', (select coalesce(sum((r.current_week ->> 'inputTokens')::numeric), 0) from ranked r),
  'outputTokens', (select coalesce(sum((r.current_week ->> 'outputTokens')::numeric), 0) from ranked r),
  'topModel', (
    select jsonb_build_object('id', m.model_id, 'name', coalesce(catalogue.name, m.model_id), 'requests', m.requests)
    from models m
    left join public.v2_models catalogue on catalogue.model_slug = m.model_id
    order by m.requests desc, m.spend_nanos desc, m.model_id
    limit 1
  ),
  'releaseCount', jsonb_array_length(releases.items),
  'releaseNames', coalesce((
    select jsonb_agg(item.value ->> 'name' order by item.position)
    from jsonb_array_elements(releases.items) with ordinality as item(value, position)
    where item.position <= 2
  ), '[]'::jsonb)
)
from releases;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_facts"(uuid, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_push_digest_facts"(uuid, timestamp with time zone, timestamp with time zone, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_push_digest_facts"(uuid, timestamp with time zone, timestamp with time zone, text) TO "postgres";

CREATE OR REPLACE FUNCTION private.build_mobile_push_digests (
  p_now   timestamp with time zone,
  p_limit integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- Writes the weekly digest of up to p_limit users once one of their devices has reached 18:00 on
-- Sunday in its own time zone (private.mobile_push_digest_week), and queues it for each of the
-- user's active devices on channel scheme 2 or later; a device in its quiet hours gets it when
-- they end. Recipients have push and the digest category on and own or administer a workspace.
-- Each user gets one digest per ISO week (mobile_push_digests_user_id_iso_week_key); a week with
-- nothing to report is recorded as skipped and sends nothing. 18:00 on Sunday reaches UTC+14 at
-- 04:00 UTC on Sunday, and the window closes at 06:00 on Monday, which UTC-12 reaches at 18:00 UTC
-- on Monday: outside those hours no device can be due and nothing is read. Inside them, one scan
-- of the active devices' time zones finds the due ones, and users already written are skipped
-- through the unique key. Overlapping runs leave building to whichever started first. more is
-- true when p_limit users were taken, so the caller knows others may still be waiting.
declare
  v_into_week interval := (p_now at time zone 'UTC') - date_trunc('week', p_now at time zone 'UTC');
  v_zone text;
  v_week record;
  v_known text[] := '{}';
  v_due_zones text[] := '{}';
  v_due_weeks text[] := '{}';
  v_due_starts timestamp with time zone[] := '{}';
  v_due_cutoffs timestamp with time zone[] := '{}';
  v_candidate record;
  v_facts jsonb;
  v_message jsonb;
  v_lead uuid;
  v_digest uuid;
  v_built integer := 0;
  v_skipped integer := 0;
  v_queued integer := 0;
  v_deferred integer := 0;
  v_taken integer := 0;
begin
  if p_now is null or p_limit is null or p_limit < 1 then
    raise exception 'invalid_mobile_push_digest_build';
  end if;
  if v_into_week >= interval '18 hours' and v_into_week < interval '6 days 4 hours' then
    return jsonb_build_object('built', 0, 'skipped', 0, 'queued', 0, 'deferred', 0, 'more', false);
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('build_mobile_push_digests', 0)) then
    return jsonb_build_object('built', 0, 'skipped', 0, 'queued', 0, 'deferred', 0, 'more', false);
  end if;

  for v_zone in
    select distinct coalesce(d.time_zone, 'UTC') from public.mobile_push_devices d
    where d.status = 'active' and d.channel_scheme >= 2
  loop
    begin
      select w.* into v_week from private.mobile_push_digest_week(v_zone, p_now) w;
    exception when invalid_parameter_value then
      -- A time zone this database does not know: its devices are never due.
      continue;
    end;
    v_known := v_known || v_zone;
    if v_week.due then
      v_due_zones := v_due_zones || v_zone;
      v_due_weeks := v_due_weeks || v_week.iso_week;
      v_due_starts := v_due_starts || v_week.week_start;
      v_due_cutoffs := v_due_cutoffs || v_week.week_cutoff;
    end if;
  end loop;

  if cardinality(v_due_zones) > 0 then
    for v_candidate in
      -- A user with devices in several due time zones takes the week of the first to reach 18:00.
      select distinct on (d.user_id) d.user_id, z.time_zone, z.iso_week, z.week_start, z.week_cutoff
      from unnest(v_due_zones, v_due_weeks, v_due_starts, v_due_cutoffs) as z(time_zone, iso_week, week_start, week_cutoff)
      join public.mobile_push_devices d
        on coalesce(d.time_zone, 'UTC') = z.time_zone and d.status = 'active' and d.channel_scheme >= 2
      join public.mobile_notification_preferences p on p.user_id = d.user_id
      where p.enabled
        and (p.categories -> 'digest') is distinct from 'false'::jsonb
        and not exists (select 1 from public.mobile_push_digests g where g.user_id = d.user_id and g.iso_week = z.iso_week)
        and (
          exists (select 1 from public.workspace_members m where m.user_id = d.user_id and m.role::text in ('owner', 'admin'))
          or exists (select 1 from public.workspaces w where w.owner_user_id = d.user_id)
        )
      order by d.user_id, z.week_cutoff, d.created_at, d.id
      limit p_limit
    loop
      v_taken := v_taken + 1;
      v_facts := private.mobile_push_digest_facts(v_candidate.user_id, v_candidate.week_start, v_candidate.week_cutoff, v_candidate.time_zone);
      v_lead := (v_facts -> 'lead' ->> 'id')::uuid;
      v_message := case when v_lead is not null then private.mobile_push_digest_message(v_facts) end;
      v_digest := null;

      insert into public.mobile_push_digests as g
        (user_id, iso_week, time_zone, week_start, week_cutoff, status, workspace_id, title, body, href, summary, created_at)
      values (
        v_candidate.user_id, v_candidate.iso_week, v_candidate.time_zone, v_candidate.week_start, v_candidate.week_cutoff,
        case when v_message is null then 'skipped' else 'queued' end,
        v_lead,
        v_message ->> 'title',
        v_message ->> 'body',
        case when v_message is not null then '/account/week?workspace=' || v_lead || '&week=' || v_candidate.iso_week end,
        v_facts,
        p_now
      )
      on conflict (user_id, iso_week) do nothing
      returning g.id into v_digest;

      -- Another run wrote this user's digest first.
      continue when v_digest is null;
      if v_message is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_built := v_built + 1;

      with inserted as (
        insert into public.mobile_push_deliveries as x (event_id, digest_id, workspace_id, device_id, user_id, status, not_before, created_at)
        select
          null,
          v_digest,
          v_lead,
          d.id,
          d.user_id,
          case when quiet.release_local is null then 'pending' else 'deferred' end,
          coalesce(quiet.release_local at time zone coalesce(d.time_zone, 'UTC'), p_now),
          p_now
        from public.mobile_push_devices d
        join public.mobile_notification_preferences p on p.user_id = d.user_id
        cross join lateral (select p_now at time zone coalesce(d.time_zone, 'UTC') as moment) here
        cross join lateral (select here.moment::time as clock_time, here.moment::date as calendar_day) wall
        cross join lateral (
          select case
            when p.quiet_start is null or p.quiet_end is null or p.quiet_start = p.quiet_end then null
            when p.quiet_start < p.quiet_end then
              case when wall.clock_time >= p.quiet_start and wall.clock_time < p.quiet_end then wall.calendar_day + p.quiet_end end
            when wall.clock_time >= p.quiet_start then (wall.calendar_day + 1) + p.quiet_end
            when wall.clock_time < p.quiet_end then wall.calendar_day + p.quiet_end
          end as release_local
        ) quiet
        where d.user_id = v_candidate.user_id and d.status = 'active' and d.channel_scheme >= 2
          and coalesce(d.time_zone, 'UTC') = any (v_known)
        on conflict do nothing
        returning x.status
      )
      select v_queued + count(*) filter (where i.status = 'pending'), v_deferred + count(*) filter (where i.status = 'deferred')
      into v_queued, v_deferred
      from inserted i;
    end loop;
  end if;

  return jsonb_build_object('built', v_built, 'skipped', v_skipped, 'queued', v_queued, 'deferred', v_deferred, 'more', v_taken >= p_limit);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."build_mobile_push_digests"(timestamp with time zone, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."build_mobile_push_digests"(timestamp with time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."build_mobile_push_digests"(timestamp with time zone, integer) TO "postgres";

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
-- over catalogue pushes only (never digests or other pushes without an event) and with a
-- grouped push counting once, it is recorded as suppressed; a push that joins a group
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
          and x.status in ('pending', 'processing', 'sent', 'deferred') and x.event_id is not null
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

CREATE OR REPLACE FUNCTION public.get_mobile_week_summary (
  p_user_id      uuid,
  p_workspace_id uuid,
  p_week         text                     DEFAULT NULL::text,
  p_time_zone    text                     DEFAULT NULL::text,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The app's "Your week" screen for one workspace: ISO week p_week ("2026-W43"; this week when
-- null) in p_time_zone (when null, the time zone of the user's most recently seen device, else
-- UTC), up to now while the week is still running. Totals for the week and for the same local
-- span of the week before, the change between them when both are above zero, all seven days, the
-- top five models by requests, and the releases that week the user's notification rules match.
-- Spend is in US dollars. Null when p_week is not a real ISO week.
-- Service role only: the account route checks workspace membership before calling it.
with zone as (
  select coalesce(
    nullif(btrim(p_time_zone), ''),
    (
      select d.time_zone from public.mobile_push_devices d
      where d.user_id = p_user_id and d.status = 'active' and d.time_zone is not null
      order by d.last_seen_at desc, d.id
      limit 1
    ),
    'UTC'
  ) as name
),
bounds as (
  select
    zone.name as time_zone,
    week.monday,
    week.monday::timestamp at time zone zone.name as week_start,
    (week.monday + 7)::timestamp at time zone zone.name as week_end,
    (week.monday - 7)::timestamp at time zone zone.name as previous_start
  from zone
  cross join lateral (
    select case
      when p_week is null then date_trunc('week', p_now at time zone zone.name)::date
      else private.mobile_iso_week_monday(p_week)
    end as monday
  ) week
  where week.monday is not null
),
spans as (
  select
    b.*,
    span.until,
    ((span.until at time zone b.time_zone) - interval '7 days') at time zone b.time_zone as previous_until
  from bounds b
  cross join lateral (select least(b.week_end, greatest(b.week_start, p_now)) as until) span
),
figures as (
  select
    s.*,
    private.mobile_week_usage(p_workspace_id, s.week_start, s.until, s.time_zone, true) as current_week,
    private.mobile_week_usage(p_workspace_id, s.previous_start, s.previous_until, s.time_zone) as previous_week,
    private.mobile_week_releases(p_user_id, s.week_start, s.until) as releases
  from spans s
)
select jsonb_build_object(
  'week', to_char(f.monday, 'IYYY-"W"IW'),
  'timeZone', f.time_zone,
  'from', to_char(f.week_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'to', to_char(f.until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'weekEnd', to_char(f.week_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'complete', p_now >= f.week_end,
  'workspace', (select jsonb_build_object('id', w.id, 'name', w.name) from public.workspaces w where w.id = p_workspace_id),
  'totals', jsonb_build_object(
    'spend', trim_scale(round(cur.spend_nanos / 1e9, 9)),
    'requests', cur.requests,
    'successfulRequests', cur.successful_requests,
    'successRate', case when cur.requests > 0 then round(cur.successful_requests / cur.requests, 4) end,
    'inputTokens', cur.input_tokens,
    'outputTokens', cur.output_tokens,
    'tokens', cur.tokens
  ),
  'previous', jsonb_build_object(
    'from', to_char(f.previous_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'to', to_char(f.previous_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'spend', trim_scale(round(prev.spend_nanos / 1e9, 9)),
    'requests', prev.requests,
    'successfulRequests', prev.successful_requests,
    'successRate', case when prev.requests > 0 then round(prev.successful_requests / prev.requests, 4) end,
    'inputTokens', prev.input_tokens,
    'outputTokens', prev.output_tokens,
    'tokens', prev.tokens
  ),
  'change', jsonb_build_object(
    'spend', case when cur.spend_nanos > 0 and prev.spend_nanos > 0 then round((cur.spend_nanos - prev.spend_nanos) / prev.spend_nanos, 4) end,
    'requests', case when cur.requests > 0 and prev.requests > 0 then round((cur.requests - prev.requests) / prev.requests, 4) end
  ),
  'days', (
    select jsonb_agg(jsonb_build_object(
      'date', day.date,
      'spend', trim_scale(round(coalesce((figure.value ->> 'spendNanos')::numeric, 0) / 1e9, 9)),
      'requests', coalesce((figure.value ->> 'requests')::numeric, 0),
      'inputTokens', coalesce((figure.value ->> 'inputTokens')::numeric, 0),
      'outputTokens', coalesce((figure.value ->> 'outputTokens')::numeric, 0),
      'tokens', coalesce((figure.value ->> 'tokens')::numeric, 0)
    ) order by day.date)
    from generate_series(0, 6) as offsets(n)
    cross join lateral (select f.monday + offsets.n as date) day
    left join lateral (
      select item.value from jsonb_array_elements(f.current_week -> 'days') item
      where item.value ->> 'date' = to_char(day.date, 'YYYY-MM-DD')
    ) figure on true
  ),
  'topModels', coalesce((
    select jsonb_agg(jsonb_build_object(
      'modelId', model.value ->> 'modelId',
      'name', coalesce(catalogue.name, model.value ->> 'modelId'),
      'spend', trim_scale(round((model.value ->> 'spendNanos')::numeric / 1e9, 9)),
      'requests', (model.value ->> 'requests')::numeric
    ) order by model.position)
    from jsonb_array_elements(f.current_week -> 'models') with ordinality as model(value, position)
    left join public.v2_models catalogue on catalogue.model_slug = model.value ->> 'modelId'
    where model.position <= 5
  ), '[]'::jsonb),
  'releases', jsonb_build_object('matching', 'rules', 'count', jsonb_array_length(f.releases), 'items', f.releases)
)
from figures f
cross join lateral (
  select
    (f.current_week ->> 'spendNanos')::numeric as spend_nanos,
    (f.current_week ->> 'requests')::numeric as requests,
    (f.current_week ->> 'successfulRequests')::numeric as successful_requests,
    (f.current_week ->> 'inputTokens')::numeric as input_tokens,
    (f.current_week ->> 'outputTokens')::numeric as output_tokens,
    (f.current_week ->> 'tokens')::numeric as tokens
) cur
cross join lateral (
  select
    (f.previous_week ->> 'spendNanos')::numeric as spend_nanos,
    (f.previous_week ->> 'requests')::numeric as requests,
    (f.previous_week ->> 'successfulRequests')::numeric as successful_requests,
    (f.previous_week ->> 'inputTokens')::numeric as input_tokens,
    (f.previous_week ->> 'outputTokens')::numeric as output_tokens,
    (f.previous_week ->> 'tokens')::numeric as tokens
) prev;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_mobile_week_summary"(uuid, uuid, text, text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_mobile_week_summary"(uuid, uuid, text, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_mobile_week_summary"(uuid, uuid, text, text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_mobile_week_summary"(uuid, uuid, text, text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
