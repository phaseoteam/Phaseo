// Standalone PostgreSQL regression test: a self-serve refund claim counts every charge on a top-up's
// credits as usage. Before, only successful gateway_requests rows counted, so a purchase partly spent
// through charges that are recorded elsewhere looked unused and could be refunded in full:
// - a stream the client left that kept its drain checkpoint charge on an unsuccessful (499) row;
// - a stream whose drain the runtime stopped, which has only its open stepped charge row
//   (gateway_request_charges, is_final = false) and no gateway_requests row.
// A charge recorded by both a charge row and its request row (billing_request_id) is counted once.
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
const chargeTotals = await findMigration('_gateway_charge_request_total.sql');
const migration = await findMigration('_refund_claim_counts_charged_failures.sql');
const billingIndex = await findMigration('_gateway_requests_billing_request_index.sql');
assert(migration.name > chargeTotals.name, 'the refund migration runs after the stepped charge columns exist');
assert.equal(migrations.at(-1), billingIndex.name, 'the index migration is newer than every other migration');
// The index migration holds the one index and nothing else.
assert.equal(
  billingIndex.sql.replace(/^--.*\n/gm, '').trim(),
  'create index if not exists gateway_requests_workspace_billing_request_idx\n  on public.gateway_requests (workspace_id, billing_request_id)\n  where billing_request_id is not null;',
);
assert(normalize(await read('../schemas/public/tables/gateway_requests.sql')).includes(
  'CREATE INDEX gateway_requests_workspace_billing_request_idx ON ONLY public.gateway_requests USING btree (workspace_id, billing_request_id)\n  WHERE (billing_request_id IS NOT NULL);'),
'the declarative table has the index');

// The declarative file describes the same end state.
const functionBody = (sql) => {
  const start = sql.indexOf('$function$', sql.indexOf('FUNCTION public.stripe_claim_self_serve_refund'));
  return sql.slice(start, sql.indexOf('$function$', start + 10) + 10);
};
const schemaBody = functionBody(normalize(await read('../schemas/public/functions/stripe_claim_self_serve_refund.sql')));
assert(schemaBody.length > 20 && migration.sql.includes(schemaBody), 'the migration ships the schema body of stripe_claim_self_serve_refund');
assert(!schemaBody.includes('gr.success is true'), 'unsuccessful charged rows count as usage');
assert(/from public\.gateway_request_charges charge[\s\S]*gr\.billing_request_id = charge\.request_id/.test(schemaBody),
  'charges without a request row count as usage');
assert(!/charge\.is_final/.test(schemaBody) && !/interval '1 day'/.test(schemaBody),
  'every applied charge counts, open or settled, with no time window on the request lookup');
assert(/adjustment\.created_at >= v_purchase\.event_time/.test(schemaBody), 'stepped charges count by debit time');
assert(!/not like 'batch\\_capture:%'/.test(schemaBody), 'batch captures are counted, not left out');
// Outside the usage query the body is the previous one.
const outsideUsage = (body) => {
  const usageStart = body.indexOf('    select coalesce(sum(gr.cost_nanos), 0)::bigint');
  const usageEnd = body.indexOf('    select *\n    into v_wallet');
  assert(usageStart > 0 && usageEnd > usageStart, 'usage query found');
  return body.slice(0, usageStart).replace(/^[ \t]*--.*\n/gm, '') + body.slice(usageEnd);
};
assert.equal(outsideUsage(schemaBody), outsideUsage(functionBody(previous.sql)), 'only the usage query changed');

const usd = (n) => Math.round(n * 1e9);
const ws = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000001';
const db = new PGlite();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const balance = async () => Number((await one('select balance_nanos from public.wallets where workspace_id = $1', [ws])).balance_nanos);
const setBalance = (nanos) => db.query('update public.wallets set balance_nanos = $2, reserved_nanos = 0 where workspace_id = $1', [ws, nanos]);
const reset = () => db.exec('delete from public.gateway_requests; delete from public.credit_ledger; delete from public.gateway_request_charges;');
const purchase = (pi, amount, before, hoursAgo) => db.query(
  `insert into public.credit_ledger (workspace_id, event_time, kind, amount_nanos, before_balance_nanos, after_balance_nanos, ref_type, ref_id, status)
   values ($1, now() - make_interval(hours => $5::int), 'top_up', $3::bigint, $4::bigint, $4::bigint + $3::bigint, 'Stripe_Payment_Intent', $2, 'Paid')`,
  [ws, pi, amount, before, hoursAgo]);
// Five charged cancellations of $1: unsuccessful 499 rows that kept their checkpoint charge.
const chargedCancellations = (minutesAgo) => db.query(
  `insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at)
   select $1, false, $2, now() - make_interval(mins => $3::int) from generate_series(1, 5)`, [ws, usd(1), minutesAgo]);
// A stream whose drain the runtime stopped: only its open stepped charge row. With `requestRow`,
// a request row was written after all (a reconciled settlement) and records the same charge.
const stoppedDrain = async (billingId, nanos, minutesAgo, { requestRow = false, isFinal = false } = {}) => {
  await db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, created_at)
    values ($1, $2, $3, 'applied', $5, now() - make_interval(mins => $4::int))`, [ws, billingId, nanos, minutesAgo, isFinal]);
  if (requestRow) await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, billing_request_id)
    values ($1, false, $3, now() - make_interval(mins => $4::int), $2)`, [ws, billingId, nanos, minutesAgo + 1]);
};
const claim = (pi) => asService(() => one('select * from public.stripe_claim_self_serve_refund($1, $2, $3)', [ws, pi, owner]));

// Buy $10 from an empty wallet, spend $5, then top up $10 more and claim the first purchase.
async function scenario(prefix, spend) {
  await reset();
  await purchase(`${prefix}_first`, usd(10), 0, 3);
  await spend(prefix);
  await purchase(`${prefix}_second`, usd(10), usd(5), 1);
  await setBalance(usd(15));
}
const viaCancellations = () => chargedCancellations(120);
const viaStoppedDrain = (prefix) => stoppedDrain(`${prefix}_bill`, usd(5), 120);

try {
  await db.exec(await read('./fixtures/billing-security-before.sql'));
  await db.exec("create or replace function public.mfa_satisfied() returns boolean language sql stable as 'select true';");
  await db.query('insert into public.workspaces (id) values ($1)', [ws]);
  await db.query('insert into public.workspace_members values ($1, $2)', [ws, owner]);
  await db.query('insert into public.wallets (workspace_id) values ($1)', [ws]);
  await db.exec(previous.sql);
  // The request row's charge key (production has it) and the stepped charge columns.
  await db.exec('alter table public.gateway_requests add column billing_request_id text, add column request_id text;');
  await db.exec(chargeTotals.sql);

  // ---------- Before the fix ----------
  await scenario('before', viaCancellations);
  assert.equal((await claim('before_first')).ok, true, 'before the fix charged cancellations are not usage');
  assert.equal(await balance(), usd(5), 'before the fix the full $10 is taken back');
  await scenario('before_drain', viaStoppedDrain);
  assert.equal((await claim('before_drain_first')).ok, true, "before the fix a stopped drain's charge is not usage");

  await db.exec(migration.sql);
  await db.exec(migration.sql);
  await db.exec(billingIndex.sql);
  await db.exec(billingIndex.sql);
  assert.equal(Number((await one(`select count(*)::int as n from pg_indexes where indexname = 'gateway_requests_workspace_billing_request_idx'`)).n), 1);

  // ---------- After the fix ----------
  // $5 spent through charged cancellations uses the first purchase.
  await scenario('after', viaCancellations);
  const after = await claim('after_first');
  assert.equal(after.reason, 'lot_used', 'the $5 of charged cancellations counts as usage of the first purchase');
  assert.equal(await balance(), usd(15), 'nothing is refunded');
  // The later purchase, with nothing used since, is still refundable, within the balance bound.
  const second = await claim('after_second');
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(await balance(), usd(5));

  // $5 charged at drain checkpoints of a stream the runtime stopped (charge row only) uses it too.
  await scenario('drain', viaStoppedDrain);
  const drained = await claim('drain_first');
  assert.equal(drained.reason, 'lot_used', 'an open stepped charge without a request row counts as usage');
  assert.equal(await balance(), usd(15));
  assert.equal((await claim('drain_second')).ok, true, 'the later purchase is still refundable');

  // Counted once when a request row records the same charge: $5 used fits in a $7 prior balance,
  // $10 (counted twice) would not.
  await reset();
  await purchase('once_first', usd(10), usd(7), 3);
  await stoppedDrain('once_bill', usd(5), 120, { requestRow: true });
  await setBalance(usd(12));
  assert.equal((await claim('once_first')).ok, true, 'the charge row and its request row are not counted twice');
  // A settled stepped charge whose audit row never landed is usage too.
  await scenario('lost_audit', (prefix) => stoppedDrain(`${prefix}_bill`, usd(5), 120, { isFinal: true }));
  assert.equal((await claim('lost_audit_first')).reason, 'lot_used', 'a final charge with no request row counts as usage');
  assert.equal(await balance(), usd(15));
  // A settled stepped charge with its request row is counted once, as is an ordinary one-off charge.
  await reset();
  await purchase('final_first', usd(10), usd(7), 3);
  await stoppedDrain('final_bill', usd(5), 120, { requestRow: true, isFinal: true });
  await setBalance(usd(12));
  assert.equal((await claim('final_first')).ok, true, 'a settled charge with both rows is counted once');
  await reset();
  await purchase('sync_first', usd(10), usd(7), 3);
  await asService(() => db.query('select public.gateway_charge_with_credit_cache($1, $2, $3, null)', [ws, 'sync_bill', usd(5)]));
  await db.query(`update public.gateway_request_charges set created_at = now() - interval '2 hours' where request_id = 'sync_bill'`);
  await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, billing_request_id)
    values ($1, true, $2, now() - interval '2 hours', 'sync_bill')`, [ws, usd(5)]);
  await setBalance(usd(12));
  assert.equal((await claim('sync_first')).ok, true, 'a one-off charge with its request row is counted once');
  // A batch capture counts once, whether its per-row request rows persisted fully, partly or not
  // at all: each scenario charges $5, and the purchase had a prior balance of $4 or $6.
  const batch = async (prefix, rowsPersisted, priorBalance) => {
    await reset();
    await purchase(`${prefix}_first`, usd(10), usd(priorBalance), 3);
    await db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, created_at)
      values ($1, $2, $3, 'applied', now() - interval '2 hours')`, [ws, `batch_capture:${prefix}_batch`, usd(5)]);
    await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, request_id)
      select $1, true, $2, now() - interval '2 hours', 'batch_usage:' || $3 || ':' || i from generate_series(1, $4::int) i`,
      [ws, usd(1), `${prefix}_batch`, rowsPersisted]);
    await setBalance(usd(priorBalance + 10));
    return claim(`${prefix}_first`);
  };
  assert.equal((await batch('batch_full', 5, 6)).ok, true, 'a batch with all its rows is counted once ($5 fits in $6)');
  assert.equal((await batch('batch_full_low', 5, 4)).reason, 'lot_used', 'a batch with all its rows counts its $5');
  assert.equal((await batch('batch_missing', 0, 4)).reason, 'lot_used', 'a batch whose rows never persisted still counts its $5');
  assert.equal((await batch('batch_partial', 2, 4)).reason, 'lot_used', 'a batch with 2 of 5 rows persisted still counts its $5');
  assert.equal((await batch('batch_partial_ok', 2, 6)).ok, true, 'a partly persisted batch is counted once, not rows plus capture');

  // A stream charged at checkpoints that started before the purchase: checkpoint 1 ($3) debited
  // before it, checkpoint 2 ($4 more) after. The $4 used the new purchase; the $3 did not.
  const stepped = async (prefix, priorBalance) => {
    await reset();
    await setBalance(usd(20));
    const charge = (total) => asService(() => db.query('select public.gateway_charge_request_total($1, $2, $3, false, null, null)', [ws, `${prefix}_bill`, total]));
    await charge(usd(3));
    await db.query(`update public.gateway_request_charges set created_at = now() - interval '3 hours' where request_id = $1`, [`${prefix}_bill`]);
    await db.query(`update public.credit_ledger set created_at = now() - interval '3 hours' where ref_type = 'gateway_request_charge'`);
    await purchase(`${prefix}_first`, usd(10), usd(priorBalance), 2);
    await charge(usd(7));
    await setBalance(usd(priorBalance + 10));
    return claim(`${prefix}_first`);
  };
  assert.equal((await stepped('ckpt', 3)).reason, 'lot_used', 'a checkpoint after the purchase uses it, even for a request that started before');
  assert.equal((await stepped('ckpt_ok', 5)).ok, true, 'only the $4 debited after the purchase counts, not the earlier $3');
  // Its request row, once written, is not counted on top of the debits.
  await reset();
  await setBalance(usd(20));
  await purchase('ckpt_row_first', usd(10), usd(5), 2);
  await asService(() => db.query('select public.gateway_charge_request_total($1, $2, $3, true, null, null)', [ws, 'ckpt_row_bill', usd(4)]));
  await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, billing_request_id)
    values ($1, false, $2, now() - interval '1 hour', 'ckpt_row_bill')`, [ws, usd(4)]);
  await setBalance(usd(15));
  assert.equal((await claim('ckpt_row_first')).ok, true, 'a stepped request row is not counted on top of its debits ($4 fits in $5)');
  // A stepped charge from before the purchase is not usage of it.
  await reset();
  await stoppedDrain('old_bill', usd(5), 600);
  await purchase('old_first', usd(10), 0, 3);
  await setBalance(usd(10));
  assert.equal((await claim('old_first')).ok, true, 'charges before the purchase do not use it');
  // A failed request that kept no charge is not usage.
  await reset();
  await purchase('free_first', usd(10), 0, 3);
  await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at)
    values ($1, false, 0, now() - interval '2 hours'), ($1, false, null, now() - interval '2 hours')`, [ws]);
  await setBalance(usd(10));
  assert.equal((await claim('free_first')).ok, true, 'unsuccessful rows without a charge do not use up a purchase');

  console.log(JSON.stringify({ passed: true, migration: migration.name }));
} finally {
  await db.close();
}
