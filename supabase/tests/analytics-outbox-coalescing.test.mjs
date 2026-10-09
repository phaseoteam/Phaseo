import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const tables = ['v2_private_usage_daily', 'v2_public_usage_daily', 'v2_public_usage_hourly'];

async function fixture(current) {
  const db = new PGlite();
  await db.exec(await read('./fixtures/staged-reporting-before.sql'));
  await db.exec("set timezone='UTC';");
  // Use the deployed visibility rules, and real correction writers.
  await db.exec(await read('../migrations/20261009114400_exclude_staged_models_from_public_reporting.sql'));
  for (const name of ['enqueue_v2_analytics_correction', 'enqueue_v2_analytics_fact_correction', 'enqueue_v2_analytics_meter_correction']) {
    await db.exec(await read(`../schemas/private/functions/${name}.sql`));
  }
  await db.exec(await read(current ? '../schemas/public/functions/process_v2_analytics_outbox.sql' : './fixtures/analytics-outbox-before.sql'));
  for (const table of tables) {
    await db.exec(`alter table ${table}_meters add foreign key (rollup_id) references ${table}(rollup_id) on delete cascade`);
  }
  await db.exec(`
    create index test_usage_request_idx on v2_request_usage(request_event_id);
    create index test_attempt_request_idx on v2_request_attempts(request_event_id);
    create unique index previous_grain_identity on private.v2_analytics_previous_grains
      (workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo) nulls not distinct;
    alter table private.v2_analytics_previous_grains alter queued_at set default clock_timestamp();
    alter table private.v2_analytics_previous_grains alter transaction_id set default txid_current();
    create trigger fact_correction after update or delete on v2_request_facts
      for each row execute function private.enqueue_v2_analytics_fact_correction();
    create trigger meter_correction after insert or update or delete on v2_request_usage
      for each row execute function private.enqueue_v2_analytics_meter_correction();
    insert into v2_models(model_slug,hidden,status) values ('model-a',false,'active'),('model-b',false,'active');
    insert into v2_model_provider_routes(provider_model_id,model_slug,provider_slug,access_scope,phaseo_status,routing_enabled,status,is_stealth,provider_availability_status)
      values ('route-a','model-a','provider','public','enabled',true,'active',false,'available'),
        ('route-b','model-b','provider','public','enabled',true,'active',false,'available');
    insert into v2_request_facts (request_event_id,workspace_id,request_id,occurred_at,routed_model_slug,provider_model_id,
      success,status_code,latency_ms,throughput,generation_ms,cost_nanos,public_reporting_allowed)
    select md5(i::text)::uuid, md5('workspace')::uuid, 'request-'||i,
      date_trunc('day',now())-interval '1 day', 'model-a', 'route-a', i%5<>0,
      case when i%5=0 then 429 else 200 end, case when i%7=0 then null else i end,
      case when i%11=0 then null else i/2.0 end,i*2,i*100,i%13<>0
    from generate_series(1,3000) i;
    update v2_request_facts set safe_metadata='{"testing_mode":true}'
      where substring(request_id from 9)::integer%13=0;
    insert into v2_request_usage(request_event_id,meter_key,modality,unit,quantity)
      select request_event_id,'input_tokens','text','token',3 from v2_request_facts;
    insert into v2_analytics_outbox(request_event_id,workspace_id,occurred_at,status,available_at,updated_at)
      select request_event_id,workspace_id,occurred_at,'pending',now(),now() from v2_request_facts
      on conflict(request_event_id) do update set available_at=now();
    -- Same public hour but another workspace is not covered privately.
    insert into v2_request_facts(request_event_id,workspace_id,request_id,occurred_at,routed_model_slug,provider_model_id,success,public_reporting_allowed)
      values (md5('other')::uuid,md5('other-workspace')::uuid,'other',date_trunc('day',now())-interval '1 day'+interval '1 minute','model-a','route-a',true,true);
    insert into v2_analytics_outbox(request_event_id,workspace_id,occurred_at,status,available_at)
      select request_event_id,workspace_id,occurred_at,'pending',now() from v2_request_facts where request_id='other';
    -- Not ready to acknowledge, even though the aggregate sees its fact.
    insert into v2_request_facts(request_event_id,workspace_id,request_id,occurred_at,routed_model_slug,provider_model_id,success,public_reporting_allowed)
      values (md5('future')::uuid,md5('workspace')::uuid,'future',date_trunc('day',now())-interval '1 day','model-a','route-a',true,true);
    insert into v2_analytics_outbox(request_event_id,workspace_id,occurred_at,status,available_at)
      select request_event_id,workspace_id,occurred_at,'pending',now()+interval '1 day' from v2_request_facts where request_id='future';
  `);
  return db;
}

async function drain(db, current, checkInitial = false) {
  let calls = 0;
  let grains = 0;
  while (calls++ < 30) {
    const result = (await db.query('select process_v2_analytics_outbox(250) result')).rows[0].result;
    if (!result.selected) return { calls: calls-1, grains };
    grains += result.private_grains + result.public_daily_grains + result.public_hourly_grains;
    if (calls === 1 && current && checkInitial) {
      assert.equal(result.selected,250);
      assert.equal(result.coalesced,1750);
      assert.equal(Number((await db.query("select count(*) n from v2_analytics_outbox where status='complete'")).rows[0].n),2000);
      assert.equal((await db.query("select status from v2_analytics_outbox where request_event_id=md5('other')::uuid")).rows[0].status,'pending');
      assert.equal((await db.query("select status from v2_analytics_outbox where request_event_id=md5('future')::uuid")).rows[0].status,'pending');
    }
  }
  assert.fail('Worker failed to drain ready events');
}

async function output(db) {
  const data = {};
  for (const table of tables) {
    data[table] = (await db.query(`select to_jsonb(r)-'rollup_id'-'created_at'-'updated_at' as row from ${table} r order by (to_jsonb(r)-'rollup_id'-'created_at'-'updated_at')::text`)).rows;
    data[`${table}_meters`] = (await db.query(`select to_jsonb(r)-'rollup_id'-'created_at'-'updated_at' as grain,
      m.meter_key,m.modality,m.unit,m.quantity from ${table} r join ${table}_meters m using(rollup_id)
      order by (to_jsonb(r)-'rollup_id'-'created_at'-'updated_at')::text,m.meter_key,m.modality,m.unit`)).rows;
  }
  return data;
}

let before;
let after;
try {
  before = await fixture(false);
  after = await fixture(true);
  const oldWork = await drain(before, false);
  const newWork = await drain(after, true, true);
  assert.deepEqual(await output(after), await output(before), 'Every rollup and meter is equivalent after draining');
  assert(newWork.grains < oldWork.grains / 2, 'Already covered events remove repeated summary rebuilds');
  const publicCount = Number((await after.query('select sum(requests) n from v2_public_usage_daily')).rows[0].n);
  assert.equal(publicCount,3002-Math.floor(3000/13));
  // A correction arriving during a rebuild must not be acknowledged as covered.
  await after.exec(`create function test_correct_during_rebuild() returns trigger language plpgsql as $$ begin
      if current_setting('test.correct',true)='on' then
        perform set_config('test.correct','off',false);
        update public.v2_request_usage set quantity=13 where request_event_id=md5('1')::uuid;
      end if;
      return new;
    end $$;
    create trigger correct_during_rebuild before insert on v2_private_usage_daily
      for each row execute function test_correct_during_rebuild();
    update v2_analytics_outbox set status='pending',available_at=now() where request_event_id=md5('1')::uuid;
    set test.correct='on';`);
  await after.query('select process_v2_analytics_outbox(250)');
  assert.equal((await after.query("select status from v2_analytics_outbox where request_event_id=md5('1')::uuid")).rows[0].status,'pending');
  await drain(after, true);
  assert.equal(Number((await after.query("select sum(quantity) n from v2_private_usage_daily_meters where meter_key='input_tokens'")).rows[0].n),9010);
  // Moving an event requires rebuilding both the former and new identities.
  await after.exec("update v2_request_facts set routed_model_slug='model-b',provider_model_id='route-b',occurred_at=occurred_at+interval '1 day',cloudflare_colo='LHR' where request_event_id=md5('1')::uuid");
  await drain(after, true);
  assert.equal(Number((await after.query('select count(*) n from private.v2_analytics_previous_grains')).rows[0].n),0);
  assert.equal(Number((await after.query("select sum(requests) n from v2_private_usage_daily where model_slug='model-b'")).rows[0].n),1);
  const corrected = await output(after);
  assert.equal((await after.query('select process_v2_analytics_outbox(250) result')).rows[0].result.selected,0);
  assert.deepEqual(await output(after),corrected,'Empty runs do not change rollups');
  const privileges = (await after.query("select has_function_privilege('anon','public.process_v2_analytics_outbox(integer)','execute') anon,has_function_privilege('service_role','public.process_v2_analytics_outbox(integer)','execute') backend")).rows[0];
  assert.deepEqual(privileges,{anon:false,backend:true});
  console.log(JSON.stringify({ oldWork,newWork,checks:'All aggregate fields/meters, coalescing cap, workspace boundaries, readiness, public visibility, correction re-enqueue, moved grains, idempotency and grants passed' },null,2));
} catch (error) {
  console.error(error.message, error.detail ?? '', error.where?.split('\n')[0] ?? '');
  process.exitCode = 1;
} finally {
  await before?.close();
  await after?.close();
}
