import assert from 'node:assert/strict';
import { applyMigration, createBudgetDatabase, readColumnMigrations, readIndexMigrations, readMigration, readSchema, readTableMigrations } from './fixtures/budget-enforcement-db.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

// Migration 20261107020007_budget_enforcement_money_hygiene against production shapes (see the
// fixture): one budget usage calculation for workspace budgets, department admission and the
// spend-limit seed; department budgets on holds, realtime and the context fallback; one count per
// batch hold; active holds across period rollover; captured video holds before their audit row;
// no budget row lock in reserve; a missing wallet fails the charge; dropped and revoked money
// surfaces; 90-day I/O retention (normalized first); and video holds in the stale-hold reaper.
// PGlite runs one connection, so lock order is checked from the function definition.
const functionFiles = [
  'private/functions/unbilled_spend.sql',
  'private/functions/key_spend_items.sql',
  'private/functions/budget_spend_items.sql',
  'private/functions/department_budget_usage.sql',
  'private/functions/workspace_budget_status.sql',
  'public/functions/gateway_department_budget_status.sql',
  'public/functions/gateway_workspace_budget_status.sql',
  'public/functions/gateway_spend_limit_seed.sql',
  'public/functions/workspace_department_budget_status.sql',
  'private/functions/gateway_context_access.sql',
  'public/functions/gateway_fetch_request_context_without_workspace_budget.sql',
  'public/functions/gateway_wallet_reserve_once_without_workspace_budget.sql',
  'public/functions/gateway_wallet_reserve_once.sql',
  'public/functions/gateway_realtime_create_with_hold.sql',
  'public/functions/gateway_realtime_extend_hold_once.sql',
  'public/functions/gateway_fetch_request_context.sql',
  'public/functions/gateway_fetch_request_context_bundle.sql',
  'public/functions/deduct_and_check_top_up.sql',
  'public/functions/gateway_wallet_release_stale_orphan_batch_reservations.sql',
];
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const DOLLAR = 1_000_000_000;
const WS = id('1', 1); // department budgets
const WS_BATCH = id('1', 2); // workspace budget and batch holds
const WS_REAP = id('1', 3); // stale holds
const NO_WALLET = id('1', 4);
const WS_ROLL = id('1', 5); // holds across period rollover
const WS_CAP = id('1', 6); // captured video holds and charged failures
const WS_DEL = id('1', 7); // a key deleted after its holds and requests
const WS_PLAN = id('1', 8); // history in every partition, for plans
const WS_BATCHES = id('1', 9); // batch debits and their rows
const WS_RECON = id('1', 10); // batches debited after their placeholders, rows persisted late
const WS_STEP = id('1', 11); // a stepped request across period rollover
const WS_PEND = id('1', 12); // requests pending reconciliation
const WS_LEGACY = id('1', 13); // pending by billing_status only, either side of the cutoff
const ENG = id('4', 1);
const ROLL = id('4', 2);
const CAP = id('4', 3);
const RECON = id('4', 4);
const STEP = id('4', 5);
const PEND = id('4', 6);
const MEMBER = id('2', 1);
const KEY = { linked: id('3', 1), member: id('3', 2), outside: id('3', 3), batch: id('3', 4), roll: id('3', 5), cap: id('3', 6), limited: id('3', 7), del: id('3', 8), batches: id('3', 9), recon: id('3', 10), step: id('3', 11), pend: id('3', 12), plan: id('3', 13), legacy: id('3', 14) };
// Before every current period: the earlier of this week's Monday and the 1st, less a day.
const BEFORE_PERIODS = `(least(date_trunc('week', now() at time zone 'utc'), date_trunc('month', now() at time zone 'utc')) at time zone 'utc' - interval '1 day')`;

const db = await createBudgetDatabase(PGlite);
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const failures = [];
const check = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); } catch (error) { failures.push(name); console.log(`not ok - ${name}\n  ${process.env.FULL_ERRORS ? error.message : String(error.message).split('\n')[0]}`); }
};
const reserve = (workspace, reservation, nanos, key = null, count = null) => asService(() => one(
  'select * from public.gateway_wallet_reserve_once($1, $2, $3, null, $4, $5)', [workspace, reservation, nanos, key, count]));
const request = (workspace, requestId, key, nanos, success = true) => db.query(
  `insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values ($1, $2, $3, $4, $5)`,
  [workspace, requestId, key, success, nanos]);
const departmentStatus = (workspace, key) => asService(async () => (await one(`select public.gateway_department_budget_status($1, $2, 0) as r`, [workspace, key])).r);
const workspaceStatus = (workspace) => asService(async () => (await one(`select public.gateway_workspace_budget_status($1, 0) as r`, [workspace])).r);
const seed = (workspace, keys) => asService(async () => (await one(`select public.gateway_spend_limit_seed($1, $2::uuid[]) as r`, [workspace, keys])).r);
const byInterval = (budgets) => Object.fromEntries(budgets.map((budget) => [budget.interval, Number(budget.usage_nanos)]));

try {
  await db.exec(`
    insert into public.workspaces (id) values ('${WS}'), ('${WS_BATCH}'), ('${WS_REAP}'), ('${NO_WALLET}'), ('${WS_ROLL}'), ('${WS_CAP}');
    insert into public.workspace_settings (workspace_id, io_logging_retention_days) values ('${WS}', 90), ('${WS_BATCH}', 180), ('${WS_ROLL}', 365);
    insert into public.wallets (workspace_id, balance_nanos, reserved_nanos) values
      ('${WS}', ${1000 * DOLLAR}, 0), ('${WS_BATCH}', ${1000 * DOLLAR}, 0), ('${WS_REAP}', ${1000 * DOLLAR}, ${70 * DOLLAR}),
      ('${WS_ROLL}', ${1000 * DOLLAR}, 0), ('${WS_CAP}', ${1000 * DOLLAR}, 0);
    insert into public.keys (id, workspace_id, department_id, created_by) values
      ('${KEY.linked}', '${WS}', '${ENG}', null), ('${KEY.member}', '${WS}', null, '${MEMBER}'),
      ('${KEY.outside}', '${WS}', null, null), ('${KEY.batch}', '${WS_BATCH}', null, null),
      ('${KEY.roll}', '${WS_ROLL}', '${ROLL}', null), ('${KEY.cap}', '${WS_CAP}', '${CAP}', null);
    insert into public.workspace_departments (id, workspace_id, name) values
      ('${ENG}', '${WS}', 'Engineering'), ('${ROLL}', '${WS_ROLL}', 'Research'), ('${CAP}', '${WS_CAP}', 'Studio');
    insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ('${WS}', '${MEMBER}', '${ENG}');
    insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values
      ('${WS}', '${ENG}', 'daily', ${10 * DOLLAR}),
      ('${WS_ROLL}', '${ROLL}', 'daily', ${100 * DOLLAR}), ('${WS_ROLL}', '${ROLL}', 'weekly', ${100 * DOLLAR}),
      ('${WS_ROLL}', '${ROLL}', 'monthly', ${100 * DOLLAR}), ('${WS_CAP}', '${CAP}', 'daily', ${10 * DOLLAR});
    insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values
      ('${WS_BATCH}', 'daily', ${10 * DOLLAR}),
      ('${WS_ROLL}', 'daily', ${100 * DOLLAR}), ('${WS_ROLL}', 'weekly', ${100 * DOLLAR}), ('${WS_ROLL}', 'monthly', ${100 * DOLLAR}),
      ('${WS_CAP}', 'daily', ${10 * DOLLAR});
    -- Stale holds: the reaper's input. Wallet reserved_nanos covers them.
    insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, created_at) values
      ('video_hold:no-operation', '${WS_REAP}', ${10 * DOLLAR}, 'held', 'video-1', now() - interval '2 days'),
      ('video_hold:queued', '${WS_REAP}', ${10 * DOLLAR}, 'held', 'video-2', now() - interval '2 days'),
      ('video_hold:billed', '${WS_REAP}', ${10 * DOLLAR}, 'held', 'video-3', now() - interval '2 days'),
      ('video_hold:unbilled', '${WS_REAP}', ${10 * DOLLAR}, 'held', 'video-4', now() - interval '2 days'),
      ('video_hold:failed', '${WS_REAP}', ${10 * DOLLAR}, 'reserved', 'video-5', now() - interval '2 days'),
      ('video_hold:recent', '${WS_REAP}', ${10 * DOLLAR}, 'reserved', 'video-6', now() - interval '1 hour'),
      ('batch_hold:orphan', '${WS_REAP}', ${10 * DOLLAR}, 'reserved', 'batch-1', now() - interval '1 hour');
    insert into public.gateway_async_operations (workspace_id, kind, status, request_id, meta, billed_at) values
      ('${WS_REAP}', 'video', 'queued', 'video-2', '{}', null),
      ('${WS_REAP}', 'video', 'completed', null, '{"reservationId": "video_hold:billed"}', now()),
      ('${WS_REAP}', 'video', 'completed', 'video-4', '{}', null),
      ('${WS_REAP}', 'video', 'failed', 'video-5', '{}', null);
    -- Rollover: holds made before every current period, one still active (video, realtime) and
    -- one already captured, plus a completed request from then and one from today.
    insert into public.gateway_realtime_sessions (workspace_id, session_id, key_id) values ('${WS_ROLL}', 'rt-old', '${KEY.roll}');
    insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, key_id, settled_amount_nanos, created_at) values
      ('video_hold:old-active', '${WS_ROLL}', ${1 * DOLLAR}, 'reserved', 'vid-old-active', '${KEY.roll}', null, ${BEFORE_PERIODS}),
      ('realtime_hold:rt-old', '${WS_ROLL}', ${DOLLAR / 4}, 'reserved', 'rt-old', null, null, ${BEFORE_PERIODS}),
      ('video_hold:old-captured', '${WS_ROLL}', ${2 * DOLLAR}, 'captured', 'vid-old-captured', '${KEY.roll}', ${2 * DOLLAR}, ${BEFORE_PERIODS});
    insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos, created_at) values
      ('${WS_ROLL}', 'old-request', '${KEY.roll}', true, ${4 * DOLLAR}, ${BEFORE_PERIODS}),
      ('${WS_ROLL}', 'today-request', '${KEY.roll}', true, ${DOLLAR / 2}, now());
  `);

  // The migration carries the declarative definitions and the manifest lists the new functions.
  const migration = await readMigration();
  await check('the migration carries each declarative function and the manifest lists the new ones', async () => {
    for (const path of functionFiles) {
      assert.ok(migration.includes((await readSchema(path)).replace(/\r\n/g, '\n').trim()), `${path} is in the migration`);
    }
    const manifest = JSON.parse(await readSchema('.pgdelta-export.json'));
    for (const list of ['loadOrder', 'files']) {
      for (const path of ['public/functions/gateway_department_budget_status.sql', 'private/functions/budget_spend_items.sql',
        'private/functions/department_budget_usage.sql', 'private/functions/unbilled_spend.sql', 'private/functions/workspace_budget_status.sql']) {
        assert.ok(manifest[list].includes(path), `${path} in ${list}`);
      }
      assert.ok(!manifest[list].includes('public/functions/wallet_apply_delta.sql'), `wallet_apply_delta gone from ${list}`);
      const order = manifest.loadOrder;
      assert.ok(order.indexOf('private/functions/department_budget_usage.sql') > order.indexOf('private/functions/budget_spend_items.sql'));
      assert.ok(order.indexOf('private/functions/department_budget_usage.sql') > order.indexOf('private/functions/spend_limit_period.sql'));
    }
    // The lock plan: every migration of this change sets a lock timeout first; the function
    // migration locks no table; each other migration locks at most one existing table.
    const tableStatement = /\b(alter\s+table|create\s+(unique\s+)?index|drop\s+index|(create|drop)\s+(or\s+replace\s+)?(trigger|policy)|(grant|revoke)\s[^;]*\bon\s+table|comment\s+on\s+(table|column))\b/i;
    const statementsOf = (sql) => sql.replace(/--.*$/gm, '').replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '$$$$')
      .split(';').map((part) => part.trim()).filter(Boolean);
    assert.match(migration, /^SET LOCAL lock_timeout = '10s';/);
    assert.ok(!statementsOf(migration).some((statement) => tableStatement.test(statement)), 'the function migration locks no table');
    const ours = [...await readColumnMigrations(), ...await readIndexMigrations(), ...await readTableMigrations()]
      .filter((sql) => !sql.includes('gateway_requests_workspace_billing_request_idx')); // fix/async-billing-20261104's
    for (const sql of ours) {
      assert.match(sql, /^SET LOCAL lock_timeout = '10s';/);
      const tables = new Set(statementsOf(sql).filter((statement) => tableStatement.test(statement))
        .map((statement) => statement.match(/\bpublic\.(\w+)|"public"\."(\w+)"/i)).filter(Boolean).map((match) => match[1] ?? match[2]));
      assert.ok(tables.size <= 1, `one table per migration: ${[...tables].join(', ')}`);
    }
    const [addColumn, validate] = await readColumnMigrations();
    assert.match(addColumn, /ADD COLUMN IF NOT EXISTS expected_cost_nanos bigint;/);
    assert.match(addColumn, /CHECK \(\(expected_cost_nanos >= 0\)\) NOT VALID;/);
    assert.match(validate, /VALIDATE CONSTRAINT gateway_requests_expected_cost_nanos_check;/);
    for (const index of await readIndexMigrations()) {
      const statements = index.split('\n').filter((line) => !line.startsWith('--')).join('\n').split(';').filter((part) => part.trim())
        .filter((part) => !/^\s*SET LOCAL lock_timeout/i.test(part));
      assert.equal(statements.length, 1, 'one statement per index migration');
      assert.match(statements[0], /^\s*CREATE INDEX IF NOT EXISTS /i);
    }
    assert.match((await readTableMigrations()).find((sql) => sql.includes('workspace_settings')),
      /raise notice 'io_logging_retention_days set to 90 on % workspace_settings row\(s\)', v_count;/);
  });
  await check('the migration applies over workspaces with 180- and 365-day retention, setting them to 90', async () => {
    try {
      await applyMigration(db, migration);
    } catch (error) {
      // Clear the way so the remaining checks still run against this migration.
      await db.query(`update public.workspace_settings set io_logging_retention_days = 90`);
      await applyMigration(db, migration);
      throw error;
    }
    const days = await rows(`select io_logging_retention_days as days from public.workspace_settings order by workspace_id`);
    assert.deepEqual(days.map((row) => row.days), [90, 90, 90]);
  });
  await applyMigration(db, migration); // replays cleanly

  await check('expected_cost_nanos is a nullable column that refuses negative amounts', async () => {
    const column = await one(`select data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'gateway_requests' and column_name = 'expected_cost_nanos'`);
    assert.deepEqual(column, { data_type: 'bigint', is_nullable: 'YES' });
    const { validated } = await one(`select convalidated as validated from pg_constraint where conname = 'gateway_requests_expected_cost_nanos_check'
      and conrelid = 'public.gateway_requests'::regclass`);
    assert.equal(validated, true);
    await assert.rejects(db.query(`insert into public.gateway_requests (workspace_id, request_id, expected_cost_nanos) values ($1, 'negative', -1)`, [WS]),
      /expected_cost_nanos_check/);
  });
  await check('the migration releases no hold itself', async () => {
    const held = await rows(`select reservation_id from public.gateway_wallet_reservations where workspace_id = $1 and status in ('held', 'reserved') order by 1`, [WS_REAP]);
    assert.equal(held.length, 7);
  });

  await check('gateway_department_budget_status is service-only SECURITY DEFINER; the helpers are private', async () => {
    const fn = await one(`select prosecdef, provolatile from pg_proc where proname = 'gateway_department_budget_status'`);
    assert.deepEqual(fn, { prosecdef: true, provolatile: 's' });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const signature of ['private.budget_spend_items(uuid, timestamptz, uuid[], text[], text[])', 'private.department_budget_usage(uuid, uuid, text[])',
        'private.unbilled_spend(uuid, timestamptz, uuid[], text[], text[])', 'private.workspace_budget_status(uuid, bigint, text[])']) {
        const { allowed } = await one(`select has_function_privilege($1, $2, 'execute') as allowed`, [role, signature]);
        // The request-context key-limit check (private.gateway_context_access) runs as service_role.
        assert.equal(allowed, role === 'service_role' && signature.startsWith('private.unbilled_spend'), `${role} ${signature}`);
      }
      if (role === 'service_role') continue;
      const { allowed } = await one(`select has_function_privilege($1, 'public.gateway_department_budget_status(uuid, uuid, bigint)', 'execute') as allowed`, [role]);
      assert.equal(allowed, false, role);
    }
  });

  // Department budgets hold back holds, realtime and the context fallback.
  await request(WS, 'eng-spend', KEY.linked, 9 * DOLLAR);
  await check('a video hold over the department budget is refused (member key)', async () => {
    const denied = await reserve(WS, 'video_hold:over', 2 * DOLLAR, KEY.member, 1);
    assert.deepEqual([denied.ok, denied.applied, denied.reason], [false, false, 'department_daily_cost_budget_reached']);
  });
  await check('a key outside the department is not held back', async () => {
    const outside = await reserve(WS, 'video_hold:outside', 2 * DOLLAR, KEY.outside, 1);
    assert.deepEqual([outside.ok, outside.applied], [true, true]);
  });
  await check('the context fallback lists the department budget below its limit, so it is not cached', async () => {
    const context = await asService(async () => (await one(`select public.gateway_fetch_request_context($1, 'lab/model', 'responses', $2) as r`, [WS, KEY.linked])).r);
    assert.equal(context.key_limit_ok.ok, true);
    assert.equal(context.key_limit_ok.department_budgets.length, 1);
    assert.equal(Number(context.key_limit_ok.department_budgets[0].usage_nanos), 9 * DOLLAR);
    const bundle = await asService(async () => (await one(`select public.gateway_fetch_request_context_bundle($1, 'lab/model', 'responses', $2, false) as r`, [WS, KEY.member])).r);
    assert.equal(bundle.context.key_limit_ok.department_budgets[0].department_id, ENG);
    const outside = await asService(async () => (await one(`select public.gateway_fetch_request_context($1, 'lab/model', 'responses', $2) as r`, [WS, KEY.outside])).r);
    assert.equal(outside.key_limit_ok.department_budgets, undefined);
  });
  await check('an active hold counts toward the department, in admission and in the seed alike', async () => {
    const small = await reserve(WS, 'video_hold:small', DOLLAR / 2, KEY.linked, 1);
    assert.equal(small.ok, true);
    const status = await departmentStatus(WS, KEY.member);
    assert.equal(Number(status.department_budgets[0].usage_nanos), 9.5 * DOLLAR);
    const seeded = await seed(WS, [KEY.member]);
    assert.equal(Number(seeded.department_budgets[0].usage_nanos), 9.5 * DOLLAR);
    assert.deepEqual(seeded.department_budgets[0].key_ids, [KEY.linked, KEY.member].sort());
    const batch = await reserve(WS, 'batch_hold:over', 0.6 * DOLLAR, KEY.member, 2);
    assert.equal(batch.reason, 'department_daily_cost_budget_reached');
  });
  await check('realtime create is refused over the department budget', async () => {
    await assert.rejects(asService(() => db.query(`select * from public.gateway_realtime_create_with_hold($1, 'rt-1', $2, null, 'api',
      'openai', 'openai/gpt-live', 'gpt-live', null, now() + interval '1 hour', 'realtime_hold:', 'realtime_hold:rt-1', $3, 'hash')`,
      [WS, KEY.member, DOLLAR])), /department_daily_cost_budget_reached/);
  });
  await check('realtime extend is refused over the department budget', async () => {
    await db.query(`insert into public.gateway_realtime_sessions (workspace_id, session_id, key_id, reserved_nanos) values ($1, 'rt-2', $2, 0)`, [WS, KEY.linked]);
    await assert.rejects(asService(() => db.query(`select * from public.gateway_realtime_extend_hold_once($1, 'rt-2', 'realtime_hold:rt-2', $2, 0)`,
      [WS, DOLLAR])), /department_daily_cost_budget_reached/);
  });
  await request(WS, 'eng-spend-2', KEY.member, DOLLAR / 2);
  await check('the request-context fallback reports a used-up department budget', async () => {
    const context = await asService(async () => (await one(`select public.gateway_fetch_request_context($1, 'lab/model', 'responses', $2) as r`, [WS, KEY.linked])).r);
    assert.equal(context.key_limit_ok.ok, false);
    assert.equal(context.key_limit_ok.reason, 'department_daily_cost_budget_reached');
    assert.equal(context.key_limit_ok.department_id, ENG);
    assert.equal(context.key_limit_ok.department_name, 'Engineering');
    const outside = await asService(async () => (await one(`select public.gateway_fetch_request_context($1, 'lab/model', 'responses', $2) as r`, [WS, KEY.outside])).r);
    assert.equal(outside.key_limit_ok.ok, true);
    const bundle = await asService(async () => (await one(`select public.gateway_fetch_request_context_bundle($1, 'lab/model', 'responses', $2, false) as r`, [WS, KEY.member])).r);
    assert.equal(bundle.context.key_limit_ok.reason, 'department_daily_cost_budget_reached');
  });

  // A reserved batch hold counts once in the workspace budget.
  await check('a batch hold counts once toward the workspace budget', async () => {
    const held = await reserve(WS_BATCH, 'batch_hold:b1', 6 * DOLLAR, KEY.batch, 3);
    assert.equal(held.ok, true);
    assert.equal(Number((await workspaceStatus(WS_BATCH)).budgets[0].usage_nanos), 6 * DOLLAR);
    const next = await reserve(WS_BATCH, 'batch_hold:b2', 3 * DOLLAR, KEY.batch, 1);
    assert.equal(next.ok, true, 'a hold that fits next to the first one is admitted');
  });
  await check('a captured batch hold counts once, through its debit', async () => {
    // Settlement (gateway_wallet_settle_once) captures the hold and debits the batch in one step.
    await db.query(`update public.gateway_wallet_reservations set status = 'captured', captured_nanos = amount_nanos, settled_amount_nanos = amount_nanos
      where reservation_id = 'batch_hold:b1'`);
    await db.query(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status)
      values ($1, 'charge', $2, 'async_job_charge', $3, 'async_job', 'b1-batch', 'captured')`, [WS_BATCH, -6 * DOLLAR, `${WS_BATCH}:batch_hold:b1`]);
    // The $6 debit and the $3 hold still active; not the captured hold's placeholders.
    assert.equal(Number((await workspaceStatus(WS_BATCH)).budgets[0].usage_nanos), 9 * DOLLAR);
  });

  // Active holds count in every period until they end; captured ones only in their own.
  await check('active holds count across daily, weekly and monthly rollover (department)', async () => {
    const status = await departmentStatus(WS_ROLL, KEY.roll);
    assert.deepEqual(byInterval(status.department_budgets), { daily: 1.75 * DOLLAR, weekly: 1.75 * DOLLAR, monthly: 1.75 * DOLLAR });
    assert.deepEqual(byInterval((await seed(WS_ROLL, [KEY.roll])).department_budgets), { daily: 1.75 * DOLLAR, weekly: 1.75 * DOLLAR, monthly: 1.75 * DOLLAR });
  });
  await check('active holds count across daily, weekly and monthly rollover (workspace)', async () => {
    assert.deepEqual(byInterval((await workspaceStatus(WS_ROLL)).budgets), { daily: 1.75 * DOLLAR, weekly: 1.75 * DOLLAR, monthly: 1.75 * DOLLAR });
  });

  // A captured video hold counts before (or without) its audit row, and once after it lands.
  await db.exec(`insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, key_id, settled_amount_nanos, created_at)
    values ('video_hold:c1', '${WS_CAP}', ${4 * DOLLAR}, 'captured', 'vid-c1', '${KEY.cap}', ${3 * DOLLAR}, now())`);
  await check('a captured video hold whose audit row failed to persist still counts', async () => {
    assert.equal(Number((await departmentStatus(WS_CAP, KEY.cap)).department_budgets[0].usage_nanos), 3 * DOLLAR);
    assert.equal(Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos), 3 * DOLLAR);
  });
  await check('once the audit row lands, the captured hold counts once', async () => {
    await request(WS_CAP, 'vid-c1', KEY.cap, 3 * DOLLAR);
    assert.equal(Number((await departmentStatus(WS_CAP, KEY.cap)).department_budgets[0].usage_nanos), 3 * DOLLAR);
    assert.equal(Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos), 3 * DOLLAR);
    assert.equal(Number((await seed(WS_CAP, [KEY.cap])).department_budgets[0].usage_nanos), 3 * DOLLAR);
  });
  await check('a charged request that did not succeed counts toward both budgets and the seed; a free failure does not', async () => {
    await request(WS_CAP, 'stream-cancelled', KEY.cap, DOLLAR, false);
    await request(WS_CAP, 'failed-free', KEY.cap, 0, false);
    assert.equal(Number((await departmentStatus(WS_CAP, KEY.cap)).department_budgets[0].usage_nanos), 4 * DOLLAR);
    assert.equal(Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos), 4 * DOLLAR);
    assert.equal(Number((await seed(WS_CAP, [KEY.cap])).department_budgets[0].usage_nanos), 4 * DOLLAR);
  });
  await check('a charged request that did not succeed counts toward key caps on holds; a free failure does not', async () => {
    await db.query(`insert into public.keys (id, workspace_id, daily_limit_cost_nanos) values ($1, $2, $3)`, [KEY.limited, WS_CAP, 2 * DOLLAR]);
    await request(WS_CAP, 'limited-cancelled', KEY.limited, 1.5 * DOLLAR, false);
    await request(WS_CAP, 'limited-failed-free', KEY.limited, 0, false);
    const refused = await reserve(WS_CAP, 'video_hold:limited-1', DOLLAR, KEY.limited, 1);
    assert.equal(refused.reason, 'daily_cost_limit_reached');
    const fits = await reserve(WS_CAP, 'video_hold:limited-2', 0.4 * DOLLAR, KEY.limited, 1);
    assert.equal(fits.ok, true);
  });
  await check('the department alert sweep counts a charged async request that did not succeed', async () => {
    await db.query(`insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos, endpoint) values
      ($1, 'video-charged-failed', $2, false, $3, 'video.generation'), ($1, 'video-free-failed', $2, false, 0, 'video.generation')`, [WS_CAP, KEY.cap, 2 * DOLLAR]);
    const alert = await asService(async () => (await one(`select public.workspace_department_budget_status($1) as r`, [WS_CAP])).r);
    assert.equal(Number(alert[0].usage_nanos), 2 * DOLLAR);
    await db.query(`delete from public.gateway_requests where request_id in ('video-charged-failed', 'video-free-failed')`);
  });
  await check('a stepped charge counts by wallet movement, each at its time, also after its row lands', async () => {
    const before = Number((await workspaceStatus(WS_ROLL)).budgets[0].usage_nanos);
    let step = 0;
    const movement = (billingId, at, usage) => `('${WS_ROLL}', 'adjustment', ${-usage}, 'gateway_request_charge', '${billingId}:${++step}',
      'gateway_request', '${billingId}', 'applied', ${at})`;
    await db.exec(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id, created_at) values
      ('${WS_ROLL}', 'billing-open', ${3 * DOLLAR}, 'applied', false, '${KEY.roll}', ${BEFORE_PERIODS}),
      ('${WS_ROLL}', 'billing-final', ${DOLLAR / 2}, 'applied', true, null, now()),
      ('${WS_ROLL}', 'billing-applying', ${DOLLAR}, 'applying', false, null, now()),
      ('${WS_ROLL}', 'billing-landed', ${DOLLAR}, 'applied', false, '${KEY.roll}', now());
      -- The open stream's checkpoints: $1 before every current period, $2 today (the charge row
      -- holds the $3 total with its first debit's time).
      insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status, created_at) values
        ${movement('billing-open', BEFORE_PERIODS, DOLLAR)}, ${movement('billing-open', 'now()', 2 * DOLLAR)},
        ${movement('billing-landed', 'now()', DOLLAR)};`);
    await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos) values
      ($1, 'stream-landed', 'billing-landed', $2, false, $3)`, [WS_ROLL, KEY.roll, 1.25 * DOLLAR]);
    // Today: the open stream's $2 debit, the final one-off charge's $0.50, and the landed stream's
    // $1 movement (money movements win: not its row's $1.25). Not the earlier debit or a charge
    // still applying.
    assert.deepEqual(byInterval((await workspaceStatus(WS_ROLL)).budgets), {
      daily: before + 3.5 * DOLLAR, weekly: before + 3.5 * DOLLAR, monthly: before + 3.5 * DOLLAR,
    });
    // A refund at the next checkpoint lowers it, at its own time.
    await db.exec(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status, created_at)
      values ${movement('billing-open', "now() + interval '1 second'", -DOLLAR / 2)}`);
    assert.equal(Number((await workspaceStatus(WS_ROLL)).budgets[0].usage_nanos), before + 3 * DOLLAR);
    // The open stream's request row lands ($2.50): its movements still count, the row's cost does not.
    await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos) values
      ($1, 'stream-open', 'billing-open', $2, false, $3)`, [WS_ROLL, KEY.roll, 2.5 * DOLLAR]);
    assert.equal(Number((await workspaceStatus(WS_ROLL)).budgets[0].usage_nanos), before + 3 * DOLLAR);
    await db.query(`delete from public.gateway_request_charges where workspace_id = $1 and request_id = 'billing-final'`, [WS_ROLL]);
  });
  await check('the seed skips a held admission\'s charge row by billing id, and only by billing id', async () => {
    await db.exec(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id) values
      ('${WS_CAP}', 'billing-open', ${DOLLAR}, 'applied', true, '${KEY.limited}')`);
    const seedWith = async (exclude) => asService(async () => (await one(
      `select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as r`, [WS_CAP, [KEY.limited], exclude])).r);
    const usage = (seeded) => ({
      workspace: Number(seeded.budget_status.budgets[0].usage_nanos),
      key: Number(seeded.keys[0].used.daily.cost_nanos),
    });
    const counted = usage(await seedWith([]));
    // The coordinator holds the admission: it lists the request id and the billing id.
    assert.deepEqual(usage(await seedWith(['stream-open', 'billing-open'])), { workspace: counted.workspace - DOLLAR, key: counted.key - DOLLAR });
    // A request id alone never stands for the charge row.
    assert.deepEqual(usage(await seedWith(['stream-open'])), counted);
    assert.equal('stepped_charges' in (await seedWith([])), false);
    // Admission counts it, and so do hold admission's key caps: $1 of the key's $2 a day is gone.
    assert.equal(Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos), counted.workspace);
    const refused = await reserve(WS_CAP, 'video_hold:after-open-charge', 1.5 * DOLLAR, KEY.limited, 1);
    assert.equal(refused.reason, 'daily_cost_limit_reached');
    await db.query(`delete from public.gateway_request_charges where request_id = 'billing-open'`);
  });
  await check('a batch counts its debit once, whether or not its rows persisted', async () => {
    await db.exec(`
      insert into public.workspaces (id) values ('${WS_BATCHES}');
      insert into public.keys (id, workspace_id) values ('${KEY.batches}', '${WS_BATCHES}');
      insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${WS_BATCHES}', 'daily', ${100 * DOLLAR});
      -- Batches without a reservation: one charged $3 whose rows never persisted, one charged $5 with $2 of rows.
      insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id) values
        ('${WS_BATCHES}', 'batch_capture:b-none', ${3 * DOLLAR}, 'applied', true, '${KEY.batches}'),
        ('${WS_BATCHES}', 'batch_capture:b-part', ${5 * DOLLAR}, 'applied', true, '${KEY.batches}');
      insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values
        ('${WS_BATCHES}', 'batch_usage:b-part:1', '${KEY.batches}', true, ${2 * DOLLAR});
      -- A reserved batch held at $3 and settled at $10, with $2 of rows persisted.
      insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, key_id,
        captured_nanos, settled_amount_nanos, capture_ref_id) values
        ('batch_hold:r1', '${WS_BATCHES}', ${3 * DOLLAR}, 'captured', 'b-res', '${KEY.batches}', ${3 * DOLLAR}, ${10 * DOLLAR}, 'b-res');
      insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status) values
        ('${WS_BATCHES}', 'charge', ${-10 * DOLLAR}, 'async_job_charge', '${WS_BATCHES}:batch_hold:r1', 'async_job', 'b-res', 'captured');
      insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values
        ('${WS_BATCHES}', 'batch_usage:b-res:1', '${KEY.batches}', true, ${2 * DOLLAR});`);
    // $3 + $5 + $10, each once.
    assert.equal(Number((await workspaceStatus(WS_BATCHES)).budgets[0].usage_nanos), 18 * DOLLAR);
    // The rest of a batch's rows land: still its debit, once.
    await db.exec(`insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values
      ('${WS_BATCHES}', 'batch_usage:b-none:1', '${KEY.batches}', true, ${3 * DOLLAR}),
      ('${WS_BATCHES}', 'batch_usage:b-res:2', '${KEY.batches}', true, ${8 * DOLLAR})`);
    assert.equal(Number((await workspaceStatus(WS_BATCHES)).budgets[0].usage_nanos), 18 * DOLLAR);
  });
  // Money movements win (one rule for #3534 and #3547): a request's spend is its money movements,
  // each at its own time, and its audit cost only when it has none. Each surface is read the way
  // the gateway reads it: workspace and department admission, the spend-limit seed (department and
  // key), hold admission's key caps, and private.key_spend_items (both request-context key checks
  // read it; gateway-admission-history.test.mjs runs the real one).
  const DAY_START = `(date_trunc('day', now() at time zone 'utc') at time zone 'utc')`;
  const surfaces = async (workspace, key) => {
    const seeded = await seed(workspace, [key]);
    const items = await rows(`select coalesce(sum(nanos) filter (where at >= ${DAY_START}), 0)::bigint as day
      from private.key_spend_items($1, ${DAY_START}, array[$2]::uuid[])`, [workspace, key]);
    return {
      workspace: byInterval((await workspaceStatus(workspace)).budgets),
      department: byInterval((await departmentStatus(workspace, key)).department_budgets),
      seedDepartment: byInterval(seeded.department_budgets),
      seedKey: Object.fromEntries(['daily', 'weekly', 'monthly'].map((w) => [w, Number(seeded.keys[0].used[w].cost_nanos)])),
      keyItems: Number(items[0].day),
    };
  };
  const setUp = (workspace, key, department, intervals) => db.exec(`
    insert into public.workspaces (id) values ('${workspace}');
    insert into public.wallets (workspace_id, balance_nanos, reserved_nanos) values ('${workspace}', ${1000 * DOLLAR}, 0);
    insert into public.workspace_departments (id, workspace_id, name) values ('${department}', '${workspace}', 'Money');
    insert into public.keys (id, workspace_id, department_id, daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos)
      values ('${key}', '${workspace}', '${department}', ${10000 * DOLLAR}, ${10000 * DOLLAR}, ${10000 * DOLLAR});
    insert into public.workspace_budgets (workspace_id, interval, limit_nanos)
      select '${workspace}', i, ${10000 * DOLLAR} from unnest(array[${intervals.map((i) => `'${i}'`).join(', ')}]) i;
    insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos)
      select '${workspace}', '${department}', i, ${10000 * DOLLAR} from unnest(array[${intervals.filter((i) => i !== 'lifetime').map((i) => `'${i}'`).join(', ')}]) i;`);
  const everywhere = (nanos, intervals = ['daily']) => {
    const each = Object.fromEntries(intervals.map((i) => [i, nanos[i] ?? nanos]));
    const keyWindows = Object.fromEntries(['daily', 'weekly', 'monthly'].map((i) => [i, nanos[i] ?? nanos]));
    const departmentWindows = Object.fromEntries(intervals.filter((i) => i !== 'lifetime').map((i) => [i, nanos[i] ?? nanos]));
    return { workspace: each, department: departmentWindows, seedDepartment: departmentWindows, seedKey: keyWindows, keyItems: nanos.daily ?? nanos };
  };

  await check('a debited batch counts its debit at its time, not its placeholders or rows, everywhere', async () => {
    await setUp(WS_RECON, KEY.recon, RECON, ['daily']);
    await db.exec(`
      insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values
        ('${WS_RECON}', 'recon-chat', '${KEY.recon}', true, ${70 * DOLLAR});
      -- Held at $100 before midnight, with $100 of batch_hold_usage placeholders at the held price;
      -- settled at $50 today (captured cheaper than the hold).
      insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, key_id,
        captured_nanos, settled_amount_nanos, capture_ref_id, created_at) values
        ('batch_hold:recon', '${WS_RECON}', ${100 * DOLLAR}, 'captured', 'recon-request', '${KEY.recon}', ${50 * DOLLAR}, ${50 * DOLLAR}, 'b-recon',
         ${DAY_START} - interval '1 hour');
      insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos, created_at)
        select '${WS_RECON}', 'batch_hold_usage:batch_hold:recon:' || n, '${KEY.recon}', true, ${50 * DOLLAR}, ${DAY_START} - interval '1 hour'
        from generate_series(1, 2) n;
      insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status) values
        ('${WS_RECON}', 'charge', ${-50 * DOLLAR}, 'async_job_charge', '${WS_RECON}:batch_hold:recon', 'async_job', 'b-recon', 'captured');
      -- A batch without a reservation, captured at $6 today.
      insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id) values
        ('${WS_RECON}', 'batch_capture:b-late', ${6 * DOLLAR}, 'applied', true, '${KEY.recon}');`);
    // Today: $70 of chat, the $50 debit, the $6 capture. Yesterday's placeholders no longer count.
    assert.deepEqual(await surfaces(WS_RECON, KEY.recon), everywhere(126 * DOLLAR));
    const sinceYesterday = Number((await one(`select sum(nanos) as n from private.budget_spend_items($1, ${DAY_START} - interval '1 day')`, [WS_RECON])).n);
    assert.equal(sinceYesterday, 126 * DOLLAR);
    // Their per-row usage persists three days later (a persistence retry), including a batch whose id
    // starts with another's: still each debit, once.
    await db.exec(`insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos, created_at) values
      ('${WS_RECON}', 'batch_usage:b-recon:1', '${KEY.recon}', true, ${50 * DOLLAR}, now() + interval '3 days'),
      ('${WS_RECON}', 'batch_usage:b-late:1', '${KEY.recon}', true, ${6 * DOLLAR}, now() + interval '3 days'),
      ('${WS_RECON}', 'batch_usage:b-late-res:1', '${KEY.recon}', true, ${2 * DOLLAR}, now() + interval '3 days')`);
    // b-late-res has no debit yet: its row counts.
    assert.deepEqual(await surfaces(WS_RECON, KEY.recon), everywhere(128 * DOLLAR));
    // Before capture, a hold's placeholders count toward the key, the hold itself toward budgets.
    await db.exec(`
      insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, key_id, created_at) values
        ('batch_hold:open', '${WS_RECON}', ${30 * DOLLAR}, 'held', 'open-request', '${KEY.recon}', now());
      insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos)
        select '${WS_RECON}', 'batch_hold_usage:batch_hold:open:' || n, '${KEY.recon}', true, ${10 * DOLLAR} from generate_series(1, 3) n;`);
    assert.deepEqual(await surfaces(WS_RECON, KEY.recon), everywhere(158 * DOLLAR));
  });

  await check('a stepped request counts its movements in their periods after its audit row lands (daily, weekly, monthly, lifetime)', async () => {
    await setUp(WS_STEP, KEY.step, STEP, ['daily', 'weekly', 'monthly', 'lifetime']);
    // $100 debited at a checkpoint before midnight, $50 at the final settlement today.
    await db.exec(`
      insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id, created_at) values
        ('${WS_STEP}', 'billing-step', ${150 * DOLLAR}, 'applied', true, '${KEY.step}', ${DAY_START} - interval '1 hour');
      insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status, created_at) values
        ('${WS_STEP}', 'adjustment', ${-100 * DOLLAR}, 'gateway_request_charge', 'step:1', 'gateway_request', 'billing-step', 'applied', ${DAY_START} - interval '1 hour'),
        ('${WS_STEP}', 'adjustment', ${-50 * DOLLAR}, 'gateway_request_charge', 'step:final', 'gateway_request', 'billing-step', 'applied', now());`);
    // Each period counts the movements made in it: yesterday's $100 only where yesterday is in the period.
    const periods = await one(`select
      ${DAY_START} - interval '1 hour' >= (private.spend_limit_period('weekly', now())).period_start as week,
      ${DAY_START} - interval '1 hour' >= (private.spend_limit_period('monthly', now())).period_start as month`);
    const expected = { daily: 50 * DOLLAR, weekly: (periods.week ? 150 : 50) * DOLLAR, monthly: (periods.month ? 150 : 50) * DOLLAR, lifetime: 150 * DOLLAR };
    const intervals = ['daily', 'weekly', 'monthly', 'lifetime'];
    assert.deepEqual(await surfaces(WS_STEP, KEY.step), everywhere(expected, intervals));
    // The final audit row lands today with the $150 total: its cost does not count again.
    await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos)
      values ($1, 'stream-step', 'billing-step', $2, true, $3)`, [WS_STEP, KEY.step, 150 * DOLLAR]);
    assert.deepEqual(await surfaces(WS_STEP, KEY.step), everywhere(expected, intervals));
    // A later refund lowers it at its own time.
    await db.exec(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status, created_at)
      values ('${WS_STEP}', 'adjustment', ${20 * DOLLAR}, 'gateway_request_charge', 'step:refund', 'gateway_request', 'billing-step', 'applied', now())`);
    const refunded = Object.fromEntries(Object.entries(expected).map(([w, n]) => [w, n - 20 * DOLLAR]));
    assert.deepEqual(await surfaces(WS_STEP, KEY.step), everywhere(refunded, intervals));
  });

  await check('a request pending reconciliation counts its money movements and what it did not collect, never its audit cost', async () => {
    await setUp(WS_PEND, KEY.pend, PEND, ['daily']);
    await db.exec(`
      insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id) values
        ('${WS_PEND}', 'billing-null', ${2 * DOLLAR}, 'applied', true, '${KEY.pend}'),
        ('${WS_PEND}', 'billing-stale', ${DOLLAR}, 'applied', true, '${KEY.pend}'),
        ('${WS_PEND}', 'billing-zero', ${3 * DOLLAR}, 'applied', false, '${KEY.pend}'),
        ('${WS_PEND}', 'billing-short', ${DOLLAR}, 'applied', true, '${KEY.pend}'),
        -- Nothing could be priced or charged: a final charge row of 0.
        ('${WS_PEND}', 'billing-nothing', 0, 'applied', true, '${KEY.pend}');
      insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status) values
        -- A stream that charged $3 at a checkpoint and whose final bill of $1 refunded $2 after its row was written.
        ('${WS_PEND}', 'adjustment', ${-3 * DOLLAR}, 'gateway_request_charge', 'stale:1', 'gateway_request', 'billing-stale', 'applied'),
        ('${WS_PEND}', 'adjustment', ${2 * DOLLAR}, 'gateway_request_charge', 'stale:final', 'gateway_request', 'billing-stale', 'applied'),
        -- A stream that charged $3 at a checkpoint and whose refund to 0 failed.
        ('${WS_PEND}', 'adjustment', ${-3 * DOLLAR}, 'gateway_request_charge', 'zero:1', 'gateway_request', 'billing-zero', 'applied');
      insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, expected_cost_nanos, detail_metadata) values
        -- A committed one-off charge whose stored total could not be read back: cost unknown.
        ('${WS_PEND}', 'pend-null', 'billing-null', '${KEY.pend}', false, null, ${2 * DOLLAR}, null),
        -- The stale read-back ($3) on the stream's row; its charge has since dropped to $1.
        ('${WS_PEND}', 'pend-stale', 'billing-stale', '${KEY.pend}', false, ${3 * DOLLAR}, ${DOLLAR}, null),
        -- The failed refund to 0: the confirmed $3 and an intended bill of 0.
        ('${WS_PEND}', 'pend-zero', 'billing-zero', '${KEY.pend}', false, ${3 * DOLLAR}, 0, null),
        -- Charged $1 of an intended $2.50: the $1.50 it did not collect counts too.
        ('${WS_PEND}', 'pend-short', 'billing-short', '${KEY.pend}', false, ${DOLLAR}, ${2.5 * DOLLAR}, null),
        -- Pending with no charge row: its audit cost (0).
        ('${WS_PEND}', 'pend-none', 'billing-none', '${KEY.pend}', false, 0, ${2 * DOLLAR}, null),
        -- Nothing could be priced or charged (#3534): expected 0 and cost 0, with and without a
        -- charge row. $0, not unknown.
        ('${WS_PEND}', 'pend-nothing', 'billing-nothing', '${KEY.pend}', false, 0, 0, null),
        ('${WS_PEND}', 'pend-nothing-uncharged', 'billing-nothing-uncharged', '${KEY.pend}', false, 0, 0, null);`);
    // $2 + $1 + $3 + $2.50, and $0 for the rows where nothing was priced or charged.
    assert.deepEqual(await surfaces(WS_PEND, KEY.pend), everywhere(8.5 * DOLLAR));
    // The failed refund to 0 is reconciled: its +$3 refund lands.
    await db.exec(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status) values
      ('${WS_PEND}', 'adjustment', ${3 * DOLLAR}, 'gateway_request_charge', 'zero:final', 'gateway_request', 'billing-zero', 'applied');
      update public.gateway_request_charges set cost_nanos = 0, is_final = true where workspace_id = '${WS_PEND}' and request_id = 'billing-zero';`);
    assert.deepEqual(await surfaces(WS_PEND, KEY.pend), everywhere(5.5 * DOLLAR));
    // Hold admission's key cap reads the same $5.50: $0.40 more fits under a $6 cap, $0.60 does not.
    await db.query(`update public.keys set daily_limit_cost_nanos = $2 where id = $1`, [KEY.pend, 6 * DOLLAR]);
    assert.equal((await reserve(WS_PEND, 'video_hold:pend-fits', 0.4 * DOLLAR, KEY.pend, 1)).ok, true);
    assert.equal((await reserve(WS_PEND, 'video_hold:pend-over', 0.2 * DOLLAR, KEY.pend, 1)).reason, 'daily_cost_limit_reached');
    // The coordinator holding a pending request's admission lists both ids: its charge, movements and
    // uncollected part are left to it.
    const held = await asService(async () => (await one(`select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as r`,
      [WS_PEND, [KEY.pend], ['pend-short', 'billing-short']])).r);
    // (Holds are not key usage: hold admission adds them itself.)
    assert.equal(Number(held.keys[0].used.daily.cost_nanos), 3 * DOLLAR);
  });

  await check('billing_status alone marks a row pending only before 2026-11-09', async () => {
    // Gateway code before this change flagged pending rows only in detail_metadata; the gateway now
    // always sets expected_cost_nanos. A legacy row (8 Nov) and a newer one (10 Nov), each flagged by
    // billing_status only, each with an applied charge below its row's cost.
    await db.exec(`
      insert into public.workspaces (id) values ('${WS_LEGACY}');
      insert into public.keys (id, workspace_id) values ('${KEY.legacy}', '${WS_LEGACY}');
      insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id, created_at) values
        ('${WS_LEGACY}', 'billing-legacy', ${4 * DOLLAR}, 'applied', true, '${KEY.legacy}', '2026-11-08T12:00:00Z'),
        ('${WS_LEGACY}', 'billing-newer', ${6 * DOLLAR}, 'applied', true, '${KEY.legacy}', '2026-11-10T12:00:00Z');
      insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, detail_metadata, created_at) values
        ('${WS_LEGACY}', 'pend-legacy', 'billing-legacy', '${KEY.legacy}', false, ${5 * DOLLAR},
          '{"accounting_finalization": {"billing_status": "pending_reconciliation"}}', '2026-11-08T12:00:01Z'),
        ('${WS_LEGACY}', 'pend-newer', 'billing-newer', '${KEY.legacy}', false, ${7 * DOLLAR},
          '{"accounting_finalization": {"billing_status": "pending_reconciliation"}}', '2026-11-10T12:00:01Z');`);
    // The legacy row counts its $4 charge; the newer one is not pending, so its row's $7 counts.
    const total = async (fn, args) => Number((await one(`select coalesce(sum(nanos), 0)::bigint as n from private.${fn}(${args})`)).n);
    assert.equal(await total('budget_spend_items', `'${WS_LEGACY}', null`), 11 * DOLLAR);
    assert.equal(await total('key_spend_items', `'${WS_LEGACY}', null, array['${KEY.legacy}']::uuid[]`), 11 * DOLLAR);
    // A newer row is read for its pending state through expected_cost_nanos only.
    await db.query(`update public.gateway_requests set expected_cost_nanos = $2 where workspace_id = $1 and request_id = 'pend-newer'`, [WS_LEGACY, 6 * DOLLAR]);
    assert.equal(await total('budget_spend_items', `'${WS_LEGACY}', null`), 10 * DOLLAR);
    assert.equal(await total('key_spend_items', `'${WS_LEGACY}', null, array['${KEY.legacy}']::uuid[]`), 10 * DOLLAR);
  });
  await check('the seed leaves out request ids the coordinator already counts', async () => {
    const seeded = await asService(async () => (await one(`select public.gateway_spend_limit_seed($1, $2::uuid[], array['stream-cancelled']) as r`, [WS_CAP, [KEY.cap]])).r);
    assert.equal(Number(seeded.department_budgets[0].usage_nanos), 3 * DOLLAR);
  });

  await check('a small partial index serves charged requests that did not succeed', async () => {
    const { def } = await one(`select pg_get_indexdef('public.gateway_requests_charged_unsuccessful_cost_idx'::regclass) as def`);
    assert.match(def, /\(workspace_id, created_at\) INCLUDE \(key_id, cost_nanos\) WHERE \(\(success IS NOT TRUE\) AND \(cost_nanos > 0\)\)/);
  });
  await check('budget readers probe indexes per row and charge under custom and generic plans, with normal planner settings', async () => {
    const charges = (await one(`select pg_get_indexdef('public.gateway_request_charges_applied_cost_idx'::regclass) as def`)).def;
    assert.match(charges, /\(workspace_id, created_at\) INCLUDE \(request_id, key_id, cost_nanos\) WHERE \(\(status = 'applied'::text\) AND \(cost_nanos > 0\)\)/);
    const movements = (await one(`select pg_get_indexdef('public.credit_ledger_request_charge_movements_idx'::regclass) as def`)).def;
    assert.match(movements, /\(workspace_id, created_at\) INCLUDE \(source_ref_id, amount_nanos\)/);
    // A workspace with history in every partition, and a few open charges.
    await db.exec(`
      insert into public.workspaces (id) values ('${WS_PLAN}');
      insert into public.keys (id, workspace_id) values ('${KEY.plan}', '${WS_PLAN}');
      insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, created_at)
        select '${WS_PLAN}', 'plan-' || i, 'plan-billing-' || i, '${KEY.plan}', true, 1,
          case i % 3 when 0 then timestamptz '2025-06-01' when 1 then now() else timestamptz '2027-06-01' end + (i || ' seconds')::interval
        from generate_series(1, 30000) i;
      insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, created_at)
        select '${WS_PLAN}', 'plan-open-' || i, 5, 'applied', true, now() from generate_series(1, 20) i;
      insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status, created_at)
        select '${WS_PLAN}', 'adjustment', -5, 'gateway_request_charge', 'plan-step-' || i, 'gateway_request', 'plan-open-' || i, 'applied', now()
        from generate_series(1, 10) i;
      -- A batch of each kind, with rows in every partition.
      insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, created_at) values
        ('${WS_PLAN}', 'batch_capture:plan-b', 9, 'applied', true, now());
      insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, captured_nanos, capture_ref_id) values
        ('batch_hold:plan', '${WS_PLAN}', 9, 'captured', 'plan-r', 9, 'plan-r');
      insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status, created_at) values
        ('${WS_PLAN}', 'charge', -9, 'async_job_charge', '${WS_PLAN}:batch_hold:plan', 'async_job', 'plan-r', 'captured', now());
      insert into public.gateway_requests (workspace_id, request_id, success, cost_nanos, created_at)
        select '${WS_PLAN}', case i % 2 when 0 then 'batch_usage:plan-b:' else 'batch_usage:plan-r:' end || i, true, 1,
          case i % 3 when 0 then timestamptz '2025-06-01' when 1 then now() else timestamptz '2027-06-01' end
        from generate_series(1, 300) i;
      -- Rows pending reconciliation, by expected cost and by billing_status, with applied charges.
      insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, expected_cost_nanos, detail_metadata, created_at)
        select '${WS_PLAN}', 'plan-pending-' || i, 'plan-open-' || i, '${KEY.plan}', false, 3,
          case when i % 2 = 0 then 7 end,
          case when i % 2 = 1 then '{"accounting_finalization": {"billing_status": "pending_reconciliation"}}'::jsonb end,
          case when i % 2 = 1 then timestamptz '2026-11-08 12:00:00+00' else now() end
        from generate_series(11, 14) i;
      analyze public.gateway_requests; analyze public.gateway_request_charges; analyze public.credit_ledger;`);
    // Each function's own body, prepared with its parameters and planned both ways: custom (the
    // planner sees the values) and generic (as a SQL function's statements may be).
    const plans = async (file, args) => {
      const source = await readSchema(file);
      const body = source.slice(source.indexOf('AS $function$') + 'AS $function$'.length, source.indexOf('$function$;'))
        .replace(/--.*$/gm, '').replace(/;\s*$/, '')
        .replace(/\bp_workspace_id\b/g, '$1').replace(/\bp_since\b/g, '$2').replace(/\bp_key_ids\b/g, '$3')
        .replace(/\bp_exclude_request_ids\b/g, '$4').replace(/\bp_exclude_charge_ids\b/g, '$5');
      const result = {};
      for (const mode of ['force_custom_plan', 'force_generic_plan']) {
        await db.exec(`set plan_cache_mode = ${mode}; prepare reader(uuid, timestamptz, uuid[], text[], text[]) as ${body}`);
        try {
          result[mode] = {
            plan: (await rows(`explain (costs off) execute reader(${args})`)).map((row) => row['QUERY PLAN']).join('\n'),
            rows: await rows(`execute reader(${args})`),
          };
        } finally {
          await db.exec('deallocate reader; reset plan_cache_mode');
        }
      }
      return result;
    };
    const since = `'${WS_PLAN}', now() - interval '1 day'`;
    for (const [mode, { plan, rows: out }] of Object.entries(await plans('private/functions/unbilled_spend.sql', `${since}, null, '{}', '{}'`))) {
      // Each charge probes its request row, and a pending one, on the billing request index.
      assert.match(plan, /Limit/, mode);
      assert.match(plan, /gateway_requests_\w+_workspace_id_billing_request_id_idx/, mode);
      assert.doesNotMatch(plan, /Seq Scan on gateway_requests/, `${mode}\n${plan}`);
      assert.doesNotMatch(plan, /Hash (Right )?Anti Join/, `${mode}\n${plan}`);
      // Ten stepped movements, ten one-off charges (four pending, six without a row), two batch
      // debits, and what two pending rows did not collect.
      assert.equal(out.length, 24, mode);
    }
    // Request readers over a recent window (the last rows of the 2027 history), as budgets read it.
    const recent = `'${WS_PLAN}', timestamptz '2027-06-01 08:15:00+00'`;
    for (const [file, args] of [
      ['private/functions/key_spend_items.sql', `${recent}, array['${KEY.plan}']::uuid[], '{}', '{}'`],
      ['private/functions/budget_spend_items.sql', `${recent}, null, '{}', '{}'`],
    ]) {
      for (const [mode, { plan }] of Object.entries(await plans(file, args))) {
        assert.doesNotMatch(plan, /Seq Scan on gateway_requests/, `${file} ${mode}\n${plan}`);
      }
    }
  });
  await check('gateway_wallet_reserve_once takes no budget row lock', async () => {
    const { def } = await one(`select pg_get_functiondef('public.gateway_wallet_reserve_once(uuid, text, bigint, text, uuid, integer)'::regprocedure) as def`);
    assert.doesNotMatch(def, /from\s+public\.workspace_budgets/i);
    assert.match(def, /pg_advisory_xact_lock\(hashtextextended\(p_workspace_id::text, 0\)\)/);
  });

  // No wallet, no applied charge.
  await check('a charge for a workspace without a wallet fails and is not recorded as applied', async () => {
    await assert.rejects(asService(() => db.query(`select public.deduct_and_check_top_up($1, 100)`, [NO_WALLET])), /wallet_not_found/);
    await assert.rejects(asService(() => db.query(`select * from public.gateway_deduct_and_check_top_up_once($1, 'req-1', 100)`, [NO_WALLET])), /wallet_not_found/);
    const applied = await rows(`select 1 from public.gateway_request_charges where workspace_id = $1 and status = 'applied'`, [NO_WALLET]);
    assert.equal(applied.length, 0);
  });

  // Hygiene.
  await check('wallet_apply_delta and the credit_ledger insert policy are gone', async () => {
    assert.equal((await rows(`select 1 from pg_proc where proname = 'wallet_apply_delta'`)).length, 0);
    assert.equal((await rows(`select 1 from pg_policies where tablename = 'credit_ledger' and cmd = 'INSERT'`)).length, 0);
  });
  await check('clients cannot write wallet reservations or delete wallets', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const { allowed } = await one(`select has_table_privilege($1, 'public.gateway_wallet_reservations', $2) as allowed`, [role, privilege]);
        assert.equal(allowed, false, `${role} ${privilege} reservations`);
      }
      const { reads } = await one(`select has_table_privilege($1, 'public.gateway_wallet_reservations', 'SELECT') as reads`, [role]);
      assert.equal(reads, true, `${role} keeps SELECT (RLS decides)`);
    }
    const { deletes } = await one(`select has_table_privilege('anon', 'public.wallets', 'DELETE') as deletes`);
    assert.equal(deletes, false);
  });

  // Retention stays at 90 days.
  await check('I/O log retention over 90 days is refused', async () => {
    await assert.rejects(db.query(`update public.workspace_settings set io_logging_retention_days = 180 where workspace_id = $1`, [WS]), /retention_days_check/);
    await db.query(`update public.workspace_settings set io_logging_retention_days = 90 where workspace_id = $1`, [WS]);
  });

  await check('a keyed stepped charge counts toward its department; a keyless one toward the workspace only', async () => {
    const before = Number((await departmentStatus(WS_CAP, KEY.cap)).department_budgets[0].usage_nanos);
    const workspaceBefore = Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos);
    await db.exec(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id) values
      ('${WS_CAP}', 'billing-keyed', ${DOLLAR}, 'applied', false, '${KEY.cap}'),
      ('${WS_CAP}', 'billing-keyless', ${2 * DOLLAR}, 'applied', false, null)`);
    assert.equal(Number((await departmentStatus(WS_CAP, KEY.cap)).department_budgets[0].usage_nanos), before + DOLLAR);
    assert.equal(Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos), workspaceBefore + 3 * DOLLAR);
    assert.equal(Number((await seed(WS_CAP, [KEY.cap])).department_budgets[0].usage_nanos), before + DOLLAR);
    await db.query(`delete from public.gateway_request_charges where request_id in ('billing-keyed', 'billing-keyless')`);
  });
  await check('deleting a key keeps its captured video and batch hold counted once', async () => {
    await db.exec(`
      insert into public.workspaces (id) values ('${WS_DEL}');
      insert into public.wallets (workspace_id, balance_nanos) values ('${WS_DEL}', ${100 * DOLLAR});
      insert into public.keys (id, workspace_id) values ('${KEY.del}', '${WS_DEL}');
      insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${WS_DEL}', 'daily', ${100 * DOLLAR});
      insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, key_id, settled_amount_nanos)
        values ('video_hold:del', '${WS_DEL}', ${4 * DOLLAR}, 'captured', 'vid-del', '${KEY.del}', ${3 * DOLLAR});
      insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos)
        values ('${WS_DEL}', 'vid-del', '${KEY.del}', true, ${3 * DOLLAR});`);
    const batch = await reserve(WS_DEL, 'batch_hold:del', 2 * DOLLAR, KEY.del, 2);
    assert.equal(batch.ok, true);
    const usage = async () => Number((await workspaceStatus(WS_DEL)).budgets[0].usage_nanos);
    assert.equal(await usage(), 5 * DOLLAR, '$3 video (audited) + $2 batch hold');
    await db.query(`delete from public.keys where id = $1`, [KEY.del]);
    const nulled = await one(`select (select count(*) from public.gateway_requests where workspace_id = $1 and key_id is null)::int as requests,
      (select count(*) from public.gateway_wallet_reservations where workspace_id = $1 and key_id is null)::int as holds`, [WS_DEL]);
    assert.deepEqual(nulled, { requests: 3, holds: 2 }, 'the foreign keys set both key columns to NULL');
    assert.equal(await usage(), 5 * DOLLAR, 'still counted once after the key is gone');
  });
  await check('the history bound prunes gateway_requests partitions under a generic plan', async () => {
    const { def } = await one(`select pg_get_functiondef('private.budget_spend_items(uuid, timestamptz, uuid[], text[], text[])'::regprocedure) as def`);
    const unbilled = (await one(`select pg_get_functiondef('private.unbilled_spend(uuid, timestamptz, uuid[], text[], text[])'::regprocedure) as def`)).def;
    assert.doesNotMatch(def + unbilled, /p_since is null or/i);
    assert.equal((def.match(/created_at >= coalesce\(p_since, '-infinity'::timestamptz\)/g) ?? []).length, 3);
    assert.match(unbilled, /request\.created_at >= coalesce\(p_since, '-infinity'::timestamptz\)/);
    // The same predicate, prepared and planned generically as inside the function.
    await db.exec(`set plan_cache_mode = force_generic_plan;
      prepare spend_history(uuid, timestamptz) as select sum(request.cost_nanos) from public.gateway_requests request
        where request.workspace_id = $1 and request.cost_nanos > 0 and request.created_at >= coalesce($2, '-infinity'::timestamptz);
      prepare spend_history_or(uuid, timestamptz) as select sum(request.cost_nanos) from public.gateway_requests request
        where request.workspace_id = $1 and request.cost_nanos > 0 and ($2 is null or request.created_at >= $2);`);
    try {
      const plan = async (name) => (await rows(`explain (costs off) execute ${name}('${WS}', '2026-06-01')`)).map((row) => row['QUERY PLAN']).join('\n');
      const pruned = await plan('spend_history');
      assert.match(pruned, /Subplans Removed: 1/);
      assert.doesNotMatch(pruned, /gateway_requests_2025/);
      assert.match(await plan('spend_history_or'), /gateway_requests_2025/, 'the OR form reads every partition');
    } finally {
      await db.exec('deallocate spend_history; deallocate spend_history_or; reset plan_cache_mode');
    }
  });

  // The reaper releases video holds that billing will never settle.
  await check('the reaper releases stale video holds with no live operation', async () => {
    const released = await asService(async () => (await one(`select public.gateway_wallet_release_stale_orphan_batch_reservations(1800, 100) as n`)).n);
    const states = Object.fromEntries((await rows(`select reservation_id, status, release_ref_id from public.gateway_wallet_reservations where workspace_id = $1`, [WS_REAP]))
      .map((row) => [row.reservation_id, `${row.status}:${row.release_ref_id ?? ''}`]));
    assert.deepEqual(states, {
      'video_hold:no-operation': 'released:stale_orphan_video_reaper',
      'video_hold:queued': 'held:',
      'video_hold:billed': 'released:stale_orphan_video_reaper',
      'video_hold:unbilled': 'held:',
      'video_hold:failed': 'released:stale_orphan_video_reaper',
      'video_hold:recent': 'reserved:',
      'batch_hold:orphan': 'released:stale_orphan_batch_reaper',
    });
    assert.equal(released, 4);
    const { reserved_nanos } = await one(`select reserved_nanos from public.wallets where workspace_id = $1`, [WS_REAP]);
    assert.equal(Number(reserved_nanos), 30 * DOLLAR);
  });

  if (failures.length) throw new Error(`${failures.length} check(s) failed: ${failures.join('; ')}`);
  console.log('budget enforcement and money hygiene: all checks passed');
} finally {
  await db.close();
}
