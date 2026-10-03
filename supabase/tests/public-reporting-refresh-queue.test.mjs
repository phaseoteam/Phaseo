import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const migrationFile = '../migrations/20261003094412_queue_public_reporting_refreshes.sql';
const read = file => readFile(new URL(file, import.meta.url), 'utf8');
const functionFrom = async (file, name) => {
  const source = await read(file);
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const body = source.slice(start);
  const delimiter = body.match(/as (\$[^$]*\$)/i)[1];
  return body.slice(0, body.indexOf(`${delimiter};`, body.indexOf(delimiter) + delimiter.length) + delimiter.length + 1);
};
try {
  await db.exec(`
    create schema private; create schema cron;
    create role anon; create role authenticated; create role service_role;
    create table cron.job(jobname text primary key, active boolean, schedule text, command text, jobid bigint generated always as identity);
    insert into cron.job(jobname,active,schedule,command) values ('refresh-public-leaderboard-rollups',true,'',''),
      ('refresh-public-model-user-usage-daily',true,'',''),('refresh-public-model-workspace-usage-weekly',true,'','');
    create function cron.alter_job(p_jobid bigint, active boolean) returns void language sql as
      'update cron.job set active=$2 where jobid=$1';
    create function cron.schedule(text,text,text) returns bigint language sql as
      'insert into cron.job(jobname,active,schedule,command) values ($1,true,$2,$3) on conflict(jobname) do update set schedule=$2,command=$3,active=true returning 1::bigint';
    create table gateway_requests(id uuid, created_at timestamptz, api_model_id text, pricing_plan text,
      is_free_variant boolean, primary key(id,created_at));
    create table v2_model_provider_routes(provider_model_id text primary key,provider_slug text);
    create table v2_request_facts(request_event_id uuid primary key,occurred_at timestamptz,workspace_id uuid,
      routed_model_slug text,requested_model_slug text,requested_model_input text,provider_model_id text,
      safe_metadata jsonb default '{}',end_user_id text,key_id uuid,success boolean,
      gateway_request_id uuid,gateway_request_created_at timestamptz);
    create table v2_request_usage(request_event_id uuid references v2_request_facts on delete cascade,
      meter_key text,quantity numeric,sequence int,primary key(request_event_id,meter_key,sequence));
    create table v2_analytics_outbox(request_event_id uuid primary key,workspace_id uuid,occurred_at timestamptz,
      status text,attempt_count int,available_at timestamptz,last_error text,updated_at timestamptz);
    create table public_model_user_usage_daily(day_bucket date,model_id text,provider_id text,actor_hash text,
      requests bigint,tokens bigint,refreshed_at timestamptz,primary key(day_bucket,model_id,provider_id,actor_hash));
    create table public_model_workspace_usage_weekly(week_start date,model_id text,workspace_hash text,
      requests bigint,refreshed_at timestamptz,primary key(week_start,model_id,workspace_hash));
    create function public.resolve_public_model_id(text,text) returns text language sql as 'select nullif($1,'''')';
  `);
  await db.exec(await functionFrom('../migrations/20260306143000_gateway_request_details_and_rankings_fix.sql', 'gateway_usage_total_tokens'));
  await db.exec(await functionFrom('../migrations/20260610221839_gateway_request_normalized_usage_columns.sql', 'gateway_usage_nonnegative_bigint'));
  await db.exec(await functionFrom('../migrations/20260622204613_gateway_request_pricing_variant_for_leaderboards.sql', 'public_leaderboard_model_id'));
  // Legacy metric input shape is independent of the optimized refresh query.
  await db.exec(`create view public.v2_rpc_gateway_requests_legacy_shape as
    select f.request_event_id id,f.occurred_at created_at,f.workspace_id,f.workspace_id team_id,
      coalesce(f.routed_model_slug,f.requested_model_slug,f.requested_model_input) model_id,
      f.requested_model_input requested_model_id,f.routed_model_slug routed_model_id,
      coalesce(f.routed_model_slug,f.requested_model_slug) canonical_model_id,r.provider_slug provider,
      nullif(f.safe_metadata->>'oauth_user_id','')::uuid oauth_user_id,f.end_user_id,f.key_id,f.success,
      coalesce(u.payload,'{}') usage,coalesce(u.total_tokens,0)::bigint usage_total_tokens
    from v2_request_facts f left join v2_model_provider_routes r using(provider_model_id)
    left join lateral (select jsonb_object_agg(meter_key,quantity) payload,
      sum(quantity) filter(where meter_key in ('input_tokens','output_tokens')) total_tokens
      from (select meter_key,sum(quantity) quantity from v2_request_usage where request_event_id=f.request_event_id group by 1) m) u on true;`);
  await db.exec(await functionFrom('../migrations/20260811100351_fix_v2_public_usage_legacy_dependency.sql', 'refresh_public_model_user_usage_daily'));
  await db.exec(`alter function refresh_public_model_user_usage_daily(timestamptz,timestamptz) rename to fixture_legacy_refresh;`);
  await db.exec(await read('../migrations/20261003094224_cover_public_workspace_retention_reads.sql'));
  await db.exec(await read(migrationFile));
  await db.exec(await read('../migrations/20261003100138_isolate_reporting_signals_and_queue_repairs.sql'));
  await db.exec(await read('../migrations/20261003101150_bound_reporting_signal_shards.sql'));
  await db.exec(await read('../migrations/20261003094842_cover_free_router_usage_reads.sql'));
  await db.exec(`alter table v2_request_facts add column byok boolean;
    alter table gateway_requests add column byok boolean;
    create table v2_request_attempts(request_event_id uuid,safe_metadata jsonb);
    create table gateway_upstream_requests(gateway_request_id uuid,gateway_request_created_at timestamptz,key_source text);`);
  await db.exec(await read('../migrations/20261003102631_preserve_reports_during_metadata_pruning.sql'));
  await db.exec(`alter table v2_request_facts add column app_id uuid,add column cloudflare_colo text,
    add column status_code integer,add column tool_call_count bigint default 0,add column tool_call_succeeded boolean,
    add column structured_output_attempted boolean,add column structured_output_succeeded boolean,
    add column latency_ms bigint,add column generation_ms bigint,add column throughput numeric,
    add column gateway_total_ms bigint,add column internal_dispatch_ms bigint,add column cost_nanos numeric default 0;
    alter table v2_request_attempts add column success boolean;
    alter table v2_request_usage add column modality text default 'text',add column unit text default 'tokens';`);
  const metrics = `requests bigint,successful_requests bigint,failed_requests bigint,rate_limited_requests bigint,
    tool_call_count bigint,tool_call_requests bigint,tool_call_successes bigint,structured_output_attempts bigint,
    structured_output_successes bigint,latency_sum_ms bigint,latency_count bigint,generation_sum_ms bigint,
    generation_count bigint,throughput_sum numeric,throughput_count bigint,gateway_total_sum_ms bigint,
    gateway_total_count bigint,internal_dispatch_sum_ms bigint,internal_dispatch_count bigint,
    upstream_attempts bigint,failed_upstream_attempts bigint,cached_input_tokens numeric,input_tokens numeric,cost_nanos numeric`;
  for(const table of ['private_usage_daily','public_usage_daily','public_usage_hourly']) {
    await db.exec(`create table v2_${table}(rollup_id uuid primary key default gen_random_uuid(),
      ${table==='public_usage_hourly'?'bucket_start timestamptz':'usage_date date'},
      ${table==='private_usage_daily'?'workspace_id uuid,':''} app_id uuid,model_slug text,provider_model_id text,
      cloudflare_colo text,${metrics});
      create table v2_${table}_meters(rollup_id uuid references v2_${table} on delete cascade,
        meter_key text,modality text,unit text,quantity numeric);`);
  }
  await db.exec(`create table v2_rollup_refresh_state(rollup_name text,bucket_start timestamptz,last_started_at timestamptz,
    last_completed_at timestamptz,source_watermark timestamptz,status text,error_message text,updated_at timestamptz,
    primary key(rollup_name,bucket_start));`);
  await db.exec(await functionFrom('../migrations/20260722154000_v2_analytics_outbox_processor.sql','process_v2_analytics_outbox'));
  await db.exec(await read('../migrations/20261003102642_repair_previous_analytics_grains.sql'));
  const freeRouterIndex = (await db.query(`select indexdef from pg_indexes where indexname='v2_request_facts_free_router_reporting_idx'`)).rows[0].indexdef;
  assert.match(freeRouterIndex, /INCLUDE \(request_event_id\)/);
  assert.match(freeRouterIndex, /requested_model_input = 'phaseo\/free'/);
  const scalar = async sql => (await db.query(sql)).rows[0];
  const daily = async () => (await db.query(`select day_bucket::text,model_id,provider_id,actor_hash,requests::text,tokens::text
    from public_model_user_usage_daily where day_bucket < '2026-10-05' order by 1,2,3,4`)).rows;
  const drain = async () => {
    for(let i=0;i<30;i++) {
      if (!(await scalar('select count(*)::int n from private.public_reporting_refresh_queue')).n) return;
      assert.equal((await scalar('select private.drain_public_reporting_refresh() n')).n,1);
    }
    assert.fail('Queue did not drain');
  };
  await db.exec(`insert into v2_model_provider_routes values('route','provider');
    insert into gateway_requests(id,created_at,api_model_id,pricing_plan,is_free_variant) values('00000000-0000-0000-0000-000000000001','2026-10-03 10:00Z','model:free','free',true);
    insert into v2_request_facts(request_event_id,occurred_at,workspace_id,routed_model_slug,requested_model_slug,requested_model_input,provider_model_id,safe_metadata,end_user_id,key_id,success,gateway_request_id,gateway_request_created_at) values
      ('00000000-0000-0000-0000-000000000001','2026-10-03 10:00Z','10000000-0000-0000-0000-000000000001','model','model','model:free','route','{}',null,null,true,'00000000-0000-0000-0000-000000000001','2026-10-03 10:00Z'),
      ('00000000-0000-0000-0000-000000000002','2026-10-03 23:59:59.999999Z','10000000-0000-0000-0000-000000000002','model','model','model','route','{"oauth_user_id":"20000000-0000-0000-0000-000000000001"}','end-user',null,true,null,null),
      ('00000000-0000-0000-0000-000000000003','2026-10-04 00:00Z','10000000-0000-0000-0000-000000000001',null,'model','model',null,'{}','end-user',null,false,null,null),
      ('00000000-0000-0000-0000-000000000004','2026-10-04 01:00Z','10000000-0000-0000-0000-000000000001',null,'model','model',null,'{}','end-user',null,true,null,null);
    insert into v2_request_usage(request_event_id,meter_key,quantity,sequence) values
      ('00000000-0000-0000-0000-000000000001','input_tokens',1.5,0),
      ('00000000-0000-0000-0000-000000000001','input_tokens',2.5,1),
      ('00000000-0000-0000-0000-000000000001','output_tokens',8,0),
      ('00000000-0000-0000-0000-000000000002','total_tokens',15,0);
    select fixture_legacy_refresh('2026-10-03','2026-10-05');`);
  const baseline = await daily();
  assert.equal(baseline.length,3);
  await db.exec(`insert into public_model_user_usage_daily values('2026-10-05','sentinel','provider','actor',7,9,now());
    insert into public_model_workspace_usage_weekly values('2026-10-05','sentinel','workspace',7,now());`);
  await drain();
  assert.deepEqual(await daily(),baseline);
  assert.equal((await scalar(`select count(*)::int n from public_model_user_usage_daily where model_id='sentinel'`)).n,1);
  assert.equal((await scalar(`select count(*)::int n from public_model_workspace_usage_weekly where model_id='sentinel'`)).n,1);
  assert.equal((await scalar(`select requests::int n from public_model_workspace_usage_weekly where model_id='model' and workspace_hash=md5('public-model-workspace:10000000-0000-0000-0000-000000000001')`)).n,2);
  // Corrections, authoritative free metadata, usage mutations and cascades.
  await db.exec(`update v2_analytics_outbox set status='complete';
    update gateway_requests set api_model_id='model',pricing_plan='standard',is_free_variant=false;
    update v2_request_usage set quantity=21 where meter_key='total_tokens';
    update v2_request_facts set success=true where request_event_id='00000000-0000-0000-0000-000000000003';`);
  await drain();
  assert.equal((await scalar(`select status from v2_analytics_outbox where request_event_id='00000000-0000-0000-0000-000000000002'`)).status,'pending');
  assert.equal((await scalar(`select status from v2_analytics_outbox where request_event_id='00000000-0000-0000-0000-000000000003'`)).status,'pending');
  const corrected = await daily();
  await db.exec(`select fixture_legacy_refresh('2026-10-03','2026-10-05')`);
  assert.deepEqual(await daily(),corrected);
  await db.exec(`update v2_request_facts set occurred_at='2026-10-06',routed_model_slug='moved' where request_event_id='00000000-0000-0000-0000-000000000001';
    delete from v2_request_facts where request_event_id='00000000-0000-0000-0000-000000000002';`);
  await drain();
  assert.equal((await scalar(`select count(*)::int n from public_model_user_usage_daily where day_bucket='2026-10-03'`)).n,0);
  assert.equal((await scalar(`select requests::int n from public_model_workspace_usage_weekly where model_id='moved'`)).n,1);
  // A concurrent/new-generation signal survives acknowledgment.
  await db.exec(`create function fixture_race() returns trigger language plpgsql as $$begin
    perform private.enqueue_public_reporting_refresh(new.day_bucket::timestamp at time zone 'utc'); return new; end$$;
    create trigger fixture_race after insert on public_model_user_usage_daily for each row execute function fixture_race();
    select private.enqueue_public_reporting_refresh('2026-10-04');`);
  await db.query('select private.drain_public_reporting_refresh()');
  assert.equal((await scalar(`select count(distinct (report,bucket_start))::int n from private.public_reporting_refresh_queue`)).n,2);
  await db.exec('drop trigger fixture_race on public_model_user_usage_daily');
  await drain();
  // Publication failure restores the old result and backs off despite new traffic.
  await db.exec(`create function fixture_fail() returns trigger language plpgsql as $$begin raise exception 'fixture'; end$$;
    create trigger fixture_fail before insert on public_model_user_usage_daily for each row execute function fixture_fail();
    select private.enqueue_public_reporting_refresh('2026-10-04');`);
  const previous = await daily();
  assert.equal((await scalar('select private.drain_public_reporting_refresh() n')).n,0);
  assert.deepEqual(await daily(),previous);
  assert.equal((await scalar(`select last_error_code from private.public_reporting_refresh_queue where report='users_daily'`)).last_error_code,'P0001');
  await db.exec(`select private.enqueue_public_reporting_refresh('2026-10-04')`);
  assert.equal((await scalar(`select (retry_after > clock_timestamp()+interval '1 hour') backed_off from private.public_reporting_refresh_queue where report='users_daily'`)).backed_off,true);
  assert.equal((await scalar(`select (retry_after > clock_timestamp()+interval '1 hour') backed_off from private.public_reporting_refresh_backoff where report='users_daily'`)).backed_off,true);
  // Independent transactions never share a signaling tuple; repeated meters
  // within a transaction coalesce without losing the earlier dirty period.
  await db.exec(`begin; select private.enqueue_public_reporting_refresh('2026-09-01');
    select private.enqueue_public_reporting_refresh('2026-09-01'); commit;`);
  await db.exec(`select private.enqueue_public_reporting_refresh('2026-09-01')`);
  assert.equal((await scalar(`select count(*)::int n from private.public_reporting_refresh_queue where bucket_start='2026-09-01'`)).n,2);
  for(let i=0;i<200;i++) {
    await db.exec(`select private.enqueue_public_reporting_refresh('2026-10-04')`);
  }
  assert.equal((await scalar(`select count(*)::int n from private.public_reporting_refresh_queue where report='users_daily' and bucket_start='2026-10-04'`)).n,64);
  assert.equal((await scalar(`select count(*)::int n from private.public_reporting_refresh_queue where report='workspaces_weekly' and bucket_start='2026-09-28'`)).n,64);
  assert.equal((await scalar(`select (retry_after > clock_timestamp()+interval '1 hour') backed_off from private.public_reporting_refresh_backoff where report='users_daily'`)).backed_off,true);
  for(const role of ['anon','authenticated','service_role']) {
    assert.equal((await scalar(`select has_table_privilege('${role}','private.public_reporting_refresh_queue','SELECT') allowed`)).allowed,false);
  }
  assert.equal((await scalar(`select count(*)::int n from cron.job where jobname like 'refresh-public-%' and active`)).n,0);
  assert.equal((await scalar(`select has_function_privilege('anon','private.drain_public_reporting_refresh()','EXECUTE') allowed`)).allowed,false);
  // Run the real bounded retention function: cascaded meters must not dirty
  // durable historical reports or create correction outbox work.
  await db.exec(`drop trigger fixture_fail on public_model_user_usage_daily;
    insert into v2_request_facts(request_event_id,occurred_at,workspace_id,routed_model_slug,success,byok)
    values('00000000-0000-0000-0000-000000000099','2025-01-01','10000000-0000-0000-0000-000000000001','retained-model',true,true);
    insert into v2_request_usage(request_event_id,meter_key,quantity,sequence) values('00000000-0000-0000-0000-000000000099','input_tokens',10,1);
    select public.refresh_public_model_user_usage_daily('2025-01-01','2025-01-02');
    select public.refresh_public_model_workspace_usage_weekly('2024-12-30','2025-01-06');
    delete from private.public_reporting_refresh_queue;
    delete from private.v2_analytics_previous_grains;
    delete from public.v2_analytics_outbox;`);
  const retainedReports = (await db.query(`select * from public_model_user_usage_daily where day_bucket='2025-01-01'`)).rows;
  assert.equal((await scalar(`select public.prune_byok_request_metadata(90,100) result`)).result.v2_deleted,1);
  assert.equal((await scalar(`select count(*)::int n from private.public_reporting_refresh_queue`)).n,0);
  assert.equal((await scalar(`select count(*)::int n from v2_analytics_outbox`)).n,0);
  assert.equal((await scalar(`select count(*)::int n from private.v2_analytics_previous_grains`)).n,0);
  assert.deepEqual((await db.query(`select * from public_model_user_usage_daily where day_bucket='2025-01-01'`)).rows,retainedReports);
  assert.equal((await scalar(`select requests::int n from public_model_workspace_usage_weekly where model_id='retained-model'`)).n,1);
  assert.equal((await scalar(`select coalesce(current_setting('phaseo.pruning_byok_metadata',true),'') flag`)).flag,'');
  await db.exec(`update v2_request_facts set routed_model_slug='after-pruning' where request_event_id='00000000-0000-0000-0000-000000000001'`);
  assert.equal((await scalar(`select count(*)::int n from private.public_reporting_refresh_queue`)).n,2);
  // Seed an old V2 group, then move its last request through two identities.
  await db.exec(`delete from private.v2_analytics_previous_grains;
    delete from v2_analytics_outbox;
    select private.enqueue_v2_analytics_correction('00000000-0000-0000-0000-000000000001');
    select public.process_v2_analytics_outbox(10);
    update v2_request_facts set occurred_at='2026-10-07',routed_model_slug='intermediate' where request_event_id='00000000-0000-0000-0000-000000000001';
    update v2_request_facts set occurred_at='2026-10-08',routed_model_slug='final' where request_event_id='00000000-0000-0000-0000-000000000001';`);
  assert.equal((await scalar(`select count(*)::int n from private.v2_analytics_previous_grains`)).n,2);
  await db.exec(`create trigger fixture_old_grain_fail before insert on v2_public_usage_daily
    for each row execute function fixture_fail();`);
  await assert.rejects(db.exec(`select public.process_v2_analytics_outbox(10)`),/fixture/);
  assert.equal((await scalar(`select count(*)::int n from private.v2_analytics_previous_grains`)).n,2);
  await db.exec(`drop trigger fixture_old_grain_fail on v2_public_usage_daily`);
  await db.exec(`select public.process_v2_analytics_outbox(10);`);
  assert.equal((await scalar(`select count(*)::int n from private.v2_analytics_previous_grains`)).n,1);
  await db.exec(`select public.process_v2_analytics_outbox(10);`);
  assert.equal((await scalar(`select count(*)::int n from private.v2_analytics_previous_grains`)).n,0);
  for(const table of ['private_usage_daily','public_usage_daily','public_usage_hourly']) {
    assert.equal((await scalar(`select coalesce(sum(requests),0)::int n from v2_${table} where model_slug='after-pruning'`)).n,0);
    assert.equal((await scalar(`select sum(requests)::int n from v2_${table} where model_slug='final'`)).n,1);
  }
  await db.exec(`delete from v2_request_facts where request_event_id='00000000-0000-0000-0000-000000000001';
    select public.process_v2_analytics_outbox(10);`);
  assert.equal((await scalar(`select coalesce(sum(requests),0)::int n from v2_public_usage_daily where model_slug='final'`)).n,0);
  console.log('Public reporting queue: legacy equivalence, UTC boundaries, corrections, cascades, 64-signal cap, retention preservation, former-grain moves/deletions, atomic repair rollback, outbox repairs and permissions passed.');
} catch(error) {
  console.error(error.message,error.code ?? '',error.where ?? '');
  process.exitCode=1;
} finally { await db.close(); }
