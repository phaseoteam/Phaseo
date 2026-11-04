// Standalone PostgreSQL regression test: batch and video settlement always charge the actual cost.
// Before the fix gateway_wallet_settle_once returned 'insufficient_balance' and captured nothing when the
// actual cost was above the job's hold plus the unreserved balance, so the finished job was never charged.
// The case runs first on the function as shipped by the 2026-11-04 billing security migration, then on the
// real migration: the hold is released, the full cost is debited into overdraft, the uncovered part is
// recorded on the reservation, and a replay does not charge again.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/async-settlement-overdraft.test.mjs
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
const migration = await findMigration('_async_settlement_always_charges.sql');

// The declarative files describe the same end state.
const fnSql = normalize(await read('../schemas/public/functions/gateway_wallet_settle_once.sql'));
const body = fnSql.slice(fnSql.indexOf('$function$'), fnSql.lastIndexOf('$function$') + 10);
assert(body.length > 20 && migration.includes(body), 'the migration ships the schema body of gateway_wallet_settle_once');
assert(!body.includes('insufficient_balance'), 'settlement no longer refuses an overdraft');
assert(normalize(await read('../schemas/public/tables/gateway_wallet_reservations.sql'))
  .includes('"overdraft_nanos"       bigint                   NOT NULL DEFAULT 0'));

const usd = (n) => Math.round(n * 1e9);
const ws = '10000000-0000-4000-8000-000000000001';
const db = new PGlite();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const wallet = async () => { const w = await one('select balance_nanos, reserved_nanos from public.wallets where workspace_id = $1', [ws]); return { balance: Number(w.balance_nanos), reserved: Number(w.reserved_nanos) }; };
const setWallet = (balance, reserved) => db.query('update public.wallets set balance_nanos = $2, reserved_nanos = $3 where workspace_id = $1', [ws, balance, reserved]);
const hold = (id, amount) => db.query(
  `insert into public.gateway_wallet_reservations (workspace_id, reservation_id, amount_nanos, status) values ($1, $2, $3, 'held')`, [ws, id, amount]);
const settle = (id, actual) => asService(() => one('select * from public.gateway_wallet_settle_once($1, $2, $3, $4)', [ws, id, actual, id]));
const reservation = (id) => one('select * from public.gateway_wallet_reservations where workspace_id = $1 and reservation_id = $2', [ws, id]);
const ledgerCount = async (id) => Number((await one(
  `select count(*)::int as n from public.credit_ledger where ref_type = 'async_job_charge' and ref_id = $1`, [`${ws}:${id}`])).n);

try {
  await db.exec(await read('./fixtures/billing-security-before.sql'));
  await db.exec("create or replace function public.mfa_satisfied() returns boolean language sql stable as 'select true';");
  await db.query('insert into public.workspaces (id) values ($1)', [ws]);
  await db.query('insert into public.wallets (workspace_id) values ($1)', [ws]);
  await db.exec(previous);

  // ---------- Before the fix ----------
  // A batch held at $1 (e.g. rows with n=128) costs $20 with $10 in the wallet: nothing is charged.
  await setWallet(usd(10), usd(1));
  await hold('batch_hold:old', usd(1));
  const old = await settle('batch_hold:old', usd(20));
  assert.equal(old.ok, false);
  assert.equal(old.reason, 'insufficient_balance', 'before the fix the settlement is refused');
  assert.deepEqual(await wallet(), { balance: usd(10), reserved: usd(1) }, 'before the fix nothing is charged');
  assert.equal(await ledgerCount('batch_hold:old'), 0);

  await db.exec(migration);
  await db.exec(migration);

  // ---------- After the fix ----------
  // The same refused hold now settles: the full $20 is charged into overdraft.
  const fixed = await settle('batch_hold:old', usd(20));
  assert.equal(fixed.ok, true, JSON.stringify(fixed));
  assert.equal(fixed.applied, true);
  assert.equal(Number(fixed.amount_nanos), usd(20));
  assert.deepEqual(await wallet(), { balance: usd(-10), reserved: 0 }, 'the full cost is debited and the hold released');
  const row = await reservation('batch_hold:old');
  assert.equal(row.status, 'captured');
  assert.equal(Number(row.settled_amount_nanos), usd(20));
  assert.equal(Number(row.captured_nanos), usd(1));
  assert.equal(Number(row.released_nanos), 0);
  // Covered: $1 hold + $9 unreserved balance. Uncovered: $10.
  assert.equal(Number(row.overdraft_nanos), usd(10), 'the uncovered part is recorded');
  assert.equal(await ledgerCount('batch_hold:old'), 1);

  // A replay does not charge again.
  const replay = await settle('batch_hold:old', usd(20));
  assert.equal(replay.ok, true);
  assert.equal(replay.applied, false);
  assert.equal(replay.reason, 'already_captured');
  assert.deepEqual(await wallet(), { balance: usd(-10), reserved: 0 });
  assert.equal(await ledgerCount('batch_hold:old'), 1);

  // Other holds are not released, and the uncovered part is charged into overdraft.
  await setWallet(usd(5), usd(10));
  await hold('video_hold:a', usd(4));
  // Wallet has $5 against $10 held (this $4 + $6 elsewhere): only this hold covers the cost.
  const video = await settle('video_hold:a', usd(7));
  assert.equal(video.ok, true);
  assert.deepEqual(await wallet(), { balance: usd(-2), reserved: usd(6) }, 'the $6 held for other jobs stays held');
  assert.equal(Number((await reservation('video_hold:a')).overdraft_nanos), usd(3));

  // A covered settlement records no overdraft and refunds the unused hold.
  await setWallet(usd(10), usd(4));
  await hold('batch_hold:covered', usd(4));
  assert.equal((await settle('batch_hold:covered', usd(3))).ok, true);
  assert.deepEqual(await wallet(), { balance: usd(7), reserved: 0 });
  const covered = await reservation('batch_hold:covered');
  assert.equal(Number(covered.overdraft_nanos), 0);
  assert.equal(Number(covered.released_nanos), usd(1));

  console.log('async-settlement-overdraft: ok');
} finally {
  await db.close();
}
