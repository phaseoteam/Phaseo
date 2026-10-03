# Gateway key usage index

The gateway enforces key limits using successful requests filtered by key,
workspace, and time. The former key cost index did not cover workspace ID,
so this check required reading request payload rows. The replacement index
covers all predicates and cost without changing results or RPC permissions.

Run the focused regression test with PGlite 0.5.8:

```powershell
$env:PGLITE_MODULE = '<file URL to @electric-sql/pglite/dist/index.js>'
node supabase/tests/gateway-key-usage-index.test.mjs
```

For a busy production database, generate online preparation statements:

```sql
select format(
  'CREATE INDEX CONCURRENTLY %I ON %s (key_id, workspace_id, created_at) INCLUDE (cost_nanos) WHERE success IS TRUE AND key_id IS NOT NULL;',
  c.relname || '_success_key_workspace_cost_idx', p.relid::regclass
)
from pg_partition_tree('public.gateway_requests') p
join pg_class c on c.oid = p.relid
where p.isleaf;
```

Execute each generated statement separately, outside a transaction. Inspect
existing indexes before retrying interrupted builds; an invalid index must
be removed before rebuilding it. Then apply the migration to attach the
matching child indexes and provide inheritance for future partitions.
The migration aborts if a lock takes more than 500 ms or building takes
more than 15 seconds. A timeout rolls back the migration; prebuilt child
indexes remain available for the next attempt.

Verify the parent is valid and all leaf partitions are attached. Use
`EXPLAIN (ANALYZE, BUFFERS)` on the key-limit query for a busy key to check
index selection and heap fetches. Index-only scans still need heap reads
on pages whose visibility map is not set. Regular vacuum can improve this;
do not use `VACUUM FULL` for incident recovery.

The index adds storage and write overhead; the old key indexes remain in
place until representative production reads justify retiring them.
Rollback consists of dropping this new parent index, which also removes
its attached child indexes. Request rows and accounting data are unaffected.
