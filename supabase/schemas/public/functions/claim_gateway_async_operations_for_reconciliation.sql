CREATE OR REPLACE FUNCTION public.claim_gateway_async_operations_for_reconciliation (
  p_kind          text,
  p_limit         integer DEFAULT 100,
  p_statuses      text[]  DEFAULT NULL::text[],
  p_worker_id     text    DEFAULT 'gateway-reconciler'::text,
  p_lease_seconds integer DEFAULT 120,
  p_shard_count   integer DEFAULT 1,
  p_shard_index   integer DEFAULT 0
)
  RETURNS TABLE (
    workspace_id         uuid,
    kind                 text,
    internal_id          text,
    request_id           text,
    session_id           text,
    app_id               uuid,
    provider             text,
    native_id            text,
    model                text,
    status               text,
    meta                 jsonb,
    billed_at            timestamp with time zone,
    next_reconcile_at    timestamp with time zone,
    reconcile_attempts   integer,
    reconcile_locked_at  timestamp with time zone,
    reconcile_locked_by  text,
    last_reconcile_error text,
    created_at           timestamp with time zone,
    updated_at           timestamp with time zone
  )
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 2000));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 3600));
  v_shard_count integer := greatest(1, least(coalesce(p_shard_count, 1), 256));
  v_shard_index integer := greatest(0, least(coalesce(p_shard_index, 0), greatest(1, least(coalesce(p_shard_count, 1), 256)) - 1));
  v_worker_id text := left(coalesce(nullif(trim(p_worker_id), ''), 'gateway-reconciler'), 200);
begin
  return query
  with candidates as (
    select op.id
    from public.gateway_async_operations op
    where op.kind = p_kind
      and op.billed_at is null
      and (op.next_reconcile_at is null or op.next_reconcile_at <= now())
      and (
        op.reconcile_locked_at is null
        or op.reconcile_locked_at < now() - make_interval(secs => v_lease_seconds)
      )
      and (
        p_statuses is null
        or coalesce(op.status, '') = any(p_statuses)
      )
      and not (op.kind = 'batch' and op.meta->>'resource' = 'file')
      and (
        v_shard_count = 1
        or mod(
          mod(hashtextextended(op.workspace_id::text || ':' || op.internal_id, 0), v_shard_count::bigint)
            + v_shard_count::bigint,
          v_shard_count::bigint
        ) = v_shard_index::bigint
      )
    order by op.next_reconcile_at asc nulls first, op.updated_at asc
    limit v_limit
    for update skip locked
  ),
  claimed as (
    update public.gateway_async_operations op
    set
      reconcile_locked_at = now(),
      reconcile_locked_by = v_worker_id,
      reconcile_attempts = op.reconcile_attempts + 1,
      updated_at = now()
    from candidates
    where op.id = candidates.id
    returning op.*
  )
  select
    claimed.workspace_id,
    claimed.kind,
    claimed.internal_id,
    claimed.request_id,
    claimed.session_id,
    claimed.app_id,
    claimed.provider,
    claimed.native_id,
    claimed.model,
    claimed.status,
    claimed.meta,
    claimed.billed_at,
    claimed.next_reconcile_at,
    claimed.reconcile_attempts,
    claimed.reconcile_locked_at,
    claimed.reconcile_locked_by,
    claimed.last_reconcile_error,
    claimed.created_at,
    claimed.updated_at
  from claimed
  order by claimed.next_reconcile_at asc nulls first, claimed.updated_at asc;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_gateway_async_operations_for_reconciliation"(text, integer, text[], text, integer, integer, integer) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."claim_gateway_async_operations_for_reconciliation"(text, integer, text[], text, integer, integer, integer) TO "service_role";

COMMENT ON FUNCTION "public"."claim_gateway_async_operations_for_reconciliation"(text, integer, text[], text, integer, integer, integer) IS 'Atomically claims due, unbilled async operations for reconciliation using a short service-role lease and FOR UPDATE SKIP LOCKED.';

REVOKE ALL ON FUNCTION "public"."claim_gateway_async_operations_for_reconciliation"(text, integer, text[], text, integer, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."claim_gateway_async_operations_for_reconciliation"(text, integer, text[], text, integer, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_gateway_async_operations_for_reconciliation"(text, integer, text[], text, integer, integer, integer) TO "postgres";
