import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const migration = await readFile(new URL('../migrations/20261003085925_coalesce_provider_health_refresh.sql', import.meta.url), 'utf8');
try {
  await db.exec(`
    create schema private; create schema cron;
    create role anon; create role authenticated; create role service_role;
    create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
    create table v2_model_provider_routes(provider_model_id text primary key,provider_slug text);
    create table v2_request_facts(request_event_id uuid primary key,occurred_at timestamptz,
      routed_model_slug text,requested_model_slug text);
    create table v2_request_attempts(attempt_id integer generated always as identity primary key,
      request_event_id uuid references v2_request_facts on delete cascade,attempt_number integer,
      provider_model_id text,success boolean,latency_ms integer,unique(request_event_id,attempt_number));
    create index attempts_request on v2_request_attempts(request_event_id);
    create table v2_public_provider_health_daily(usage_date date,model_slug text,provider_model_id text,
      provider_slug text,request_count bigint,successful_request_count bigint,attempt_count bigint,
      successful_attempts bigint,failed_attempts bigint,fallback_attempts bigint,latency_sum_ms bigint,
      latency_count bigint,updated_at timestamptz,primary key(usage_date,model_slug,provider_slug,provider_model_id));
    insert into v2_model_provider_routes values('route-a','provider-a'),('route-b','provider-b');
    insert into v2_request_facts values
      ('00000000-0000-0000-0000-000000000001','2026-10-03 01:00Z','model-a','alias'),
      ('00000000-0000-0000-0000-000000000002','2026-10-03 02:00Z',null,'model-a');
  `);
  await db.exec(migration);
  await db.exec(await readFile(new URL('../migrations/20261003090335_bound_health_queue_drain.sql', import.meta.url), 'utf8'));
  const scalar = async sql => (await db.query(sql)).rows[0];
  const verify = async () => {
    await db.query('select private.drain_provider_health_refresh(5)');
    const actual = (await db.query(`select usage_date::text,model_slug,provider_model_id,provider_slug,
      request_count::text,successful_request_count::text,attempt_count::text,successful_attempts::text,
      failed_attempts::text,fallback_attempts::text,latency_sum_ms::text,latency_count::text
      from v2_public_provider_health_daily order by 1,2,3`)).rows;
    const expected = (await db.query(`select f.occurred_at::date::text usage_date,
      coalesce(f.routed_model_slug,f.requested_model_slug) model_slug,a.provider_model_id,r.provider_slug,
      count(distinct f.request_event_id)::text request_count,
      (count(distinct f.request_event_id) filter(where a.success))::text successful_request_count,
      count(*)::text attempt_count,(count(*) filter(where a.success))::text successful_attempts,
      (count(*) filter(where not a.success))::text failed_attempts,
      (count(*) filter(where a.attempt_number>1))::text fallback_attempts,
      coalesce(sum(a.latency_ms),0)::text latency_sum_ms,count(a.latency_ms)::text latency_count
      from v2_request_facts f join v2_request_attempts a using(request_event_id)
      join v2_model_provider_routes r using(provider_model_id)
      where coalesce(f.routed_model_slug,f.requested_model_slug) is not null
      group by 1,2,3,4 order by 1,2,3`)).rows;
    assert.deepEqual(actual, expected);
  };
  await db.exec(`insert into v2_request_attempts(request_event_id,attempt_number,provider_model_id,success,latency_ms)
    values ('00000000-0000-0000-0000-000000000001',1,'route-a',false,100),
      ('00000000-0000-0000-0000-000000000001',2,'route-a',true,200),
      ('00000000-0000-0000-0000-000000000001',3,'route-b',true,null),
      ('00000000-0000-0000-0000-000000000002',1,'route-a',true,0);`);
  assert.equal((await scalar('select count(*)::int n from private.provider_health_refresh_queue')).n, 2);
  assert.equal((await scalar('select count(*)::int n from v2_public_provider_health_daily')).n, 0,
    'ingestion must enqueue without recomputing health');
  await verify();
  // Corrected attempt, replay/delete-and-reinsert, and a moved fact must converge.
  await db.exec('update v2_request_attempts set success=false,latency_ms=null where attempt_id=2');
  await verify();
  await db.exec(`update v2_request_facts set occurred_at='2026-10-02 23:59Z',routed_model_slug='model-b'
    where request_event_id='00000000-0000-0000-0000-000000000001'`);
  assert.equal((await scalar(`select routed_model_slug from v2_request_facts
    where request_event_id='00000000-0000-0000-0000-000000000001'`)).routed_model_slug, 'model-b');
  await verify();
  await db.exec(`delete from v2_request_attempts where request_event_id='00000000-0000-0000-0000-000000000001';
    insert into v2_request_attempts(request_event_id,attempt_number,provider_model_id,success,latency_ms)
    values('00000000-0000-0000-0000-000000000001',1,'route-b',true,350);`);
  await verify();
  // Simulate a concurrent write during publication. Its newer generation must survive.
  await db.exec(`create function health_write_race() returns trigger language plpgsql as $$begin
    perform private.enqueue_provider_health_refresh(new.usage_date,new.model_slug,new.provider_model_id);
    return new; end$$;
    create trigger health_race after insert on v2_public_provider_health_daily
      for each row execute function health_write_race();
    select private.enqueue_provider_health_refresh('2026-10-02','model-b','route-b');
    select private.drain_provider_health_refresh(5);`);
  assert.equal((await scalar('select count(*)::int n from private.provider_health_refresh_queue')).n, 1);
  await db.exec('drop trigger health_race on v2_public_provider_health_daily');
  await verify();
  await db.exec(`delete from v2_request_facts where request_event_id='00000000-0000-0000-0000-000000000001'`);
  await verify();
  // Failed publication rolls back the derived delete and preserves its retry signal.
  await db.exec(`select private.enqueue_provider_health_refresh('2026-10-03','model-a','route-a');
    create function health_fail() returns trigger language plpgsql as $$begin raise exception 'fixture failure'; end$$;
    create trigger health_failure before insert on v2_public_provider_health_daily for each row execute function health_fail();`);
  assert.equal((await scalar('select private.drain_provider_health_refresh(5) n')).n, 0);
  assert.equal((await scalar('select last_error_code from private.provider_health_refresh_queue')).last_error_code, 'P0001');
  assert.equal((await scalar('select count(*)::int n from v2_public_provider_health_daily')).n, 1);
  await db.exec(`drop trigger health_failure on v2_public_provider_health_daily;
    update private.provider_health_refresh_queue set retry_after=clock_timestamp();`);
  await verify();
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await scalar(`select has_table_privilege('${role}','private.provider_health_refresh_queue','SELECT') allowed`)).allowed, false);
  }
  assert.equal((await scalar(`select has_function_privilege('anon','private.drain_provider_health_refresh(integer)','EXECUTE') allowed`)).allowed, false);
  assert.equal((await scalar('select count(*)::int n from private.provider_health_refresh_queue')).n, 0);
  console.log('Provider health queue: coalescing, retries, mutations, cascades, generation race and permissions passed.');
} catch (error) {
  console.error(error.message, error.code ?? '', error.where ?? '');
  process.exitCode = 1;
} finally { await db.close(); }
