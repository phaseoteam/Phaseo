// Run with PGLITE_MODULE pointing to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  create role service_role; create role anon; create role authenticated;
  create table v2_models (model_slug text primary key, hidden boolean default false, status text default 'active');
  create table v2_model_provider_routes (provider_model_id text primary key, is_stealth boolean default false,
    routing_enabled boolean default true, status text default 'active', effective_from timestamptz, effective_to timestamptz);
  create table public_model_user_usage_daily (day_bucket date, model_id text, actor_hash text);
  create table v2_public_usage_daily (usage_date date, model_slug text, provider_model_id text, tool_call_count bigint);
  create table v2_rpc_gateway_model_usage_daily (
    day_bucket date, model_id text, input_text_tokens numeric default 0, output_text_tokens numeric default 0,
    image_inputs numeric default 0, image_outputs numeric default 0, input_audio_tokens numeric default 0,
    output_audio_tokens numeric default 0, audio_seconds numeric default 0, speech_seconds numeric default 0,
    transcription_seconds numeric default 0, input_video_tokens numeric default 0, output_video_tokens numeric default 0,
    video_seconds numeric default 0, cached_read_tokens numeric default 0, cached_write_tokens numeric default 0,
    embedding_tokens numeric default 0, rerank_quad_tokens numeric default 0
  );
  create table v2_request_facts (request_event_id text primary key, occurred_at timestamptz,
    routed_model_slug text, requested_model_slug text, provider_model_id text, tool_call_count bigint,
    gateway_request_id text, gateway_request_created_at timestamptz);
  create table v2_request_usage (request_event_id text, meter_key text, quantity numeric);
  create table gateway_requests (id text, created_at timestamptz, api_model_id text, pricing_plan text, is_free_variant boolean);
  create table v2_rpc_gateway_requests_legacy_shape (id text, created_at timestamptz, canonical_model_id text,
    model_id text, requested_model_id text, routed_model_id text, provider text, oauth_user_id text,
    end_user_id text, workspace_id text, team_id text, key_id text, success boolean);
  create function public.public_leaderboard_model_id(text,text,text,text,text,text,text,boolean) returns text
    language sql as $$ select coalesce($1,$2,$3,$4,$5) $$;
  insert into v2_models values ('model',false,'active'), ('hidden',true,'active');
  insert into v2_model_provider_routes values ('route',false,true,'active',null,null), ('stealth',true,true,'active',null,null);
  alter table v2_models add column lab_slug text default 'lab';
  create table v2_labs (lab_slug text primary key, name text);
  insert into v2_labs values ('lab','Lab');
  alter table v2_model_provider_routes add column provider_slug text default 'provider';
  alter table v2_request_facts add column app_id uuid default '00000000-0000-0000-0000-000000000001';
  alter table v2_request_facts add column success boolean default true;
  alter table v2_public_usage_daily add column rollup_id uuid default gen_random_uuid();
  alter table v2_public_usage_daily add column app_id uuid;
  alter table v2_public_usage_daily add column requests bigint;
  alter table v2_public_usage_daily add column successful_requests bigint;
  create table v2_public_usage_daily_meters (rollup_id uuid, meter_key text, quantity numeric);
  create table api_apps (id uuid primary key, title text, url text, last_seen timestamptz, is_public boolean, is_active boolean);
  insert into api_apps values
    ('00000000-0000-0000-0000-000000000001','App A','https://example.com/a',now(),true,true),
    ('00000000-0000-0000-0000-000000000002','App B','https://example.com/b',now(),true,true);
  create function public.api_app_url_group_key(text,text) returns text language sql as
    $$ select coalesce(split_part($1,'/',3),$2) $$;
  grant select on all tables in schema public to service_role;
`);
for (const migration of ['20261005130000_rolling_ranking_totals', '20261005140000_rolling_app_and_market_totals']) {
  await db.exec(await readFile(new URL(`../migrations/${migration}.sql`, import.meta.url), 'utf8'));
}
for (const [metric, meters, value] of [
  ['tokens',{total_tokens:10,input_tokens:20,output_tokens:30},10],
  ['tokens',{input_tokens:4},4],
  ['tokens',{input_text_tokens:2,output_text_tokens:3},5],
  ['cached_tokens',{cached_read_tokens:5,cached_input_tokens:9999,cache_write_tokens:7},12],
  ['video_seconds',{video_seconds:0,output_video_seconds:9999},0],
]) {
  const result=await db.query('select public_ranking_metric_value($1,$2) as value',[metric,JSON.stringify(meters)]);
  assert.equal(Number(result.rows[0].value),value);
}
const DAY = 24 * 60 * 60 * 1000;
let events;
async function seed(asOf) {
  await db.exec(`truncate v2_request_facts, v2_request_usage, v2_rpc_gateway_model_usage_daily, v2_public_usage_daily_meters,
    v2_public_usage_daily, public_model_user_usage_daily, v2_rpc_gateway_requests_legacy_shape`);
  const end = Date.parse(asOf);
  events = [
    [0,10000], [-3600000,1], [-DAY,2], [-DAY-1,4], [-2*DAY,8], [-2*DAY-1,16],
    [-7*DAY,32], [-7*DAY-1,64], [-14*DAY,128], [-14*DAY-1,256],
    [-30*DAY,512], [-30*DAY-1,1024], [-60*DAY,2048], [-60*DAY-1,4096],
    [3600000,20000],
  ].map(([offset, value], i) => ({ id: String(i), at: end+offset, value, actor: i % 3 ? 'repeat' : 'second' }));
  for (const event of events) {
    await db.query(`insert into v2_request_facts (request_event_id,occurred_at,routed_model_slug,requested_model_slug,provider_model_id,tool_call_count,app_id)
      values ($1,$2,'model','model','route',$3,$4)`,
      [event.id, new Date(event.at).toISOString(), event.value, `00000000-0000-0000-0000-00000000000${Number(event.id)%2+1}`]);
    await db.query(`insert into v2_request_usage values ($1,'input_text_tokens',$2), ($1,'output_video_seconds',$2 / 10.0),
      ($1,'image_inputs',3), ($1,'input_images',9999), ($1,'cached_read_tokens',5), ($1,'cached_input_tokens',9999)`, [event.id,event.value]);
    await db.query(`insert into v2_rpc_gateway_requests_legacy_shape values ($1,$2,'model','model','model','model','provider',
      null,$3,'workspace',null,null,true)`, [event.id,new Date(event.at).toISOString(),event.actor]);
  }
  await db.exec(`
    insert into v2_rpc_gateway_model_usage_daily (day_bucket,model_id,input_text_tokens,video_seconds,image_inputs,cached_read_tokens)
      select (occurred_at at time zone 'UTC')::date,'model',sum(tool_call_count),sum(tool_call_count) / 10.0, count(*) * 3, count(*) * 5
      from v2_request_facts group by 1;
    insert into v2_public_usage_daily (usage_date,model_slug,provider_model_id,tool_call_count,app_id,requests,successful_requests)
      select (occurred_at at time zone 'UTC')::date,'model','route',sum(tool_call_count),app_id,count(*),count(*) from v2_request_facts group by 1,app_id;
    insert into v2_public_usage_daily_meters
      select d.rollup_id,u.meter_key,sum(u.quantity) from v2_public_usage_daily d
      join v2_request_facts f on (f.occurred_at at time zone 'UTC')::date = d.usage_date and f.app_id = d.app_id
      join v2_request_usage u on u.request_event_id = f.request_event_id
      group by d.rollup_id,u.meter_key;
    insert into public_model_user_usage_daily
      select distinct (created_at at time zone 'UTC')::date, 'model', md5('public-model-user:' || end_user_id)
      from v2_rpc_gateway_requests_legacy_shape;
  `);
  // These facts must never affect public totals or be queried as whole-day fallbacks.
  await db.query(`insert into v2_request_facts (request_event_id,occurred_at,routed_model_slug,requested_model_slug,provider_model_id,tool_call_count,gateway_request_id,gateway_request_created_at) values
    ('hidden',$1,'hidden','hidden','route',99999,null,null), ('stealth',$1,'model','model','stealth',99999,null,null)`,
    [new Date(end-3600000).toISOString()]);
  await db.exec(`insert into v2_request_usage values ('hidden','input_text_tokens',99999),('stealth','input_text_tokens',99999)`);
  await db.query(`insert into v2_rpc_gateway_requests_legacy_shape (id,created_at,canonical_model_id,end_user_id,success)
    values ('hidden',$1,'hidden','private',true), ('failed',$1,'model','failed-only',false), ('no-actor',$1,'model',null,true)`,
    [new Date(end-3600000).toISOString()]);
}
const read = async (metric, days, asOf) => (await db.query('select * from get_public_period_leaderboard($1,$2,$3)',[metric,days,asOf])).rows
  .map(row => ({...row,current:Number(row.current),previous:Number(row.previous)}));
function expected(metric, days, asOf) {
  const end=Date.parse(asOf), middle=end-days*DAY, start=middle-days*DAY;
  const total = (from,to) => {
    const included=events.filter(event => event.at >= from && event.at < to);
    if (metric === 'users') return new Set(included.map(event => event.actor)).size;
    if (metric === 'image_inputs') return included.length * 3;
    if (metric === 'cached_tokens') return included.length * 5;
    return included.reduce((sum,event) => sum + event.value,0) / (metric === 'video_seconds' ? 10 : 1);
  };
  return [{model_id:'model',current:total(middle,end),previous:total(start,middle)}];
}
for (const asOf of ['2026-01-15T12:34:56.789Z','2026-01-15T00:00:00Z','2026-03-30T12:34:56.789Z']) {
  await seed(asOf);
  for (const timezone of ['UTC','America/New_York','Europe/London']) {
    await db.query("select set_config('TimeZone',$1,false)",[timezone]);
    for (const days of [1,7,30]) {
      for (const metric of ['text_tokens','video_seconds','image_inputs','cached_tokens','tool_calls','users']) {
        assert.deepEqual(await read(metric,days,asOf),expected(metric,days,asOf),`${asOf} ${timezone} ${days}d ${metric}`);
      }
    }
    for (const [range,days] of [['24h',1],['week',7],['4w',28],['month',30],['year',365]]) {
      const total = expected('text_tokens',days,asOf)[0].current;
      const count = events.filter(event => event.at >= Date.parse(asOf)-days*DAY && event.at < Date.parse(asOf)).length;
      const apps = (await db.query('select * from get_public_top_apps_rolling(20,$1,$2)',[range,asOf])).rows;
      assert.equal(apps.length,1,`${range}: app URL groups remain combined`);
      assert.equal(Number(apps[0].tokens),total,`${range}: app tokens`);
      assert.equal(Number(apps[0].requests),count,`${range}: app requests`);
      assert.equal(apps[0].unique_models,1);
      for (const dimension of ['organization','provider']) {
        const share = (await db.query('select * from get_public_market_share_rolling($1,$2,$3)',[dimension,range,asOf])).rows;
        assert.equal(share.length,1);
        assert.equal(Number(share[0].tokens),total,`${dimension} ${range}: market-share tokens`);
        assert.equal(Number(share[0].requests),count);
        assert.equal(Number(share[0].share_pct),100);
      }
    }
    const today = (await db.query("select * from get_public_top_apps_rolling(20,'today',$1)",[asOf])).rows;
    const todayEvents = events.filter(event => event.at >= Date.parse(asOf.slice(0,10)+'T00:00:00Z') && event.at < Date.parse(asOf));
    assert.equal(today.length,todayEvents.length ? 1 : 0);
    if (today.length) assert.equal(Number(today[0].tokens),todayEvents.reduce((sum,event)=>sum+event.value,0));
  }
}
await assert.rejects(read('unknown',7,'2026-03-30T12:34:56.789Z'),/Invalid ranking/);
await assert.rejects(read('text_tokens',60,'2026-03-30T12:34:56.789Z'),/Invalid ranking/);
await db.exec("update api_apps set is_public=false where title='App B'");
let visibleApps = (await db.query("select * from get_public_top_apps_rolling(20,'month',$1)",['2026-03-30T12:34:56.789Z'])).rows;
const visibleTotal = events.filter(event => Number(event.id)%2===0 && event.at>=Date.parse('2026-03-30T12:34:56.789Z')-30*DAY
  && event.at<Date.parse('2026-03-30T12:34:56.789Z')).reduce((sum,event)=>sum+event.value,0);
assert.equal(visibleApps.length,1);
assert.equal(Number(visibleApps[0].tokens),visibleTotal);
await db.exec("update api_apps set is_public=true,is_active=false where title='App B'");
visibleApps = (await db.query("select * from get_public_top_apps_rolling(20,'month',$1)",['2026-03-30T12:34:56.789Z'])).rows;
assert.equal(Number(visibleApps[0].tokens),visibleTotal);
await db.exec("update api_apps set is_active=true where title='App B'");
await db.exec('set role service_role');
assert.deepEqual(await read('text_tokens',7,'2026-03-30T12:34:56.789Z'),expected('text_tokens',7,'2026-03-30T12:34:56.789Z'));
await db.query("select * from get_public_top_apps_rolling(20,'month',$1)",['2026-03-30T12:34:56.789Z']);
await db.query("select * from get_public_market_share_rolling('provider','year',$1)",['2026-03-30T12:34:56.789Z']);
await db.exec('reset role; set role anon');
await assert.rejects(read('text_tokens',7,'2026-03-30T12:34:56.789Z'),/permission denied/);
await db.close();
console.log('Rolling model/app/market totals, all periods, both cutoffs, overlap, distinct users, aliases, fractional meters, app privacy, UTC/DST and access passed.');
