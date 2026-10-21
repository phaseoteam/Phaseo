// Standalone PostgreSQL regression test. Install @electric-sql/pglite@0.5.8 in
// a temporary directory and set PGLITE_MODULE to its dist/index.js file URL.
// Run: node supabase/tests/workspace-credit-ledger-net.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const workspace = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.credit_ledger (
    id uuid primary key default gen_random_uuid(), workspace_id uuid not null, kind text not null,
    amount_nanos bigint not null, created_at timestamptz not null default now()
  );
  insert into public.credit_ledger (workspace_id, kind, amount_nanos, created_at) values
    -- A top-up and two charges inside the window...
    ('${workspace}', 'top_up', 50000, '2026-10-12T09:00:00Z'),
    ('${workspace}', 'charge', -3000, '2026-10-11T00:00:00Z'),
    ('${workspace}', 'charge', -250, '2026-09-21T00:00:00Z'),
    -- ...but not a row before the window or another workspace's rows.
    ('${workspace}', 'charge', -6000, '2026-09-20T23:59:59Z'),
    ('${other}', 'charge', -7000, '2026-10-12T09:00:00Z');
  -- More rows than PostgREST returns in one page, to show the sum is not truncated.
  insert into public.credit_ledger (workspace_id, kind, amount_nanos, created_at)
    select '${workspace}', 'charge', -1, timestamptz '2026-10-01T00:00:00Z' + make_interval(secs => n)
    from generate_series(1, 1500) as n;
  grant select on public.credit_ledger to service_role;
`);
await db.exec(await readFile(new URL('../migrations/20261021062644_workspace_credit_ledger_net.sql', import.meta.url), 'utf8'));

const net = async (workspaceId) => (await db.query(
  'select public.get_workspace_credit_ledger_net($1, $2) as nanos', [workspaceId, '2026-09-21T00:00:00Z'],
)).rows[0].nanos;
await db.exec('set role service_role');
assert.equal(Number(await net(workspace)), 50000 - 3000 - 250 - 1500, 'sums every signed ledger row since p_since, past 1,000 rows');
assert.equal(Number(await net(other)), -7000, 'sums only the requested workspace');
assert.equal(Number(await net('00000000-0000-0000-0000-000000000003')), 0, 'a workspace without ledger rows reports 0, not null');
await db.exec('reset role');

const privileges = (await db.query(`select
  has_function_privilege('anon', 'public.get_workspace_credit_ledger_net(uuid,timestamptz)', 'execute') as anon,
  has_function_privilege('authenticated', 'public.get_workspace_credit_ledger_net(uuid,timestamptz)', 'execute') as authenticated,
  has_function_privilege('service_role', 'public.get_workspace_credit_ledger_net(uuid,timestamptz)', 'execute') as service_role`)).rows[0];
assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: true }, 'service role only');
await db.close();
console.log('Passed: signed ledger rows in the window beyond 1,000 rows, workspace isolation, empty workspaces and service-role-only grants.');
