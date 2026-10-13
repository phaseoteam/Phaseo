// Standalone PostgreSQL regression test. Install @electric-sql/pglite@0.5.8 in
// a temporary directory and set PGLITE_MODULE to its dist/index.js file URL.
// Run: node supabase/tests/workspace-recent-credit-spend.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const workspace = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.gateway_request_charges (
    workspace_id uuid not null, request_id text not null, cost_nanos bigint not null check (cost_nanos > 0),
    status text not null default 'applying', created_at timestamptz not null default now(),
    primary key (workspace_id, request_id)
  );
  insert into public.gateway_request_charges values
    ('${workspace}', 'recent-a', 1500, 'applied', '2026-10-12T10:00:00Z'),
    ('${workspace}', 'recent-b', 500, 'applied', '2026-10-07T00:00:00Z'),
    ('${workspace}', 'before-window', 9000, 'applied', '2026-10-05T23:59:59Z'),
    ('${workspace}', 'still-applying', 700, 'applying', '2026-10-12T11:00:00Z'),
    ('${workspace}', 'failed', 800, 'failed', '2026-10-12T12:00:00Z'),
    ('${other}', 'other-workspace', 4000, 'applied', '2026-10-12T10:00:00Z');
  grant select on public.gateway_request_charges to service_role;
`);
await db.exec(await readFile(new URL('../migrations/20261013120100_workspace_recent_credit_spend.sql', import.meta.url), 'utf8'));

const spend = async (workspaceId) => (await db.query(
  'select public.get_workspace_recent_credit_spend($1, $2) as nanos', [workspaceId, '2026-10-06T00:00:00Z'],
)).rows[0].nanos;
await db.exec('set role service_role');
assert.equal(Number(await spend(workspace)), 2000, 'sums applied charges since p_since only');
assert.equal(Number(await spend('00000000-0000-0000-0000-000000000003')), 0, 'a workspace without charges spends 0');
await db.exec('reset role');

const privileges = (await db.query(`select
  has_function_privilege('anon', 'public.get_workspace_recent_credit_spend(uuid,timestamptz)', 'execute') as anon,
  has_function_privilege('authenticated', 'public.get_workspace_recent_credit_spend(uuid,timestamptz)', 'execute') as authenticated,
  has_function_privilege('service_role', 'public.get_workspace_recent_credit_spend(uuid,timestamptz)', 'execute') as service_role`)).rows[0];
assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: true }, 'service role only');
await db.close();
console.log('Passed: applied charges in the window, empty workspaces and service-role-only grants.');
