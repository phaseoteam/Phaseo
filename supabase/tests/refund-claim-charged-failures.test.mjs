// Standalone PostgreSQL regression test: a self-serve refund claim counts every charge on a top-up's
// credits as usage. Before, only successful gateway_requests rows counted, so a purchase partly spent
// through charges that are recorded elsewhere looked unused and could be refunded in full:
// - a stream the client left that kept its drain checkpoint charge on an unsuccessful (499) row;
// - a stream whose drain the runtime stopped, which has only its open stepped charge row
//   (gateway_request_charges, is_final = false) and no gateway_requests row.
// A charge recorded by both a charge row and its request row (billing_request_id) is counted once.
// A one-off charge whose request rows under-record it (a Worker older than the lost-charge fix wrote
// a failure after the debit with no cost) counts what they fall short of it
// (refund_claim_counts_under_recorded_charges).
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
const cutoffs = await findMigration('_billing_cutoffs.sql');
const expectedCostColumn = await findMigration('_gateway_requests_expected_cost_nanos.sql');
const expectedCostCheck = await findMigration('_validate_gateway_requests_expected_cost_nanos_check.sql');
const chargeColumns = await findMigration('_gateway_request_charges_stepped_columns.sql');
const chargeTotals = await findMigration('_gateway_charge_request_total.sql');
const overdraftColumn = await findMigration('_gateway_wallet_reservations_overdraft.sql');
const settlement = await findMigration('_async_settlement_always_charges.sql');
const migration = await findMigration('_refund_claim_counts_charged_failures.sql');
const billingIndex = await findMigration('_gateway_requests_billing_request_index.sql');
const underRecorded = await findMigration('_refund_claim_counts_under_recorded_charges.sql');
assert(underRecorded.name > billingIndex.name, 'the shortfall migration runs after the index it reads through');
assert(underRecorded.sql.startsWith("SET LOCAL lock_timeout = '10s';\n"), 'the shortfall migration starts with the lock timeout');
assert(!/\b(alter|lock)\s+table\b|\bcreate\s+(unique\s+)?index\b/i.test(underRecorded.sql.replace(/--.*$/gm, '')),
  'the shortfall migration changes functions only');
assert(migration.name > chargeTotals.name, 'the refund migration runs after the stepped charge columns exist');
// The claim reads gateway_requests.expected_cost_nanos: this PR adds the column, before every other
// migration of it, so no claim runs between the new body and the column (#3547 reads it too).
assert(cutoffs.name < expectedCostColumn.name && expectedCostColumn.name < expectedCostCheck.name && expectedCostCheck.name < chargeColumns.name,
  'the JSON-pending cutoff, then the expected cost column and its validation, are the first migrations');
for (const file of ['private/tables/billing_cutoffs.sql', 'private/functions/pending_json_cutoff.sql']) {
  const exportJson = JSON.parse(await read('../schemas/.pgdelta-export.json'));
  assert(exportJson.loadOrder.includes(file) && exportJson.files.includes(file), `${file} is in the declarative export`);
}
const helperBody = functionBody => functionBody.slice(functionBody.indexOf('$function$'), functionBody.lastIndexOf('$function$') + 10);
assert(cutoffs.sql.includes(helperBody(normalize(await read('../schemas/private/functions/pending_json_cutoff.sql')))),
  'the migration ships the schema body of private.pending_json_cutoff');
assert(/LANGUAGE plpgsql/.test(normalize(await read('../schemas/public/functions/stripe_claim_self_serve_refund.sql'))));
assert(normalize(await read('../schemas/public/tables/gateway_requests.sql')).includes('"expected_cost_nanos"               bigint,'),
  'the declarative table has the column');
assert(billingIndex.name > migration.name, 'the index migration runs after the refund migration');
// The index migration holds the lock timeout and the one index, and nothing else.
assert.equal(
  billingIndex.sql.replace(/^--.*\n/gm, '').trim(),
  'SET LOCAL lock_timeout = \'10s\';\n\ncreate index if not exists gateway_requests_workspace_billing_request_idx\n  on public.gateway_requests (workspace_id, billing_request_id)\n  where billing_request_id is not null;',
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
assert(schemaBody.length > 20 && underRecorded.sql.includes(schemaBody), 'the latest migration ships the schema body of stripe_claim_self_serve_refund');
// The shortfall migration changes only the one-off charge term (step 3) of 20261110140727's body.
const withoutOneOffTerm = (body) => body.replace(/^[ \t]*--.*\n/gm, '')
  .replace(/    v_usage_nanos := v_usage_nanos \+ coalesce\(\(\n      select sum\((?:charge\.cost_nanos\)|case)[\s\S]*?\n    \), 0\)::bigint;\n\n    v_usage_nanos := v_usage_nanos \+ coalesce\(\(\n      select sum\(charge\.cost_nanos\)\n      from public\.gateway_request_charges charge\n      where charge\.workspace_id = p_team_id\n        and charge\.status = 'applied'\n        and charge\.cost_nanos > 0\n        and charge\.created_at >= v_purchase\.event_time\n        and starts_with/, 'ONE_OFF_TERM starts_with');
assert(withoutOneOffTerm(schemaBody).includes('ONE_OFF_TERM'), 'the one-off charge term was found');
assert.equal(withoutOneOffTerm(schemaBody), withoutOneOffTerm(functionBody(migration.sql)), 'only the one-off charge term changed');
assert(/charge\.cost_nanos - audit\.row_cost/.test(schemaBody) && /not audit\.succeeded and charge\.cost_nanos > audit\.row_cost/.test(schemaBody),
  'a one-off charge its unsuccessful, non-pending rows under-record counts the shortfall');
assert(!schemaBody.includes('gr.success is true'), 'unsuccessful charged rows count as usage');
assert(/from public\.gateway_request_charges charge[\s\S]*request\.billing_request_id = charge\.request_id/.test(schemaBody),
  'charges without a request row count as usage');
assert(!/charge\.is_final/.test(schemaBody) && !/interval '1 day'/.test(schemaBody),
  'every applied charge counts, open or settled, with no time window on the request lookup');
assert(/adjustment\.created_at >= v_purchase\.event_time/.test(schemaBody), 'stepped charges count by debit time');
assert(/debit\.ref_type = 'async_job_charge'/.test(schemaBody), 'reserved batches count by their settled debit');
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
const reset = () => db.exec(`delete from public.gateway_requests; delete from public.credit_ledger; delete from public.gateway_request_charges;
  delete from public.gateway_wallet_reservations; update public.wallets set reserved_nanos = 0;`);
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
// A $6 one-off charge debited after the purchase, then its request row(s) by `shape`. Returns the
// claim at a prior balance of $6 less 1 nano and of exactly $6: ['lot_used', 'ok'] means the usage
// since the purchase is exactly $6, ['ok', 'ok'] that it is below it.
const auditRow = (billingId, { success = false, cost, expected = null, status = 'recorded' }) => db.query(
  `insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, billing_request_id, expected_cost_nanos, detail_metadata)
   values ($1, $2, $3, now() - interval '2 hours', $4, $5, $6::jsonb)`,
  [ws, success, cost, billingId, expected, JSON.stringify({ accounting_finalization: { billing_status: status } })]);
const usageAtSix = async (prefix, shape) => {
  const run = async (suffix, prior) => {
    await reset();
    await purchase(`${prefix}_${suffix}_first`, usd(10), prior, 3);
    const billingId = `${prefix}_${suffix}_bill`;
    await asService(() => db.query('select public.gateway_charge_with_credit_cache($1, $2, $3, null)', [ws, billingId, usd(6)]));
    await db.query(`update public.gateway_request_charges set created_at = now() - interval '2 hours' where request_id = $1`, [billingId]);
    await shape(billingId);
    await setBalance(prior + usd(10));
    const result = await claim(`${prefix}_${suffix}_first`);
    return result.ok ? 'ok' : result.reason;
  };
  return [await run('below', usd(6) - 1), await run('at', usd(6))];
};
const underRecordedShapes = {
  // An old Worker: debited $6, then a failure row with no cost, billing_status 'recorded'.
  old_worker: (billingId) => auditRow(billingId, { cost: null }),
  // A failure row carrying $2 of the $6.
  partial: (billingId) => auditRow(billingId, { cost: usd(2) }),
  // This Worker: the failure row carries the confirmed $6.
  new_worker: (billingId) => auditRow(billingId, { cost: usd(6) }),
  // A successful one-off charge.
  success: (billingId) => auditRow(billingId, { success: true, cost: usd(6) }),
  // A buffered request whose charge committed unacknowledged: pending, expected $6, cost read back.
  buffered_pending: (billingId) => auditRow(billingId, { cost: usd(6), expected: usd(6), status: 'pending_reconciliation' }),
  buffered_pending_unread: (billingId) => auditRow(billingId, { cost: null, expected: usd(6), status: 'pending_reconciliation' }),
};
const viaStoppedDrain = (prefix) => stoppedDrain(`${prefix}_bill`, usd(5), 120);

try {
  await db.exec(await read('./fixtures/billing-security-before.sql'));
  await db.exec("create or replace function public.mfa_satisfied() returns boolean language sql stable as 'select true';");
  await db.query('insert into public.workspaces (id) values ($1)', [ws]);
  await db.query('insert into public.workspace_members values ($1, $2)', [ws, owner]);
  await db.query('insert into public.wallets (workspace_id) values ($1)', [ws]);
  await db.exec(previous.sql);
  // The request row's charge key and audit details and the private schema (production has them),
  // then this PR's migrations in order.
  await db.exec(`alter table public.gateway_requests add column billing_request_id text, add column request_id text,
    add column detail_metadata jsonb;`);
  await db.exec('create schema if not exists private; grant usage on schema private to service_role;');
  await db.exec(cutoffs.sql);
  // The marker starts NULL (no cutoff: the JSON flag is always read); a later migration sets it
  // once the deploy is verified. A replay keeps a marker set since.
  const marker = async () => (await one('select pending_json_cutoff as at from private.billing_cutoffs')).at;
  assert.equal(await marker(), null, 'the migration leaves the marker unset');
  const later = new Date('2030-01-01T00:00:00Z');
  await db.query('update private.billing_cutoffs set pending_json_cutoff = $1', [later]);
  await db.exec(cutoffs.sql);
  assert.equal((await marker()).getTime(), later.getTime(), 'a replay keeps a marker set since');
  await db.query('update private.billing_cutoffs set pending_json_cutoff = null');
  // Only the service role (and the claim, which runs as its owner) can read it.
  for (const [role, allowed] of [['service_role', true], ['anon', false], ['authenticated', false]]) {
    assert.equal((await one(`select has_function_privilege($1, 'private.pending_json_cutoff()', 'execute') as ok`, [role])).ok, allowed, role);
  }
  // NULL reads as infinity: every row is before it.
  assert.equal((await asService(() => one(`select private.pending_json_cutoff() = 'infinity'::timestamptz as ok`))).ok, true);
  await db.query('delete from private.billing_cutoffs');
  assert.equal((await asService(() => one(`select private.pending_json_cutoff() = 'infinity'::timestamptz as ok`))).ok, true, 'a missing marker too');
  await db.exec(cutoffs.sql);
  await db.exec(expectedCostColumn.sql);
  await db.exec(expectedCostCheck.sql);
  await assert.rejects(db.query('insert into public.gateway_requests (workspace_id, expected_cost_nanos) values ($1, -1)', [ws]),
    /gateway_requests_expected_cost_nanos_check/);
  await db.exec(chargeColumns.sql);
  await db.exec(chargeTotals.sql);
  await db.exec(overdraftColumn.sql);
  await db.exec(settlement.sql);

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

  // ---------- Before the shortfall fix (20261110140727's body) ----------
  // A row that is neither successful nor pending hid its one-off charge: the old Worker's $6 debit
  // counted 0 and a row carrying $2 counted $2, so the purchase looked unused.
  assert.deepEqual(await usageAtSix('pre_old_worker', underRecordedShapes.old_worker), ['ok', 'ok'],
    'before the fix an old-Worker failure row with no cost hides its $6 debit');
  assert.deepEqual(await usageAtSix('pre_partial', underRecordedShapes.partial), ['ok', 'ok'],
    'before the fix a failure row carrying $2 hides the other $4');
  await db.exec(underRecorded.sql);
  await db.exec(underRecorded.sql);

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

  // A reserved batch: $3 held (three $1 key-limit placeholders, batch_hold_usage), settled after the
  // purchase at its actual $10 through gateway_wallet_settle_once (an async_job_charge ledger row).
  // The purchase had a $5 prior balance; $2 of per-row usage persisted in the partial case.
  const reservedBatch = async (prefix, { placeholders, rowsPersisted, priorBalance }) => {
    await reset();
    const reservation = `batch_hold:${prefix}_req`;
    await db.query(`update public.wallets set balance_nanos = $2, reserved_nanos = $3 where workspace_id = $1`, [ws, usd(30), usd(3)]);
    await db.query(`insert into public.gateway_wallet_reservations (workspace_id, reservation_id, amount_nanos, status, created_at)
      values ($1, $2, $3, 'held', now() - interval '3 hours')`, [ws, reservation, usd(3)]);
    if (placeholders) await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, request_id)
      select $1, true, $2, now() - interval '90 minutes', 'batch_hold_usage:' || $3 || ':' || i from generate_series(1, 3) i`, [ws, usd(1), reservation]);
    await purchase(`${prefix}_first`, usd(10), usd(priorBalance), 2);
    const settled = await asService(() => one('select * from public.gateway_wallet_settle_once($1, $2, $3, $4)', [ws, reservation, usd(10), `${prefix}_batch`]));
    assert.equal(settled.ok, true, JSON.stringify(settled));
    if (rowsPersisted) await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, request_id)
      select $1, true, $2, now() - interval '30 minutes', 'batch_usage:' || $3 || ':' || i from generate_series(1, $4::int) i`,
      [ws, usd(1), `${prefix}_batch`, rowsPersisted]);
    await setBalance(usd(priorBalance + 10));
    return claim(`${prefix}_first`);
  };
  assert.equal((await reservedBatch('rb_partial', { placeholders: false, rowsPersisted: 2, priorBalance: 5 })).reason, 'lot_used',
    'a reserved batch counts its $10 debit, not the $2 of rows that persisted');
  assert.equal((await reservedBatch('rb_missing', { placeholders: false, rowsPersisted: 0, priorBalance: 5 })).reason, 'lot_used',
    'a reserved batch with no persisted rows counts its $10 debit');
  assert.equal((await reservedBatch('rb_hold', { placeholders: true, rowsPersisted: 0, priorBalance: 5 })).reason, 'lot_used',
    'a reserved batch counts its $10 debit, not its $3 held-price placeholders');
  assert.equal((await reservedBatch('rb_once', { placeholders: false, rowsPersisted: 2, priorBalance: 11 })).ok, true,
    'the debit and its persisted rows are counted once ($10 fits in $11)');
  assert.equal((await reservedBatch('rb_once_hold', { placeholders: true, rowsPersisted: 0, priorBalance: 11 })).ok, true,
    'the debit and its placeholders are counted once ($10 fits in $11)');

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

  // A video, reserved as video_hold:<request id> (the executors reserve with the request id) and
  // settled at its actual $10 by gateway_wallet_settle_once, whose async_job_charge debit names the
  // provider's video id. Its request row was written when the job was created; the settlement's
  // update of the row's cost was skipped (cost 0) or applied ($10). The debit counts at its time,
  // whole; the request row does not count once the hold is debited.
  const video = async (prefix, { rowWrittenAfterPurchase = false, rowCost = 0, priorBalance, debitBeforePurchase = false }) => {
    await reset();
    const requestId = `${prefix}_req`;
    const reservation = `video_hold:${requestId}`;
    await db.query(`update public.wallets set balance_nanos = $2, reserved_nanos = $3 where workspace_id = $1`, [ws, usd(30), usd(3)]);
    await db.query(`insert into public.gateway_wallet_reservations (workspace_id, reservation_id, amount_nanos, status, hold_ref_id, created_at)
      values ($1, $2, $3, 'held', $4, now() - interval '3 hours')`, [ws, reservation, usd(3), requestId]);
    await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, request_id)
      values ($1, true, $2, now() - make_interval(mins => $3::int), $4)`, [ws, rowCost, rowWrittenAfterPurchase ? 90 : 170, requestId]);
    const settle = async () => {
      const settled = await asService(() => one('select * from public.gateway_wallet_settle_once($1, $2, $3, $4)', [ws, reservation, usd(10), `${prefix}_provider_video`]));
      assert.equal(settled.ok, true, JSON.stringify(settled));
    };
    if (debitBeforePurchase) {
      await settle();
      await db.query(`update public.credit_ledger set created_at = now() - interval '150 minutes' where ref_type = 'async_job_charge'`);
    }
    await purchase(`${prefix}_first`, usd(10), usd(priorBalance), 2);
    if (!debitBeforePurchase) await settle();
    await purchase(`${prefix}_second`, usd(10), usd(priorBalance), 1);
    await setBalance(usd(priorBalance + 20));
    return claim(`${prefix}_first`);
  };
  assert.equal((await video('video_skipped', { priorBalance: 5 })).reason, 'lot_used',
    "a video's $10 debit counts though its request row's cost was never updated");
  assert.equal((await video('video_skipped_ok', { priorBalance: 11 })).ok, true, 'and counts once ($10 fits in $11)');
  assert.equal((await video('video_old_row', { rowCost: usd(10), priorBalance: 5 })).reason, 'lot_used',
    'a video counts its debit though its request row was written before the purchase');
  assert.equal((await video('video_updated', { rowWrittenAfterPurchase: true, rowCost: usd(10), priorBalance: 11 })).ok, true,
    'a video whose row records its cost is counted once, not as the row plus the debit ($10 fits in $11)');
  assert.equal((await video('video_debit_before', { debitBeforePurchase: true, rowWrittenAfterPurchase: true, rowCost: usd(10), priorBalance: 0 })).ok, true,
    'a video debited before the purchase does not use it, though its audit row landed after it');

  // A batch counts its whole debit at the debit's time; its per-row usage does not count.
  const capturedBatch = async (prefix, { captureMinutesAgo, rowsMinutesAgo, rows, rowNanos, captureNanos, priorBalance }) => {
    await reset();
    await db.query(`insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, created_at)
      values ($1, $2, $3, 'applied', now() - make_interval(mins => $4::int))`, [ws, `batch_capture:${prefix}_batch`, captureNanos, captureMinutesAgo]);
    await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, request_id)
      select $1, true, $2, now() - make_interval(mins => $5::int), 'batch_usage:' || $3 || ':' || i from generate_series(1, $4::int) i`,
      [ws, rowNanos, `${prefix}_batch`, rows, rowsMinutesAgo]);
    await purchase(`${prefix}_first`, usd(10), usd(priorBalance), 2);
    await setBalance(usd(priorBalance + 10));
    return claim(`${prefix}_first`);
  };
  assert.equal((await capturedBatch('batch_before', { captureMinutesAgo: 150, rowsMinutesAgo: 60, rows: 5, rowNanos: usd(1), captureNanos: usd(5), priorBalance: 0 })).ok, true,
    'a batch debited before the purchase does not use it, though its rows were audited after it');
  assert.equal((await capturedBatch('batch_rows_80', { captureMinutesAgo: 60, rowsMinutesAgo: 60, rows: 8, rowNanos: usd(10), captureNanos: usd(50), priorBalance: 60 })).ok, true,
    'rows of $80 and a capture of $50 count $50 ($50 fits in $60)');
  assert.equal((await capturedBatch('batch_rows_80_low', { captureMinutesAgo: 60, rowsMinutesAgo: 60, rows: 8, rowNanos: usd(10), captureNanos: usd(50), priorBalance: 49 })).reason, 'lot_used',
    'and the capture of $50 does count ($50 does not fit in $49)');

  // Rows written from the deploy's marker (private.pending_json_cutoff()) are pending only by
  // expected_cost_nanos: the JSON billing_status is read strictly before it. The marker is moved to
  // an hour ago for this check.
  const shipped = normalize(migration.sql);
  assert.equal(shipped.split('pending.created_at < (select private.pending_json_cutoff())').length - 1, 2,
    'both JSON-pending lookups apply the cutoff');
  assert(!/2026-11-09/.test(shipped), 'no fixed date');
  const cutoff = (await one(`select date_trunc('second', now() - interval '1 hour') as at`)).at;
  // A committed $5 one-off charge whose audit row has only the JSON flag and a stale $8 cost (read
  // back before a correction). Pending, the row is left out and the $5 charge counts; not pending,
  // the row's $8 counts. A $6 prior balance tells them apart.
  const flaggedAt = async (prefix, offsetMs) => {
    await reset();
    await purchase(`${prefix}_first`, usd(10), usd(6), 3);
    await asService(() => db.query('select public.gateway_charge_with_credit_cache($1, $2, $3, null)', [ws, `${prefix}_bill`, usd(5)]));
    await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, billing_request_id, detail_metadata)
      values ($1, false, $6, $2::timestamptz + make_interval(secs => $3::float8 / 1000), $4, $5::jsonb)`,
      [ws, cutoff, offsetMs, `${prefix}_bill`, JSON.stringify({ accounting_finalization: { billing_status: 'pending_reconciliation' } }), usd(8)]);
    await setBalance(usd(16));
    return claim(`${prefix}_first`);
  };
  // Marker unset: the flag is read for every row, whenever it was written (an old Worker still live).
  assert.equal(await marker(), null);
  assert.equal((await flaggedAt('unset_at', 0)).ok, true, 'with no marker a JSON-only pending row counts its $5 charge, not its row');
  assert.equal((await flaggedAt('unset_after', 3_600_000)).ok, true, 'however late it was written');
  // Marker set (an hour ago here): the flag is read strictly before it.
  await db.query('update private.billing_cutoffs set pending_json_cutoff = $1', [cutoff]);
  assert.equal((await flaggedAt('cut_before', -1)).ok, true, 'just before the cutoff the flag marks the row pending: the charge counts');
  assert.equal((await flaggedAt('cut_at', 0)).reason, 'lot_used', 'exactly at the cutoff the flag is not read: the row ($8) counts');
  assert.equal((await flaggedAt('cut_after', 1)).reason, 'lot_used', 'after the cutoff the flag is not read either');
  await db.query('update private.billing_cutoffs set pending_json_cutoff = null');

  // A delivered request pending reconciliation with no charge row at all (its charge was never
  // applied): its expected $5 counts once, less the cost its row already counts (NULL, 0 or $2).
  const unchargedPending = async (prefix, rowCost, priorBalance) => {
    await reset();
    await purchase(`${prefix}_first`, usd(10), usd(priorBalance), 3);
    await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, billing_request_id, request_id, expected_cost_nanos)
      values ($1, false, $2, now() - interval '2 hours', $3, $4, $5)`, [ws, rowCost, `${prefix}_bill`, `${prefix}_req`, usd(5)]);
    await setBalance(usd(priorBalance + 10));
    return claim(`${prefix}_first`);
  };
  for (const [label, rowCost] of [['null', null], ['zero', 0], ['two', usd(2)]]) {
    assert.equal((await unchargedPending(`unpaid_${label}`, rowCost, 4)).reason, 'lot_used',
      `an uncharged pending request counts its expected bill (row cost ${label}; $5 does not fit in $4)`);
    assert.equal((await unchargedPending(`unpaid_${label}_ok`, rowCost, 5)).ok, true,
      `and counts it once (row cost ${label}; $5 fits in $5)`);
  }

  // ---------- Money movements win over a pending reconciliation's audit cost ----------
  // A delivered request whose charge attempts all failed is audited as pending reconciliation with
  // the cost it read back (NULL when unreadable, or a snapshot taken before a debit or refund
  // committed) and the bill it meant to charge. Its charge row is what the wallet took.
  const pendingRow = (billingId, { cost, expected = null, flagged = true }) => db.query(
    `insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, billing_request_id, expected_cost_nanos, detail_metadata)
     values ($1, false, $3, now() - interval '2 hours', $2, $4, $5::jsonb)`,
    [ws, billingId, cost, expected, JSON.stringify(flagged ? { accounting_finalization: { billing_status: 'pending_reconciliation' } } : {})]);
  const oneOffCharge = async (billingId, nanos) => {
    await asService(() => db.query('select public.gateway_charge_with_credit_cache($1, $2, $3, null)', [ws, billingId, nanos]));
    await db.query(`update public.gateway_request_charges set created_at = now() - interval '2 hours' where request_id = $1`, [billingId]);
  };
  // Buy $10, spend $5 through a one-off charge whose debit committed but whose stored total could
  // not be read (audit cost NULL), top up $10: the first purchase is used.
  await scenario('uncertain', async (prefix) => {
    await oneOffCharge(`${prefix}_bill`, usd(5));
    await pendingRow(`${prefix}_bill`, { cost: null, expected: usd(5) });
  });
  assert.equal((await claim('uncertain_first')).reason, 'lot_used', 'a committed one-off charge counts though its audit cost is NULL');
  assert.equal(await balance(), usd(15), 'nothing is refunded');
  // Flagged by the audit's billing_status alone (no expected cost written): the same.
  await scenario('flag_only', async (prefix) => {
    await oneOffCharge(`${prefix}_bill`, usd(5));
    await pendingRow(`${prefix}_bill`, { cost: null });
  });
  assert.equal((await claim('flag_only_first')).reason, 'lot_used', 'billing_status pending_reconciliation marks the row as well');
  // Read back as 0 before the debit committed (a delayed commit): the charge row's $5 counts.
  await scenario('late_commit', async (prefix) => {
    await oneOffCharge(`${prefix}_bill`, usd(5));
    await pendingRow(`${prefix}_bill`, { cost: 0, expected: usd(5) });
  });
  assert.equal((await claim('late_commit_first')).reason, 'lot_used', 'a debit that committed after the read-back counts');
  // Read back correctly at $5: counted once, not as the row plus the charge ($5 fits in $7).
  await reset();
  await purchase('pending_once_first', usd(10), usd(7), 3);
  await oneOffCharge('pending_once_bill', usd(5));
  await pendingRow('pending_once_bill', { cost: usd(5), expected: usd(5) });
  await setBalance(usd(12));
  assert.equal((await claim('pending_once_first')).ok, true, 'a pending row and its charge are counted once');
  // An ordinary successful one-off charge keeps using its audit cost, as before.
  await reset();
  await purchase('ordinary_first', usd(10), usd(4), 3);
  await oneOffCharge('ordinary_bill', usd(5));
  await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at, billing_request_id)
    values ($1, true, $2, now() - interval '2 hours', 'ordinary_bill')`, [ws, usd(5)]);
  await setBalance(usd(14));
  assert.equal((await claim('ordinary_first')).reason, 'lot_used', 'an ordinary charge counts its audit cost');
  // A stepped stream's refund from $5 to $3 that committed after the audit read back $5: the debits
  // count ($3 fits in a $4 prior balance), not the frozen $5.
  const steppedPending = async (prefix, priorBalance, { finalTotal, frozen, expected }) => {
    await reset();
    await setBalance(usd(20));
    await purchase(`${prefix}_first`, usd(10), usd(priorBalance), 3);
    const charge = (total, final) => asService(() => db.query('select public.gateway_charge_request_total($1, $2, $3, $4, null, null)',
      [ws, `${prefix}_bill`, total, final]));
    await charge(usd(5), false);
    if (finalTotal !== null) await charge(usd(finalTotal), true);
    await pendingRow(`${prefix}_bill`, { cost: usd(frozen), expected: usd(expected) });
    await setBalance(usd(priorBalance + 10));
    return claim(`${prefix}_first`);
  };
  assert.equal((await steppedPending('late_refund', 4, { finalTotal: 3, frozen: 5, expected: 3 })).ok, true,
    'a refund that committed after the read-back counts at its net $3');
  // The final ($8) did not go through after $5 of checkpoints: the $3 the wallet did not take is the
  // unpaid part of a pending request, and counts with the $5 debited ($8 does not fit in $7).
  assert.equal((await steppedPending('unpaid', 7, { finalTotal: null, frozen: 5, expected: 8 })).reason, 'lot_used',
    'the unpaid part of a pending request counts');
  assert.equal((await steppedPending('unpaid_ok', 9, { finalTotal: null, frozen: 5, expected: 8 })).ok, true,
    'the debits and the unpaid part are counted once ($8 fits in $9)');

  // ---------- One-off charges their request rows under-record ----------
  // Usage since the purchase is exactly the $6 debited, whatever the row recorded.
  for (const [shape, expectation] of [
    ['old_worker', 'an old-Worker failure row with no cost: the $6 debit counts'],
    ['partial', 'a failure row carrying $2: the row and the $4 shortfall count $6'],
    ['new_worker', 'a failure row carrying the $6: counted once, not $12'],
    ['success', 'a successful one-off charge: counted once'],
    ['buffered_pending', 'a buffered request pending reconciliation, cost read back: counted once'],
    ['buffered_pending_unread', 'a buffered request pending reconciliation, cost unread: counted once'],
  ]) {
    assert.deepEqual(await usageAtSix(shape, underRecordedShapes[shape]), ['lot_used', 'ok'], expectation);
  }
  // The old-Worker shape with a $10 top-up on an empty wallet: the $6 debit uses it, nothing is refunded.
  await reset();
  await purchase('old_worker_refund_first', usd(10), 0, 3);
  await asService(() => db.query('select public.gateway_charge_with_credit_cache($1, $2, $3, null)', [ws, 'old_worker_refund_bill', usd(6)]));
  await underRecordedShapes.old_worker('old_worker_refund_bill');
  // The wallet holds the whole $10, so only the usage can refuse the claim.
  await setBalance(usd(10));
  assert.equal((await claim('old_worker_refund_first')).reason, 'lot_used', 'the spent top-up is not refunded');
  assert.equal(await balance(), usd(10));

  console.log(JSON.stringify({ passed: true, migration: underRecorded.name }));
} finally {
  await db.close();
}
