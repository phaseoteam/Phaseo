// Standalone PostgreSQL regression test. Install @electric-sql/pglite@0.5.8 in
// a temporary directory and set PGLITE_MODULE to its dist/index.js file URL.
// Run: node supabase/tests/analytics-reads.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const migration = async (name) => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8');
const workspace = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table v2_model_provider_routes (
    provider_model_id text primary key, provider_slug text, is_stealth boolean default false,
    routing_enabled boolean default true, status text default 'active', effective_from timestamptz, effective_to timestamptz
  );
  create table v2_models (model_slug text primary key, hidden boolean default false, status text default 'active', lab_slug text default 'lab-a');
  create table v2_labs (lab_slug text primary key, name text, metadata jsonb);
  create table v2_providers (provider_slug text primary key, metadata jsonb);
  insert into v2_labs values ('lab-a','Lab A','{}');
  insert into v2_providers values ('provider-a','{}');
  create schema private;
  create view private.v2_rpc_models_compat as select model_slug as model_id,lab_slug as organisation_id from v2_models;
  create view private.v2_rpc_labs_compat as select lab_slug as organisation_id,name from v2_labs;
  insert into v2_models(model_slug,hidden,status) values ('model-a',false,'active'), ('hidden',true,'active');
  insert into v2_model_provider_routes(provider_model_id,provider_slug,is_stealth) values ('route-a','provider-a',false),('stealth','provider-a',true);
`);
for (const table of ['v2_public_usage_daily', 'v2_public_usage_hourly', 'v2_private_usage_daily']) {
  await db.exec(`create table ${table} (
    rollup_id uuid primary key, usage_date date, bucket_start timestamptz, workspace_id uuid,
    model_slug text, provider_model_id text, app_id uuid, requests bigint, successful_requests bigint,
    failed_requests bigint default 0, rate_limited_requests bigint default 0,
    cost_nanos numeric default 0, latency_sum_ms numeric default 0, latency_count bigint default 0,
    throughput_sum numeric default 0, throughput_count bigint default 0,
    generation_sum_ms numeric default 0, generation_count bigint default 0, updated_at timestamptz default now()
  );
  create table ${table}_meters (
    rollup_id uuid references ${table}, meter_key text, modality text default 'text', unit text default 'token', quantity numeric,
    primary key (rollup_id,meter_key,modality,unit)
  );
  insert into ${table}(rollup_id, usage_date, bucket_start, workspace_id,model_slug,provider_model_id,requests,successful_requests,cost_nanos,latency_sum_ms,latency_count)
  select md5(i::text)::uuid, current_date - (i % 40), (current_date - (i % 40))::timestamptz,
    case when i <= 1200 then '${workspace}'::uuid else '${other}'::uuid end,
    case when i % 10 = 0 then 'hidden' else 'model-a' end,
    case when i % 13 = 0 then 'stealth' else 'route-a' end,
    1, 1, 1000000, 201, 2 from generate_series(1,1300) i;
  insert into ${table}_meters(rollup_id,meter_key,quantity)
  select rollup_id, key, case key when 'total_tokens' then 17 when 'input_tokens' then 4 else 6 end
  from ${table} cross join unnest(array['total_tokens','input_tokens','output_tokens','input_text_tokens','output_text_tokens']) key
  where extract(day from usage_date)::int % 3 <> 0 or key not in ('total_tokens','input_tokens','output_tokens');
  grant select on ${table}, ${table}_meters to authenticated, service_role;
  `);
}
await db.exec(`grant select on v2_models,v2_model_provider_routes to authenticated,service_role;
  alter table v2_private_usage_daily enable row level security;
  create policy workspace_read on v2_private_usage_daily to authenticated using (workspace_id = current_setting('test.workspace')::uuid);
  alter table v2_private_usage_daily_meters enable row level security;
  create policy workspace_read on v2_private_usage_daily_meters to authenticated using (exists (
    select 1 from v2_private_usage_daily d where d.rollup_id = v2_private_usage_daily_meters.rollup_id
  ));
`);
await db.exec(await migration('20260830221500_filter_public_usage_to_visible_routes'));
await db.exec(await migration('20260726129000_v2_private_usage_projection_totals'));
const legacy = (await migration('20260726126000_v2_remaining_analytics_rpc_cutover')).split('create or replace view public.v2_rpc_public_app_model_usage_daily')[0];
await db.exec(legacy);
await db.exec((await migration('20260726124000_v2_rankings_rpc_cutover')).split('create or replace function public.get_public_trending_models')[0]);
await db.exec((await migration('20260622084703_refresh_public_rankings_rollups'))
  .match(/create or replace function public.get_public_market_share\([\s\S]*?\$\$;/i)[0]
  .replaceAll('public.gateway_model_usage_daily','public.v2_rpc_gateway_model_usage_daily')
  .replaceAll('public.data_models','private.v2_rpc_models_compat')
  .replaceAll('public.data_organisations','private.v2_rpc_labs_compat'));
await db.exec((await migration('20260811142307_tighten_compatibility_grants_and_restore_market_share_order'))
  .slice((await migration('20260811142307_tighten_compatibility_grants_and_restore_market_share_order')).indexOf('create or replace function public.get_public_market_share_timeseries')));
const views = ['v2_web_public_usage_daily','v2_web_public_usage_hourly','v2_web_private_usage_daily','v2_rpc_gateway_model_usage_daily'];
const snapshot = async () => {
  const result = [];
  for (const name of views) result.push((await db.query(`select coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text),'[]') as rows from ${name} v`)).rows);
  for (const range of ['today','week','month','year']) {
    for (const metric of ['tokens','requests','cost']) result.push((await db.query('select * from get_public_model_rankings($1,$2,250)', [range,metric])).rows);
  }
  for (const dimension of ['provider','organization']) {
    for (const range of ['today','week','month','year']) {
      result.push((await db.query('select * from get_public_market_share($1,$2)', [dimension,range])).rows);
      for (const bucket of ['hour','day','week','month']) result.push((await db.query('select * from get_public_market_share_timeseries($1,$2,$3,1)', [dimension,range,bucket])).rows);
    }
  }
  return result;
};
const before = await snapshot();
await db.exec(await migration('20260907230818_optimize_analytics_reads'));
assert.deepEqual(await snapshot(), before, 'view and rankings results must remain identical');
await db.exec(`set role authenticated; set test.workspace = '${workspace}';`);
const summary = (await db.query("select get_private_usage_summary($1, current_date-50, current_date+1) as result", [workspace])).rows[0].result;
assert.equal(summary.topProvider.requests, 1200, 'summary includes more than 1000 rollups');
assert.equal(summary.topModel.requests, 1080);
assert.equal(summary.fastestModel.speedMs, 101, 'round the weighted average, preserving fractional division');
assert.equal(summary.mostExpensive.cost, 1.08);
const empty = { topModel:null, topProvider:null, fastestModel:null, mostExpensive:null };
assert.deepEqual((await db.query('select get_private_usage_summary($1,current_date-50,current_date+1) as result', [other])).rows[0].result, empty, 'RLS rejects another workspace');
assert.deepEqual((await db.query('select get_private_usage_facets($1,current_date-50,current_date+1) as result', [other])).rows[0].result, [], 'facet RLS rejects another workspace');
for (const timezone of ['UTC', 'America/New_York']) {
  await db.exec(`set timezone = '${timezone}'`);
  const { rows } = await db.query(`select
    get_private_usage_facets($1,current_date-7+interval '12 hours',current_date+interval '12 hours') as actual,
    (select coalesce(jsonb_agg(to_jsonb(f) order by canonical_model_id,provider,app_id),'[]') from (
      select distinct canonical_model_id,provider,app_id from v2_web_private_usage_daily
      where workspace_id=$1 and bucket_15m >= current_date-7+interval '12 hours' and bucket_15m <= current_date+interval '12 hours'
    ) f) as expected`, [workspace]);
  assert.deepEqual(rows[0].actual, rows[0].expected, 'partial-day date filtering preserves existing semantics');
}
await db.exec('reset role');
for (const name of ['get_private_usage_summary','get_private_usage_facets']) {
  const { rows } = await db.query(`select has_function_privilege('anon','${name}(uuid,timestamptz,timestamptz)','execute') as allowed`);
  assert.equal(rows[0].allowed,false);
}
const repairMigration = await migration('20260907230819_reduce_analytics_repair_frequency');
await db.exec(repairMigration); // No pg_cron installed: safely skip.
await db.exec(`create schema cron;
  create table cron.job (jobid bigint primary key, jobname text, schedule text, command text, active boolean);
  create function cron.alter_job(job_id bigint, schedule text default null) returns void language sql as $$
    update cron.job j set schedule = alter_job.schedule where j.jobid = job_id;
  $$;
  insert into cron.job values (1,'refresh-public-leaderboard-rollups','7 * * * *','repair command',false),
    (2,'unrelated','* * * * *','unrelated command',true);
`);
// PGlite does not ship pg_cron; exercise the installed-extension branch with a
// signature-compatible fixture, without changing the migration's job logic.
const installedRepair = repairMigration.replace("exists (select 1 from pg_extension where extname = 'pg_cron')", 'true');
await db.exec(installedRepair);
await db.exec(installedRepair);
assert.deepEqual((await db.query('select schedule,command,active from cron.job where jobid=1')).rows[0],
  { schedule:'7 3 * * *', command:'repair command', active:false });
assert.equal((await db.query('select schedule from cron.job where jobid=2')).rows[0].schedule,'* * * * *');
await db.exec("update cron.job set schedule='15 4 * * *' where jobid=1");
await db.exec(installedRepair);
assert.equal((await db.query('select schedule from cron.job where jobid=1')).rows[0].schedule,'15 4 * * *');
await db.close();
console.log('Passed: 4 views, 12 ranking and 40 market-share combinations, >1000 rollups, weighted latency, partial days/timezones, workspace isolation, grants and repair scheduling.');
