import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`;
const ws = (n) => id('1', n);
const key = (n) => id('3', n);
const policy = (n) => id('6', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migration = await readFile(new URL('../migrations/20261015113136_rate_limit_throttle_rollups.sql', import.meta.url), 'utf8');
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const rateLimit = (policyId, scope) => JSON.stringify({ rate_limit: { policy_id: policyId, limit_scope: scope } });

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
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
  await db.exec(migration);

  assert.ok(migration.includes(await schema('public/tables/workspace_rate_limit_throttles_minute.sql')), 'table migration matches the declarative definition');
  assert.ok(migration.includes(await schema('public/functions/refresh_rate_limit_throttle_rollups.sql')), 'function migration matches the declarative definition');

  const fact = (workspace, at, keyId, errorCode, metadata) => db.query(
    `insert into public.v2_request_facts (workspace_id, occurred_at, key_id, error_code, safe_metadata) values ($1, $2, $3, $4, $5::jsonb)`,
    [workspace, at, keyId, errorCode, metadata],
  );
  const [{ minute }] = await rows(`select date_trunc('minute', now() - interval '10 minutes') as minute`);
  const at = (seconds) => new Date(minute.getTime() + seconds * 1000).toISOString();

  await fact(ws(1), at(1), key(1), 'user:rate_limit_exceeded', rateLimit(policy(1), 'key'));
  await fact(ws(1), at(20), key(1), 'user:rate_limit_exceeded', rateLimit(policy(1), 'key'));
  await fact(ws(1), at(61), key(1), 'user:rate_limit_exceeded', rateLimit(policy(1), 'key'));
  // OAuth request: no key.
  await fact(ws(1), at(5), null, 'user:rate_limit_exceeded', rateLimit(policy(2), 'member'));
  await fact(ws(2), at(5), key(2), 'user:rate_limit_exceeded', rateLimit(policy(3), 'end_user'));
  // Not policy throttles: a provider rate limit, a missing policy, a malformed policy id, an unknown scope, a success.
  await fact(ws(1), at(5), key(1), 'rate_limit_exceeded', rateLimit(policy(1), 'key'));
  await fact(ws(1), at(5), key(1), 'user:rate_limit_exceeded', '{}');
  await fact(ws(1), at(5), key(1), 'user:rate_limit_exceeded', rateLimit('not-a-uuid', 'key'));
  await fact(ws(1), at(5), key(1), 'user:rate_limit_exceeded', rateLimit(policy(1), 'workspace'));
  await fact(ws(1), at(5), key(1), null, rateLimit(policy(1), 'key'));
  // Outside the default one-hour window.
  await fact(ws(1), new Date(minute.getTime() - 2 * 3600_000).toISOString(), key(1), 'user:rate_limit_exceeded', rateLimit(policy(1), 'key'));

  // A stale row inside the window is replaced; one before the window is kept; one past retention is pruned.
  await db.query(
    `insert into public.workspace_rate_limit_throttles_minute values
      ($1, $2, $3, 'key', $4, 99),
      (date_trunc('minute', now() - interval '3 hours'), $2, $3, 'key', $4, 7),
      (date_trunc('minute', now() - interval '31 days'), $2, $3, 'key', $4, 5)`,
    [minute, ws(1), policy(1), key(1)],
  );

  const select = () => rows(`
    select workspace_id, bucket_start, policy_id, limit_scope, key_id, throttled_requests
    from public.workspace_rate_limit_throttles_minute
    order by bucket_start, workspace_id, policy_id`);

  const summary = (await rows(`select public.refresh_rate_limit_throttle_rollups() as s`))[0].s;
  assert.equal(summary.rows, 4);
  assert.equal(summary.pruned, 1);

  const expected = [
    { workspace_id: ws(1), bucket: -3 * 3600, policy_id: policy(1), limit_scope: 'key', key_id: key(1), throttled_requests: 7 },
    { workspace_id: ws(1), bucket: 0, policy_id: policy(1), limit_scope: 'key', key_id: key(1), throttled_requests: 2 },
    { workspace_id: ws(1), bucket: 0, policy_id: policy(2), limit_scope: 'member', key_id: null, throttled_requests: 1 },
    { workspace_id: ws(2), bucket: 0, policy_id: policy(3), limit_scope: 'end_user', key_id: key(2), throttled_requests: 1 },
    { workspace_id: ws(1), bucket: 60, policy_id: policy(1), limit_scope: 'key', key_id: key(1), throttled_requests: 1 },
  ];
  const normalize = (result) => result.map(({ bucket_start, ...rest }) => ({
    ...rest,
    bucket: Math.round((bucket_start.getTime() - minute.getTime()) / 1000 / 60) * 60,
  }));
  const [threeHoursAgo] = await rows(`select date_trunc('minute', now() - interval '3 hours') as t`);
  expected[0].bucket = Math.round((threeHoursAgo.t.getTime() - minute.getTime()) / 1000 / 60) * 60;
  assert.deepEqual(normalize(await select()), expected);

  // Idempotent: a second run rebuilds the same counts.
  await rows(`select public.refresh_rate_limit_throttle_rollups()`);
  assert.deepEqual(normalize(await select()), expected);

  // An explicit earlier start reaches facts outside the default window.
  const wider = (await rows(`select public.refresh_rate_limit_throttle_rollups(now() - interval '3 hours') as s`))[0].s;
  assert.equal(wider.rows, 5);
  // The 3-hour-old stale row is inside the wider window, so it is rebuilt from facts (none at that minute).
  assert.equal((await select()).length, 5);
  assert.equal((await rows(`select count(*)::int as n from public.workspace_rate_limit_throttles_minute where throttled_requests = 7`))[0].n, 0);

  // Deleting a workspace removes its rows.
  await db.exec(`delete from public.workspaces where id = '${ws(2)}'`);
  assert.equal((await rows(`select count(*)::int as n from public.workspace_rate_limit_throttles_minute where workspace_id = '${ws(2)}'`))[0].n, 0);
  // Its facts remain, but the next refresh skips them rather than failing on the foreign key.
  const afterDelete = (await rows(`select public.refresh_rate_limit_throttle_rollups() as s`))[0].s;
  assert.equal(afterDelete.rows, 3);
  assert.equal((await rows(`select count(*)::int as n from public.workspace_rate_limit_throttles_minute where workspace_id = '${ws(2)}'`))[0].n, 0);

  for (const role of ['anon', 'authenticated']) {
    const [grant] = await rows(`select has_function_privilege($1, 'public.refresh_rate_limit_throttle_rollups(timestamptz)', 'execute') as ok`, [role]);
    assert.equal(grant.ok, false, `${role} cannot run the refresh`);
  }
  const [serviceGrant] = await rows(`select has_function_privilege('service_role', 'public.refresh_rate_limit_throttle_rollups(timestamptz)', 'execute') as ok`);
  assert.equal(serviceGrant.ok, true);

  console.log('rate-limit-throttle-rollups: ok');
} finally {
  await db.close();
}
