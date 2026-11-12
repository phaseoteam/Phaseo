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
