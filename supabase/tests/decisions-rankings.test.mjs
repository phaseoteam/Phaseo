// Run with PGLITE_MODULE pointing to @electric-sql/pglite/dist/index.js.
// Decisions have their own ranking: decision_tokens leave the text metrics,
// decision-only models leave the text page's per-model sections, and past
// /v1/decisions requests are backfilled.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const migration = await readFile(new URL('../migrations/20261104202000_decisions_rankings.sql', import.meta.url), 'utf8');
const schema = async (path) => (await readFile(new URL(`../schemas/public/${path}`, import.meta.url), 'utf8')).trim();

// The migration must carry the same definitions as the declarative schema.
for (const [path, end] of [
  ['functions/public_decision_only_models.sql', null],
  ['functions/public_ranking_metric_value.sql', '$$;'],
  ['functions/get_public_modality_usage_timeseries.sql', '$function$;'],
  ['functions/get_public_fastest_models.sql', '$function$;'],
  ['functions/get_public_unique_user_timeseries.sql', '$function$;'],
  ['functions/get_public_market_share_timeseries.sql', '$function$;'],
]) {
  const text = await schema(path);
  const body = end ? text.slice(0, text.indexOf(end) + end.length) : text;
  assert.ok(migration.includes(body), `${path} matches the migration`);
}
const periodSchema = await schema('functions/get_public_period_leaderboard.sql');
assert.ok(migration.includes(periodSchema.slice('create function'.length, periodSchema.indexOf('$$;'))), 'period leaderboard matches');
const view = await schema('views/v2_rpc_gateway_model_usage_daily.sql');
assert.ok(migration.includes(view.slice('CREATE VIEW'.length, view.indexOf(';\n'))), 'daily view matches');

assert.equal(migration.split("- coalesce(sum(meter.quantity) filter (where meter.meter_key = 'decision_tokens'), 0), 0)").length - 1, 2,
  'market share subtracts decision tokens from hourly and daily totals');

// Split the migration into its top-level statements by their opening lines.
const starts = [...migration.matchAll(/^(CREATE OR REPLACE|create or replace|insert into)\b/gm)].map((match) => match.index);
const statements = starts.map((start, index) => migration.slice(start, starts[index + 1] ?? migration.length));
const statement = (needle) => {
  const found = statements.find((text) => text.includes(needle));
  assert.ok(found, `statement ${needle}`);
  // Keep only the statement itself, not trailing grants.
  return found.replace(/\n(REVOKE|GRANT|revoke|grant)[\s\S]*$/, '\n');
};

const db = new PGlite();
await db.exec(`
  create role service_role; create role anon; create role authenticated;
  create table v2_labs (lab_slug text primary key, colour text);
  create table v2_models (model_slug text primary key, lab_slug text);
  create table v2_model_provider_routes (provider_model_id text primary key, model_slug text);
  create table v2_route_capabilities (provider_model_id text, capability_id text);
  insert into v2_labs values ('lab', '#123456');
  insert into v2_models values ('chat', 'lab'), ('decider', 'lab'), ('both', 'lab');
  insert into v2_model_provider_routes values ('r-chat', 'chat'), ('r-decider', 'decider'), ('r-both', 'both');
  insert into v2_route_capabilities values
    ('r-chat', 'text.generate'), ('r-decider', 'decisions.make'), ('r-decider', 'batch'),
    ('r-both', 'decisions.make'), ('r-both', 'text.generate');
  create table v2_rpc_gateway_model_usage_daily (
    day_bucket date, model_id text, requests bigint default 1,
    input_text_tokens bigint default 0, output_text_tokens bigint default 0, decision_tokens bigint default 0,
    image_inputs bigint default 0, image_outputs bigint default 0, input_audio_tokens bigint default 0,
    output_audio_tokens bigint default 0, audio_seconds numeric default 0, speech_seconds numeric default 0,
    transcription_seconds numeric default 0, input_video_tokens bigint default 0, output_video_tokens bigint default 0,
    video_seconds numeric default 0, cached_read_tokens bigint default 0, cached_write_tokens bigint default 0,
    embedding_tokens bigint default 0, rerank_quad_tokens bigint default 0
  );
  insert into v2_rpc_gateway_model_usage_daily (day_bucket, model_id, input_text_tokens, output_text_tokens, decision_tokens) values
    (current_date, 'chat', 90, 10, 0),
    (current_date, 'decider', 40, 2, 42),
    (current_date, 'both', 70, 5, 25);
  create function public.get_public_model_performance(p_hours integer, p_min integer)
    returns table (model_id text, provider text, requests bigint, cost_per_1m_tokens numeric,
      median_latency_ms numeric, p95_latency_ms numeric, median_throughput numeric, success_rate numeric)
    language sql as $$ select * from (values
      ('chat', 'p', 3::bigint, null::numeric, 100::numeric, null::numeric, 50::numeric, 1::numeric),
      ('decider', 'p', 2::bigint, null::numeric, 50::numeric, null::numeric, 90::numeric, 1::numeric),
      ('both', 'p', 1::bigint, null::numeric, 70::numeric, null::numeric, 60::numeric, 1::numeric)) v $$;
  create table gateway_requests (id text, created_at timestamptz, endpoint text);
  create table v2_request_facts (request_event_id text primary key, gateway_request_id text, gateway_request_created_at timestamptz);
  create table v2_request_usage (request_event_id text, meter_key text, modality text, unit text, quantity numeric,
    source text, billable boolean, sequence integer, unique (request_event_id, meter_key, sequence));
  insert into gateway_requests values ('g1', '2026-10-01', 'decisions'), ('g2', '2026-10-01', 'chat.completions'),
    ('g3', '2026-10-02', 'decisions');
  insert into v2_request_facts values ('e1', 'g1', '2026-10-01'), ('e2', 'g2', '2026-10-01'), ('e3', 'g3', '2026-10-02');
  insert into v2_request_usage values
    ('e1', 'input_text_tokens', 'text', 'tokens', 30, 'gateway', true, 0),
    ('e1', 'output_text_tokens', 'text', 'tokens', 1, 'gateway', true, 0),
    ('e1', 'input_tokens', 'text', 'tokens', 30, 'gateway', true, 0),
    ('e2', 'input_text_tokens', 'text', 'tokens', 99, 'gateway', true, 0),
    ('e3', 'input_text_tokens', 'text', 'tokens', 5, 'gateway', true, 0),
    ('e3', 'decision_tokens', 'text', 'tokens', 5, 'gateway', false, 0);
`);
for (const needle of [
  'public.public_decision_only_models ()',
  'public.public_ranking_metric_value(',
  'public.get_public_modality_usage_timeseries (',
  'public.get_public_fastest_models (',
  'insert into public.v2_request_usage',
]) await db.exec(statement(needle));

// Only models that do nothing but decisions are decision-only.
assert.deepEqual((await db.query('select model_slug from public_decision_only_models()')).rows, [{ model_slug: 'decider' }]);

// Per-request meters: text excludes decision tokens; decisions count only them.
const metric = async (name, meters) => Number((await db.query('select public_ranking_metric_value($1, $2::jsonb) as v', [name, JSON.stringify(meters)])).rows[0].v);
assert.equal(await metric('text_tokens', { input_text_tokens: 40, output_text_tokens: 2, decision_tokens: 42 }), 0);
assert.equal(await metric('text_tokens', { input_text_tokens: 40, output_text_tokens: 2 }), 42);
assert.equal(await metric('text_tokens', { input_text_tokens: 1, decision_tokens: 5 }), 0, 'never negative');
assert.equal(await metric('decision_tokens', { input_text_tokens: 40, decision_tokens: 42 }), 42);
// Total tokens feed market share and top apps on the text page.
assert.equal(await metric('tokens', { input_tokens: 40, output_tokens: 2, input_text_tokens: 40, output_text_tokens: 2, decision_tokens: 42 }), 0);
assert.equal(await metric('tokens', { input_tokens: 100, output_tokens: 10, decision_tokens: 25 }), 85);
assert.equal(await metric('tokens', { total_tokens: 7 }), 7);

// Daily series: the text chart drops decision volume, the decisions chart has only it.
const series = async (name) => Object.fromEntries((await db.query(
  "select model_id, tokens from get_public_modality_usage_timeseries($1, 'month', 20)", [name])).rows
  .map((row) => [row.model_id, Number(row.tokens)]));
assert.deepEqual(await series('text_tokens'), { chat: 100, both: 50 });
assert.deepEqual(await series('decision_tokens'), { decider: 42, both: 25 });

// Fastest models on the text page leave decision-only models out.
assert.deepEqual((await db.query('select model_id from get_public_fastest_models(30, 20) order by model_id')).rows
  .map((row) => row.model_id), ['both', 'chat']);

// Backfill: one decision_tokens row per past decisions request, text tokens only,
// not billable; an existing row is kept and chat requests are untouched.
assert.deepEqual((await db.query(
  "select request_event_id, quantity::int as quantity, billable from v2_request_usage where meter_key = 'decision_tokens' order by 1",
)).rows, [
  { request_event_id: 'e1', quantity: 31, billable: false },
  { request_event_id: 'e3', quantity: 5, billable: false },
]);
await db.exec(statement('insert into public.v2_request_usage'));
assert.equal(Number((await db.query("select count(*) from v2_request_usage where meter_key = 'decision_tokens'")).rows[0].count), 2, 'backfill is idempotent');

await db.close();
console.log('Decisions rankings SQL: metric split, decision-only models, fastest models and backfill passed.');
