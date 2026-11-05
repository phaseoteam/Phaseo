// Standalone PostgreSQL regression test for gateway_charge_request_total: one charged total per request
// for a stream charged at checkpoints while its upstream drains after the client left, then from its
// final bill. Before this function each checkpoint charged a delta under its own key, so a checkpoint
// that committed while its response was lost was charged again, and an estimate above the final bill
// was kept. Here the stored total is the source of truth:
// - a replayed or lost-response call is reconciled by the next call (charged once);
// - a checkpoint never refunds; the final call refunds an estimate above the final bill, or all of it
//   when the bill is waived (0);
// - after the final call, late checkpoints are no-ops and a different final total is refused;
// - debits go into overdraft like other request charges, and every adjustment writes a ledger row;
// - one-off request charges (gateway_charge_with_credit_cache) and this function never double-charge
//   the same request id.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/gateway-charge-request-total.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const findMigration = async (suffix) => {
  const name = migrations.find((file) => file.endsWith(suffix));
  assert(name, `${suffix} exists`);
  return normalize(await read(`../migrations/${name}`));
};
const previous = await findMigration('_billing_security_fixes.sql');
const migration = await findMigration('_gateway_charge_request_total.sql');
const validateMigration = await findMigration('_validate_gateway_request_charges_cost_check.sql');
// Validation runs in its own, later migration (transaction): the first holds ACCESS EXCLUSIVE only briefly.
assert(!/validate\s+constraint/i.test(migration), 'the function migration does not validate the check in the same transaction');
assert(/validate\s+constraint\s+gateway_request_charges_cost_nanos_check/i.test(validateMigration));
const migrationOrder = migrations.filter((name) => /_(gateway_charge_request_total|validate_gateway_request_charges_cost_check)\.sql$/.test(name)).sort();
assert.deepEqual(migrationOrder.map((name) => name.replace(/^\d+_/, '')),
  ['gateway_charge_request_total.sql', 'validate_gateway_request_charges_cost_check.sql'], 'validation runs after the check is added');

// The declarative files describe the same end state.
const fnSql = normalize(await read('../schemas/public/functions/gateway_charge_request_total.sql'));
const body = fnSql.slice(fnSql.indexOf('$function$'), fnSql.lastIndexOf('$function$') + 10);
assert(body.length > 20 && migration.includes(body), 'the migration ships the schema body of gateway_charge_request_total');
const tableSql = normalize(await read('../schemas/public/tables/gateway_request_charges.sql'));
assert(tableSql.includes('"is_final"             boolean                  NOT NULL DEFAULT true'));
assert(tableSql.includes('CHECK ((cost_nanos >= 0))'));
const exportJson = JSON.parse(await read('../schemas/.pgdelta-export.json'));
const file = 'public/functions/gateway_charge_request_total.sql';
assert(exportJson.loadOrder.includes(file) && exportJson.files.includes(file), `${file} is in the declarative export`);

const usd = (n) => Math.round(n * 1e9);
const ws = '10000000-0000-4000-8000-000000000001';
const db = new PGlite();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const balance = async () => Number((await one('select balance_nanos from public.wallets where workspace_id = $1', [ws])).balance_nanos);
const setWallet = (balanceNanos, reserved = 0) =>
  db.query('update public.wallets set balance_nanos = $2, reserved_nanos = $3 where workspace_id = $1', [ws, balanceNanos, reserved]);
const total = (request, nanos, final) => asService(() =>
  one('select public.gateway_charge_request_total($1, $2, $3, $4, null) as r', [ws, request, nanos, final]).then((row) => row.r));
const oneOff = (request, nanos) => asService(() =>
  one('select public.gateway_charge_with_credit_cache($1, $2, $3, null) as r', [ws, request, nanos]).then((row) => row.r));
const chargeRow = (request) => one('select * from public.gateway_request_charges where workspace_id = $1 and request_id = $2', [ws, request]);
const ledger = async (request) => (await db.query(
  `select amount_nanos::bigint as amount, ref_id, kind from public.credit_ledger
   where ref_type = 'gateway_request_charge' and source_ref_id = $1 order by created_at, ref_id`, [request])).rows
  .map((row) => [Number(row.amount), row.ref_id.split(':').slice(2).join(':'), row.kind]);

try {
  await db.exec(await read('./fixtures/billing-security-before.sql'));
  await db.query('insert into public.workspaces (id) values ($1)', [ws]);
  await db.query('insert into public.wallets (workspace_id) values ($1)', [ws]);
  await db.exec(previous);

  // ---------- Before: no total-based charge ----------
  await assert.rejects(total('missing', 1, true), /function public\.gateway_charge_request_total.* does not exist/);

  await db.exec(migration);
  const pending = await one(`select convalidated from pg_constraint where conname = 'gateway_request_charges_cost_nanos_check'`);
  assert.equal(pending.convalidated, false, 'the relaxed check is added unvalidated');
  await db.exec(validateMigration);
  await db.exec(migration);
  await db.exec(validateMigration);
  const validated = await one(`select convalidated, pg_get_constraintdef(oid) as def from pg_constraint where conname = 'gateway_request_charges_cost_nanos_check'`);
  assert.equal(validated.convalidated, true, 'the check is validated after the second migration');
  assert.match(validated.def, /cost_nanos >= 0/);

  // Service role only.
  for (const role of ['anon', 'authenticated']) {
    const allowed = await one(`select has_function_privilege($1, 'public.gateway_charge_request_total(uuid, text, bigint, boolean, bigint)', 'execute') as ok`, [role]);
    assert.equal(allowed.ok, false, `${role} cannot charge`);
  }

  // 1. A checkpoint whose response was lost is replayed or reconciled by the next call: charged once.
  await setWallet(usd(10));
  assert.equal((await total('lost', 100, false)).applied, true);
  const replay = await total('lost', 100, false);
  assert.equal(replay.already_applied, true);
  assert.equal(await balance(), usd(10) - 100, 'the replayed checkpoint is charged once');
  const next = await total('lost', 250, false);
  assert.equal(Number(next.delta_nanos), 150, 'the next checkpoint charges only the increase');
  assert.equal((await total('lost', 200, false)).already_applied, true, 'a lower checkpoint never refunds');
  assert.equal(await balance(), usd(10) - 250);
  const final = await total('lost', 400, true);
  assert.equal(Number(final.delta_nanos), 150);
  assert.equal(Number(final.charged_total_nanos), 400);
  assert.equal(await balance(), usd(10) - 400, 'charged 400 in total for a final bill of 400');
  assert.deepEqual(await ledger('lost'), [[-100, '100', 'adjustment'], [-150, '250', 'adjustment'], [-150, 'final', 'adjustment']]);
  let row = await chargeRow('lost');
  assert.equal(Number(row.cost_nanos), 400); assert.equal(row.is_final, true); assert.equal(row.status, 'applied');
  // 2. After the final call: replays and late checkpoints are no-ops; a different final total is refused.
  assert.equal((await total('lost', 400, true)).already_applied, true);
  assert.equal((await total('lost', 900, false)).already_applied, true, 'a late checkpoint changes nothing');
  await assert.rejects(total('lost', 401, true), /request_charge_amount_mismatch/);
  assert.equal(await balance(), usd(10) - 400);
  assert.equal((await ledger('lost')).length, 3);

  // 3. An estimate above the final bill is refunded down to the final amount.
  await setWallet(usd(10));
  await total('over', 500, false);
  const refund = await total('over', 400, true);
  assert.equal(refund.status, 'credited');
  assert.equal(Number(refund.delta_nanos), -100);
  assert.equal(await balance(), usd(10) - 400, 'charged the final 400, not the 500 estimate');
  assert.deepEqual(await ledger('over'), [[-500, '500', 'adjustment'], [100, 'final', 'adjustment']]);
  assert.equal(Number((await chargeRow('over')).cost_nanos), 400);

  // 4. A waived final bill (0) refunds everything the checkpoints charged.
  await setWallet(usd(10));
  await total('waived', 300, false);
  await total('waived', 0, true);
  assert.equal(await balance(), usd(10), 'nothing charged for a waived request');
  row = await chargeRow('waived');
  assert.equal(Number(row.cost_nanos), 0); assert.equal(row.is_final, true);
  assert.deepEqual(await ledger('waived'), [[-300, '300', 'adjustment'], [300, 'final', 'adjustment']]);

  // 5. Overdraft is recorded like other request charges, and a refund pays it back first.
  await setWallet(50, 0);
  await total('overdraft', 200, false);
  assert.equal(await balance(), -150);
  assert.equal(Number((await chargeRow('overdraft')).overdraft_nanos), 150);
  await total('overdraft', 120, true);
  assert.equal(await balance(), -70);
  assert.equal(Number((await chargeRow('overdraft')).overdraft_nanos), 70);
  // Held credits are not spendable: a charge into them is overdraft too.
  await setWallet(usd(1), usd(1));
  await total('held', 100, true);
  assert.equal(Number((await chargeRow('held')).overdraft_nanos), 100);
  assert.equal(Number((await one('select reserved_nanos from public.wallets where workspace_id = $1', [ws])).reserved_nanos), usd(1));

  // 6. A final bill for a request never checkpointed is charged once.
  await setWallet(usd(10));
  await total('direct', 300, true);
  assert.equal(await balance(), usd(10) - 300);
  // A checkpoint of 0 records nothing.
  assert.equal((await total('empty', 0, false)).already_applied, true);
  assert.equal(await chargeRow('empty'), undefined);

  // 7. One-off request charges and total-based charges never double-charge a request id.
  await setWallet(usd(10));
  await oneOff('one-off', 300);
  assert.equal((await total('one-off', 300, true)).already_applied, true);
  assert.equal((await total('one-off', 900, false)).already_applied, true);
  await assert.rejects(total('one-off', 200, true), /request_charge_amount_mismatch/);
  assert.equal(await balance(), usd(10) - 300);
  await total('stepped', 100, false);
  await assert.rejects(oneOff('stepped', 300), /request_charge_amount_mismatch/, 'a one-off charge cannot charge a stepped request again');
  assert.equal(await balance(), usd(10) - 400);

  // 8. Existing one-off charges are unchanged: still positive-only and idempotent.
  await assert.rejects(oneOff('zero', 0), /invalid_cost_nanos/);
  assert.equal((await oneOff('one-off', 300)).already_applied, true);
  assert.equal((await chargeRow('one-off')).is_final, true);

  console.log(JSON.stringify({ passed: true, migration: 'gateway_charge_request_total' }));
} finally {
  await db.close();
}
