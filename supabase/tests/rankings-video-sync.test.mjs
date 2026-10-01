import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table gateway_requests (id uuid, created_at timestamptz, workspace_id uuid, endpoint text, usage jsonb);
  create table v2_request_facts (request_event_id uuid primary key, gateway_request_id uuid, gateway_request_created_at timestamptz, workspace_id uuid, occurred_at timestamptz);
  create table v2_request_usage (request_event_id uuid, meter_key text, modality text, unit text, quantity numeric, source text, billable boolean, sequence integer,
    primary key(request_event_id,meter_key,sequence));
  create table v2_analytics_outbox (request_event_id uuid primary key, workspace_id uuid, occurred_at timestamptz, status text, attempt_count integer, available_at timestamptz, last_error text, updated_at timestamptz);
  insert into gateway_requests values (md5('request')::uuid, '2026-09-19T01:00:00Z', md5('workspace')::uuid, 'video.generation', '{"output_video_seconds":2.75}');
  insert into v2_request_facts select md5('fact')::uuid,id,created_at,workspace_id,created_at from gateway_requests;
  insert into v2_request_usage values (md5('fact')::uuid,'output_video_seconds','video','seconds',1,'gateway',true,30),
    (md5('fact')::uuid,'input_tokens','text','tokens',17,'gateway',true,1);
`);
await db.exec(await readFile(new URL('../migrations/20260919121000_restore_request_usage_rollup_sync.sql', import.meta.url), 'utf8'));
const sync = async (workspace = 'workspace') => (await db.query(`select upsert_gateway_request_into_workspace_usage_rollup(md5('request')::uuid,'2026-09-19T01:00:00Z',md5($1)::uuid) as synced`, [workspace])).rows[0].synced;
await db.exec('set role service_role');
assert.equal(await sync('another-workspace'), false);
assert.equal(await sync(), true);
assert.equal(await sync(), true);
await db.exec('reset role');
let rows = (await db.query("select quantity from v2_request_usage where meter_key = 'output_video_seconds'")).rows;
assert.equal(rows.length, 1);
assert.equal(Number(rows[0].quantity), 2.75);
assert.equal(Number((await db.query("select quantity from v2_request_usage where meter_key = 'input_tokens'")).rows[0].quantity), 17);
assert.equal((await db.query('select status from v2_analytics_outbox')).rows[0].status, 'pending');
await db.exec("update gateway_requests set usage = '{\"output_video_seconds\":6.5}'; update v2_analytics_outbox set status = 'complete'; set role service_role;");
assert.equal(await sync(), true);
await db.exec('reset role');
rows = (await db.query("select quantity from v2_request_usage where meter_key = 'output_video_seconds'")).rows;
assert.equal(Number(rows[0].quantity), 6.5);
assert.equal((await db.query('select status from v2_analytics_outbox')).rows[0].status, 'pending');
for (const role of ['anon','authenticated']) {
  assert.equal((await db.query(`select has_function_privilege('${role}','upsert_gateway_request_into_workspace_usage_rollup(uuid,timestamptz,uuid)','execute') as allowed`)).rows[0].allowed, false);
}
await db.close();
console.log('Video sync SQL: late duration, retry idempotency, preserved meters, outbox requeue, and workspace scope passed.');
