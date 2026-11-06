// Standalone PostgreSQL regression test for the 2026-11-03 billing review. Each case runs first on the
// function definitions from before the fix (fixtures/billing-security-before.sql) to show the bug, then on
// the real migration:
// 1. A request costing more than the unreserved balance was never charged (free inference). Now it is
//    always charged, into overdraft, and the overdraft is recorded; a batch hold can still be captured.
// 2. Self-serve refund eligibility is checked in SQL: usage summed past 1,000 rows, holds respected,
//    never below zero, and the wallet debited in the same transaction.
// 3. A refund is applied to the wallet once per Stripe refund id, from the route and the webhooks. A claim
//    left unlinked for 15 minutes is given back, and a fresh claim is never left on an old failed refund.
// 4. Disputes (chargebacks) are debited once per dispute id, into overdraft, and given back when won.
// 5. One auto top-up in flight per wallet; auto_top_up_amount is limited to what the webhook credits.
// 6. A credit code can be redeemed once per workspace, not once per member.
// PGlite runs one connection, so this checks the decisions and idempotency, not lock contention.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/billing-security-fixes.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_billing_security_fixes.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));

// The declarative files describe the same end state. Changed again later: gateway_wallet_settle_once
// by async_settlement_always_charges (see async-settlement-overdraft.test.mjs) and
// stripe_claim_self_serve_refund by refund_claim_counts_charged_failures (see refund-claim-charged-failures.test.mjs).
for (const fn of ['deduct_and_check_top_up',
  'stripe_apply_payment_intent_credit', 'redeem_credit_code',
  'stripe_apply_refund_once', 'stripe_apply_dispute_once']) {
  const sql = normalize(await read(`../schemas/public/functions/${fn}.sql`));
  const body = sql.slice(sql.indexOf('$function$'), sql.lastIndexOf('$function$') + 10);
  assert(body.length > 20 && migration.includes(body), `the migration ships the schema body of ${fn}`);
}
const exportJson = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of ['public/functions/stripe_apply_refund_once.sql', 'public/functions/stripe_apply_dispute_once.sql']) {
  assert(exportJson.loadOrder.includes(file) && exportJson.files.includes(file), `${file} is in the declarative export`);
}
const tableSql = async (name) => normalize(await read(`../schemas/public/tables/${name}.sql`));
assert((await tableSql('wallets')).includes('"auto_top_up_in_flight_until" timestamp with time zone'));
assert((await tableSql('wallets')).includes('CONSTRAINT "wallets_auto_top_up_amount_check" CHECK'));
assert((await tableSql('gateway_request_charges')).includes('"overdraft_nanos"      bigint                   NOT NULL DEFAULT 0'));
assert((await tableSql('credit_ledger')).includes('"wallet_debited"            boolean'));
assert((await tableSql('credit_grant_redemptions')).includes('UNIQUE (grant_id, workspace_id)'));

const usd = (n) => Math.round(n * 1e9);
const ws = '10000000-0000-4000-8000-000000000001';
const ownerA = '20000000-0000-4000-8000-000000000001';
const memberB = '20000000-0000-4000-8000-000000000002';
const db = new PGlite();
let seq = 0;

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const asUser = async (user, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const wallet = () => one('select * from public.wallets where workspace_id = $1', [ws]);
const balance = async () => Number((await wallet()).balance_nanos);
const setWallet = (fields) => db.query(
  `update public.wallets set balance_nanos = $2, reserved_nanos = $3, auto_top_up_enabled = $4,
     low_balance_threshold = $5, auto_top_up_amount = $6 where workspace_id = $1`,
  [ws, fields.balance ?? 0, fields.reserved ?? 0, fields.enabled ?? false, fields.threshold ?? 0, fields.amount ?? 0]);
const charge = (cost, id = `req-${++seq}`) => asService(() =>
  one('select public.gateway_charge_with_credit_cache($1, $2, $3, null) as r', [ws, id, cost]).then((row) => row.r));
const purchase = async (pi, { amount, before, hoursAgo = 1 }) => db.query(
  `insert into public.credit_ledger (workspace_id, event_time, kind, amount_nanos, before_balance_nanos, after_balance_nanos, ref_type, ref_id, status)
   values ($1, now() - make_interval(hours => $5::int), 'top_up', $3::bigint, $4::bigint, $4::bigint + $3::bigint, 'Stripe_Payment_Intent', $2, 'Paid')`,
  [ws, pi, amount, before, hoursAgo]);
const claim = (pi) => asService(() => one('select * from public.stripe_claim_self_serve_refund($1, $2, $3)', [ws, pi, ownerA]));
const applyRefund = (pi, refundId, net, status) => asService(() =>
  one('select * from public.stripe_apply_refund_once($1, $2, $3, $4, $5)', [ws, pi, refundId, net, status]));
const applyDispute = (pi, disputeId, amount, status) => asService(() =>
  one('select * from public.stripe_apply_dispute_once($1, $2, $3, $4, $5)', [ws, pi, disputeId, amount, status]));
const redeem = (user) => asUser(user, () => one('select * from public.redeem_credit_code($1, $2)', ['LAUNCH', ws]));

try {
  await db.exec(await read('./fixtures/billing-security-before.sql'));
  // redeem_credit_code checks MFA first (require_mfa_for_data_api); this fixture's users have no factors.
  await db.exec("create or replace function public.mfa_satisfied() returns boolean language sql stable as 'select true';");
  await db.query('insert into public.workspaces (id) values ($1)', [ws]);
  await db.query('insert into public.workspace_members values ($1, $2), ($1, $3)', [ws, ownerA, memberB]);
  await db.query('insert into public.wallets (workspace_id) values ($1)', [ws]);
  await db.query(`insert into public.credit_grants (code, code_normalized, amount_nanos, max_redemptions) values ('LAUNCH', 'LAUNCH', $1, 10)`, [usd(5)]);

  // ---------- Before the fix ----------
  // 1. $5 request with $0.20 left: the debit is refused, so nothing is charged and admission still passes.
  await setWallet({ balance: usd(0.2) });
  await assert.rejects(charge(usd(5)), /insufficient_unreserved_balance/);
  assert.equal(await balance(), usd(0.2), 'before the fix the $5 request is never charged');
  // 1b. Batch settlement refused a capture within its own hold once balance was below reserved.
  await setWallet({ balance: usd(5), reserved: usd(10) });
  await db.query(`insert into public.gateway_wallet_reservations (workspace_id, reservation_id, amount_nanos, status) values ($1, 'batch-old', $2, 'held')`, [ws, usd(10)]);
  const oldSettle = await asService(() => one('select * from public.gateway_wallet_settle_once($1, $2, $3, null)', [ws, 'batch-old', usd(8)]));
  assert.equal(oldSettle.reason, 'insufficient_balance', 'before the fix an overdrawn wallet cannot settle its own hold');
  // 5. Every low-balance charge asks for another auto top-up.
  await setWallet({ balance: usd(5), enabled: true, threshold: usd(10), amount: usd(20) });
  assert.equal((await charge(usd(0.01))).status, 'top_up_required');
  assert.equal((await charge(usd(0.01))).status, 'top_up_required', 'before the fix each request triggers a top-up');
  // 5b. An owner can write an amount the webhook refuses to credit.
  await asUser(ownerA, () => db.query('update public.wallets set auto_top_up_amount = 1 where workspace_id = $1', [ws]));
  assert.equal(Number((await wallet()).auto_top_up_amount), 1);
  // 6. Two members redeem one code into the same workspace.
  await setWallet({ balance: 0 });
  assert.equal((await redeem(ownerA)).status, 'succeeded');
  assert.equal((await redeem(memberB)).status, 'succeeded', 'before the fix each member can redeem the code');
  assert.equal(await balance(), usd(10));
  // 2. The atomic claim function was never callable.
  await purchase('pi_old', { amount: usd(10), before: 0 });
  await assert.rejects(claim('pi_old'), /team_id/, 'before the fix stripe_claim_self_serve_refund references a missing column');

  // Reset the rows the "before" cases wrote that the new constraints would reject.
  await db.exec(`delete from public.credit_grant_redemptions; update public.credit_grants set redemptions_count = 0;
    update public.wallets set auto_top_up_amount = 0; delete from public.credit_ledger;`);

  await db.exec(migration);
  await db.exec(migration);

  // ---------- After the fix ----------
  // 1. The real cost is charged into overdraft, recorded, and replays don't charge again.
  await setWallet({ balance: usd(0.2) });
  const overdrawn = await charge(usd(5), 'big-request');
  assert.equal(overdrawn.applied, true);
  assert.equal(await balance(), usd(0.2) - usd(5), 'the $5 request is charged in full');
  assert.equal(Number(overdrawn.available_nanos), 0, 'the cache sees no available credit, so admission blocks');
  assert.equal(overdrawn.invalidate_credit_cache, true);
  const chargeRow = await one(`select overdraft_nanos, status from public.gateway_request_charges where request_id = 'big-request'`);
  assert.equal(Number(chargeRow.overdraft_nanos), usd(4.8), 'the uncovered part is recorded as overdraft');
  assert.equal((await charge(usd(5), 'big-request')).already_applied, true);
  assert.equal(await balance(), usd(0.2) - usd(5), 'a replay does not charge twice');
  // A charge into held funds is also taken in full.
  await setWallet({ balance: usd(10), reserved: usd(9.9) });
  await charge(usd(1), 'into-holds');
  assert.equal(await balance(), usd(9));
  assert.equal(Number((await one(`select overdraft_nanos from public.gateway_request_charges where request_id = 'into-holds'`)).overdraft_nanos), usd(0.9));
  // A covered charge records no overdraft.
  await setWallet({ balance: usd(10) });
  await charge(usd(1), 'covered');
  assert.equal(Number((await one(`select overdraft_nanos from public.gateway_request_charges where request_id = 'covered'`)).overdraft_nanos), 0);
  // 1b. The hold can still be captured when the wallet is overdrawn.
  await setWallet({ balance: usd(5), reserved: usd(10) });
  await db.query(`insert into public.gateway_wallet_reservations (workspace_id, reservation_id, amount_nanos, status) values ($1, 'batch-new', $2, 'held')`, [ws, usd(10)]);
  const settled = await asService(() => one('select * from public.gateway_wallet_settle_once($1, $2, $3, null)', [ws, 'batch-new', usd(8)]));
  assert.equal(settled.ok, true, JSON.stringify(settled));
  assert.equal(await balance(), usd(-3));
  assert.equal(Number((await wallet()).reserved_nanos), 0);
  // Beyond its own hold, settlement still needs free balance.
  await setWallet({ balance: usd(5), reserved: usd(10) });
  await db.query(`insert into public.gateway_wallet_reservations (workspace_id, reservation_id, amount_nanos, status) values ($1, 'batch-over', $2, 'held')`, [ws, usd(10)]);
  assert.equal((await asService(() => one('select * from public.gateway_wallet_settle_once($1, $2, $3, null)', [ws, 'batch-over', usd(11)]))).reason, 'insufficient_balance');

  // 5. One auto top-up until it is credited or 15 minutes pass.
  await setWallet({ balance: usd(5), enabled: true, threshold: usd(10), amount: usd(20) });
  assert.equal((await charge(usd(0.01))).status, 'top_up_required');
  const marker = (await wallet()).auto_top_up_in_flight_until;
  assert(marker, 'the in-flight marker is set');
  assert.equal((await charge(usd(0.01))).status, 'top_up_pending', 'a second low-balance charge does not trigger another top-up');
  assert.equal((await charge(usd(0.01))).status, 'top_up_pending');
  await asService(() => db.query(`select * from public.stripe_apply_payment_intent_credit($1, 'pi_auto_1', 'auto_top_up', $2)`, [ws, usd(1)]));
  assert.equal((await wallet()).auto_top_up_in_flight_until, null, 'a credited auto top-up clears the marker');
  assert.equal((await charge(usd(0.01))).status, 'top_up_required');
  await db.query(`update public.wallets set auto_top_up_in_flight_until = now() - interval '1 second' where workspace_id = $1`, [ws]);
  assert.equal((await charge(usd(0.01))).status, 'top_up_required', 'an expired marker allows a new top-up');
  // A negative balance still triggers auto top-up.
  await db.query(`update public.wallets set auto_top_up_in_flight_until = null, balance_nanos = 0 where workspace_id = $1`, [ws]);
  assert.equal((await charge(usd(3))).status, 'top_up_required');
  // 5b. The amount is limited to what the webhook credits ($5 to $1,000,000), or 0 when off.
  for (const bad of [1, usd(1), usd(4.99), usd(1_000_001), -1]) {
    await assert.rejects(asUser(ownerA, () => db.query('update public.wallets set auto_top_up_amount = $2 where workspace_id = $1', [ws, bad])),
      /wallets_auto_top_up_amount_check/, `auto_top_up_amount ${bad} is refused`);
  }
  for (const good of [0, usd(5), usd(1_000_000)]) {
    await asUser(ownerA, () => db.query('update public.wallets set auto_top_up_amount = $2 where workspace_id = $1', [ws, good]));
  }

  // 6. One redemption per workspace.
  await setWallet({ balance: 0 });
  assert.equal((await redeem(ownerA)).status, 'succeeded');
  const second = await redeem(memberB);
  assert.equal(second.status, 'already_redeemed');
  assert.equal(await balance(), usd(5), 'the code credits the workspace once');
  assert.equal((await redeem(ownerA)).status, 'already_redeemed');

  // 2. Self-serve refund claims.
  // Usage is summed in SQL: 1,500 requests (more than one PostgREST page) of $0.001 = $1.50 > $1 before the purchase.
  await setWallet({ balance: usd(30) });
  await purchase('pi_used', { amount: usd(10), before: usd(1) });
  await db.query(`insert into public.gateway_requests (workspace_id, success, cost_nanos, created_at)
    select $1, true, $2, now() - interval '30 minutes' from generate_series(1, 1500)`, [ws, usd(0.001)]);
  const used = await claim('pi_used');
  assert.equal(used.ok, false); assert.equal(used.reason, 'lot_used', 'usage past the first 1,000 rows counts');
  assert.equal(await balance(), usd(30));
  await db.exec('delete from public.gateway_requests');
  // Holds count: refunding $10 from $15 with $8 held would spend held funds.
  await setWallet({ balance: usd(15), reserved: usd(8) });
  await purchase('pi_held', { amount: usd(10), before: usd(5) });
  assert.equal((await claim('pi_held')).reason, 'lot_used', 'a refund may not spend held credits');
  // Never below zero.
  await setWallet({ balance: usd(9) });
  await purchase('pi_short', { amount: usd(10), before: usd(5) });
  assert.equal((await claim('pi_short')).reason, 'lot_used', 'a refund may not take the wallet below zero');
  // Window and status checks still apply.
  await purchase('pi_late', { amount: usd(10), before: 0, hoursAgo: 25 });
  assert.equal((await claim('pi_late')).reason, 'window_expired');
  assert.equal((await claim('pi_missing')).reason, 'purchase_not_found');
  // An eligible claim debits the wallet at once, and a second claim is refused.
  await setWallet({ balance: usd(15) });
  await purchase('pi_ok', { amount: usd(10), before: usd(5) });
  const ok = await claim('pi_ok');
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(Number(ok.amount_nanos), usd(10));
  assert.equal(await balance(), usd(5), 'the claim debits the wallet before the Stripe refund');
  assert.equal((await claim('pi_ok')).ok, false, 'a concurrent second claim is refused');

  // 3. The refund is applied once, whichever of the route and the webhooks gets there first.
  const linked = await applyRefund('pi_ok', 're_ok', usd(10), 'pending'); // refund.created webhook
  assert.equal(linked.applied, false); assert.equal(linked.wallet_debited, true);
  await applyRefund('pi_ok', 're_ok', usd(10), 'succeeded'); // route
  await applyRefund('pi_ok', 're_ok', usd(10), 'succeeded'); // refund.updated webhook
  await applyRefund('pi_ok', 're_ok', usd(10), 'pending'); // late refund.created
  assert.equal(await balance(), usd(5), 'the refund is debited exactly once');
  const refundRows = (await db.query(`select ref_id, status, wallet_debited from public.credit_ledger where kind = 'refund' and source_ref_id = 'pi_ok'`)).rows;
  assert.equal(refundRows.length, 1); assert.equal(refundRows[0].ref_id, 're_ok'); assert.equal(refundRows[0].wallet_debited, true);
  assert.equal(refundRows[0].status, 'Succeeded', 'a late pending event does not reopen the refund');
  assert.equal((await one(`select refund_claim_state from public.credit_ledger where ref_id = 'pi_ok'`)).refund_claim_state, 'Succeeded');
  // A refund that fails at Stripe gives the credits back, once.
  await applyRefund('pi_ok', 're_ok', usd(10), 'failed');
  await applyRefund('pi_ok', 're_ok', usd(10), 'failed');
  assert.equal(await balance(), usd(15));
  // Failed is final: stale succeeded or pending events delivered afterwards don't debit again.
  await applyRefund('pi_ok', 're_ok', usd(10), 'succeeded');
  await applyRefund('pi_ok', 're_ok', usd(10), 'pending');
  assert.equal(await balance(), usd(15), 'a succeeded event replayed after the failure does not debit again');
  assert.equal((await one(`select status from public.credit_ledger where ref_type = 'Stripe_Refund' and ref_id = 're_ok'`)).status, 'Failed');
  // A claim whose Stripe refund was never created is given back.
  await purchase('pi_cancel', { amount: usd(4), before: usd(15) });
  assert.equal((await claim('pi_cancel')).ok, true);
  assert.equal(await balance(), usd(11));
  assert.equal((await applyRefund('pi_cancel', null, null, 'failed')).applied, true);
  assert.equal(await balance(), usd(15));
  assert.equal((await one(`select refund_claim_state from public.credit_ledger where ref_id = 'pi_cancel'`)).refund_claim_state, 'Failed');
  assert.equal((await applyRefund('pi_cancel', null, null, 'failed')).status, 'claim_not_found');
  const claimRow = (refId) => one(`select status, wallet_debited from public.credit_ledger where ref_type = 'Stripe_Refund' and ref_id = $1`, [refId]);
  const ageClaim = (pi, minutes) => db.query(
    `update public.credit_ledger set refund_claimed_at = now() - make_interval(mins => $2::int) where ref_type = 'Stripe_Payment_Intent' and ref_id = $1`, [pi, minutes]);
  // A claim whose response was lost (Stripe never called, nothing linked) blocks for 15 minutes, then
  // the next request gives it back and claims afresh.
  await purchase('pi_lost', { amount: usd(4), before: usd(15) });
  const lost = await claim('pi_lost');
  assert.equal(lost.ok, true); assert.match(lost.claim_ref_id, /^self_serve_claim:pi_lost:/);
  assert.equal(await balance(), usd(11));
  await ageClaim('pi_lost', 14);
  assert.equal((await claim('pi_lost')).reason, 'refund_claim_in_progress', 'a claim under 15 minutes old may still be in flight');
  await ageClaim('pi_lost', 16);
  const retried = await claim('pi_lost');
  assert.equal(retried.ok, true, 'an abandoned claim no longer blocks the customer');
  assert.notEqual(retried.claim_ref_id, lost.claim_ref_id, 'each claim has its own id for the Stripe idempotency key');
  assert.equal(await balance(), usd(11), 'the abandoned debit is given back before the new claim debits once');
  assert.deepEqual(await claimRow(lost.claim_ref_id), { status: 'Canceled', wallet_debited: false });
  // The abandoned claim's refund did reach Stripe after all: its late webhook takes over the open claim,
  // and the retry (Stripe finds nothing left to refund) has nothing to give back.
  await applyRefund('pi_lost', 're_lost', usd(4), 'pending');
  assert.equal((await applyRefund('pi_lost', null, null, 'failed')).status, 'claim_not_found');
  await applyRefund('pi_lost', 're_lost', usd(4), 'succeeded');
  assert.equal(await balance(), usd(11), 'the refund is debited once');
  // An abandoned claim is also given back once the 24-hour window has closed, and a late refund for it
  // is debited once when it succeeds, like a dashboard refund.
  await purchase('pi_stale', { amount: usd(4), before: usd(11) });
  const stale = await claim('pi_stale');
  assert.equal(stale.ok, true); assert.equal(await balance(), usd(7));
  await ageClaim('pi_stale', 16);
  await db.query(`update public.credit_ledger set event_time = now() - interval '25 hours' where ref_type = 'Stripe_Payment_Intent' and ref_id = 'pi_stale'`);
  assert.equal((await claim('pi_stale')).reason, 'window_expired');
  assert.equal(await balance(), usd(11), 'the abandoned debit is given back even after the window');
  assert.equal((await claim('pi_stale')).reason, 'window_expired');
  assert.equal(await balance(), usd(11), 'and only once');
  await applyRefund('pi_stale', 're_stale', usd(4), 'pending');
  assert.equal(await balance(), usd(11));
  await applyRefund('pi_stale', 're_stale', usd(4), 'succeeded');
  await applyRefund('pi_stale', 're_stale', usd(4), 'succeeded');
  assert.equal(await balance(), usd(7), 'a late refund for a released claim is debited once');
  // A retry after a failed refund: if Stripe hands back the old failed refund id, the fresh claim's debit is
  // given back rather than orphaned, and the customer can try again.
  await setWallet({ balance: usd(15) });
  await purchase('pi_retry', { amount: usd(4), before: usd(15) });
  assert.equal((await claim('pi_retry')).ok, true);
  await applyRefund('pi_retry', 're_retry', usd(4), 'failed');
  assert.equal(await balance(), usd(15));
  // A retry gets its own claim (and its own Stripe idempotency key, so a new refund).
  const fresh = await claim('pi_retry');
  assert.equal(fresh.ok, true); assert.equal(await balance(), usd(11));
  // A duplicate webhook for the older, failed refund must not cancel the newer claim.
  await applyRefund('pi_retry', 're_retry', usd(4), 'failed');
  assert.equal(await balance(), usd(11), 'a replayed old failure leaves the newer claim debited');
  assert.deepEqual(await claimRow(fresh.claim_ref_id), { status: 'Applying', wallet_debited: true });
  await applyRefund('pi_retry', 're_retry_2', usd(4), 'succeeded');
  assert.equal(await balance(), usd(11), 'the new refund links to the new claim and debits once');
  // A replayed old failure doesn't change the newer claim's purchase state, so if that newer request
  // stops before reaching Stripe, the 15-minute recovery still gives its debit back.
  await setWallet({ balance: usd(15) });
  await purchase('pi_replay', { amount: usd(4), before: usd(15) });
  assert.equal((await claim('pi_replay')).ok, true);
  await applyRefund('pi_replay', 're_replay', usd(4), 'failed');
  const newer = await claim('pi_replay');
  assert.equal(newer.ok, true); assert.equal(await balance(), usd(11));
  await applyRefund('pi_replay', 're_replay', usd(4), 'failed');
  assert.equal((await one(`select refund_claim_state from public.credit_ledger where ref_type = 'Stripe_Payment_Intent' and ref_id = 'pi_replay'`)).refund_claim_state, 'Applying',
    'an old refund event leaves the newer claim in progress');
  await ageClaim('pi_replay', 16);
  const recovered = await claim('pi_replay');
  assert.equal(recovered.ok, true, 'the abandoned newer claim is recovered, not blocked as refund_already_exists');
  assert.equal(await balance(), usd(11), 'its debit was given back before the next claim debited once');
  assert.deepEqual(await claimRow(newer.claim_ref_id), { status: 'Canceled', wallet_debited: false });
  await setWallet({ balance: usd(15) });
  // A dashboard refund (no claim) is debited once when it succeeds, even into overdraft.
  await purchase('pi_dash', { amount: usd(20), before: 0, hoursAgo: 48 });
  await applyRefund('pi_dash', 're_dash', usd(20), 'pending');
  assert.equal(await balance(), usd(15), 'a pending dashboard refund is not debited yet');
  await applyRefund('pi_dash', 're_dash', usd(20), 'succeeded');
  await applyRefund('pi_dash', 're_dash', usd(20), 'succeeded');
  assert.equal(await balance(), usd(-5));
  // Refund rows written by the old code count as already applied.
  await db.query(`insert into public.credit_ledger (workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos, ref_type, ref_id, status, source_ref_type, source_ref_id)
    values ($1, 'refund', $2, $3, $4, 'Stripe_Refund', 're_legacy', 'Succeeded', 'Stripe_Payment_Intent', 'pi_dash')`, [ws, -usd(1), usd(2), usd(1)]);
  await applyRefund('pi_dash', 're_legacy', usd(1), 'succeeded');
  assert.equal(await balance(), usd(-5));

  // 4. Disputes.
  await setWallet({ balance: usd(3) });
  await purchase('pi_disputed', { amount: usd(10), before: 0, hoursAgo: 72 });
  const opened = await applyDispute('pi_disputed', 'dp_1', usd(10), 'needs_response');
  assert.equal(opened.applied, true);
  await applyDispute('pi_disputed', 'dp_1', usd(10), 'needs_response');
  await applyDispute('pi_disputed', 'dp_1', usd(10), 'under_review');
  assert.equal(await balance(), usd(-7), 'the disputed credit is debited once, into overdraft');
  await applyDispute('pi_disputed', 'dp_1', usd(10), 'won');
  assert.equal(await balance(), usd(3), 'a won dispute gives the credit back');
  await applyDispute('pi_disputed', 'dp_1', usd(10), 'needs_response');
  assert.equal(await balance(), usd(3), 'a late older event does not reopen a closed dispute');
  await applyDispute('pi_disputed', 'dp_2', usd(10), 'needs_response');
  await applyDispute('pi_disputed', 'dp_2', usd(10), 'lost');
  assert.equal(await balance(), usd(-7), 'a lost dispute stays debited');
  const disputeRow = await one(`select kind, amount_nanos, status, wallet_debited from public.credit_ledger where ref_type = 'Stripe_Dispute' and ref_id = 'dp_2'`);
  assert.deepEqual({ ...disputeRow, amount_nanos: Number(disputeRow.amount_nanos) },
    { kind: 'chargeback', amount_nanos: -usd(10), status: 'lost', wallet_debited: true });

  // Only the service role can call the new functions.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.stripe_apply_refund_once($1, $2, $3, $4, $5)', [ws, 'pi_x', 're_x', 1, 'succeeded']), /permission denied/);
    await assert.rejects(db.query('select * from public.stripe_apply_dispute_once($1, $2, $3, $4, $5)', [ws, 'pi_x', 'dp_x', 1, 'lost']), /permission denied/);
    await assert.rejects(db.query('select * from public.stripe_claim_self_serve_refund($1, $2, $3)', [ws, 'pi_x', ownerA]), /permission denied/);
    await db.exec('reset role');
  }

  console.log(JSON.stringify({ passed: true, migration: migrationName, concurrency: 'single connection; decisions and idempotency, not lock contention' }));
} finally {
  await db.close();
}
