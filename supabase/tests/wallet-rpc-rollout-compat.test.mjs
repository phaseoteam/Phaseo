// Rollout check: CI runs `supabase db push` before it deploys the Workers, so for a few minutes the
// previous gateway keeps calling the wallet RPCs against this PR's migrations. Each call below is the
// exact named-argument set the previous gateway sends (copied from origin/main when this was written):
// - apps/api/src/pipeline/pricing/persist.ts: gateway_charge_with_credit_cache(p_workspace_id,
//   p_request_id, p_cost_nanos, p_credit_snapshot_balance_nanos)
// - apps/api/src/core/wallet-reservations.ts: gateway_wallet_settle_once(p_workspace_id,
//   p_reservation_id, p_actual_nanos, p_settle_ref_id)
// - gateway_charge_with_credit_cache's previous body: gateway_deduct_and_check_top_up_once(
//   p_workspace_id, p_request_id, p_cost_nanos), positional
// gateway_charge_request_total is new in this PR, so no previous Worker calls it; its required
// arguments are checked without the defaulted ones. Named arguments are how PostgREST calls RPCs.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/wallet-rpc-rollout-compat.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).sort();
const migration = async (suffix) => {
  const name = migrations.find((file) => file.endsWith(suffix));
  assert(name, `${suffix} exists`);
  return read(`../migrations/${name}`);
};

const usd = (n) => Math.round(n * 1e9);
const ws = '10000000-0000-4000-8000-000000000001';
const db = new PGlite();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const balance = async () => Number((await one('select balance_nanos from public.wallets where workspace_id = $1', [ws])).balance_nanos);

try {
  await db.exec(await read('./fixtures/billing-security-before.sql'));
  await db.query('insert into public.workspaces (id) values ($1)', [ws]);
  await db.query('insert into public.wallets (workspace_id, balance_nanos) values ($1, $2)', [ws, usd(10)]);
  // Production state before this PR (gateway_requests already has these columns), then this PR's
  // migrations in order.
  await db.exec('alter table public.gateway_requests add column billing_request_id text, add column request_id text;');
  await db.exec(await migration('_billing_security_fixes.sql'));
  for (const suffix of ['_gateway_charge_request_total.sql', '_validate_gateway_request_charges_cost_check.sql',
    '_async_settlement_always_charges.sql', '_refund_claim_counts_charged_failures.sql', '_gateway_requests_billing_request_index.sql']) {
    await db.exec(await migration(suffix));
  }

  // The signatures: every parameter the previous gateway passes keeps its name and type, and each
  // new parameter has a default, so the previous calls still resolve to exactly one function.
  const signatures = (await db.query(`
    select p.proname, pg_get_function_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('gateway_charge_with_credit_cache', 'gateway_deduct_and_check_top_up_once',
      'gateway_charge_request_total', 'gateway_wallet_settle_once')
    order by p.proname`)).rows;
  assert.deepEqual(signatures.map((row) => [row.proname, row.args]), [
    ['gateway_charge_request_total', 'p_workspace_id uuid, p_request_id text, p_total_nanos bigint, p_final boolean, p_credit_snapshot_balance_nanos bigint DEFAULT NULL::bigint, p_key_id uuid DEFAULT NULL::uuid'],
    ['gateway_charge_with_credit_cache', 'p_workspace_id uuid, p_request_id text, p_cost_nanos bigint, p_credit_snapshot_balance_nanos bigint DEFAULT NULL::bigint, p_key_id uuid DEFAULT NULL::uuid'],
    ['gateway_deduct_and_check_top_up_once', 'p_workspace_id uuid, p_request_id text, p_cost_nanos bigint, p_key_id uuid DEFAULT NULL::uuid'],
    ['gateway_wallet_settle_once', 'p_workspace_id uuid, p_reservation_id text, p_actual_nanos bigint, p_settle_ref_id text DEFAULT NULL::text'],
  ], 'one function each, previous parameters unchanged, new ones defaulted');

  // persist.ts on main: a request charge, with and without a credit snapshot.
  const charged = await asService(() => one(`select public.gateway_charge_with_credit_cache(
    p_workspace_id => $1, p_request_id => $2, p_cost_nanos => $3, p_credit_snapshot_balance_nanos => $4) as r`,
  [ws, 'main-request', usd(1), usd(10)]));
  assert.equal(charged.r.applied, true, JSON.stringify(charged.r));
  const noSnapshot = await asService(() => one(`select public.gateway_charge_with_credit_cache(
    p_workspace_id => $1, p_request_id => $2, p_cost_nanos => $3, p_credit_snapshot_balance_nanos => $4) as r`,
  [ws, 'main-request-2', usd(1), null]));
  assert.equal(noSnapshot.r.applied, true);
  assert.equal(await balance(), usd(8), 'the previous gateway still charges');
  const row = await one(`select status, cost_nanos, key_id from public.gateway_request_charges where request_id = 'main-request'`);
  assert.deepEqual([row.status, Number(row.cost_nanos), row.key_id], ['applied', usd(1), null]);
  // A replay is still a replay.
  const replay = await asService(() => one(`select public.gateway_charge_with_credit_cache(
    p_workspace_id => $1, p_request_id => $2, p_cost_nanos => $3, p_credit_snapshot_balance_nanos => $4) as r`,
  [ws, 'main-request', usd(1), usd(10)]));
  assert.equal(replay.r.already_applied, true);
  assert.equal(await balance(), usd(8));

  // The previous wrapper body's positional call of the inner function.
  await asService(() => db.query('select * from public.gateway_deduct_and_check_top_up_once($1, $2, $3)', [ws, 'main-inner', usd(1)]));
  assert.equal(await balance(), usd(7));

  // wallet-reservations.ts on main: settle a batch hold.
  await db.query(`update public.wallets set reserved_nanos = $2 where workspace_id = $1`, [ws, usd(2)]);
  await db.query(`insert into public.gateway_wallet_reservations (workspace_id, reservation_id, amount_nanos, status) values ($1, 'batch_hold:main', $2, 'held')`, [ws, usd(2)]);
  const settled = await asService(() => one(`select * from public.gateway_wallet_settle_once(
    p_workspace_id => $1, p_reservation_id => $2, p_actual_nanos => $3, p_settle_ref_id => $4)`, [ws, 'batch_hold:main', usd(1), 'batch_main']));
  assert.equal(settled.ok, true, JSON.stringify(settled));
  assert.equal(await balance(), usd(6));

  // gateway_charge_request_total: the required arguments alone resolve and charge.
  const stepped = await asService(() => one(`select public.gateway_charge_request_total(
    p_workspace_id => $1, p_request_id => $2, p_total_nanos => $3, p_final => $4) as r`, [ws, 'new-stepped', usd(1), false]));
  assert.equal(stepped.r.applied, true);
  assert.equal(await balance(), usd(5));

  console.log(JSON.stringify({ passed: true, calls: ['gateway_charge_with_credit_cache', 'gateway_deduct_and_check_top_up_once', 'gateway_wallet_settle_once', 'gateway_charge_request_total'] }));
} finally {
  await db.close();
}
