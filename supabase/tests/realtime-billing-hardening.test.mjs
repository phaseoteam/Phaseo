import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const ws = '20000000-0000-4000-8000-000000000001';
const keyA = '20000000-0000-4000-8000-0000000000a1';
const keyB = '20000000-0000-4000-8000-0000000000b1';
const admin = '20000000-0000-4000-8000-0000000000ad';
const usd = (n) => Math.round(n * 1e9);
const num = (value) => (value == null ? value : Number(value));
let sequence = 0;

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const wallet = async () => {
  const row = await one('select balance_nanos, reserved_nanos from public.wallets where workspace_id = $1', [ws]);
  return { balance: num(row.balance_nanos), reserved: num(row.reserved_nanos) };
};
const session = async (id) => one('select * from public.gateway_realtime_sessions where session_id = $1', [id]);

/** Creates a connected session with one hold, its request row, and the wallet state. */
async function seed({ balance, hold, walletReserved = hold, key = keyA, status = 'connected' }) {
  const id = `rt_test_${++sequence}`;
  const prefix = `rt:${id}:`;
  await db.query('update public.wallets set balance_nanos = $2, reserved_nanos = $3 where workspace_id = $1', [ws, balance, walletReserved]);
  await db.query(`insert into public.gateway_realtime_sessions
    (session_id, workspace_id, key_id, provider, model_id, status, reservation_prefix, reservation_count, reserved_nanos, started_at)
    values ($1, $2, $3, 'openai', 'openai/gpt-realtime', $4, $5, 1, $6, now())`, [id, ws, key, status, prefix, hold]);
  const started = (await session(id)).started_at;
  await db.query(`insert into public.gateway_wallet_reservations (workspace_id, reservation_id, amount_nanos, status, hold_ref_id)
    values ($1, $2, $3, 'reserved', $4)`, [ws, `${prefix}0001`, hold, id]);
  await db.query(`insert into public.gateway_requests (realtime_session_id, created_at, status_code, cost_nanos)
    values ($1, $2, 102, 0)`, [id, started]);
  return id;
}

const settle = (id, cost, extra = {}) => one(`select * from public.gateway_realtime_settle_once(
    p_workspace_id => $1, p_session_id => $2, p_final_cost_nanos => $3, p_usage => '{"output_audio_tokens":1}'::jsonb,
    p_status => 'completed', p_estimated => $4, p_estimate_basis => $5)`,
  [ws, id, cost, extra.estimated ?? false, extra.basis ?? null]);
const markUnresolved = (id, confirmed) => one(`select * from public.gateway_realtime_mark_billing_unresolved(
    $1, $2, '{"output_audio_tokens":1}'::jsonb, 'test_unresolved', $3)`, [ws, id, confirmed]);

try {
  await db.exec(await readFile(new URL('./fixtures/realtime-billing-before.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../migrations/20261027103455_realtime_billing_hardening.sql', import.meta.url), 'utf8'));
  await db.query('insert into public.workspaces (id) values ($1)', [ws]);
  await db.query('insert into public.keys (id, workspace_id) values ($1, $3), ($2, $3)', [keyA, keyB, ws]);
  await db.query(`insert into public.users (user_id, role) values ($1, 'admin')`, [admin]);
  await db.query('insert into public.wallets (workspace_id) values ($1)', [ws]);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(settle('rt_missing', 0), /permission denied/);
    await db.exec('reset role');
  }

  // 1. Cost above holds and free balance settles with debt instead of failing.
  let id = await seed({ balance: usd(5), hold: usd(5) });
  let result = await settle(id, usd(5.6));
  assert.equal(result.applied, true);
  assert.equal(result.status, 'completed');
  assert.equal(num(result.captured_nanos), usd(5.6));
  assert.equal(num(result.debt_nanos), usd(0.6));
  assert.equal(num(result.uncollected_nanos), 0);
  assert.deepEqual(await wallet(), { balance: usd(-0.6), reserved: 0 });
  let row = await session(id);
  assert.equal(num(row.debt_nanos), usd(0.6));
  assert.equal(num(row.final_cost_nanos), usd(5.6));
  assert.equal(num((await one('select cost_nanos from public.gateway_requests where realtime_session_id = $1', [id])).cost_nanos), usd(5.6));
  assert.equal(num((await one(`select amount_nanos from public.credit_ledger where ref_id = $1`, [id])).amount_nanos), -usd(5.6));
  // Replays are idempotent.
  result = await settle(id, usd(5.6));
  assert.equal(result.already_applied, true);
  assert.deepEqual(await wallet(), { balance: usd(-0.6), reserved: 0 });

  // 2. Beyond the $1 overdraft cap: capture up to the cap, record the rest, never retry.
  id = await seed({ balance: usd(5), hold: usd(5) });
  result = await settle(id, usd(7));
  assert.equal(result.applied, true);
  assert.equal(num(result.captured_nanos), usd(6));
  assert.equal(num(result.uncollected_nanos), usd(1));
  assert.deepEqual(await wallet(), { balance: usd(-1), reserved: 0 });
  row = await session(id);
  assert.equal(num(row.final_cost_nanos), usd(7));
  assert.equal(num(row.captured_nanos), usd(6));
  assert.equal(num(row.uncollected_nanos), usd(1));
  assert.equal(row.billing_anomaly, 'overdraft_cap_reached');
  // The request row reports the full priced cost, not just what was collected.
  assert.equal(num((await one('select cost_nanos from public.gateway_requests where realtime_session_id = $1', [id])).cost_nanos), usd(7));

  // 3. A wallet already in debt still captures its own hold, never more than the cap allows.
  id = await seed({ balance: usd(-0.8) + usd(0.5), hold: usd(0.5) });
  result = await settle(id, usd(1));
  assert.equal(num(result.captured_nanos), usd(0.7));
  assert.equal(num(result.uncollected_nanos), usd(0.3));
  assert.deepEqual(await wallet(), { balance: usd(-1), reserved: 0 });

  // 4. A reserved balance mismatch is clamped and recorded, not retried forever.
  id = await seed({ balance: usd(10), hold: usd(2), walletReserved: 0 });
  result = await settle(id, usd(1), { estimated: true, basis: 'interrupted_turn_metered_audio' });
  assert.equal(result.applied, true);
  assert.deepEqual(await wallet(), { balance: usd(9), reserved: 0 });
  row = await session(id);
  assert.equal(row.billing_anomaly, 'reserved_balance_mismatch');
  assert.equal(row.billing_estimated, true);
  assert.equal(row.estimate_basis, 'interrupted_turn_metered_audio');

  // 5. Marking unresolved captures the confirmed part; review blocks only that key;
  //    settling charges just the remainder, resolves the review and restores the key.
  id = await seed({ balance: usd(10), hold: usd(5) });
  await markUnresolved(id, usd(2));
  row = await session(id);
  assert.equal(row.status, 'billing_unresolved');
  assert.equal(num(row.captured_nanos), usd(2));
  assert.deepEqual(await wallet(), { balance: usd(8), reserved: usd(3) });
  assert.equal(num((await one(`select sum(amount_nanos) as held from public.gateway_wallet_reservations
    where hold_ref_id = $1 and status in ('held', 'reserved')`, [id])).held), usd(3));
  // Repeating the mark with the same confirmed cost does not capture again.
  await markUnresolved(id, usd(2));
  assert.deepEqual(await wallet(), { balance: usd(8), reserved: usd(3) });
  const review = await one('select * from public.gateway_realtime_billing_reviews where session_id = $1', [id]);
  assert.equal(review.key_id, keyA);
  assert.equal(review.access_blocked, true);
  await assert.rejects(seed({ balance: usd(8), hold: usd(1), walletReserved: usd(4), key: keyA }), /realtime_billing_review_required/);
  await db.query('update public.wallets set balance_nanos = $2, reserved_nanos = $3 where workspace_id = $1', [ws, usd(8), usd(3)]);
  const otherKey = await seed({ balance: usd(8), hold: usd(1), walletReserved: usd(4), key: keyB });
  assert.ok(otherKey, 'another key in the workspace is not blocked');
  await settle(otherKey, 0);
  assert.deepEqual(await wallet(), { balance: usd(8), reserved: usd(3) });
  result = await settle(id, usd(3));
  assert.equal(result.applied, true);
  assert.equal(num(result.captured_nanos), usd(3));
  assert.deepEqual(await wallet(), { balance: usd(7), reserved: 0 });
  assert.equal(num((await one(`select sum(amount_nanos) as total from public.credit_ledger where ref_id like $1`, [`${id}%`])).total), -usd(3));
  const resolved = await one('select status, access_blocked from public.gateway_realtime_billing_reviews where session_id = $1', [id]);
  assert.deepEqual(resolved, { status: 'resolved', access_blocked: false });
  assert.ok(await seed({ balance: usd(7), hold: usd(1), walletReserved: usd(1), key: keyA }), 'the key is usable again');

  // 6. A write-off keeps the confirmed capture; review capture is not capped by the holds.
  id = await seed({ balance: usd(10), hold: usd(1) });
  await markUnresolved(id, usd(0.5));
  let version = num((await one('select version from public.gateway_realtime_billing_reviews where session_id = $1', [id])).version);
  await one(`select public.gateway_realtime_review_decide($1, $2, gen_random_uuid(), $3, 'write_off', 'Customer goodwill write-off.') as r`,
    [id, admin, version]);
  row = await session(id);
  assert.equal(row.status, 'failed');
  assert.equal(num(row.captured_nanos), usd(0.5));
  assert.deepEqual(await wallet(), { balance: usd(9.5), reserved: 0 });

  id = await seed({ balance: usd(9.5), hold: usd(1) });
  await markUnresolved(id, 0);
  await db.query(`update public.gateway_realtime_billing_reviews r set confirmed_cost_nanos = $2, billable_usage = '{}'::jsonb,
    evidence_usage = s.usage, evidence_metadata = s.metadata from public.gateway_realtime_sessions s
    where r.session_id = s.session_id and r.session_id = $1`, [id, usd(1.5)]);
  version = num((await one('select version from public.gateway_realtime_billing_reviews where session_id = $1', [id])).version);
  await one(`select public.gateway_realtime_review_decide($1, $2, gen_random_uuid(), $3, 'capture_confirmed', 'Provider usage confirmed later.') as r`,
    [id, admin, version]);
  assert.equal(num((await session(id)).captured_nanos), usd(1.5));
  assert.deepEqual(await wallet(), { balance: usd(8), reserved: 0 });

  // 7. Stuck rows do not count towards the per-provider concurrency cap.
  await db.query(`insert into public.gateway_realtime_sessions (session_id, workspace_id, provider, model_id, status, reservation_prefix, created_at, expires_at)
    select 'rt_stuck_' || g, $1, 'spacex-ai', 'spacex-ai/voice', 'created', 'rt:stuck:' || g, now(), now() + interval '10 minutes'
    from generate_series(1, 20) g`, [ws]);
  await assert.rejects(db.query(`insert into public.gateway_realtime_sessions (session_id, workspace_id, provider, model_id, reservation_prefix)
    values ('rt_over_cap', $1, 'spacex-ai', 'spacex-ai/voice', 'rt:over:')`, [ws]), /realtime_provider_concurrency_limit/);
  await db.query(`update public.gateway_realtime_sessions set created_at = now() - interval '3 minutes' where session_id like 'rt_stuck_%'`);
  await db.query(`insert into public.gateway_realtime_sessions (session_id, workspace_id, provider, model_id, reservation_prefix)
    values ('rt_after_reap', $1, 'spacex-ai', 'spacex-ai/voice', 'rt:after:')`, [ws]);

  // 8. Hold extension works while connecting and an insufficient balance leaves the status alone.
  id = await seed({ balance: usd(8), hold: usd(1), walletReserved: usd(1), status: 'connecting' });
  await one(`select * from public.gateway_realtime_extend_hold_once_without_workspace_budget($1, $2, $3, $4, 0)`,
    [ws, id, `rt:${id}:0002`, usd(2)]);
  assert.equal(num((await session(id)).reserved_nanos), usd(2));
  await assert.rejects(one(`select * from public.gateway_realtime_extend_hold_once_without_workspace_budget($1, $2, $3, $4, 0)`,
    [ws, id, `rt:${id}:0003`, usd(100)]), /insufficient_funds/);
  assert.equal((await session(id)).status, 'connecting');

  console.log(JSON.stringify({ passed: true, checks: ['privileges', 'overdraft debt', 'overdraft cap', 'existing debt',
    'reserved mismatch clamp', 'estimated settlement', 'confirmed capture', 'per-key review block', 'auto unblock',
    'write-off keeps confirmed', 'uncapped review capture', 'stuck rows excluded from concurrency', 'connecting extension'] }));
} finally {
  await db.close();
}
