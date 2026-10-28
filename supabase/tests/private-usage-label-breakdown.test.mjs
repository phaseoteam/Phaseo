// Standalone PostgreSQL regression test. Install @electric-sql/pglite@0.5.8 in
// a temporary directory and set PGLITE_MODULE to its dist/index.js file URL.
// Run: node supabase/tests/private-usage-label-breakdown.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const db = new PGlite();
const workspace = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const [keyA, keyB, owner] = ['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c3'];

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls; -- as on Supabase
  create schema private;
  set timezone = 'UTC';
  create table public.v2_request_facts (
    request_event_id uuid primary key, workspace_id uuid, occurred_at timestamptz, app_id uuid, key_id uuid,
    endpoint text, requested_model_input text, requested_model_slug text, routed_model_slug text,
    provider_model_id text, success boolean, error_code text, byok boolean, safe_metadata jsonb, cost_nanos bigint,
    auth_method text, gateway_request_id uuid, gateway_request_created_at timestamptz
  );
  create table public.v2_request_usage (request_event_id uuid, meter_key text, quantity numeric(30,12), sequence integer default 0);
  create table public.v2_model_provider_routes (provider_model_id text primary key, provider_slug text);
  create table public.keys (id uuid primary key, workspace_id uuid, created_by uuid, oauth_user_id uuid, key_kind text not null default 'standard', department_id uuid);
  create table public.v2_analytics_outbox (request_event_id uuid primary key, workspace_id uuid, occurred_at timestamptz, status text);
  -- Read by the view for OAuth requests only.
  create table public.gateway_requests (id uuid, created_at timestamptz, oauth_user_id uuid, primary key (id, created_at));
  insert into public.keys values ('${keyA}', '${workspace}', null), ('${keyB}', '${workspace}', '${owner}');
  grant usage on schema private to service_role;
  grant select on public.v2_request_facts, public.v2_request_usage, public.v2_model_provider_routes, public.keys, public.v2_analytics_outbox, public.gateway_requests to service_role;
`);
await db.exec(await read('../schemas/private/tables/v2_analytics_previous_grains.sql'));
await db.exec((await read('../schemas/public/tables/v2_private_usage_15m.sql')).replace(/,\r?\n  CONSTRAINT "v2_private_usage_15m_workspace_id_fkey"[^\r\n]*/, ''));
await db.exec((await read('../schemas/public/tables/v2_private_usage_labels_15m.sql')).replace(/,\r?\n  CONSTRAINT "v2_private_usage_labels_15m_workspace_id_fkey"[^\r\n]*/, ''));
await db.exec(await read('../schemas/private/views/v2_usage_overview_requests.sql'));

// The migration ships exactly the declarative definition.
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_private_usage_label_breakdown.sql'));
assert.ok(migrationName, 'the migration exists');
const breakdownMigration = await read(`../migrations/${migrationName}`);
assert.ok(breakdownMigration.includes(await read('../schemas/public/functions/get_private_usage_label_breakdown.sql')), 'the migration matches the declarative definition');
await db.exec(breakdownMigration);

// A request every 7 minutes over a day and a half, in two workspaces. Department is a
// classifier dimension; some requests have two values under it, one has it repeated.
await db.exec(`
  insert into public.v2_request_facts
  select md5(ws || i)::uuid, ws::uuid, timestamptz '2026-10-14 00:03:00+00' + make_interval(mins => i * 7),
    null, (array['${keyA}', '${keyB}', null])[i % 3 + 1]::uuid,
    case when i % 41 = 0 then 'batch' else 'responses' end,
    'input', 'model-a', null, null,
    i % 6 <> 0, null, false,
    case when i % 8 = 0 then '{"labels":[{"key":"department","value":"legal"},{"key":"department","value":"sales"},{"key":"env","value":"prod"}]}'
      when i % 4 = 0 then '{"labels":[{"key":"department","value":"legal"},{"key":"department","value":"legal"}]}'
      when i % 4 = 1 then '{"labels":[{"key":"department","value":"support"},{"key":"phaseo.classifier","value":"c1"}]}'
      when i % 4 = 2 then '{"labels":"not a list"}' else '{"labels":[{"key":"department","value":7}]}' end::jsonb,
    case when ws = '${workspace}' then i * 1000 else 1 end
  from generate_series(0, 308) i, (values ('${workspace}'), ('${other}')) w(ws);
  insert into public.v2_request_usage (request_event_id, meter_key, quantity)
  select request_event_id, meter, quantity from public.v2_request_facts,
    lateral (values ('input_tokens', 100.0), ('output_tokens', 20.0), ('total_tokens', case when cost_nanos % 7000 = 0 then 500.0 end)) meters(meter, quantity)
  where quantity is not null;
`);
// The rollup backfill fills both rollups the way the outbox processor would.
const backfill = await read('../migrations/20261015134806_private_usage_15m.sql');
await db.exec(backfill.slice(backfill.indexOf('-- Backfill every request')));
// A request the outbox hasn't rolled up yet.
await db.exec(`
  insert into public.v2_request_facts (request_event_id, workspace_id, occurred_at, key_id, routed_model_slug, success, safe_metadata, cost_nanos)
  values (md5('late-1')::uuid, '${workspace}', '2026-10-15 11:58:00+00', '${keyA}', 'model-a', true, '{"labels":[{"key":"department","value":"late"}]}', 7);
`);

const breakdown = async (args, workspaceId = workspace) => (await db.query(
  'select public.get_private_usage_label_breakdown($1, $2, $3, $4, $5, $6, $7, $8) as rows',
  [workspaceId, args.from, args.to, args.key ?? 'department', args.keyId ?? null, args.excludeKey ?? false, args.creatorId ?? null, args.limit ?? 100],
)).rows[0].rows;

/** The same figures summed straight from the requests, counting a request once per distinct value. */
const expected = async ({ from, to, key = 'department', where = 'true', limit = 100 }) => (await db.query(`
  with values_per_request as (
    select distinct f.request_event_id, label ->> 'value' as value
    from public.v2_request_facts f,
      jsonb_array_elements(case when jsonb_typeof(f.safe_metadata -> 'labels') = 'array' then f.safe_metadata -> 'labels' else '[]' end) label
    where f.workspace_id = '${workspace}' and f.occurred_at >= $1 and f.occurred_at <= $2 and coalesce(f.endpoint, '') <> 'batch'
      and label ->> 'key' = $3 and jsonb_typeof(label -> 'value') = 'string' and (${where})
  )
  select v.value, count(*)::int requests, count(*) filter (where f.success)::int "successfulRequests",
    sum(f.cost_nanos)::bigint "costNanos",
    sum(coalesce(u.total, coalesce(u.input, 0) + coalesce(u.output, 0)))::bigint tokens,
    sum(coalesce(u.input, 0))::bigint "inputTokens", sum(coalesce(u.output, 0))::bigint "outputTokens"
  from values_per_request v
  join public.v2_request_facts f using (request_event_id)
  left join lateral (select
      sum(quantity) filter (where meter_key = 'input_tokens') input, sum(quantity) filter (where meter_key = 'output_tokens') output,
      sum(quantity) filter (where meter_key = 'total_tokens') total
    from public.v2_request_usage where request_event_id = f.request_event_id) u on true
  group by 1 order by 4 desc, 2 desc, 1 limit ${limit}`, [from, to, key])).rows
  .map((row) => ({ ...row, costNanos: Number(row.costNanos), tokens: Number(row.tokens), inputTokens: Number(row.inputTokens), outputTokens: Number(row.outputTokens) }));

const short = { from: '2026-10-15T11:40:00Z', to: '2026-10-15T11:59:30Z' };
const day = { from: '2026-10-14T09:12:00Z', to: '2026-10-15T12:00:00Z' };
const dayRows = await breakdown(day);
assert.deepEqual(dayRows, await expected(day), 'values over a day: rollup in the middle, requests at the edges and the request the rollup has not caught up with');
assert.deepEqual(dayRows.map((row) => row.value).sort(), ['late', 'legal', 'sales', 'support'], 'non-string values and malformed lists are left out');
assert.deepEqual(await breakdown(short), await expected(short), 'a window too short for the rollup');
assert.deepEqual(await breakdown({ ...day, key: 'phaseo.classifier' }), await expected({ ...day, key: 'phaseo.classifier' }), 'classifier calls by classifier');
assert.deepEqual(await breakdown({ ...day, keyId: keyA }), await expected({ ...day, where: `f.key_id = '${keyA}'` }), 'one key');
assert.deepEqual(await breakdown({ ...day, keyId: keyA, excludeKey: true }), await expected({ ...day, where: `f.key_id is distinct from '${keyA}'` }), 'every key but one');
assert.deepEqual(await breakdown({ ...day, creatorId: owner }), await expected({ ...day, where: `f.key_id = '${keyB}'` }), 'keys one person created');
assert.deepEqual(await breakdown({ ...day, limit: 2 }), await expected({ ...day, limit: 2 }), 'the limit keeps the most expensive values');
assert.deepEqual(await breakdown({ ...day, key: 'nobody' }), [], 'a key nobody used');
assert.notDeepEqual(await breakdown(day, other), dayRows, 'another workspace is summed apart');

// A correction the outbox processor hasn't reached: that hour comes from requests.
await db.exec(`
  update public.v2_request_facts set cost_nanos = cost_nanos + 1000000, safe_metadata = '{"labels":[{"key":"department","value":"legal"}]}'
    where workspace_id = '${workspace}' and occurred_at = '2026-10-14 15:06:00+00';
  insert into public.v2_analytics_outbox
    select request_event_id, workspace_id, occurred_at, 'pending' from public.v2_request_facts
    where workspace_id = '${workspace}' and occurred_at = '2026-10-14 15:06:00+00';
`);
assert.deepEqual(await breakdown(day), await expected(day), 'values while the rollup is behind');

const fn = 'public.get_private_usage_label_breakdown(uuid,timestamptz,timestamptz,text,uuid,boolean,uuid,integer)';
const privileges = (await db.query(`select
  has_function_privilege('anon', '${fn}', 'execute') as anon,
  has_function_privilege('authenticated', '${fn}', 'execute') as authenticated,
  has_function_privilege('service_role', '${fn}', 'execute') as service_role`)).rows[0];
assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: true });
const asServiceRole = await expected(day);
await db.exec('set role service_role');
assert.deepEqual(await breakdown(day), asServiceRole, 'service_role can read everything the RPC touches');
await db.exec('reset role');

// Timing on synthetic data: 30 days of rolled-up quarter hours for 12 values.
await db.exec(`
  insert into public.v2_private_usage_labels_15m (workspace_id, bucket_start, label_key, label_value, model_id, key_id, requests, successful_requests, cost_nanos, tokens)
  select '${workspace}', timestamptz '2026-09-01 00:00:00+00' + make_interval(mins => q * 15), 'team', 'team-' || v, 'model-' || (q % 3), '${keyA}', 3, 3, 4500, 900
  from generate_series(0, 30 * 96 - 1) q, generate_series(1, 12) v;
`);
const month = { from: '2026-09-01T00:07:00Z', to: '2026-09-30T23:52:00Z', key: 'team' };
await breakdown(month);
const started = performance.now();
const monthRows = await breakdown(month);
const elapsed = performance.now() - started;
assert.equal(monthRows.length, 12);
console.log(`30-day breakdown over ${30 * 96 * 12} rollup rows: ${elapsed.toFixed(1)} ms on PGlite`);

await db.close();
console.log('Passed: label breakdown matches the requests exactly across rollup and edges, keys, creators, limits, stale hours and workspaces; grants.');
