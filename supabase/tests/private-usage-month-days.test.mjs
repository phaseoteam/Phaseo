// Standalone PostgreSQL regression test. Install @electric-sql/pglite@0.5.8 in
// a temporary directory and set PGLITE_MODULE to its dist/index.js file URL.
// Run: node supabase/tests/private-usage-month-days.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const workspace = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.v2_private_usage_daily (
    rollup_id uuid primary key, usage_date date not null, workspace_id uuid not null,
    requests bigint not null default 0, successful_requests bigint not null default 0,
    cached_input_tokens numeric(30,12) not null default 0, cost_nanos numeric(30,0) not null default 0
  );
  create table public.v2_private_usage_daily_meters (
    rollup_id uuid references public.v2_private_usage_daily, meter_key text, modality text default 'text',
    unit text default 'token', quantity numeric(30,12), primary key (rollup_id, meter_key, modality, unit)
  );
  insert into public.v2_private_usage_daily values
    ('00000000-0000-0000-0000-00000000000a', '2026-09-30', '${workspace}', 2, 2, 0, 1000),
    ('00000000-0000-0000-0000-00000000000b', '2026-10-01', '${workspace}', 3, 2, 10, 2500),
    ('00000000-0000-0000-0000-00000000000c', '2026-10-01', '${workspace}', 1, 1, 5, 500),
    ('00000000-0000-0000-0000-00000000000d', '2026-10-02', '${workspace}', 4, 4, 0, 0),
    ('00000000-0000-0000-0000-00000000000e', '2026-10-01', '${other}', 99, 99, 99, 99),
    ('00000000-0000-0000-0000-00000000000f', '2026-08-31', '${workspace}', 7, 7, 0, 7);
  insert into public.v2_private_usage_daily_meters (rollup_id, meter_key, quantity) values
    -- Reported totals win when larger than input plus output...
    ('00000000-0000-0000-0000-00000000000b', 'total_tokens', 900),
    ('00000000-0000-0000-0000-00000000000b', 'input_tokens', 600),
    ('00000000-0000-0000-0000-00000000000b', 'output_tokens', 200),
    -- ...and input plus output wins when the total covers fewer requests.
    ('00000000-0000-0000-0000-00000000000c', 'total_tokens', 50),
    ('00000000-0000-0000-0000-00000000000c', 'input_tokens', 70),
    ('00000000-0000-0000-0000-00000000000c', 'output_tokens', 30),
    -- Modality meters duplicate the totals and must not be added again.
    ('00000000-0000-0000-0000-00000000000c', 'input_text_tokens', 70),
    ('00000000-0000-0000-0000-00000000000a', 'input_tokens', 40),
    ('00000000-0000-0000-0000-00000000000e', 'total_tokens', 9999);
  grant select on public.v2_private_usage_daily, public.v2_private_usage_daily_meters to authenticated, service_role;
  alter table public.v2_private_usage_daily enable row level security;
  create policy workspace_read on public.v2_private_usage_daily to authenticated
    using (workspace_id = current_setting('test.workspace')::uuid);
  alter table public.v2_private_usage_daily_meters enable row level security;
  create policy workspace_read on public.v2_private_usage_daily_meters to authenticated using (exists (
    select 1 from public.v2_private_usage_daily d where d.rollup_id = v2_private_usage_daily_meters.rollup_id
  ));
`);
await db.exec(await readFile(new URL('../migrations/20261013150000_private_usage_month_days.sql', import.meta.url), 'utf8'));

await db.exec(`set role authenticated; set test.workspace = '${workspace}';`);
const days = (await db.query('select public.get_private_usage_month_days($1, $2) as days', [workspace, '2026-09-01'])).rows[0].days;
assert.deepEqual(days, [
  { date: '2026-09-30', costNanos: 1000, requests: 2, successfulRequests: 2, tokens: 40, cachedTokens: 0 },
  { date: '2026-10-01', costNanos: 3000, requests: 4, successfulRequests: 3, tokens: 1000, cachedTokens: 15 },
  { date: '2026-10-02', costNanos: 0, requests: 4, successfulRequests: 4, tokens: 0, cachedTokens: 0 },
], 'sums rollups per day from p_from, with tokens counted once per rollup');

const otherDays = (await db.query('select public.get_private_usage_month_days($1, $2) as days', [other, '2026-09-01'])).rows[0].days;
assert.deepEqual(otherDays, [], 'row level security hides another workspace');
await db.exec('reset role');

const privileges = (await db.query(`select
  has_function_privilege('anon', 'public.get_private_usage_month_days(uuid,date)', 'execute') as anon,
  has_function_privilege('authenticated', 'public.get_private_usage_month_days(uuid,date)', 'execute') as authenticated`)).rows[0];
assert.deepEqual(privileges, { anon: false, authenticated: true });
await db.close();
console.log('Passed: daily sums from p_from, token counting, workspace isolation and grants.');
