SET local check_function_bodies = off;

-- Per-minute counts of requests rejected by workspace rate limit policies, rebuilt from v2_request_facts.

CREATE TABLE "public"."workspace_rate_limit_throttles_minute" (
  "bucket_start"       timestamp with time zone NOT NULL,
  "workspace_id"       uuid                     NOT NULL,
  "policy_id"          uuid                     NOT NULL,
  "limit_scope"        text                     NOT NULL,
  "key_id"             uuid,
  "throttled_requests" integer                  NOT NULL,
  CONSTRAINT "workspace_rate_limit_throttles_minute_key" UNIQUE NULLS NOT DISTINCT (workspace_id, bucket_start, policy_id, limit_scope, key_id),
  CONSTRAINT "workspace_rate_limit_throttles_minute_limit_scope_check"
    CHECK ((limit_scope = ANY (ARRAY['key'::text, 'member'::text, 'guardrail'::text, 'end_user'::text, 'department'::text]))),
  CONSTRAINT "workspace_rate_limit_throttles_minute_throttled_requests_check" CHECK ((throttled_requests > 0)),
  CONSTRAINT "workspace_rate_limit_throttles_minute_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_rate_limit_throttles_minute"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_rate_limit_throttles_minute_bucket_idx ON public.workspace_rate_limit_throttles_minute USING btree (bucket_start);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_rate_limit_throttles_minute"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_rate_limit_throttles_minute" IS 'Requests rejected by a workspace rate limit policy, per minute, policy, limit scope and API key (null for OAuth requests). Rebuilt from v2_request_facts by refresh_rate_limit_throttle_rollups; kept for 30 days.';

REVOKE ALL ON TABLE "public"."workspace_rate_limit_throttles_minute" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."workspace_rate_limit_throttles_minute" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_rate_limit_throttles_minute" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.refresh_rate_limit_throttle_rollups (
  p_since timestamp with time zone DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '30s'
  SET lock_timeout TO '2s'
  AS $function$
declare
  -- Rebuilding the trailing hour absorbs late audit writes and a few missed runs.
  v_from timestamptz := date_trunc('minute',
    greatest(coalesce(p_since, now() - interval '1 hour'), now() - interval '1 day'));
  v_rows integer;
  v_pruned integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('public.refresh_rate_limit_throttle_rollups', 0)) then
    return jsonb_build_object('rows', 0, 'pruned', 0, 'skipped_locked', true);
  end if;

  delete from public.workspace_rate_limit_throttles_minute rollup
  where rollup.bucket_start >= v_from;

  insert into public.workspace_rate_limit_throttles_minute (
    bucket_start, workspace_id, policy_id, limit_scope, key_id, throttled_requests
  )
  select
    date_trunc('minute', fact.occurred_at),
    fact.workspace_id,
    (fact.safe_metadata->'rate_limit'->>'policy_id')::uuid,
    fact.safe_metadata->'rate_limit'->>'limit_scope',
    fact.key_id,
    count(*)
  from public.v2_request_facts fact
  where fact.occurred_at >= v_from
    and fact.error_code = 'user:rate_limit_exceeded'
    and fact.safe_metadata->'rate_limit'->>'policy_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and fact.safe_metadata->'rate_limit'->>'limit_scope' in ('key', 'member', 'guardrail', 'end_user', 'department')
  group by 1, 2, 3, 4, 5;
  get diagnostics v_rows = row_count;

  delete from public.workspace_rate_limit_throttles_minute rollup
  where rollup.bucket_start < now() - interval '30 days';
  get diagnostics v_pruned = row_count;

  return jsonb_build_object('from', v_from, 'rows', v_rows, 'pruned', v_pruned);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) TO "service_role";

COMMENT ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) IS 'Rebuilds per-minute rate limit policy throttle counts from v2_request_facts since p_since (default one hour ago, at most one day), then prunes rows older than 30 days. Runs on the gateway''s five-minute schedule.';

REVOKE ALL ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
