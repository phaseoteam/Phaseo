import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`;
const ws = (n) => id('1', n);
const key = (n) => id('3', n);
const policy = (n) => id('6', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_rate_limit_throttle_summary.sql'));
const migration = await readFile(new URL(`../migrations/${migrationName}`, import.meta.url), 'utf8');
const rollupMigration = await readFile(new URL('../migrations/20261016165752_rate_limit_throttle_rollups.sql', import.meta.url), 'utf8');
const schemaPath = 'public/functions/workspace_rate_limit_throttle_summary.sql';
const schema = await readFile(new URL(`../schemas/${schemaPath}`, import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../schemas/.pgdelta-export.json', import.meta.url), 'utf8'));

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.workspaces (id uuid primary key);
    create table public.v2_request_facts (
      request_event_id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      occurred_at timestamptz not null default now(),
      key_id uuid,
      error_code text,
      safe_metadata jsonb not null default '{}'::jsonb
    );
    insert into public.workspaces values ('${ws(1)}'), ('${ws(2)}');
  `);
  await db.exec(rollupMigration);
  await db.exec(migration);

  assert.ok(migration.replace(/\r\n/g, '\n').includes(schema.replace(/\r\n/g, '\n').trim()), 'migration matches the declarative definition');
  assert.ok(manifest.loadOrder.includes(schemaPath) && manifest.files.includes(schemaPath), 'manifest lists the function');

  const [{ now }] = await rows(`select date_trunc('minute', now()) as now`);
  const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
  await db.query(
    `insert into public.workspace_rate_limit_throttles_minute values
      ($1, $5, $7, 'key', $9, 3),
      ($2, $5, $7, 'key', $9, 4),
      ($2, $5, $7, 'member', null, 2),
      ($3, $5, $8, 'department', $9, 1),
      ($4, $5, $8, 'department', $9, 50),
      ($2, $6, $7, 'key', $10, 40)`,
    [minutesAgo(5), minutesAgo(90), minutesAgo(23 * 60), minutesAgo(25 * 60), ws(1), ws(2), policy(1), policy(2), key(1), key(2)],
  );

  const summary = async (since) => (await rows(
    since ? `select public.workspace_rate_limit_throttle_summary($1, $2) as s` : `select public.workspace_rate_limit_throttle_summary($1) as s`,
    since ? [ws(1), since] : [ws(1)],
  ))[0].s;

  // Default window is the last 24 hours: the 25-hour-old bucket and the other workspace are left out.
  assert.deepEqual(await summary(), [
    { policy_id: policy(1), throttled_requests: 9, last_throttled_at: minutesAgo(5).replace('.000Z', '+00:00') },
    { policy_id: policy(2), throttled_requests: 1, last_throttled_at: minutesAgo(23 * 60).replace('.000Z', '+00:00') },
  ]);
  // A shorter window, and a workspace with nothing throttled, which returns an empty array.
  assert.deepEqual(await summary(minutesAgo(60)), [
    { policy_id: policy(1), throttled_requests: 3, last_throttled_at: minutesAgo(5).replace('.000Z', '+00:00') },
  ]);
  assert.deepEqual((await rows(`select public.workspace_rate_limit_throttle_summary($1) as s`, [id('1', 9)]))[0].s, []);

  const grants = await rows(`
    select grantee from information_schema.role_routine_grants
    where routine_name = 'workspace_rate_limit_throttle_summary' and privilege_type = 'EXECUTE'
    order by grantee`);
  assert.deepEqual(grants.map((grant) => grant.grantee).filter((grantee) => grantee !== 'postgres'), ['service_role']);

  console.log('rate limit throttle summary: ok');
} finally {
  await db.close();
}
