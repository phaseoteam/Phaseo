import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installCatalogPolicyContext } from './fixtures/catalog-policy-context.mjs';
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
  await installCatalogPolicyContext(db);
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
    alter table public.keys add column if not exists department_id uuid;
    -- Department tables, trimmed to what the seed reads.
    create table public.workspace_departments (id uuid primary key, workspace_id uuid not null, name text not null);
    create table public.workspace_department_grants (workspace_id uuid not null, user_id uuid not null, department_id uuid not null,
      source_type text not null default 'manual', is_primary boolean not null default false, created_at timestamptz not null default now());
    alter table public.workspace_settings add column if not exists department_spend_attribution text not null default 'all';
    create table public.workspace_member_overrides (workspace_id uuid not null, user_id uuid not null,
      department_override_enabled boolean not null default false, department_id uuid, primary key (workspace_id, user_id));
    create table public.workspace_department_budgets (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      department_id uuid not null, interval text not null, limit_nanos bigint not null, created_by uuid,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  `);
  for (const path of [
    'public/functions/gateway_workspace_budget_status.sql',
    'public/functions/gateway_fetch_request_context_without_workspace_budget.sql',
    'private/functions/spend_limit_period.sql',
  ]) await db.exec(await schema(path));
  // The first seed migration, then the one adding department budgets (both replay cleanly).
  await db.exec(await readFile(new URL('../migrations/20261009000400_gateway_spend_limit_seed.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL('../migrations/20261029095151_department_budgets_in_spend_limit_seed.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  // Then the one teaching the helper the workspace's primary-department setting.
  const attributionMigration = await readFile(new URL('../migrations/20261031174621_department_attribution_primary_for_budgets.sql', import.meta.url), 'utf8');
  await db.exec(attributionMigration);
  for (const path of ['public/functions/workspace_department_budget_status.sql', 'public/functions/gateway_spend_limit_seed.sql']) {
    assert.ok(migration.includes((await schema(path)).trim()), `${path} matches its migration`);
  }
  assert.ok(attributionMigration.includes((await schema('private/functions/department_budget_key_departments.sql')).trim()),
    'the helper matches its migration');
  const manifest = JSON.parse(await schema('.pgdelta-export.json'));
  for (const list of ['loadOrder', 'files']) {
    assert.ok(manifest[list].includes('private/functions/department_budget_key_departments.sql'), `helper is in the manifest's ${list}`);
  }

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
  assert.deepEqual(seed.department_budgets, [], 'no department budgets yet');

  // Department budgets: same attribution as workspace_department_budget_status, usage counted
  // like key usage. u1 is in Engineering; u2 is granted Sales but an override moves them to
  // Engineering; u3 uses an OAuth app and is in Engineering; u4's override takes them out of
  // every department. The Sales-linked key counts only toward Sales although u1 created it.
  const ENG = '40000000-0000-4000-8000-000000000001';
  const SALES = '40000000-0000-4000-8000-000000000002';
  const IDLE = '40000000-0000-4000-8000-000000000003';
  const FOREIGN_DEPT = '40000000-0000-4000-8000-000000000004';
  const u = (n) => `50000000-0000-4000-8000-00000000000${n}`;
  const dk = {
    linked: '60000000-0000-4000-8000-000000000001',
    u1: '60000000-0000-4000-8000-000000000002',
    u2: '60000000-0000-4000-8000-000000000003',
    oauth: '60000000-0000-4000-8000-000000000004',
    u4: '60000000-0000-4000-8000-000000000005',
    foreign: '60000000-0000-4000-8000-000000000006',
  };
  await db.exec(`
    insert into public.workspace_departments values ('${ENG}', '${workspace}', 'Engineering'), ('${SALES}', '${workspace}', 'Sales'),
      ('${IDLE}', '${workspace}', 'Idle'), ('${FOREIGN_DEPT}', '${otherWorkspace}', 'Ops');
    insert into public.workspace_department_grants values ('${workspace}', '${u(1)}', '${ENG}'), ('${workspace}', '${u(2)}', '${SALES}'),
      ('${workspace}', '${u(3)}', '${ENG}'), ('${workspace}', '${u(4)}', '${ENG}'), ('${otherWorkspace}', '${u(1)}', '${FOREIGN_DEPT}');
    insert into public.workspace_member_overrides values ('${workspace}', '${u(2)}', true, '${ENG}'), ('${workspace}', '${u(4)}', true, null);
    insert into public.keys(id, workspace_id, name, status, created_at, created_by, oauth_user_id, department_id) values
      ('${dk.linked}', '${workspace}', 'sales-bot', 'active', now(), '${u(1)}', null, '${SALES}'),
      ('${dk.u1}', '${workspace}', 'u1', 'active', now(), '${u(1)}', null, null),
      ('${dk.u2}', '${workspace}', 'u2', 'active', now(), '${u(2)}', null, null),
      ('${dk.oauth}', '${workspace}', 'oauth', 'active', now(), null, '${u(3)}', null),
      ('${dk.u4}', '${workspace}', 'u4', 'active', now(), '${u(4)}', null, null),
      ('${dk.foreign}', '${otherWorkspace}', 'foreign-u1', 'active', now(), '${u(1)}', null, null);
    insert into public.workspace_department_budgets (id, workspace_id, department_id, interval, limit_nanos) values
      ('70000000-0000-4000-8000-000000000001', '${workspace}', '${ENG}', 'daily', 1000),
      ('70000000-0000-4000-8000-000000000002', '${workspace}', '${ENG}', 'monthly', 100000),
      ('70000000-0000-4000-8000-000000000003', '${workspace}', '${SALES}', 'weekly', 5000),
      ('70000000-0000-4000-8000-000000000004', '${otherWorkspace}', '${FOREIGN_DEPT}', 'daily', 10);
  `);
  const departmentRows = [
    ['d-u1-today', workspace, dk.u1, true, 10, at(bounds.day, 1_000)],
    ['d-u1-day-start', workspace, dk.u1, true, 20, bounds.day.toISOString()],
    ['d-u1-yesterday', workspace, dk.u1, true, 40, at(bounds.day, -1)],
    ['d-u1-failed', workspace, dk.u1, false, 80, at(bounds.day, 1_000)],
    ['d-u1-null-cost', workspace, dk.u1, true, null, at(bounds.day, 1_000)],
    ['d-u2-today', workspace, dk.u2, true, 100, at(bounds.day, 2_000)],
    ['d-oauth-today', workspace, dk.oauth, true, 200, at(bounds.day, 3_000)],
    ['d-u4-today', workspace, dk.u4, true, 400, at(bounds.day, 3_000)],
    ['d-linked-today', workspace, dk.linked, true, 800, at(bounds.day, 3_000)],
    ['d-linked-last-week', workspace, dk.linked, true, 1600, at(bounds.week, -1)],
    ['d-u1-last-month', workspace, dk.u1, true, 3200, at(bounds.month, -1)],
    ['d-u1-month-start', workspace, dk.u1, true, 6400, bounds.month.toISOString()],
    // A row for an Engineering key recorded under another workspace, and a key of another workspace.
    ['d-u1-elsewhere', otherWorkspace, dk.u1, true, 12800, at(bounds.day, 1_000)],
    ['d-foreign-today', otherWorkspace, dk.foreign, true, 25600, at(bounds.day, 1_000)],
  ];
  for (const [requestId, workspaceId, key, success, cost, createdAt] of departmentRows) {
    await db.query(`insert into public.gateway_requests(id, created_at, workspace_id, request_id, key_id, success, cost_nanos)
      values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`, [createdAt, workspaceId, requestId, key, success, cost]);
  }
  const departmentSeed = async (exclude = []) => {
    await db.exec('set role service_role');
    try {
      return await one(`select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as value`, [workspace, [dk.u1], exclude]);
    } finally { await db.exec('reset role'); }
  };
  const withDepartments = await departmentSeed();
  const byBudget = Object.fromEntries(withDepartments.department_budgets.map((budget) => [`${budget.department_name}:${budget.interval}`, budget]));
  assert.deepEqual(Object.keys(byBudget).sort(), ['Engineering:daily', 'Engineering:monthly', 'Sales:weekly'], 'only this workspace\'s budgets');
  const sorted = (ids) => [...ids].sort();
  assert.deepEqual(byBudget['Engineering:daily'].key_ids, sorted([dk.u1, dk.u2, dk.oauth]), 'grants, override and OAuth user; not u4 or the Sales-linked key');
  assert.deepEqual(byBudget['Engineering:monthly'].key_ids, byBudget['Engineering:daily'].key_ids);
  assert.deepEqual(byBudget['Sales:weekly'].key_ids, [dk.linked], 'u2 moved out of Sales by the override');
  // Successful rows of the department's keys in this workspace from the window start (inclusive).
  const expectedUsage = (keys, start, exclude = []) => departmentRows
    .filter(([requestId, workspaceId, key, success, , createdAt]) => workspaceId === workspace && keys.includes(key) && success &&
      Date.parse(createdAt) >= start.getTime() && !exclude.includes(requestId))
    .reduce((sum, row) => sum + (row[4] ?? 0), 0);
  const engKeys = [dk.u1, dk.u2, dk.oauth];
  // Today: u1 10 + 20 (day start counts) + u2 100 + OAuth 200. Not yesterday, failed, other-workspace rows or u4.
  assert.equal(Number(byBudget['Engineering:daily'].usage_nanos), expectedUsage(engKeys, bounds.day));
  if (bounds.day.getTime() !== bounds.month.getTime()) assert.equal(Number(byBudget['Engineering:daily'].usage_nanos), 330);
  assert.equal(Number(byBudget['Engineering:monthly'].usage_nanos), expectedUsage(engKeys, bounds.month));
  assert.ok(Number(byBudget['Engineering:monthly'].usage_nanos) >= 330 + 6400);
  assert.equal(Number(byBudget['Sales:weekly'].usage_nanos), 800);
  assert.deepEqual([byBudget['Engineering:daily'].department_id, Number(byBudget['Engineering:daily'].limit_nanos)], [ENG, 1000]);
  // Windows are the seed's own UTC day/week/month starts.
  assert.equal(byBudget['Engineering:daily'].window_start, withDepartments.day_start);
  assert.equal(byBudget['Sales:weekly'].window_start, withDepartments.week_start);
  assert.equal(byBudget['Engineering:monthly'].window_start, withDepartments.month_start);
  assert.equal(Date.parse(byBudget['Engineering:daily'].reset_at), bounds.day.getTime() + 86_400_000);
  assert.equal(Date.parse(byBudget['Sales:weekly'].reset_at), bounds.week.getTime() + 7 * 86_400_000);
  const nextMonth = new Date(Date.UTC(bounds.month.getUTCFullYear(), bounds.month.getUTCMonth() + 1, 1));
  assert.equal(Date.parse(byBudget['Engineering:monthly'].reset_at), nextMonth.getTime());

  // Recorded requests are excluded from department usage too.
  const departmentExcluded = await departmentSeed(['d-u2-today', 'd-linked-today', 'not-yet-written']);
  const excludedBy = Object.fromEntries(departmentExcluded.department_budgets.map((budget) => [`${budget.department_name}:${budget.interval}`, budget]));
  assert.equal(Number(excludedBy['Engineering:daily'].usage_nanos), expectedUsage(engKeys, bounds.day, ['d-u2-today']));
  assert.equal(Number(excludedBy['Engineering:daily'].usage_nanos), Number(byBudget['Engineering:daily'].usage_nanos) - 100);
  assert.equal(Number(excludedBy['Sales:weekly'].usage_nanos), 0);
  assert.deepEqual(departmentExcluded.excluded_rows.map((row) => row.request_id), ['d-linked-today', 'd-u2-today']);

  // The other workspace sees only its own department and keys.
  await db.exec('set role service_role');
  const other = await one(`select public.gateway_spend_limit_seed($1, $2::uuid[]) as value`, [otherWorkspace, [dk.foreign]]);
  await db.exec('reset role');
  assert.deepEqual(other.department_budgets.map((budget) => [budget.department_name, budget.key_ids, Number(budget.usage_nanos)]),
    [['Ops', [dk.foreign], 25600]]);

  // The shared attribution is what workspace_department_budget_status counts with.
  const helper = (await db.query(`select key_id, department_id from private.department_budget_key_departments($1) order by department_id, key_id`, [workspace])).rows;
  assert.deepEqual(helper.map((row) => [row.department_id, row.key_id]),
    [...sorted([dk.u1, dk.u2, dk.oauth]).map((key) => [ENG, key]), [SALES, dk.linked]]);
  assert.equal((await db.query(`select has_function_privilege('service_role', 'private.department_budget_key_departments(uuid)', 'execute') as ok`)).rows[0].ok, false);

  // u1 also joins Sales as their primary department: with "all" they count toward both, with
  // "primary" toward Sales only. Overrides (u2, u4) and linked keys are unaffected.
  await db.exec(`insert into public.workspace_department_grants(workspace_id, user_id, department_id, is_primary, created_at)
    values ('${workspace}', '${u(1)}', '${SALES}', true, now() + interval '1 day')`);
  const attributed = async (mode) => {
    await db.query(`delete from public.workspace_settings where workspace_id = $1`, [workspace]);
    await db.query(`insert into public.workspace_settings(workspace_id, department_spend_attribution) values ($1, $2)`, [workspace, mode]);
    return (await db.query(`select key_id, department_id from private.department_budget_key_departments($1) order by department_id, key_id`, [workspace]))
      .rows.map((row) => [row.department_id, row.key_id]);
  };
  assert.deepEqual(await attributed('all'),
    [...sorted([dk.u1, dk.u2, dk.oauth]).map((key) => [ENG, key]), ...sorted([dk.linked, dk.u1]).map((key) => [SALES, key])]);
  assert.deepEqual(await attributed('primary'),
    [...sorted([dk.u2, dk.oauth]).map((key) => [ENG, key]), ...sorted([dk.linked, dk.u1]).map((key) => [SALES, key])]);
  // Without a primary flag, manual beats SCIM and then the oldest grant wins.
  await db.exec(`update public.workspace_department_grants set is_primary = false where user_id = '${u(1)}'`);
  assert.deepEqual((await attributed('primary')).filter(([, key]) => key === dk.u1), [[ENG, dk.u1]]);

  await assert.rejects(db.query(`select public.gateway_spend_limit_seed(null, ${keyIds})`), /workspace_id_required/);
  await assert.rejects(db.query(`select public.gateway_spend_limit_seed('${workspace}', ${keyIds},
    array(select i::text from generate_series(1, 5001) i))`), /too_many_excluded_request_ids/);
  console.log('Spend-limit seed: matches context key-limit windows and filters, excludes recorded requests, service role only.');
} finally {
  await db.close();
}
