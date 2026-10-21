// Standalone PostgreSQL regression test for spend attribution: the actor on the 15-minute
// usage rollup, the migration's backfill, department_spend_attribution, and the department
// helpers spend rules read. Install @electric-sql/pglite@0.5.8 in a temporary directory and
// set PGLITE_MODULE to its dist/index.js file URL.
// Run: node supabase/tests/spend-attribution.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261021100616_spend_attribution.sql');
const section = (from, to) => {
  const start = migration.indexOf(from);
  const end = migration.indexOf(to, start + 1);
  assert(start >= 0 && end > start, `migration section ${from}`);
  return migration.slice(start, end);
};

const ws = '00000000-0000-0000-0000-00000000aaaa';
const other = '00000000-0000-0000-0000-00000000bbbb';
const user = Object.fromEntries(['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'gina', 'hugo'].map((name, i) => [name, `00000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}`]));
const key = {
  alice: '00000000-0000-0000-0000-0000000002a1', // standard, no department; alice is in D1 (primary) and D2
  bob: '00000000-0000-0000-0000-0000000002b1', // standard, explicitly in D3
  carol: '00000000-0000-0000-0000-0000000002c1', // OAuth-delegated with a department set: the user wins
  frank: '00000000-0000-0000-0000-0000000002f1', // standard, no department; frank is in none
  gina: '00000000-0000-0000-0000-0000000002e1', // standard, no department; gina has an override to D3
  hugo: '00000000-0000-0000-0000-0000000002d1', // standard, no department; hugo's override has no department
};
const dept = { D1: '00000000-0000-0000-0000-0000000003d1', D2: '00000000-0000-0000-0000-0000000003d2', D3: '00000000-0000-0000-0000-0000000003d3' };
const hour = '2026-10-20 10:00:00+00';

const db = new PGlite();
await db.exec(await read('./fixtures/staged-reporting-before.sql'));
await db.exec("set timezone = 'UTC';");
await db.exec(await read('../migrations/20261009114400_exclude_staged_models_from_public_reporting.sql'));
await db.exec(`
  create table public.keys (id uuid primary key, workspace_id uuid not null, created_by uuid not null,
    oauth_user_id uuid, key_kind text not null default 'standard', department_id uuid);
  create table public.workspace_settings (workspace_id uuid primary key);
  create table public.workspace_department_grants (workspace_id uuid not null, user_id uuid not null, department_id uuid not null,
    source_type text not null, source_id uuid not null, is_primary boolean not null default false, created_at timestamptz not null default now(),
    primary key (workspace_id, user_id, department_id, source_type, source_id));
  create table public.workspace_member_overrides (workspace_id uuid not null, user_id uuid not null,
    department_override_enabled boolean not null default false, department_id uuid, primary key (workspace_id, user_id));
`);
// The workspace_settings part of the migration, on the columns it touches.
await db.exec(section('ALTER TABLE "public"."workspace_settings"', 'ALTER TABLE "public"."v2_private_usage_15m"'));
// Workspaces have no identity table here.
const stripFk = (sql, table) => sql.replace(new RegExp(`,\\r?\\n  CONSTRAINT "${table}_workspace_id_fkey"[^\\r\\n]*`), '');
const tableSql = stripFk(await read('../schemas/public/tables/v2_private_usage_15m.sql'), 'v2_private_usage_15m');
// The table as it was before this migration: no actor, the old unique grain.
const oldTableSql = tableSql
  .replace(/,\r?\n  "actor_user_id"\s+uuid/, '')
  .replace(', byok, actor_user_id) NULLS NOT DISTINCT', ', byok) NULLS NOT DISTINCT')
  .replace(/COMMENT ON COLUMN "public"."v2_private_usage_15m"."actor_user_id"[^\r\n]*/, '');
assert(!oldTableSql.includes('actor_user_id'));
await db.exec(oldTableSql);
await db.exec(stripFk(await read('../schemas/public/tables/v2_private_usage_labels_15m.sql'), 'v2_private_usage_labels_15m'));

await db.exec(`
  insert into public.keys values
    ('${key.alice}', '${ws}', '${user.alice}', null, 'standard', null),
    ('${key.bob}', '${ws}', '${user.bob}', null, 'standard', '${dept.D3}'),
    ('${key.carol}', '${ws}', '${user.carol}', '${user.carol}', 'oauth_delegated', '${dept.D3}'),
    ('${key.frank}', '${ws}', '${user.frank}', null, 'standard', null),
    ('${key.gina}', '${ws}', '${user.gina}', null, 'standard', null),
    ('${key.hugo}', '${ws}', '${user.hugo}', null, 'standard', null);
`);

// ---- Backfill: old rows get the key's actor for the current and previous month only.
await db.exec(`
  insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, key_id, requests, cost_nanos) values
    ('${ws}', date_trunc('month', now(), 'UTC') + interval '15 minutes', 'model-a', '${key.alice}', 1, 10),
    ('${ws}', date_trunc('month', now() - interval '1 month', 'UTC'), 'model-a', '${key.carol}', 1, 20),
    ('${ws}', date_trunc('month', now() - interval '1 month', 'UTC') - interval '15 minutes', 'model-a', '${key.alice}', 1, 40),
    ('${ws}', date_trunc('month', now(), 'UTC'), 'model-a', null, 1, 80);
`);
await db.exec(section('ALTER TABLE "public"."v2_private_usage_15m"', '-- Appends actor_user_id'));
const backfilled = (await db.query(`select cost_nanos::int cost, actor_user_id actor from public.v2_private_usage_15m order by cost_nanos`)).rows;
assert.deepEqual(backfilled, [
  { cost: 10, actor: user.alice },
  { cost: 20, actor: user.carol },
  { cost: 40, actor: null },
  { cost: 80, actor: null },
], 'the backfill reaches back to the start of last month, uses the OAuth user of delegated keys, and leaves key-less rows alone');
const index = (await db.query(`select indexdef from pg_indexes where indexname = 'v2_private_usage_15m_key'`)).rows[0].indexdef;
assert.match(index, /byok, actor_user_id\) NULLS NOT DISTINCT/, 'the actor is part of the unique key');
await db.exec('truncate public.v2_private_usage_15m');

// ---- The rest of the migration: view, processor and helpers, as the schema files define them.
await db.exec(migration.slice(migration.indexOf('-- Appends actor_user_id')));
await db.exec(await read('../schemas/public/functions/get_private_usage_overview.sql'));
for (const name of ['private/views/v2_usage_overview_requests', 'public/functions/process_v2_analytics_outbox', 'private/functions/spend_scope_departments', 'private/functions/spend_department_totals']) {
  const file = (await read(`../schemas/${name}.sql`)).replace(/^CREATE VIEW/, 'CREATE OR REPLACE VIEW').trim();
  assert(migration.includes(file), `the migration ships ${name} exactly`);
}
for (const text of [tableSql.match(/CREATE UNIQUE INDEX[^;]*;/)[0], tableSql.match(/COMMENT ON TABLE[^\r\n]*/)[0], tableSql.match(/COMMENT ON COLUMN[^\r\n]*/)[0]]) {
  assert(migration.includes(text), 'the migration matches the table definition');
}

// ---- Requests: one workspace hour, every kind of actor.
await db.exec(`
  insert into v2_models(model_slug, hidden, status) values ('model-a', false, 'active');
  insert into v2_model_provider_routes(provider_model_id, model_slug, provider_slug, access_scope, phaseo_status, routing_enabled, status, is_stealth, provider_availability_status)
    values ('route-a', 'model-a', 'provider', 'public', 'enabled', true, 'active', false, 'available');
  -- OAuth tokens carry no key; the gateway request records the user.
  insert into public.gateway_requests (id, created_at, workspace_id, request_id, oauth_user_id, auth_method, endpoint, success, cost_nanos, key_id)
  select md5('gr' || i)::uuid, timestamptz '${hour}' + make_interval(secs => i * 7), '${ws}', 'r' || i,
    case when i % 9 = 7 then '${user.dave}'::uuid when i % 9 = 8 then '${user.erin}'::uuid end,
    case when i % 9 in (7, 8) then 'oauth' else 'api_key' end, 'chat.completions', true, i, null
  from generate_series(0, 449) i;
  insert into v2_request_facts (request_event_id, workspace_id, request_id, occurred_at, key_id, routed_model_slug, provider_model_id,
    success, status_code, cost_nanos, auth_method, gateway_request_id, gateway_request_created_at, public_reporting_allowed, safe_metadata)
  select md5('f' || i)::uuid, '${ws}', 'r' || i, timestamptz '${hour}' + make_interval(secs => i * 7),
    (array['${key.alice}', '${key.bob}', '${key.carol}', '${key.frank}', '${key.gina}', '${key.hugo}', null, null, null]::uuid[])[i % 9 + 1],
    'model-a', 'route-a', i % 10 <> 0, 200, i, case when i % 9 in (7, 8) then 'oauth' else 'api_key' end,
    md5('gr' || i)::uuid, timestamptz '${hour}' + make_interval(secs => i * 7), true,
    case when i % 2 = 0 then '{"labels":[{"key":"team","value":"search"}]}'::jsonb else '{}'::jsonb end
  from generate_series(0, 449) i;
  -- Another workspace, same hour.
  insert into v2_request_facts (request_event_id, workspace_id, request_id, occurred_at, routed_model_slug, provider_model_id, success, cost_nanos, public_reporting_allowed)
  select md5('o' || i)::uuid, '${other}', 'o' || i, timestamptz '${hour}' + make_interval(secs => i * 11), 'model-a', 'route-a', true, 3, true
  from generate_series(0, 99) i;
  insert into v2_analytics_outbox (request_event_id, workspace_id, occurred_at, status, available_at, updated_at)
  select request_event_id, workspace_id, occurred_at, 'pending', now(), now() from v2_request_facts;
`);
const started = performance.now();
let runs = 0;
while ((await db.query('select process_v2_analytics_outbox(250) result')).rows[0].result.selected) runs++;
const rebuildMs = performance.now() - started;

// The rollup keeps each actor apart and sums exactly to the requests.
const byActor = (await db.query(`select actor_user_id actor, key_id, sum(requests)::int requests, sum(cost_nanos)::int cost
  from public.v2_private_usage_15m where workspace_id = '${ws}' group by 1, 2 order by 1 nulls last, 2`)).rows;
const expectedByActor = (await db.query(`select coalesce(g.oauth_user_id, k.oauth_user_id, k.created_by) actor, f.key_id,
    count(*)::int requests, sum(f.cost_nanos)::int cost
  from v2_request_facts f left join public.keys k on k.id = f.key_id
  left join public.gateway_requests g on g.id = f.gateway_request_id and f.auth_method = 'oauth'
  where f.workspace_id = '${ws}' group by 1, 2 order by 1 nulls last, 2`)).rows;
assert.deepEqual(byActor, expectedByActor, 'the rollup attributes each request to its key creator or OAuth user');
const actorOf = Object.fromEntries(byActor.map((row) => [row.key_id ?? `oauth:${row.actor}`, row.actor]));
assert.equal(actorOf[key.alice], user.alice, 'a key request belongs to the key creator');
assert.equal(actorOf[key.carol], user.carol, 'an OAuth-delegated key belongs to its user');
assert.equal(actorOf[`oauth:${user.dave}`], user.dave, 'an OAuth token request belongs to the OAuth user');
assert.equal(actorOf[`oauth:${user.erin}`], user.erin);
assert.equal(byActor.some((row) => row.actor === null && row.key_id === null), true, 'a request with no key and no OAuth user has no actor');
const rollupRows = Number((await db.query(`select count(*) n from public.v2_private_usage_15m where workspace_id = '${ws}'`)).rows[0].n);
const oldGrainRows = Number((await db.query(`select count(*) n from (select distinct bucket_start, model_id, provider_model_id, key_id, app_id, byok
  from public.v2_private_usage_15m where workspace_id = '${ws}') grains`)).rows[0].n);
assert.equal(rollupRows - oldGrainRows, 4 * 2, 'only key-less rows split, by OAuth user: two extra per quarter hour');

// The overview's totals are those of the requests, with one cell per key as before.
const cells = (await db.query(`select public.get_private_usage_overview('${ws}', '${hour}', timestamptz '${hour}' + interval '1 hour' - interval '1 microsecond') cells`)).rows[0].cells;
const facts = (await db.query(`select count(*)::int requests, sum(cost_nanos)::int cost, count(distinct key_id)::int + 1 cells from v2_request_facts where workspace_id = '${ws}'`)).rows[0];
assert.equal(cells.reduce((sum, cell) => sum + cell.requests, 0), facts.requests, 'overview requests are unchanged');
assert.equal(cells.reduce((sum, cell) => sum + cell.costNanos, 0), facts.cost, 'overview spend is unchanged');
assert.equal(cells.length, facts.cells, 'OAuth users share the key-less cell, as before');
const hourly = (await db.query(`select public.get_private_usage_overview('${ws}', '${hour}', timestamptz '${hour}' + interval '1 hour' - interval '1 microsecond', 'hour') cells`)).rows[0].cells;
assert.equal(hourly.length, facts.cells, 'hourly cells are unchanged');
const labels = Number((await db.query(`select sum(requests) n from public.v2_private_usage_labels_15m where workspace_id = '${ws}'`)).rows[0].n);
assert.equal(labels, 225, 'the label rollup is unchanged');

// ---- Departments.
await db.exec(`
  insert into public.workspace_department_grants (workspace_id, user_id, department_id, source_type, source_id, is_primary, created_at) values
    ('${ws}', '${user.alice}', '${dept.D1}', 'manual', '${dept.D1}', true, '2026-01-02'),
    ('${ws}', '${user.alice}', '${dept.D2}', 'scim_group', '${dept.D2}', false, '2026-01-01'),
    ('${ws}', '${user.bob}', '${dept.D1}', 'manual', '${dept.D1}', false, '2026-01-01'),
    ('${ws}', '${user.carol}', '${dept.D1}', 'manual', '${dept.D1}', false, '2026-01-01'),
    ('${ws}', '${user.dave}', '${dept.D2}', 'manual', '${dept.D2}', false, '2026-01-01'),
    ('${ws}', '${user.erin}', '${dept.D2}', 'scim_group', '${dept.D2}', false, '2026-01-01'),
    ('${ws}', '${user.erin}', '${dept.D3}', 'manual', '${dept.D3}', false, '2026-02-01'),
    ('${ws}', '${user.gina}', '${dept.D1}', 'manual', '${dept.D1}', true, '2026-01-01'),
    ('${ws}', '${user.hugo}', '${dept.D1}', 'manual', '${dept.D1}', true, '2026-01-01'),
    -- Another workspace's grant never counts here.
    ('${other}', '${user.frank}', '${dept.D2}', 'manual', '${dept.D2}', true, '2026-01-01');
  insert into public.workspace_member_overrides values
    ('${ws}', '${user.gina}', true, '${dept.D3}'),
    ('${ws}', '${user.hugo}', true, null),
    -- A disabled override changes nothing.
    ('${ws}', '${user.alice}', false, null);
`);
const departments = async (keyId, actor, workspaceId = ws) => (await db.query(
  'select coalesce(array_agg(d order by d), array[]::uuid[]) ids from private.spend_scope_departments($1, $2, $3) d',
  [workspaceId, keyId, actor],
)).rows[0].ids;
const sorted = (...ids) => ids.sort();
const cases = () => [
  ['a key with its own department', key.bob, user.bob],
  ['a creator in two departments', key.alice, user.alice],
  ['an OAuth-delegated key uses the user, not its department', key.carol, user.carol],
  ['an OAuth token', null, user.dave],
  ['an OAuth user in two departments, none primary', null, user.erin],
  ['a key whose creator is in no department', key.frank, user.frank],
  ['an override department replaces the directory ones', key.gina, user.gina],
  ['an override with no department means none', key.hugo, user.hugo],
  ['no key and no actor', null, null],
];
const all = [sorted(dept.D3), sorted(dept.D1, dept.D2), [dept.D1], [dept.D2], sorted(dept.D2, dept.D3), [], [dept.D3], [], []];
for (const [i, [name, keyId, actor]] of cases().entries()) assert.deepEqual(await departments(keyId, actor), all[i], `all: ${name}`);
assert.deepEqual(await departments(key.bob, user.bob, other), [], 'a key from another workspace has no explicit department here');

await db.exec(`insert into public.workspace_settings (workspace_id, department_spend_attribution) values ('${ws}', 'primary')`);
// Primary only: alice's primary grant; erin has none marked, so the entitlement order picks
// the manual grant (D3) over the SCIM one.
const primary = [[dept.D3], [dept.D1], [dept.D1], [dept.D2], [dept.D3], [], [dept.D3], [], []];
for (const [i, [name, keyId, actor]] of cases().entries()) assert.deepEqual(await departments(keyId, actor), primary[i], `primary: ${name}`);
await assert.rejects(db.exec(`update public.workspace_settings set department_spend_attribution = 'some'`), /department_spend_attribution_check/, 'only all or primary');

// ---- Totals per department in one query, from the rollup plus async jobs.
await db.exec(`
  insert into public.gateway_requests (id, created_at, workspace_id, request_id, endpoint, success, cost_nanos, key_id)
  values (md5('video')::uuid, timestamptz '${hour}' + interval '5 minutes', '${ws}', 'video', 'video.generation', true, 1000000, '${key.alice}'),
    (md5('video-failed')::uuid, timestamptz '${hour}' + interval '6 minutes', '${ws}', 'video-failed', 'video.generation', false, 5000000, '${key.alice}');
`);
const totals = async () => Object.fromEntries((await db.query(
  `select department_id, cost_nanos::bigint::text cost, requests::int from private.spend_department_totals('${ws}', '${hour}', timestamptz '${hour}' + interval '1 hour')`,
)).rows.map((row) => [row.department_id, { cost: Number(row.cost), requests: row.requests }]));
const expectedTotals = async () => {
  const pairs = (await db.query(`select key_id, actor_user_id, sum(cost_nanos)::bigint::text cost, sum(requests)::int requests
    from public.v2_private_usage_15m where workspace_id = '${ws}' group by 1, 2`)).rows;
  pairs.push({ key_id: key.alice, actor_user_id: user.alice, cost: '1000000', requests: 1 });
  const result = {};
  for (const pair of pairs) {
    for (const id of await departments(pair.key_id, pair.actor_user_id)) {
      result[id] ??= { cost: 0, requests: 0 };
      result[id].cost += Number(pair.cost); result[id].requests += pair.requests;
    }
  }
  return result;
};
const primaryTotals = await totals();
assert.deepEqual(primaryTotals, await expectedTotals(), 'primary: department totals match the helper pair by pair');
await db.exec(`update public.workspace_settings set department_spend_attribution = 'all'`);
const allTotals = await totals();
assert.deepEqual(allTotals, await expectedTotals(), 'all: department totals match the helper pair by pair');
const sum = (rows) => Object.values(rows).reduce((total, row) => total + row.cost, 0);
assert(sum(allTotals) > sum(primaryTotals), 'counting every department counts people in two departments twice');
assert.equal(allTotals[dept.D1].cost >= 1000000, true, 'successful async jobs count; failed ones do not');

// The helpers are internal; only the jobs and postgres call them.
const privileges = (await db.query(`select
  has_function_privilege('authenticated', 'private.spend_scope_departments(uuid,uuid,uuid)', 'execute') scope_authenticated,
  has_function_privilege('anon', 'private.spend_department_totals(uuid,timestamptz,timestamptz)', 'execute') totals_anon,
  has_function_privilege('service_role', 'private.spend_department_totals(uuid,timestamptz,timestamptz)', 'execute') totals_service_role`)).rows[0];
assert.deepEqual(privileges, { scope_authenticated: false, totals_anon: false, totals_service_role: true });

const timing = [];
for (let i = 0; i < 20; i++) {
  const t = performance.now();
  await db.query(`select * from private.spend_department_totals('${ws}', '${hour}', timestamptz '${hour}' + interval '1 hour')`);
  timing.push(performance.now() - t);
}
timing.sort((a, b) => a - b);
await db.close();
console.log(`rollup rebuild of 550 requests in ${runs} runs: ${rebuildMs.toFixed(1)} ms; ${rollupRows} rollup rows (${oldGrainRows} without the actor); department totals median ${timing[10].toFixed(2)} ms`);
console.log('Passed: actor on the rollup and its backfill, unchanged overview and label totals, department rule (explicit, several, primary, OAuth, delegated, override, none), per-department totals, setting check, grants.');
