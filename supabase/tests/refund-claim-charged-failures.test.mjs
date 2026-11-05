// Standalone PostgreSQL regression test: a self-serve refund claim counts every charged request
// as usage of a top-up, including unsuccessful rows that kept a charge (a stream the client left
// after a drain checkpoint is audited as a 499 with its cost). Before, only success rows counted,
// so a purchase partly spent through charged cancellations looked unused and could be refunded.
// Runs the claim on the body shipped by 20261104193047_billing_security_fixes first, then on the
// real migration. Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE
// to its dist/index.js file URL. Run: node supabase/tests/refund-claim-charged-failures.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).sort();
const findMigration = async (suffix) => {
  const name = migrations.find((file) => file.endsWith(suffix));
  assert(name, `${suffix} exists`);
  return { name, sql: normalize(await read(`../migrations/${name}`)) };
};
const previous = await findMigration('_billing_security_fixes.sql');
const migration = await findMigration('_refund_claim_counts_charged_failures.sql');
assert.equal(migrations.at(-1), migration.name, 'the migration is newer than every other migration');

// The declarative file describes the same end state, and only the usage filter changed.
const functionBody = (sql) => {
  const start = sql.indexOf('$function$', sql.indexOf('FUNCTION public.stripe_claim_self_serve_refund'));
  return sql.slice(start, sql.indexOf('$function$', start + 10) + 10);
};
const schemaBody = functionBody(normalize(await read('../schemas/public/functions/stripe_claim_self_serve_refund.sql')));
assert(schemaBody.length > 20 && migration.sql.includes(schemaBody), 'the migration ships the schema body of stripe_claim_self_serve_refund');
const withoutComments = (sql) => sql.replace(/^[ \t]*--.*\n/gm, '');
assert.equal(
  withoutComments(schemaBody),
  withoutComments(functionBody(previous.sql)).replace('      and gr.success is true\n', ''),
  'the body is the previous one with only the success filter removed',
);

const usd = (n) => Math.round(n * 1e9);
const ws = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000001';
const db = new PGlite();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const balance = async () => Number((await one('select balance_nanos from public.wallets where workspace_id = $1', [ws])).balance_nanos);
const setBalance = (nanos) => db.query('update public.wallets set balance_nanos = $2, reserved_nanos = 0 where workspace_id = $1', [ws, nanos]);
const purchase = (pi, amount, before, hoursAgo) => db.query(
  `insert into public.credit_ledger (workspace_id, event_time, kind, amount_nanos, before_balance_nanos, after_balance_nanos, ref_type, ref_id, status)
   values ($1, now() - make_interval(hours => $5::int), 'top_up', $3::bigint, $4::bigint, $4::bigint + $3::bigint, 'Stripe_Payment_Intent', $2, 'Paid')`,
  [ws, pi, amount, before, hoursAgo]);
// Five charged cancellations of $1: unsuccessful 499 rows that kept their checkpoint charge.
const chargedCancellations = (minutesAgo) => db.query(
  `insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at)
   select $1, false, $2, now() - make_interval(mins => $3::int) from generate_series(1, 5)`, [ws, usd(1), minutesAgo]);
const claim = (pi) => asService(() => one('select * from public.stripe_claim_self_serve_refund($1, $2, $3)', [ws, pi, owner]));

// Buy $10 from an empty wallet, spend $5 through charged cancellations, then top up $10 more.
async function scenario(prefix) {
  await db.exec('delete from public.gateway_requests; delete from public.credit_ledger;');
  await purchase(`${prefix}_first`, usd(10), 0, 3);
  await chargedCancellations(120);
  await purchase(`${prefix}_second`, usd(10), usd(5), 1);
  await setBalance(usd(15));
}

try {
  await db.exec(await read('./fixtures/billing-security-before.sql'));
  await db.exec("create or replace function public.mfa_satisfied() returns boolean language sql stable as 'select true';");
  await db.query('insert into public.workspaces (id) values ($1)', [ws]);
  await db.query('insert into public.workspace_members values ($1, $2)', [ws, owner]);
  await db.query('insert into public.wallets (workspace_id) values ($1)', [ws]);
  await db.exec(previous.sql);

  // ---------- Before the fix ----------
  await scenario('before');
  const before = await claim('before_first');
  assert.equal(before.ok, true, 'before the fix the partly used purchase is refundable as unused');
  assert.equal(await balance(), usd(5), 'before the fix the full $10 is taken back');

  await db.exec(migration.sql);
  await db.exec(migration.sql);

  // ---------- After the fix ----------
  await scenario('after');
  const after = await claim('after_first');
  assert.equal(after.ok, false);
  assert.equal(after.reason, 'lot_used', 'the $5 of charged cancellations counts as usage of the first purchase');
  assert.equal(await balance(), usd(15), 'nothing is refunded');
  // The later purchase, with nothing used since, is still refundable, within the balance bound.
  const second = await claim('after_second');
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(await balance(), usd(5));
  // A failed request that kept no charge is not usage.
  await db.exec('delete from public.gateway_requests; delete from public.credit_ledger;');
  await purchase('free_first', usd(10), 0, 3);
  await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at)
    values ($1, false, 0, now() - interval '2 hours'), ($1, false, null, now() - interval '2 hours')`, [ws]);
  await setBalance(usd(10));
  assert.equal((await claim('free_first')).ok, true, 'unsuccessful rows without a charge do not use up a purchase');

  console.log(JSON.stringify({ passed: true, migration: migration.name }));
} finally {
  await db.close();
}
