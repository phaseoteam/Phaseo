// Standalone PostgreSQL regression test. Install @electric-sql/pglite@0.5.8 in
// a temporary directory and set PGLITE_MODULE to its dist/index.js file URL.
// Run: node supabase/tests/private-usage-overview.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const db = new PGlite();
const workspace = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const [keyA, keyB, owner] = ['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c3'];

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  set timezone = 'UTC';
  create table public.v2_request_facts (
    request_event_id uuid primary key, workspace_id uuid, occurred_at timestamptz, app_id uuid, key_id uuid,
    endpoint text, requested_model_input text, requested_model_slug text, routed_model_slug text,
    provider_model_id text, success boolean, error_code text, byok boolean, safe_metadata jsonb, cost_nanos bigint
  );
  create table public.v2_request_usage (request_event_id uuid, meter_key text, quantity numeric(30,12), sequence integer default 0);
  create table public.v2_model_provider_routes (provider_model_id text primary key, provider_slug text);
  create table public.keys (id uuid primary key, workspace_id uuid, created_by uuid);
  insert into public.v2_model_provider_routes values ('route-a', 'provider-a'), ('route-b', 'provider-b'), ('route-c', 'provider-a');
  insert into public.keys values ('${keyA}', '${workspace}', null), ('${keyB}', '${workspace}', '${owner}');
`);
// Workspaces have no identity table here.
await db.exec((await read('../schemas/public/tables/v2_private_usage_15m.sql')).replace(/,\r?\n  CONSTRAINT "v2_private_usage_15m_workspace_id_fkey"[^\r\n]*/, ''));
await db.exec(await read('../schemas/public/functions/get_private_usage_overview.sql'));

// A request every 7 minutes from midnight on 14 October to midday on the 15th, in two workspaces.
await db.exec(`
  insert into public.v2_request_facts
  select md5(ws || i)::uuid, ws::uuid, timestamptz '2026-10-14 00:03:00+00' + make_interval(mins => i * 7),
    case when i % 3 = 0 then '00000000-0000-0000-0000-0000000000ee'::uuid end,
    (array['${keyA}', '${keyB}', null])[i % 3 + 1]::uuid,
    case when i % 41 = 0 then 'batch' when i % 2 = 0 then 'chat.completions' end,
    'input', case when i % 2 = 0 then 'model-a' end, case when i % 4 = 1 then 'model-b' end,
    (array['route-a', 'route-b', 'route-c', null])[i % 4 + 1],
    i % 6 <> 0, case when i % 37 = 0 then 'user:guardrail_blocked' when i % 6 = 0 then 'upstream:upstream_error' end,
    i % 5 = 0,
    case when i % 4 = 0 then '{"labels":[{"key":"team","value":"search"}]}' else '{"labels":[]}' end::jsonb,
    case when ws = '${workspace}' then i * 1000 else 1 end
  from generate_series(0, 308) i, (values ('${workspace}'), ('${other}')) w(ws);
  insert into public.v2_request_usage (request_event_id, meter_key, quantity)
  select request_event_id, meter, quantity from public.v2_request_facts,
    lateral (values ('input_tokens', 100.0), ('input_text_tokens', 100.0), ('output_tokens', 20.0),
      ('cached_input_tokens', case when cost_nanos % 3000 = 0 then 40.0 end),
      ('reasoning_tokens', case when cost_nanos % 2000 = 0 then 5.0 end),
      ('total_tokens', case when cost_nanos % 7000 = 0 then 500.0 end)) meters(meter, quantity)
  where quantity is not null;
`);
// The migration's backfill fills the rollup the way the outbox processor would.
const migration = await read('../migrations/20261015103000_private_usage_15m.sql');
await db.exec(migration.slice(migration.indexOf('-- Backfill every request')));
const rolledRequests = Number((await db.query(`select sum(requests) n from public.v2_private_usage_15m where workspace_id = '${workspace}'`)).rows[0].n);
assert.equal(rolledRequests, 309 - 8, 'the backfill counts every request but async jobs');
// Two requests the outbox hasn't rolled up yet.
await db.exec(`
  insert into public.v2_request_facts (request_event_id, workspace_id, occurred_at, key_id, routed_model_slug, provider_model_id, success, safe_metadata, cost_nanos)
  values (md5('late-1')::uuid, '${workspace}', '2026-10-15 11:58:00+00', '${keyA}', 'model-a', 'route-a', true, '{}', 7),
    (md5('late-2')::uuid, '${workspace}', '2026-10-15 11:59:00+00', null, 'model-a', 'route-a', false, '{}', 11);
`);

const overview = async (args, workspaceId = workspace) => (await db.query(
  'select public.get_private_usage_overview($1, $2, $3, $4, $5, $6, $7, $8, $9) as cells',
  [workspaceId, args.from, args.to, args.bucket ?? null, args.timeZone ?? 'UTC', args.keyId ?? null, args.excludeKey ?? false, args.creatorId ?? null, args.label ?? null],
)).rows[0].cells;

/** The same figures summed straight from the requests. */
const expected = async ({ from, to, bucket = null, timeZone = 'UTC', where = 'true' }, workspaceId = workspace) => (await db.query(`
  select ${bucket === '5 minutes' ? `date_bin('5 minutes', f.occurred_at, timestamptz '2000-01-01 00:00:00+00')` : bucket ? `date_trunc('${bucket}', f.occurred_at, '${timeZone}')` : 'null::timestamptz'} as bucket,
    count(*)::int requests, count(*) filter (where f.success)::int successful,
    count(*) filter (where f.error_code like '%:guardrail_blocked')::int guardrail_blocked,
    sum(f.cost_nanos)::int cost_nanos,
    sum(coalesce(u.total, coalesce(u.input, 0) + coalesce(u.output, 0)))::int tokens,
    sum(coalesce(u.cached, 0))::int cached_tokens, sum(coalesce(u.reasoning, 0))::int reasoning_tokens
  from public.v2_request_facts f
  left join lateral (select
      sum(quantity) filter (where meter_key = 'input_tokens') input, sum(quantity) filter (where meter_key = 'output_tokens') output,
      sum(quantity) filter (where meter_key = 'total_tokens') total, sum(quantity) filter (where meter_key = 'cached_input_tokens') cached,
      sum(quantity) filter (where meter_key = 'reasoning_tokens') reasoning
    from public.v2_request_usage where request_event_id = f.request_event_id) u on true
  where f.workspace_id = '${workspaceId}' and f.occurred_at >= $1 and f.occurred_at <= $2
    and coalesce(f.endpoint, '') <> 'batch' and (${where})
  group by 1 order by 1`, [from, to])).rows;

/** Sums cells per bucket, in the shape of `expected`. */
const byBucket = (cells) => {
  const buckets = new Map();
  for (const cell of cells) {
    const key = cell.bucket === null ? null : new Date(cell.bucket).getTime();
    const sum = buckets.get(key) ?? { bucket: key === null ? null : new Date(key), requests: 0, successful: 0, guardrail_blocked: 0, cost_nanos: 0, tokens: 0, cached_tokens: 0, reasoning_tokens: 0 };
    sum.requests += cell.requests; sum.successful += cell.successfulRequests; sum.guardrail_blocked += cell.guardrailBlocked;
    sum.cost_nanos += cell.costNanos; sum.tokens += cell.tokens; sum.cached_tokens += cell.cachedTokens; sum.reasoning_tokens += cell.reasoningTokens;
    buckets.set(key, sum);
  }
  return [...buckets.values()].sort((a, b) => (a.bucket?.getTime() ?? 0) - (b.bucket?.getTime() ?? 0));
};

// Starts and ends mid-quarter: the edges come from requests, the middle from the rollup,
// and the requests the rollup hasn't caught up with still count.
const day = { from: '2026-10-14T09:12:00Z', to: '2026-10-15T12:00:00Z' };
assert.deepEqual(byBucket(await overview({ ...day, bucket: 'hour', timeZone: 'Asia/Kolkata' })), await expected({ ...day, bucket: 'hour', timeZone: 'Asia/Kolkata' }), 'hours in a half-hour time zone');
assert.deepEqual(byBucket(await overview({ ...day, bucket: 'day', timeZone: 'America/New_York' })), await expected({ ...day, bucket: 'day', timeZone: 'America/New_York' }), 'local days');
const totals = byBucket(await overview(day));
assert.deepEqual(totals, await expected(day), 'totals without buckets');
assert.equal(totals[0].guardrail_blocked > 0 && totals[0].cached_tokens > 0 && totals[0].reasoning_tokens > 0, true, 'the fixture covers guardrail blocks, cached and reasoning tokens');

// Every dimension the overview breaks down by is kept apart.
const cells = await overview(day);
assert.deepEqual(new Set(cells.map((cell) => cell.provider)), new Set(['provider-a', 'provider-b', null]));
assert.equal(cells.some((cell) => cell.modelId === 'input'), true, 'falls back to the requested model input');
assert.equal(cells.some((cell) => cell.byok) && cells.some((cell) => !cell.byok), true);
assert.equal(cells.some((cell) => cell.appId) && cells.some((cell) => !cell.appId), true);

// Filters.
assert.deepEqual(byBucket(await overview({ ...day, keyId: keyA })), await expected({ ...day, where: `f.key_id = '${keyA}'` }), 'one key');
assert.deepEqual(byBucket(await overview({ ...day, keyId: keyA, excludeKey: true })), await expected({ ...day, where: `f.key_id is distinct from '${keyA}'` }), 'every key but one, and none');
assert.deepEqual(byBucket(await overview({ ...day, creatorId: owner })), await expected({ ...day, where: `f.key_id = '${keyB}'` }), 'keys one person created');
const label = { labels: [{ key: 'team', value: 'search' }] };
assert.deepEqual(byBucket(await overview({ ...day, label })), await expected({ ...day, where: `f.safe_metadata @> '${JSON.stringify(label)}'` }), 'a request label');

// Five-minute buckets read the requests alone.
const hour = { from: '2026-10-15T10:50:00Z', to: '2026-10-15T12:00:00Z' };
assert.deepEqual(byBucket(await overview({ ...hour, bucket: '5 minutes' })), await expected({ ...hour, bucket: '5 minutes' }), '5-minute buckets');
// A window inside a single half hour has no whole quarter to read from the rollup.
const short = { from: '2026-10-15T11:40:00Z', to: '2026-10-15T11:59:30Z' };
assert.deepEqual(byBucket(await overview(short)), await expected(short), 'a short window');
assert.deepEqual(byBucket(await overview(day, other)), await expected(day, other), 'another workspace is summed apart');

const privileges = (await db.query(`select
  has_function_privilege('anon', 'public.get_private_usage_overview(uuid,timestamptz,timestamptz,text,text,uuid,boolean,uuid,jsonb)', 'execute') as anon,
  has_function_privilege('authenticated', 'public.get_private_usage_overview(uuid,timestamptz,timestamptz,text,text,uuid,boolean,uuid,jsonb)', 'execute') as authenticated,
  has_function_privilege('service_role', 'public.get_private_usage_overview(uuid,timestamptz,timestamptz,text,text,uuid,boolean,uuid,jsonb)', 'execute') as service_role,
  has_table_privilege('authenticated', 'public.v2_private_usage_15m', 'select') as rollup_authenticated`)).rows[0];
assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: true, rollup_authenticated: false });
await db.close();
console.log('Passed: the rollup plus edge requests match the requests exactly across time zones, buckets, filters and workspaces; grants.');
