import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

// The spend-limit seed must count exactly what the request-context key-limit check counts.
const db = new PGlite();
const workspace = '10000000-0000-4000-8000-000000000001';
const otherWorkspace = '10000000-0000-4000-8000-000000000002';
const capped = '20000000-0000-4000-8000-000000000001';
const unlimited = '20000000-0000-4000-8000-000000000002';
const blocked = '20000000-0000-4000-8000-000000000003';
const foreign = '20000000-0000-4000-8000-000000000004';
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;

try {
  await db.exec(await readFile(new URL('./fixtures/context-bundle-before.sql', import.meta.url), 'utf8'));
  await db.exec(`
    alter table public.gateway_requests
      add column if not exists key_id uuid, add column if not exists success boolean,
      add column if not exists cost_nanos bigint, add column if not exists detail_metadata jsonb;
    alter table public.byok_keys add column if not exists name text;
    create table public.workspace_budgets (id uuid primary key, workspace_id uuid, interval text, limit_nanos bigint,
      created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.gateway_wallet_reservations (workspace_id uuid, reservation_id text, amount_nanos bigint, status text,
      hold_ref_id text, created_at timestamptz default now(), settled_amount_nanos bigint, captured_nanos bigint default 0,
      released_nanos bigint default 0, key_id uuid);
  `);
  for (const path of [
    'public/functions/gateway_workspace_budget_status.sql',
    'public/functions/gateway_fetch_request_context_without_workspace_budget.sql',
  ]) await db.exec(await schema(path));
  const migration = await readFile(new URL('../migrations/20261009000400_gateway_spend_limit_seed.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  assert.equal(await schema('public/functions/gateway_spend_limit_seed.sql'),
    migration.replace(/^SET local check_function_bodies = off;\n\n/, ''), 'migration matches the declarative definition');

  const bounds = (await db.query(`select date_trunc('day', now() at time zone 'utc')::timestamptz as day,
    date_trunc('week', now() at time zone 'utc')::timestamptz as week, date_trunc('month', now() at time zone 'utc')::timestamptz as month`)).rows[0];
  const at = (base, offsetMs) => new Date(base.getTime() + offsetMs).toISOString();
  await db.exec(`
    insert into public.workspaces(id, created_at, tier) values ('${workspace}', now(), 'basic'), ('${otherWorkspace}', now(), 'basic');
    insert into public.wallets(workspace_id, balance_nanos, reserved_nanos) values ('${workspace}', 5000000000, 0);
    insert into public.keys(id, workspace_id, name, status, soft_blocked, created_at,
      daily_limit_requests, weekly_limit_requests, monthly_limit_requests,
      daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos) values
      ('${capped}', '${workspace}', 'capped', 'active', false, now(), 50, null, 0, null, null, 100000),
      ('${unlimited}', '${workspace}', 'unlimited', 'active', false, now(), null, 0, null, null, null, null),
      ('${blocked}', '${workspace}', 'blocked', 'active', true, now(), null, null, null, null, 7, null),
      ('${foreign}', '${otherWorkspace}', 'foreign', 'active', false, now(), 1, null, null, null, null, null);
    insert into public.workspace_budgets(id, workspace_id, interval, limit_nanos) values
      ('30000000-0000-4000-8000-000000000001', '${workspace}', 'daily', 900),
      ('30000000-0000-4000-8000-000000000002', '${workspace}', 'lifetime', 1000000);
    insert into public.gateway_wallet_reservations(workspace_id, reservation_id, amount_nanos, status, created_at) values
      ('${workspace}', 'batch:1', 40, 'reserved', now());
  `);
  const rows = [
    ['today-1', capped, true, 100, at(bounds.day, 60_000)],
    ['today-2', capped, true, null, at(bounds.day, 120_000)],
    ['today-failed', capped, false, 999, at(bounds.day, 1_000)],
    ['yesterday', capped, true, 30, at(bounds.day, -1_000)],
    ['last-week', capped, true, 50, at(bounds.week, -1_000)],
    ['last-month', capped, true, 70, at(bounds.month, -1_000)],
    ['month-start', capped, true, 11, bounds.month.toISOString()],
    ['ancient', capped, true, 13, at(bounds.month, -40 * 86_400_000)],
    ['blocked-1', blocked, true, 5, at(bounds.day, 1_000)],
    ['unlimited-1', unlimited, true, 3, at(bounds.day, 1_000)],
  ];
  for (const [requestId, key, success, cost, createdAt] of rows) {
    await db.query(`insert into public.gateway_requests(id, created_at, workspace_id, request_id, key_id, success, cost_nanos)
      values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`, [createdAt, workspace, requestId, key, success, cost]);
  }
  await db.query(`insert into public.gateway_requests(id, created_at, workspace_id, request_id, key_id, success, cost_nanos)
    values (gen_random_uuid(), now(), $1, 'other-workspace', $2, true, 500)`, [otherWorkspace, capped]);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query(`select public.gateway_spend_limit_seed('${workspace}', array['${capped}']::uuid[])`), /permission denied/);
    await db.exec('reset role');
  }
  const attributes = (await db.query(`select provolatile, prosecdef from pg_proc where proname = 'gateway_spend_limit_seed'`)).rows[0];
  assert.deepEqual(attributes, { provolatile: 's', prosecdef: true });

  const keyIds = `array['${capped}', '${unlimited}', '${blocked}', '${foreign}']::uuid[]`;
  await db.exec('set role service_role');
  const seed = await one(`select public.gateway_spend_limit_seed('${workspace}', ${keyIds}) as value`);
  await db.exec('reset role');
  assert.deepEqual(seed.keys.map((key) => key.key_id), [capped, unlimited, blocked], 'only keys of the workspace');
  assert.equal(seed.excluded_rows.length, 0);

  // Every limited key matches the existing context function bucket for bucket.
  for (const keyId of [capped, blocked]) {
    const context = await one(`select public.gateway_fetch_request_context_without_workspace_budget($1, 'lab/model', 'text.generate', $2) as value`, [workspace, keyId]);
    const key = seed.keys.find((entry) => entry.key_id === keyId);
    for (const [bucket, window] of [['daily', 'daily'], ['weekly', 'weekly'], ['monthly', 'monthly']]) {
      const expected = context.key_limit_ok.buckets[bucket];
      assert.equal(Number(key.used[window].requests), Number(expected.requests_used), `${keyId} ${bucket} requests`);
      assert.equal(Number(key.used[window].cost_nanos), Number(expected.cost_used_nanos), `${keyId} ${bucket} cost`);
      assert.deepEqual([key.limits[window].requests, key.limits[window].cost_nanos],
        [expected.requests_limit, expected.cost_limit_nanos], `${keyId} ${bucket} limits`);
    }
    assert.equal(key.soft_blocked, keyId === blocked);
    assert.equal(seed.day_start, context.key_limit_ok.buckets.daily.window_start);
    assert.equal(seed.week_start, context.key_limit_ok.buckets.weekly.window_start);
    assert.equal(seed.month_start, context.key_limit_ok.buckets.monthly.window_start);
  }
  const cappedSeed = seed.keys.find((key) => key.key_id === capped);
  assert.equal(cappedSeed.used.daily.requests, 2);
  assert.equal(cappedSeed.used.daily.cost_nanos, 100);
  const unlimitedSeed = seed.keys.find((key) => key.key_id === unlimited);
  assert.deepEqual([unlimitedSeed.limited, unlimitedSeed.used], [false, null], 'unlimited keys need no history read');

  // Budget status is the existing function's output (apart from its own clock reading).
  const budget = await one(`select public.gateway_workspace_budget_status('${workspace}', 0) as value`);
  const withoutNow = ({ now: _now, ...rest }) => rest;
  assert.deepEqual(withoutNow(seed.budget_status), withoutNow(budget));
  assert.equal(seed.budget_status.budgets.find((entry) => entry.interval === 'daily').usage_nanos, 100 + 5 + 3 + 40);

  // Recorded requests are excluded from the counts and returned when persisted.
  const excluded = await one(`select public.gateway_spend_limit_seed('${workspace}', ${keyIds}, array['today-1', 'month-start', 'not-yet-written']) as value`);
  const cappedExcluded = excluded.keys.find((key) => key.key_id === capped);
  assert.equal(cappedExcluded.used.daily.requests, 1);
  assert.equal(cappedExcluded.used.daily.cost_nanos, 0);
  assert.equal(cappedExcluded.used.monthly.requests, cappedSeed.used.monthly.requests - 2);
  assert.equal(cappedExcluded.used.monthly.cost_nanos, cappedSeed.used.monthly.cost_nanos - 111);
  assert.deepEqual(excluded.excluded_rows.map((row) => [row.request_id, row.success, row.cost_nanos]),
    [['month-start', true, 11], ['today-1', true, 100]]);
  assert.deepEqual(excluded.budget_status.budgets, seed.budget_status.budgets);

  await assert.rejects(db.query(`select public.gateway_spend_limit_seed(null, ${keyIds})`), /workspace_id_required/);
  await assert.rejects(db.query(`select public.gateway_spend_limit_seed('${workspace}', ${keyIds},
    array(select i::text from generate_series(1, 5001) i))`), /too_many_excluded_request_ids/);
  console.log('Spend-limit seed: matches context key-limit windows and filters, excludes recorded requests, service role only.');
} finally {
  await db.close();
}
