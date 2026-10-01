import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ws = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const usd = n => Math.round(n * 1e9);
let sequence = 0;
const charge = async (cost, snapshot, id = `test-${++sequence}`, workspace = ws) =>
  (await db.query('select public.gateway_charge_with_credit_cache($1,$2,$3,$4) as result', [workspace, id, cost, snapshot])).rows[0].result;
const seed = async (balance, reserved = 0) => {
  await db.exec('reset role');
  await db.query(`insert into public.wallets(workspace_id,balance_nanos,reserved_nanos) values ($1,$2,$3)
    on conflict(workspace_id) do update set balance_nanos=excluded.balance_nanos,reserved_nanos=excluded.reserved_nanos,auto_top_up_enabled=false`, [ws,balance,reserved]);
  await db.exec('set role service_role');
};
try {
  await db.exec(await readFile(new URL('./fixtures/credit-headroom-before.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL('../migrations/20260916144808_gateway_credit_cache_headroom.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(charge(1,usd(100)), /permission denied/);
    await db.exec('reset role');
  }
  await seed(usd(100_000));
  const high = await charge(usd(.001),usd(100_000),'retry');
  assert.equal(high.applied,true); assert.equal(high.invalidate_credit_cache,false,JSON.stringify(high));
  const replay = await charge(usd(.001),usd(100_000),'retry');
  assert.equal(replay.already_applied,true); assert.equal(replay.invalidate_credit_cache,true);
  assert.equal(Number((await db.query('select balance_nanos from public.wallets where workspace_id=$1',[ws])).rows[0].balance_nanos),usd(100_000)-usd(.001));
  await assert.rejects(charge(2,usd(100_000),'retry'), /request_charge_amount_mismatch/);

  // Independently queued requests all hold the same stale snapshot. PGlite
  // serializes execution: this tests cumulative decisions, not lock contention.
  await seed(usd(100));
  const results = await Promise.all(Array.from({length: 20}, () => charge(usd(1),usd(100))));
  assert.equal(results.filter(r=>!r.invalidate_credit_cache).length,9);
  assert.equal(results.filter(r=>r.invalidate_credit_cache).length,11);

  for (const [balance,reserved,snapshot,cost,invalidate] of [
    [9,0,9,.001,true], [10.001,0,10.001,.001,false], [10,0,10,.001,true],
    [100,0,100,9.999999999,false], [100,0,100,10,true],
    [100,20,100,.001,true], [100,20,80,.001,false],
    [100,0,null,.001,true], [100,0,-1,.001,true],
  ]) {
    await seed(usd(balance),usd(reserved));
    assert.equal((await charge(usd(cost),snapshot === null ? null : usd(snapshot))).invalidate_credit_cache,invalidate);
  }
  // Spending through another caller is detected against this request's old snapshot.
  await seed(usd(79));
  assert.equal((await charge(1,usd(100))).invalidate_credit_cache,true);
  // Holds cannot be consumed, even when the admitted snapshot was much higher.
  await seed(usd(100),usd(99));
  await assert.rejects(charge(usd(2),usd(100)), /insufficient_unreserved_balance/);
  assert.equal(Number((await db.query('select balance_nanos from public.wallets where workspace_id=$1',[ws])).rows[0].balance_nanos),usd(100));
  await seed(usd(100));
  await db.exec('reset role');
  await db.query('update public.wallets set auto_top_up_enabled=true,low_balance_threshold=$1,auto_top_up_amount=$2 where workspace_id=$3',[usd(200),usd(50),ws]);
  await db.exec('set role service_role');
  const topup = await charge(1,usd(100));
  assert.equal(topup.status,'top_up_required'); assert.equal(topup.invalidate_credit_cache,true);
  assert.equal(Number(topup.auto_top_up_amount_nanos),usd(50));
  const missing = await charge(1,usd(100),undefined,other);
  assert.equal(missing.invalidate_credit_cache,true);
  await db.exec('reset role');
  const invalidations = (await db.query('select count(*)::int as n from public.gateway_request_charges')).rows[0].n;
  console.log(JSON.stringify({passed:true,checks:['privileges','idempotency','cumulative spending','10 percent boundary','10 dollar boundary','reservations','external depletion','missing evidence','top-up','workspace isolation'],charges:invalidations,concurrency:'queued calls; no real lock-contention claim'}));
} finally { await db.close(); }
