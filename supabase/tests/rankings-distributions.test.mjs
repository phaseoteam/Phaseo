import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create role service_role; create role anon; create role authenticated;
    create table public.v2_request_facts (request_event_id text primary key, workspace_id text, occurred_at timestamptz, edge_country text);
    create table public.v2_request_usage (request_event_id text, meter_key text, quantity numeric);
    insert into v2_request_facts values
      ('a','w1',now()-interval '1 day','GB'), ('b','w1',now()-interval '2 days','GB'),
      ('c','w2',now()-interval '3 days','GB'), ('d','w3',now()-interval '4 days','US'),
      ('zero','w3',now()-interval '5 days','US'), ('unknown','w4',now()-interval '6 days',null),
      ('old','w1',now()-interval '40 days','GB');
    insert into v2_request_usage values
      ('a','input_tokens',4095),('a','output_tokens',10),('a','input_text_tokens',100),
      ('b','prompt_tokens',4096),('b','output_text_tokens',200),
      ('c','input_tokens',0),('c','input_text_tokens',16384),('c','output_audio_tokens',100),
      ('d','input_tokens',131072),('d','tool_calls',99999),
      ('zero','cached_read_tokens',999),('unknown','input_tokens',32768),('old','input_tokens',50);
  `);
  for (const name of ['get_public_context_length_distribution','get_public_geography_usage']) {
    await db.exec(await readFile(new URL(`../schemas/public/functions/${name}.sql`, import.meta.url),'utf8'));
    const baseline = await readFile(new URL('../baseline/schema.sql', import.meta.url),'utf8');
    const start = baseline.indexOf(`CREATE OR REPLACE FUNCTION public.${name} (`);
    assert.ok(start >= 0);
    const end = baseline.indexOf('$function$;',baseline.indexOf('AS $function$',start)) + '$function$;'.length;
    await db.exec(baseline.slice(start,end).replace(`public.${name} (`,`public.reference_${name} (`));
  }
  for (const [name,args] of [
    ['get_public_context_length_distribution','30,1,1'],
    ['get_public_context_length_distribution','365,1,1'],
    ['get_public_context_length_distribution','30,6,1'],
    ['get_public_context_length_distribution','30,1,5'],
    ['get_public_geography_usage',"now()-interval '30 days',now(),1,1"],
    ['get_public_geography_usage',"now()-interval '30 days',now(),1,2"],
    ['get_public_geography_usage',"now()-interval '30 days',now(),4,1"],
  ]) {
    const withoutLabel = rows => rows.map(({ bucket_label, ...row }) => row);
    assert.deepEqual(withoutLabel((await db.query(`select * from public.${name}(${args})`)).rows),
      withoutLabel((await db.query(`select * from public.reference_${name}(${args})`)).rows),`${name}(${args})`);
  }
  const context = (await db.query(`select * from get_public_context_length_distribution(30,1,1)`)).rows;
  assert.equal(context.length,6);
  assert.deepEqual(context.map(row=>row.bucket_label),['Under 4K','4K–16K','16K–32K','32K–64K','64K–128K','128K+']);
  assert.deepEqual(context.map(row=>Number(row.requests)),[0,2,1,1,0,1]);
  assert.deepEqual(context.map(row=>Number(row.share_percent)),[0,40,20,20,0,20]);
  assert.equal((await db.query(`select * from get_public_context_length_distribution(30,6,1)`)).rows.length,0);
  assert.equal((await db.query(`select * from get_public_context_length_distribution(30,1,5)`)).rows.length,0);
  const countries = (await db.query(`select * from get_public_geography_usage(now()-interval '30 days',now(),1,1)`)).rows;
  assert.deepEqual(countries.map(row=>[row.country_code,Number(row.requests),Number(row.tokens),Number(row.workspace_count)]),
    [['GB',3,20789,2],['US',2,131072,1]]);
  assert.deepEqual(countries.map(row=>Number(row.share_percent)),[60,40]);
  const gated = (await db.query(`select * from get_public_geography_usage(now()-interval '30 days',now(),1,2)`)).rows;
  assert.equal(gated.length,1); assert.equal(Number(gated[0].share_percent),100);
  // Exclusive upper bound and inclusive lower bound, with usage-less requests retained.
  const boundary = (await db.query(`select * from get_public_geography_usage((select occurred_at from v2_request_facts where request_event_id='zero'),(select occurred_at from v2_request_facts where request_event_id='d'),1,1)`)).rows;
  assert.deepEqual(boundary.map(row=>[row.country_code,Number(row.requests),Number(row.tokens)]),[['US',1,0]]);
  for (const role of ['anon','authenticated']) {
    const denied = (await db.query(`select has_function_privilege('${role}','public.get_public_context_length_distribution(integer,bigint,bigint)','execute') or has_function_privilege('${role}','public.get_public_geography_usage(timestamptz,timestamptz,bigint,bigint)','execute') allowed`)).rows;
    assert.equal(denied[0].allowed,false);
  }
  console.log('Context buckets, geography totals, meter precedence, bounds, and privacy gates passed');
} finally { await db.close(); }
