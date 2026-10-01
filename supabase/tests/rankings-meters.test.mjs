// Run with PGLITE_MODULE pointing to a local @electric-sql/pglite dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const migration = async (name) => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create table v2_models (model_slug text primary key, lab_slug text, hidden boolean default false, status text default 'active');
  create table v2_labs (lab_slug text primary key, colour text);
  create table v2_model_provider_routes (provider_model_id text primary key, provider_slug text, is_stealth boolean default false,
    routing_enabled boolean default true, status text default 'active', effective_from timestamptz, effective_to timestamptz);
  create table v2_public_usage_daily (
    rollup_id uuid primary key, usage_date date, model_slug text, provider_model_id text, requests bigint default 1,
    successful_requests bigint default 1, failed_requests bigint default 0, rate_limited_requests bigint default 0,
    latency_sum_ms numeric default 0, latency_count bigint default 0, generation_sum_ms numeric default 0,
    generation_count bigint default 0, throughput_sum numeric default 0, throughput_count bigint default 0, updated_at timestamptz default now()
  );
  create table v2_public_usage_daily_meters (rollup_id uuid, meter_key text, modality text, unit text, quantity numeric);
  create table public_model_workspace_usage_weekly (week_start date, model_id text, workspace_hash text, requests bigint);
  alter table public_model_workspace_usage_weekly enable row level security;
  grant select on v2_models, v2_labs, v2_model_provider_routes, v2_public_usage_daily, v2_public_usage_daily_meters to service_role;
  insert into v2_labs values ('lab', '#123456');
  insert into v2_models(model_slug,lab_slug,hidden) values ('visible','lab',false), ('hidden','lab',true);
  insert into v2_model_provider_routes(provider_model_id,provider_slug,is_stealth) values ('route','provider',false), ('stealth','provider',true);
  insert into v2_public_usage_daily(rollup_id,usage_date,model_slug,provider_model_id) values
    (md5('1')::uuid,current_date,'visible','route'),
    (md5('2')::uuid,current_date,'hidden','route'),
    (md5('3')::uuid,current_date,'visible','stealth'),
    (md5('4')::uuid,current_date-400,'visible','route');
  insert into v2_public_usage_daily_meters
    select rollup_id, key, 'text', 'tokens', 10 from v2_public_usage_daily
    cross join unnest(array['input_text_tokens','embedding_tokens','rerank_quad_tokens','input_images','output_images',
      'input_audio','output_audio','input_video','output_video','cache_write_tokens','cached_input_tokens',
      'input_audio_tokens','output_audio_tokens','input_video_tokens','output_video_tokens']) key;
  insert into v2_public_usage_daily_meters values
    (md5('1')::uuid,'output_video_seconds','video','seconds',2.75),
    (md5('1')::uuid,'audio_seconds','audio','seconds',5.5),
    (md5('1')::uuid,'speech_seconds','audio','seconds',2.25),
    (md5('1')::uuid,'transcription_seconds','audio','seconds',3.25),
    (md5('1')::uuid,'input_text_tokens','text','other-unit',7);
`);
const oldProjection = (await migration('20260726126000_v2_remaining_analytics_rpc_cutover')).split('create or replace view public.v2_rpc_public_app_model_usage_daily')[0];
await db.exec(oldProjection);
await db.exec(await migration('20260829190000_enforce_public_retention_privacy_floors'));
assert.equal((await db.query("select has_table_privilege('service_role','public_model_workspace_usage_weekly','select') as allowed")).rows[0].allowed, false);
await db.exec(await migration('20260919120000_repair_public_rankings_meters'));
await db.exec('grant select on v2_rpc_gateway_model_usage_daily to service_role; set role service_role;');
assert.deepEqual((await db.query('select * from get_public_model_retention_rankings()')).rows, [], 'backend reads empty cohorts successfully');
const expected = { text_tokens: 17, image_inputs: 10, image_outputs: 10, embedding_tokens: 10, rerank_quad_tokens: 10,
  audio_tokens: 20, audio_seconds: 5.5, speech_seconds: 2.25, transcription_seconds: 3.25,
  video_tokens: 20, video_seconds: 2.75, cached_tokens: 20 };
for (const [metric, value] of Object.entries(expected)) {
  const rows = (await db.query('select * from get_public_modality_usage_timeseries($1, $2, $3)', [metric, 'month', 20])).rows;
  assert.equal(rows.length, 1, `${metric}: excludes hidden, stealth, and out-of-window data`);
  assert.equal(rows[0].model_id, 'visible');
  assert.equal(Number(rows[0].tokens), value, `${metric}: preserves quantities and units`);
  assert.equal(Number(rows[0].requests), 1, `${metric}: joining meters does not multiply requests`);
}
await db.exec('reset role;');
// Aliases represent the same measurement and must not be summed together.
await db.exec("insert into v2_public_usage_daily_meters values (md5('1')::uuid,'video_seconds','video','seconds',2.75)");
assert.equal(Number((await db.query("select tokens from get_public_modality_usage_timeseries('video_seconds','month',20)")).rows[0].tokens), 2.75);
// UTC buckets must not change with the database session timezone.
const utc = (await db.query("select bucket from get_public_modality_usage_timeseries('speech_seconds','month',20)")).rows;
await db.exec("set timezone = 'Pacific/Auckland'");
assert.deepEqual((await db.query("select bucket from get_public_modality_usage_timeseries('speech_seconds','month',20)")).rows, utc);
for (const role of ['anon','authenticated']) {
  assert.equal((await db.query(`select has_table_privilege('${role}','public_model_workspace_usage_weekly','select') as allowed`)).rows[0].allowed, false);
}
await db.close();
console.log('Rankings SQL: all modality metrics, aliases, visibility, units, UTC buckets, and retention grants passed.');
