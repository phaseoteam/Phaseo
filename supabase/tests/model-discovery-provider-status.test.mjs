import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const migration = await readFile(new URL('../migrations/20261017101500_model_discovery_provider_status.sql', import.meta.url), 'utf8');
const schema = await readFile(new URL('../schemas/public/tables/model_discovery_provider_status.sql', import.meta.url), 'utf8');

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;`);
  await db.exec(migration);

  assert.ok(migration.includes(schema), 'migration matches the declarative definition');

  // The watcher upserts one row per provider on every sweep.
  const upsert = `
    insert into public.model_discovery_provider_status
      (provider_id, provider_name, status, reason, consecutive_failures, failing_since, last_checked_at)
    values ($1, $2, $3, $4, $5, $6, now())
    on conflict (provider_id) do update set
      status = excluded.status,
      reason = excluded.reason,
      consecutive_failures = excluded.consecutive_failures,
      failing_since = excluded.failing_since,
      last_checked_at = excluded.last_checked_at`;
  await db.query(upsert, ['stepfun', 'StepFun', 'error', 'HTTP 401', 1, new Date().toISOString()]);
  await db.query(upsert, ['stepfun', 'StepFun', 'error', 'HTTP 401', 2, new Date().toISOString()]);
  await db.query(upsert, ['mistral', 'Mistral', 'ok', null, 0, null]);
  const rows = (await db.query(`select provider_id, status, consecutive_failures from public.model_discovery_provider_status order by provider_id`)).rows;
  assert.deepEqual(rows, [
    { provider_id: 'mistral', status: 'ok', consecutive_failures: 0 },
    { provider_id: 'stepfun', status: 'error', consecutive_failures: 2 },
  ]);

  await assert.rejects(
    db.query(upsert, ['other', 'Other', 'broken', null, 0, null]),
    /model_discovery_provider_status_status_check/,
    'unknown statuses are rejected',
  );
  await assert.rejects(
    db.query(upsert, ['other', 'Other', 'error', null, -1, null]),
    /model_discovery_provider_status_consecutive_failures_check/,
    'negative streaks are rejected',
  );

  // Clients never read operator health directly.
  const grants = (await db.query(`
    select grantee, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'model_discovery_provider_status'
    order by grantee, privilege_type`)).rows;
  assert.deepEqual(grants.filter((row) => row.grantee !== 'postgres'), [
    { grantee: 'service_role', privilege_type: 'DELETE' },
    { grantee: 'service_role', privilege_type: 'INSERT' },
    { grantee: 'service_role', privilege_type: 'SELECT' },
    { grantee: 'service_role', privilege_type: 'UPDATE' },
  ]);
  const [{ relrowsecurity }] = (await db.query(`select relrowsecurity from pg_class where relname = 'model_discovery_provider_status'`)).rows;
  assert.equal(relrowsecurity, true, 'row level security is enabled');

  console.log('model discovery provider status: ok');
} finally {
  await db.close();
}
