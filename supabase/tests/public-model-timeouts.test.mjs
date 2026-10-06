// PGlite 0.5.8; PGLITE_MODULE may point to an external installation's dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
await db.exec(`set timezone = 'UTC';
  create role anon; create role authenticated; create role service_role;
  create schema private;
  create table public.v2_models(model_id text primary key,name text,release_date timestamptz,deprecation_date timestamptz,previous_model_id text);
  insert into v2_models values
    ('model-a','A',date_trunc('day',now())-interval '30 days',null,null),
    ('model-b','B',date_trunc('day',now())-interval '10 days',null,'model-a'),
    ('no-release','No release',null,null,null),
    ('empty','Empty',now()-interval '1 day',null,null);
  create view private.v2_rpc_models_compat as select * from v2_models;
  create table public.v2_model_provider_routes(provider_model_id text primary key,model_slug text,provider_slug text,api_model_id text,is_active_gateway boolean,updated_at timestamptz);
  insert into v2_model_provider_routes values
    ('route-a','model-a','provider-a','native-a',true,now()),
    ('route-a2','model-a','provider-b','native-a2',true,now()),
    ('route-b','model-b','provider-a','native-b',true,now()),
    ('route-off','model-a','provider-b','native-off',false,now());
  create view private.v2_rpc_routes_compat as select
    provider_model_id as provider_api_model_id,model_slug as model_id,model_slug as internal_model_id,
    provider_slug as provider_id,api_model_id,api_model_id as provider_model_slug,is_active_gateway,updated_at
    from v2_model_provider_routes;
  create table public.v2_model_aliases(alias_slug text primary key,model_slug text,enabled boolean,effective_from timestamptz,effective_to timestamptz,metadata jsonb,created_at timestamptz,updated_at timestamptz);
  insert into v2_model_aliases(alias_slug,model_slug,enabled) values
    ('alias-a','model-a',true),('disabled','model-a',false),('null-enabled','model-b',null),('blank','   ',true);
  create table public.v2_providers(api_provider_id text primary key,api_provider_name text);
  insert into v2_providers values ('provider-a','Provider A'),('provider-b','Provider B');
  create view private.v2_rpc_providers_compat as select * from v2_providers;
  create table public.v2_request_facts(request_event_id uuid primary key,occurred_at timestamptz,
    routed_model_slug text,requested_model_slug text,requested_model_input text,provider_model_id text,
    success boolean,latency_ms numeric,throughput numeric,generation_ms numeric);
  create table public.v2_request_usage(request_event_id uuid,meter_key text,quantity numeric,sequence int default 1);
  create index usage_request_idx on v2_request_usage(request_event_id,meter_key);
  insert into v2_request_facts
    select md5(i::text)::uuid,date_trunc('hour',now())-make_interval(hours=>i%150)-interval '15 minutes',
      case when i%3=0 then null else 'model-a' end,
      case when i%3=1 then 'different' when i%3=2 then null else 'model-a' end,'model-a',
      case when i%2=0 then 'route-a' else 'route-a2' end,i%5<>0,
      case when i%7=0 then null else i end,case when i%11=0 then null else i/2.0 end,i*10
    from generate_series(1,320) i;
  -- Cover explicit zero totals, absent totals, duplicate meter sequences and unrelated meters.
  insert into v2_request_usage select request_event_id,'input_tokens',100,1 from v2_request_facts;
  insert into v2_request_usage select request_event_id,'output_tokens',20,1 from v2_request_facts;
  insert into v2_request_usage select request_event_id,'input_tokens',3,2 from v2_request_facts;
  insert into v2_request_usage select request_event_id,'total_tokens',case when latency_ms::int%2=0 then 0 else 123 end,1
    from v2_request_facts where latency_ms::int%3<>0;
  insert into v2_request_usage select request_event_id,'unrelated',999,1 from v2_request_facts;
  -- Exact hour/day boundaries, pre-release and provider-prefixed IDs.
  insert into v2_request_facts(request_event_id,occurred_at,requested_model_input,success) values
    (md5('boundary')::uuid,date_trunc('hour',now())-interval '24 hours','model-a',true),
    (md5('now-hour')::uuid,date_trunc('hour',now()),'model-a',true),
    (md5('old')::uuid,now()-interval '40 days','model-a',false),
    (md5('prefixed')::uuid,now()-interval '2 days','provider-a/native-a',true);
  insert into v2_request_usage values (md5('prefixed')::uuid,'input_tokens',41,1);
  create view private.v2_rpc_gateway_requests_compat as select fact.occurred_at created_at,
    coalesce(fact.routed_model_slug,fact.requested_model_slug,fact.requested_model_input) model_id,
    fact.success,fact.latency_ms,fact.throughput,fact.generation_ms,route.provider_slug provider,usage.payload usage
    from v2_request_facts fact left join v2_model_provider_routes route using(provider_model_id)
    left join lateral (select jsonb_object_agg(meter_key,quantity) payload from
      (select meter_key,sum(quantity) quantity from v2_request_usage u
       where u.request_event_id=fact.request_event_id group by meter_key) grouped) usage on true;
`);
await db.exec(await read('./fixtures/public-model-timeouts-before.sql'));
await db.exec(`revoke all on function get_model_performance_overview(text) from public;
  grant execute on function get_model_performance_overview(text) to anon,authenticated,service_role;`);
const modelCases = ['model-a','model-b','empty','no-release','missing'];
const resolveCases = [['model-a',null],['alias-a',null],['disabled',null],['null-enabled',null],
  ['native-a',null],['route-a',null],['native-a','provider-b'],['blank',null],[null,null],['missing',null]];
async function snapshot() {
  const results = [];
  for (const timezone of ['UTC','Asia/Kolkata']) {
    await db.exec(`set timezone='${timezone}'`);
    for (const id of modelCases) {
      results.push((await db.query('select * from get_model_performance_overview($1)',[id])).rows);
      results.push((await db.query('select * from get_model_token_trajectory($1)',[id])).rows);
    }
  }
  for (const args of resolveCases) results.push((await db.query('select resolve_public_model_id($1,$2) id',args)).rows);
  return results;
}
// Hold transaction time fixed so bucket anchors are identical across implementations.
await db.exec('begin');
const before = await snapshot();
await db.exec('savepoint permissions_before; set role anon');
await assert.rejects(db.query('select resolve_public_model_id($1,$2)',['alias-a',null]),{code:'42501'});
await db.exec('rollback to savepoint permissions_before; reset role');
await db.exec(`grant usage on schema private to anon,authenticated,service_role;
  grant select on all tables in schema public,private to anon,authenticated,service_role;
  alter role service_role bypassrls;
  alter view private.v2_rpc_gateway_requests_compat set (security_invoker=true);
  alter table v2_request_facts enable row level security;
  alter table v2_request_usage enable row level security;
  create policy fixture_member_facts on v2_request_facts to authenticated using (latency_ms < 100);
  create policy fixture_member_usage on v2_request_usage to authenticated using
    (exists(select 1 from v2_request_facts fact where fact.request_event_id=v2_request_usage.request_event_id));`);
async function roleSnapshots() {
  const results=[];
  for (const role of ['anon','authenticated','service_role']) {
    await db.exec(`set role ${role}`);
    results.push(await snapshot());
    await db.exec('reset role');
  }
  return results;
}
const rolesBefore=await roleSnapshots();
// Restore the permission-denial boundary used earlier before applying the patch.
await db.exec('alter view private.v2_rpc_models_compat set (security_invoker=true); revoke select on v2_models from anon');
const grantsBefore = (await db.query("select proacl::text from pg_proc where oid='get_model_performance_overview(text)'::regprocedure")).rows;
await db.exec(await read('../migrations/20261006145526_optimize_public_model_timeout_queries.sql'));
assert.deepEqual(await snapshot(),before,'all metric values, boundaries, token fallbacks and resolver precedence are preserved');
assert.deepEqual((await db.query("select proacl::text from pg_proc where oid='get_model_performance_overview(text)'::regprocedure")).rows,grantsBefore,'existing RPC grants are preserved');
await db.exec('savepoint permissions; set role anon');
await assert.rejects(db.query('select resolve_public_model_id($1,$2)',['alias-a',null]),{code:'42501'});
await db.exec('rollback to savepoint permissions; reset role');
await db.exec('grant select on v2_models to anon; alter view private.v2_rpc_models_compat reset (security_invoker)');
assert.deepEqual(await roleSnapshots(),rolesBefore,'RLS-scoped reads preserve metrics for each caller role');
assert.equal((await db.query("select prosecdef from pg_proc where oid='resolve_public_model_id(text,text)'::regprocedure")).rows[0].prosecdef,false);
await db.exec('commit; set timezone=\'UTC\';');
// A selective model must be an index condition, not a post-scan filter.
await db.exec(`insert into v2_request_facts(request_event_id,occurred_at,requested_model_input)
  select md5('unrelated-'||i)::uuid,now(),'unrelated-'||i from generate_series(1,10000) i;
  analyze v2_request_facts;`);
const plan = (await db.query(`explain (format json) select request_event_id from v2_request_facts
  where coalesce(routed_model_slug,requested_model_slug,requested_model_input)='empty'
    and occurred_at>=now()-interval '5 days'`)).rows;
assert.match(JSON.stringify(plan),/v2_request_facts_resolved_model_time_idx/);
assert.match(JSON.stringify(plan),/Index Cond/);
// Exercise the cron branch against a local adapter; no maintenance deletes run.
await db.exec(`create schema cron;
  create table cron.job(jobid bigint primary key,jobname text,command text,schedule text,active boolean);
  insert into cron.job values (21,'prune-byok-request-metadata','old command','17 * * * *',false),
    (23,'provider-health-refresh-queue','keep command','* * * * *',true);
  create function cron.alter_job(bigint,command text) returns void language sql as
    'update cron.job set command = $2 where jobid = $1';`);
const migration = await read('../migrations/20261006145526_optimize_public_model_timeout_queries.sql');
const cronBlock = migration.slice(migration.indexOf('do $block$')).replace(
  "exists (select 1 from pg_extension where extname = 'pg_cron')",'true');
await db.exec(cronBlock);
const jobs = (await db.query('select * from cron.job order by jobid')).rows;
assert.equal(jobs[0].command,"set statement_timeout = '10s'; set lock_timeout = '500ms'; select public.prune_byok_request_metadata(90, 500);");
assert.equal(jobs[0].schedule,'17 * * * *');
assert.equal(jobs[0].active,false,'do not reenable a disabled cleanup');
assert.equal(jobs[1].command,'keep command','other jobs are unchanged');
await db.exec("delete from cron.job where jobid=21");
await db.exec(cronBlock); // Missing cleanup jobs are harmless.
await db.close();
console.log('Public model timeout regression tests passed: output parity, grants and indexed model selection.');
