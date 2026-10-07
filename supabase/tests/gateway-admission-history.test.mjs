import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const workspace = '10000000-0000-4000-8000-000000000001';
const key = '20000000-0000-4000-8000-000000000001';
const access = async (name = 'private.gateway_context_access') => (await db.query(
  `select ${name}($1,$2,$3,$4) as payload`,
  [workspace, 'lab/model', 'responses', key],
)).rows[0].payload;
try {
  await db.exec(await read('./fixtures/context-bundle-before.sql'));
  await db.exec('alter table public.byok_keys add column name text');
  await db.exec(await read('../migrations/20260916121303_gateway_context_bundle.sql'));
  await db.exec(await read('../schemas/private/functions/gateway_context_access.sql'));
  await db.exec(await read('../schemas/private/functions/gateway_compiled_context_access.sql'));
  await db.exec(await read('../schemas/public/functions/gateway_fetch_request_context_without_workspace_budget.sql'));
  await db.exec(`
    insert into public.workspaces(id,billing_mode,created_at) values ('${workspace}','wallet',now());
    insert into public.keys(id,workspace_id,status,soft_blocked,created_at) values ('${key}','${workspace}','active',false,now());
    insert into public.wallets(workspace_id,balance_nanos,reserved_nanos) values ('${workspace}',5000000000,2000000000);
    alter table public.gateway_requests rename to unavailable_history;
    set role service_role;
  `);
  // A missing history table makes any accidental admission scan fail loudly.
  const unlimited = await access();
  assert.equal(unlimited.key_limit_ok.ok, true);
  assert.equal(unlimited.credit_ok.available_nanos, 3000000000);
  assert.equal(unlimited.team_enrichment.total_requests, null);
  assert.equal(unlimited.key_enrichment.total_requests, null);
  assert.equal(unlimited.key_enrichment.requests_today, null);
  const legacyUnlimited = await access('public.gateway_fetch_request_context_without_workspace_budget');
  assert.equal(legacyUnlimited.key_limit_ok.ok, true);
  assert.equal(legacyUnlimited.team_enrichment.total_requests, null);
  const compiledUnlimited = await access('private.gateway_compiled_context_access');
  assert.equal(compiledUnlimited.key_limit_ok.ok, true);
  assert.equal(compiledUnlimited.team_enrichment.total_requests, null);
  await db.exec('reset role');
  await db.query('update public.wallets set balance_nanos=100000000 where workspace_id=$1', [workspace]);
  await db.exec('set role service_role');
  assert.equal((await access()).credit_ok.reason, 'insufficient_funds');
  assert.equal((await access('public.gateway_fetch_request_context_without_workspace_budget')).credit_ok.reason, 'insufficient_funds');
  await db.exec('reset role');
  await db.query('update public.wallets set balance_nanos=5000000000 where workspace_id=$1', [workspace]);
  await db.exec('set role service_role');
  await assert.rejects(db.query('select private.gateway_context_access($1,$2,$3,$4)',
    ['10000000-0000-4000-8000-000000000002','lab/model','responses',key]), /api_key_wrong_team/);
  await db.exec('reset role');
  await db.query("update public.keys set daily_limit_requests=1 where id=$1", [key]);
  await db.exec('set role service_role');
  await assert.rejects(access(), /gateway_requests.*does not exist/);
  await db.exec('reset role; alter table public.unavailable_history rename to gateway_requests');
  await db.query('insert into public.gateway_requests(workspace_id,key_id,created_at,success,cost_nanos) values ($1,$2,now(),false,999),($1,$2,now(),true,10)', [workspace,key]);
  await db.exec('set role service_role');
  const limited = await access();
  assert.equal(limited.key_limit_ok.reason, 'daily_request_limit_reached');
  assert.equal(limited.key_limit_ok.buckets.daily.requests_used, 1);
  assert.equal(limited.key_limit_ok.buckets.daily.cost_used_nanos, 10);
  assert.equal(limited.key_enrichment.requests_today, 1);
  assert.equal((await access('public.gateway_fetch_request_context_without_workspace_budget')).key_limit_ok.reason, 'daily_request_limit_reached');
  for (const [column,reason] of [
    ['weekly_limit_requests','weekly_request_limit_reached'],
    ['monthly_limit_requests','monthly_request_limit_reached'],
    ['daily_limit_cost_nanos','daily_cost_limit_reached'],
    ['weekly_limit_cost_nanos','weekly_cost_limit_reached'],
    ['monthly_limit_cost_nanos','monthly_cost_limit_reached'],
  ]) {
    await db.exec('reset role');
    await db.query(`update public.keys set daily_limit_requests=0,weekly_limit_requests=0,monthly_limit_requests=0,
      daily_limit_cost_nanos=0,weekly_limit_cost_nanos=0,monthly_limit_cost_nanos=0 where id=$1`, [key]);
    await db.query(`update public.keys set ${column}=1 where id=$1`, [key]);
    await db.exec('set role service_role');
    assert.equal((await access()).key_limit_ok.reason, reason);
    assert.equal((await access('public.gateway_fetch_request_context_without_workspace_budget')).key_limit_ok.reason, reason);
    assert.equal((await access('private.gateway_compiled_context_access')).key_limit_ok.reason, reason);
  }
  await db.exec('reset role');
  await db.query('update public.keys set soft_blocked=true where id=$1', [key]);
  await db.exec('set role service_role');
  assert.equal((await access()).key_limit_ok.reason, 'key_limit_soft_blocked');
  await db.exec('reset role');
  await db.query("update public.keys set status='disabled' where id=$1", [key]);
  await db.exec('set role service_role');
  await assert.rejects(access(), /api_key_inactive/);
  for (const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(access(), /permission denied/);
  }
  console.log('Gateway admission: unlimited keys avoid history; configured request/cost limits, wallet reservations, soft blocks and tenant isolation pass.');
} finally { await db.close(); }
