-- Async operation reconciliation leasing.
-- Keeps billing/finalization independent from user result fetches while allowing
-- multiple workers to claim due jobs without processing the same operation twice.

alter table public.gateway_async_operations
  add column if not exists next_reconcile_at timestamptz null,
  add column if not exists reconcile_attempts integer not null default 0,
  add column if not exists reconcile_locked_at timestamptz null,
  add column if not exists reconcile_locked_by text null,
  add column if not exists last_reconcile_error text null;

create index if not exists gateway_async_operations_reconcile_due_idx
  on public.gateway_async_operations (kind, next_reconcile_at asc nulls first, updated_at asc)
  where billed_at is null;

create index if not exists gateway_async_operations_reconcile_lock_idx
  on public.gateway_async_operations (kind, reconcile_locked_at asc)
  where billed_at is null and reconcile_locked_at is not null;

comment on column public.gateway_async_operations.next_reconcile_at is
  'Next time a scheduled reconciler should claim this async operation for provider status refresh/finalization.';
comment on column public.gateway_async_operations.reconcile_attempts is
  'Number of reconciliation claim attempts. Used for bounded retry backoff.';
comment on column public.gateway_async_operations.reconcile_locked_at is
  'Lease timestamp set by claim_gateway_async_operations_for_reconciliation to avoid duplicate workers.';
comment on column public.gateway_async_operations.reconcile_locked_by is
  'Worker identifier holding the current reconciliation lease.';
comment on column public.gateway_async_operations.last_reconcile_error is
  'Last reconciliation error summary, cleared after a successful attempt.';

create or replace function public.claim_gateway_async_operations_for_reconciliation(
  p_kind text,
  p_limit integer default 100,
  p_statuses text[] default null,
  p_worker_id text default 'gateway-reconciler',
  p_lease_seconds integer default 120,
  p_shard_count integer default 1,
  p_shard_index integer default 0
)
returns table (
  workspace_id uuid,
  kind text,
  internal_id text,
  request_id text,
  session_id text,
  app_id uuid,
  provider text,
  native_id text,
  model text,
  status text,
  meta jsonb,
  billed_at timestamptz,
  next_reconcile_at timestamptz,
  reconcile_attempts integer,
  reconcile_locked_at timestamptz,
  reconcile_locked_by text,
  last_reconcile_error text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.claim_gateway_async_operations_for_reconciliation(
  text,
  integer,
  text[],
  text,
  integer,
  integer,
  integer
) from public;
grant execute on function public.claim_gateway_async_operations_for_reconciliation(
  text,
  integer,
  text[],
  text,
  integer,
  integer,
  integer
) to service_role;

comment on function public.claim_gateway_async_operations_for_reconciliation(
  text,
  integer,
  text[],
  text,
  integer,
  integer,
  integer
) is
  'Atomically claims due, unbilled async operations for reconciliation using a short service-role lease and FOR UPDATE SKIP LOCKED.';
