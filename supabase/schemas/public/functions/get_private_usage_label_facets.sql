CREATE OR REPLACE FUNCTION public.get_private_usage_label_facets (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_key_id       uuid                     DEFAULT NULL::uuid,
  p_exclude_key  boolean                  DEFAULT false,
  p_creator_id   uuid                     DEFAULT NULL::uuid,
  p_limit        integer                  DEFAULT 500
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- The request labels a workspace used from p_from to p_to inclusive, with how many
-- requests carried each, for the usage overview's label filter: the most used first,
-- at most p_limit. Whole quarter hours come from v2_private_usage_labels_15m and the
-- minutes outside them, and the latest half hour, from v2_usage_overview_requests, as
-- in get_private_usage_overview.
-- Service role only: the account routes check workspace membership before calling it.
with bounds as (
  select
    rolled.rolled_from,
    rolled.rolled_to,
    rolled.rolled_to > rolled.rolled_from as use_rollup
  from (
    select
      date_bin('15 minutes', p_from - interval '1 microsecond', timestamptz '2000-01-01 00:00:00+00') + interval '15 minutes' as rolled_from,
      date_bin('15 minutes', p_to, timestamptz '2000-01-01 00:00:00+00') - interval '15 minutes' as rolled_to
  ) rolled
),
raw_ranges as (
  select p_from as range_from, p_to + interval '1 microsecond' as range_to from bounds where not bounds.use_rollup
  union all
  select p_from, bounds.rolled_from from bounds where bounds.use_rollup and bounds.rolled_from > p_from
  union all
  select bounds.rolled_to, p_to + interval '1 microsecond' from bounds where bounds.use_rollup
),
label_rows as (
  select label.value ->> 'key' as label_key, label.value ->> 'value' as label_value, request.key_id, 1::bigint as requests
  from raw_ranges
  join private.v2_usage_overview_requests request
    on request.workspace_id = p_workspace_id
    and request.occurred_at >= raw_ranges.range_from
    and request.occurred_at < raw_ranges.range_to
  cross join lateral jsonb_array_elements(request.labels) label
  where jsonb_typeof(label.value -> 'key') = 'string' and jsonb_typeof(label.value -> 'value') = 'string'
  union all
  select rollup.label_key, rollup.label_value, rollup.key_id, rollup.requests
  from bounds
  join public.v2_private_usage_labels_15m rollup
    on rollup.workspace_id = p_workspace_id
    and rollup.bucket_start >= bounds.rolled_from
    and rollup.bucket_start < bounds.rolled_to
  where bounds.use_rollup
),
facets as (
  select label_rows.label_key, label_rows.label_value, sum(label_rows.requests) as requests
  from label_rows
  where (p_key_id is null or case when p_exclude_key
      then label_rows.key_id is distinct from p_key_id
      else label_rows.key_id = p_key_id end)
    and (p_creator_id is null or exists (
      select 1 from public.keys key
      where key.id = label_rows.key_id
        and key.workspace_id = p_workspace_id
        and key.created_by = p_creator_id
    ))
  group by 1, 2
  order by 3 desc, 1, 2
  limit greatest(0, least(coalesce(p_limit, 500), 500))
)
select coalesce(jsonb_agg(jsonb_build_object(
  'key', facets.label_key,
  'value', facets.label_value,
  'requests', facets.requests
) order by facets.requests desc, facets.label_key, facets.label_value), '[]'::jsonb)
from facets;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_label_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid, boolean, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_label_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid, boolean, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_label_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid, boolean, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_label_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid, boolean, uuid, integer) FROM PUBLIC, "anon", "authenticated";
