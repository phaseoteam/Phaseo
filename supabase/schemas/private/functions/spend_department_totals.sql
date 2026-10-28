CREATE OR REPLACE FUNCTION private.spend_department_totals (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone
)
  RETURNS TABLE (
    department_id uuid,
    cost_nanos    numeric,
    requests      bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Spend per department from p_from (inclusive) to p_to (exclusive), in one query for spend
  -- rules. Usage is summed per key and actor first, then each pair is spread over the
  -- departments private.spend_scope_departments gives it, so a person in two departments
  -- counts in full toward both (unless the workspace counts primary departments only).
  -- Whole quarter hours from v2_private_usage_15m, plus async jobs and realtime sessions
  -- from gateway_requests as sweep_spend_limit_warnings adds them. Like that sweep, it reads
  -- the rollup as it stands: hours the outbox has yet to rebuild count late.
  with usage as (
    select usage.key_id, usage.actor_user_id, sum(usage.cost_nanos) as cost_nanos, sum(usage.requests)::bigint as requests
    from (
      select rollup.key_id, rollup.actor_user_id, rollup.cost_nanos, rollup.requests
      from public.v2_private_usage_15m rollup
      where rollup.workspace_id = p_workspace_id
        and rollup.bucket_start >= p_from
        and rollup.bucket_start < p_to
      union all
      -- gateway_requests_async_spend_idx
      select request.key_id, coalesce(request.oauth_user_id, key.oauth_user_id, key.created_by),
        coalesce(request.cost_nanos, 0)::numeric, 1::bigint
      from public.gateway_requests request
      left join public.keys key on key.id = request.key_id
      where request.success is true
        and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
        and request.workspace_id = p_workspace_id
        and request.created_at >= p_from
        and request.created_at < p_to
    ) usage
    group by usage.key_id, usage.actor_user_id
  )
  select scope.department_id, sum(usage.cost_nanos), sum(usage.requests)::bigint
  from usage
  cross join lateral private.spend_scope_departments(p_workspace_id, usage.key_id, usage.actor_user_id) scope(department_id)
  group by scope.department_id;
$function$;

COMMENT ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) IS 'Spend and requests per department for a workspace over [p_from, p_to), attributed by private.spend_scope_departments. Spend with no department is left out; a person in several departments counts toward each unless the workspace counts primary departments only.';

REVOKE ALL ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) TO "service_role";
