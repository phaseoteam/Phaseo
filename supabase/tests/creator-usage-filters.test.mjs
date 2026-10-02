// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table keys (id integer primary key, workspace_id integer, created_by integer);
  create table v2_request_facts (id integer primary key, workspace_id integer, key_id integer);
  create view v2_web_gateway_requests with (security_invoker = true) as select * from v2_request_facts;
  insert into keys select i, 1, 10 from generate_series(1,1501) i;
  insert into keys values (2001,2,10), (2002,1,20);
  insert into v2_request_facts select id, workspace_id, id from keys;
  insert into v2_request_facts values (3000,1,2001);
  grant select on keys, v2_request_facts, v2_web_gateway_requests to service_role;
`);
await db.exec(await readFile(new URL('../migrations/20261002150000_creator_usage_filters.sql', import.meta.url), 'utf8'));
for (const view of ['v2_web_gateway_requests_by_creator', 'v2_request_facts_by_creator']) {
  const count = await db.query(`select count(*)::int as count from ${view} where workspace_id = 1 and key_created_by = 10`);
  assert.equal(count.rows[0].count, 1501, 'All creator keys count, regardless of REST response caps');
  assert.equal((await db.query(`select count(*)::int as count from ${view} where key_created_by = 99`)).rows[0].count, 0);
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_table_privilege('${role}', '${view}', 'select') as allowed`)).rows[0].allowed, false);
  }
  await db.exec('set role service_role');
  assert.equal((await db.query(`select count(*)::int as count from ${view} where workspace_id = 1 and key_created_by = 10`)).rows[0].count, 1501);
  await db.exec('reset role');
  const options = await db.query(`select reloptions from pg_class where oid = '${view}'::regclass`);
  assert.ok(options.rows[0].reloptions.includes('security_invoker=true'));
}
await db.close();
console.log('Creator usage joins: complete results, workspace isolation, service-only grants passed.');
