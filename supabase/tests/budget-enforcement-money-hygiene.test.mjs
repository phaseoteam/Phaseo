import assert from 'node:assert/strict';
import { applyMigration, createBudgetDatabase, readIndexMigrations, readMigration, readSchema } from './fixtures/budget-enforcement-db.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

// Migration 20261106153747_budget_enforcement_money_hygiene against production shapes (see the
// fixture): one budget usage calculation for workspace budgets, department admission and the
// spend-limit seed; department budgets on holds, realtime and the context fallback; one count per
// batch hold; active holds across period rollover; captured video holds before their audit row;
// no budget row lock in reserve; a missing wallet fails the charge; dropped and revoked money
// surfaces; 90-day I/O retention (normalized first); and video holds in the stale-hold reaper.
// PGlite runs one connection, so lock order is checked from the function definition.
const functionFiles = [
  'private/functions/open_stepped_charges.sql',
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
const ENG = id('4', 1);
const ROLL = id('4', 2);
const CAP = id('4', 3);
const MEMBER = id('2', 1);
const KEY = { linked: id('3', 1), member: id('3', 2), outside: id('3', 3), batch: id('3', 4), roll: id('3', 5), cap: id('3', 6), limited: id('3', 7), del: id('3', 8) };
// Before every current period: the earlier of this week's Monday and the 1st, less a day.
const BEFORE_PERIODS = `(least(date_trunc('week', now() at time zone 'utc'), date_trunc('month', now() at time zone 'utc')) at time zone 'utc' - interval '1 day')`;

const db = await createBudgetDatabase(PGlite);
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const failures = [];
const check = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); } catch (error) { failures.push(name); console.log(`not ok - ${name}\n  ${String(error.message).split('\n')[0]}`); }
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
        'private/functions/department_budget_usage.sql', 'private/functions/workspace_budget_status.sql', 'private/functions/open_stepped_charges.sql']) {
        assert.ok(manifest[list].includes(path), `${path} in ${list}`);
      }
      assert.ok(!manifest[list].includes('public/functions/wallet_apply_delta.sql'), `wallet_apply_delta gone from ${list}`);
      const order = manifest.loadOrder;
      assert.ok(order.indexOf('private/functions/department_budget_usage.sql') > order.indexOf('private/functions/budget_spend_items.sql'));
      assert.ok(order.indexOf('private/functions/department_budget_usage.sql') > order.indexOf('private/functions/spend_limit_period.sql'));
    }
    assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /);
    assert.doesNotMatch(migration, /create\s+index/i, 'indexes have their own migrations');
    for (const index of await readIndexMigrations()) {
      const statements = index.split('\n').filter((line) => !line.startsWith('--')).join('\n').split(';').filter((part) => part.trim());
      assert.equal(statements.length, 1, 'one statement per index migration');
      assert.match(statements[0], /^\s*CREATE INDEX IF NOT EXISTS /);
    }
    assert.match(migration, /raise notice 'io_logging_retention_days set to 90 on % workspace_settings row\(s\)', v_count;/);
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

  await check('the migration releases no hold itself', async () => {
    const held = await rows(`select reservation_id from public.gateway_wallet_reservations where workspace_id = $1 and status in ('held', 'reserved') order by 1`, [WS_REAP]);
    assert.equal(held.length, 7);
  });

  await check('gateway_department_budget_status is service-only SECURITY DEFINER; the helpers are private', async () => {
    const fn = await one(`select prosecdef, provolatile from pg_proc where proname = 'gateway_department_budget_status'`);
    assert.deepEqual(fn, { prosecdef: true, provolatile: 's' });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const signature of ['private.budget_spend_items(uuid, timestamptz, uuid[], text[], text[])', 'private.department_budget_usage(uuid, uuid, text[])',
        'private.workspace_budget_status(uuid, bigint, text[])', 'private.open_stepped_charges(uuid)']) {
        const { allowed } = await one(`select has_function_privilege($1, $2, 'execute') as allowed`, [role, signature]);
        assert.equal(allowed, false, `${role} ${signature}`);
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
  await check('a captured batch hold still counts once, through its usage rows', async () => {
    await db.query(`update public.gateway_wallet_reservations set status = 'captured' where reservation_id = 'batch_hold:b1'`);
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
  await check('a stepped stream charge whose request row never landed counts toward the workspace budget, once', async () => {
    const before = Number((await workspaceStatus(WS_ROLL)).budgets[0].usage_nanos);
    // Charged in steps before every current period; the worker stopped before writing the request row.
    await db.exec(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, created_at) values
      ('${WS_ROLL}', 'billing-abandoned', ${DOLLAR}, 'applied', false, ${BEFORE_PERIODS}),
      ('${WS_ROLL}', 'billing-final', ${DOLLAR}, 'applied', true, now()),
      ('${WS_ROLL}', 'billing-applying', ${DOLLAR}, 'applying', false, now()),
      ('${WS_ROLL}', 'billing-landed', ${DOLLAR}, 'applied', false, now())`);
    await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos) values
      ($1, 'stream-landed', 'billing-landed', $2, false, $3)`, [WS_ROLL, KEY.roll, 1.25 * DOLLAR]);
    // Every period counts the abandoned charge ($1) and the landed request ($1.25), not its charge row.
    assert.deepEqual(byInterval((await workspaceStatus(WS_ROLL)).budgets), {
      daily: before + 2.25 * DOLLAR, weekly: before + 2.25 * DOLLAR, monthly: before + 2.25 * DOLLAR,
    });
    // Its request row lands: counted through the row instead.
    await db.query(`insert into public.gateway_requests (workspace_id, request_id, billing_request_id, key_id, success, cost_nanos, created_at) values
      ($1, 'stream-abandoned', 'billing-abandoned', $2, false, $3, now())`, [WS_ROLL, KEY.roll, 1.5 * DOLLAR]);
    assert.equal(Number((await workspaceStatus(WS_ROLL)).budgets[0].usage_nanos), before + 2.75 * DOLLAR);
  });
  await check('the seed skips an open stepped charge listed by billing request id, and only then', async () => {
    await db.exec(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id) values
      ('${WS_CAP}', 'billing-open', ${DOLLAR}, 'applied', false, '${KEY.limited}')`);
    const seedWith = async (exclude) => asService(async () => (await one(
      `select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[]) as r`, [WS_CAP, [KEY.limited], exclude])).r);
    const usage = (seeded) => ({
      workspace: Number(seeded.budget_status.budgets[0].usage_nanos),
      key: Number(seeded.keys[0].used.daily.cost_nanos),
    });
    const counted = usage(await seedWith([]));
    // The coordinator holds the stream's checkpoint: it lists the request id and the billing id.
    assert.deepEqual(usage(await seedWith(['stream-open', 'billing-open'])), { workspace: counted.workspace - DOLLAR, key: counted.key - DOLLAR });
    // The request id alone does not stand for the charge row.
    assert.deepEqual(usage(await seedWith(['stream-open'])), counted);
    // Admission always counts it.
    assert.equal(Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos), counted.workspace);
    await db.query(`delete from public.gateway_request_charges where request_id = 'billing-open'`);
  });
  await check('a delivered request pending reconciliation counts at its expected cost, once', async () => {
    const before = { workspace: Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos),
      department: Number((await departmentStatus(WS_CAP, KEY.cap)).department_budgets[0].usage_nanos) };
    // The response was delivered; the wallet charge failed, so the row carries cost 0 and the expected amount.
    await db.query(`insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos, expected_cost_nanos) values
      ($1, 'delivered-unbilled', $2, false, 0, $3), ($1, 'unpriced', $2, false, 0, null)`, [WS_CAP, KEY.cap, 2 * DOLLAR]);
    const now = async () => ({ workspace: Number((await workspaceStatus(WS_CAP)).budgets[0].usage_nanos),
      department: Number((await departmentStatus(WS_CAP, KEY.cap)).department_budgets[0].usage_nanos),
      seeded: Number((await seed(WS_CAP, [KEY.cap])).department_budgets[0].usage_nanos) });
    assert.deepEqual(await now(), { workspace: before.workspace + 2 * DOLLAR, department: before.department + 2 * DOLLAR, seeded: before.department + 2 * DOLLAR });
    // A later charge of the full amount: counted once, whether or not the expected amount is cleared.
    await db.query(`update public.gateway_requests set cost_nanos = $2 where workspace_id = $1 and request_id = 'delivered-unbilled'`, [WS_CAP, 2 * DOLLAR]);
    assert.deepEqual(await now(), { workspace: before.workspace + 2 * DOLLAR, department: before.department + 2 * DOLLAR, seeded: before.department + 2 * DOLLAR });
    // A partial charge counts the larger of the two.
    await db.query(`update public.gateway_requests set cost_nanos = $2 where workspace_id = $1 and request_id = 'delivered-unbilled'`, [WS_CAP, DOLLAR / 2]);
    assert.equal((await now()).workspace, before.workspace + 2 * DOLLAR);
    // The seed leaves it to the coordinator while it is still counted from memory.
    const excluded = await asService(async () => (await one(
      `select public.gateway_spend_limit_seed($1, $2::uuid[], array['delivered-unbilled']) as r`, [WS_CAP, [KEY.cap]])).r);
    assert.equal(Number(excluded.department_budgets[0].usage_nanos), before.department);
    await db.query(`delete from public.gateway_requests where request_id in ('delivered-unbilled', 'unpriced')`);
  });
  await check('the seed leaves out request ids the coordinator already counts', async () => {
    const seeded = await asService(async () => (await one(`select public.gateway_spend_limit_seed($1, $2::uuid[], array['stream-cancelled']) as r`, [WS_CAP, [KEY.cap]])).r);
    assert.equal(Number(seeded.department_budgets[0].usage_nanos), 3 * DOLLAR);
  });

  await check('a small partial index serves charged requests that did not succeed', async () => {
    const { def } = await one(`select pg_get_indexdef('public.gateway_requests_charged_unsuccessful_cost_idx'::regclass) as def`);
    assert.match(def, /\(workspace_id, created_at\) INCLUDE \(key_id, cost_nanos\) WHERE \(\(success IS NOT TRUE\) AND \(cost_nanos > 0\)\)/);
  });
  await check('open stepped charges are read from a partial index and checked by billing request id', async () => {
    const charges = (await one(`select pg_get_indexdef('public.gateway_request_charges_open_step_idx'::regclass) as def`)).def;
    assert.match(charges, /\(workspace_id, request_id\) INCLUDE \(key_id, created_at, cost_nanos\) WHERE \(\(is_final IS FALSE\) AND \(status = 'applied'::text\) AND \(cost_nanos > 0\)\)/);
    const requests = (await one(`select pg_get_indexdef('public.gateway_requests_workspace_billing_request_idx'::regclass) as def`)).def;
    assert.match(requests, /\(workspace_id, billing_request_id\) WHERE \(billing_request_id IS NOT NULL\)/);
    // The lookup per open charge uses the billing request index, never a scan of every request.
    await db.exec('set enable_seqscan = off');
    try {
      const plan = (await rows(`explain select 1 from public.gateway_request_charges charge
        where charge.workspace_id = $1 and charge.is_final is false and charge.status = 'applied' and charge.cost_nanos > 0 and not exists (
          select 1 from public.gateway_requests request
          where request.workspace_id = charge.workspace_id and request.billing_request_id = charge.request_id)`, [WS_ROLL]))
        .map((row) => row['QUERY PLAN']).join('\n');
      // Each partition carries its own copy of the parent index, named after the partition.
      assert.match(plan, /gateway_requests_\w+_workspace_id_billing_request_id_idx/);
      assert.doesNotMatch(plan, /Seq Scan/);
      assert.match(plan, /gateway_request_charges_open_step_idx/);
    } finally { await db.exec('reset enable_seqscan'); }
  });

  // The advisory lock serializes holds and budget writes; no budget row lock after it.
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
    // Listed by billing request id while the coordinator counts it from memory.
    const excluded = await asService(async () => (await one(
      `select public.gateway_spend_limit_seed($1, $2::uuid[], array['billing-keyed']) as r`, [WS_CAP, [KEY.cap]])).r);
    assert.equal(Number(excluded.department_budgets[0].usage_nanos), before);
    assert.equal(Number(excluded.budget_status.budgets[0].usage_nanos), workspaceBefore + 2 * DOLLAR);
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
    assert.doesNotMatch(def, /p_since is null or/i);
    assert.equal((def.match(/created_at >= coalesce\(p_since, '-infinity'::timestamptz\)/g) ?? []).length, 4);
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
