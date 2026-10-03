import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create table gateway_requests (
      key_id uuid, workspace_id uuid, created_at timestamptz,
      cost_nanos bigint, success boolean, payload text
    ) partition by range (created_at);
    create table requests_oct partition of gateway_requests
      for values from ('2026-10-01') to ('2026-11-01');
    insert into gateway_requests
    select md5((g % 100)::text)::uuid, md5((g % 7)::text)::uuid,
      '2026-10-01'::timestamptz + make_interval(hours => g % 600),
      case when g % 11 = 0 then null else g end, g % 5 <> 0,
      repeat('request payload', 100)
    from generate_series(1,12000) g;
    create index old_key_usage on gateway_requests(key_id,created_at)
      include(cost_nanos) where success is true and key_id is not null;
  `);
  const queries = [
    `select count(*)::text as requests, coalesce(sum(cost_nanos),0)::text as cost
     from gateway_requests where key_id=md5('1')::uuid
       and workspace_id=md5('1')::uuid and success is true
       and created_at >= '2026-10-02'`,
    `select count(*)::text as requests, coalesce(sum(cost_nanos),0)::text as cost
     from gateway_requests where key_id=md5('1')::uuid and success is true`,
    `select count(*)::text as requests, coalesce(sum(cost_nanos),0)::text as cost
     from gateway_requests where key_id=md5('99')::uuid
       and workspace_id=md5('9')::uuid and success is true`
  ];
  const before = await Promise.all(queries.map(q => db.query(q)));
  // Production prebuilds each leaf online; the parent migration must reuse it.
  await db.exec(`create index requests_oct_success_key_workspace_cost_idx
    on requests_oct(key_id,workspace_id,created_at) include(cost_nanos)
    where success is true and key_id is not null`);
  const leafOid = (await db.query(`select
    'requests_oct_success_key_workspace_cost_idx'::regclass::oid as oid`)).rows[0].oid;
  const migration = await readFile(new URL('../migrations/20261003083400_optimize_gateway_history_reads.sql', import.meta.url), 'utf8');
  await db.exec('begin;' + migration + 'commit;');
  assert.equal((await db.query(`select inhparent::regclass::text as parent
    from pg_inherits where inhrelid=${leafOid}`)).rows[0].parent,
    'gateway_requests_success_key_workspace_cost_idx');
  await db.exec('vacuum analyze gateway_requests');
  for (const [i, q] of queries.entries()) {
    assert.deepEqual((await db.query(q)).rows, before[i].rows);
  }
  const plan = JSON.stringify((await db.query('explain (analyze, buffers, format json) ' + queries[0])).rows);
  assert.match(plan, /Index Only Scan/);
  assert.match(plan, /requests_oct_success_key_workspace_cost_idx/);
  assert.match(plan, /"Heap Fetches":0/);
  await db.exec(`create table requests_nov partition of gateway_requests
    for values from ('2026-11-01') to ('2026-12-01')`);
  const inherited = await db.query(`select count(*)::int as n from pg_inherits
    join pg_index on pg_index.indexrelid=pg_inherits.inhrelid
    where inhparent='gateway_requests_success_key_workspace_cost_idx'::regclass
      and indrelid='requests_nov'::regclass`);
  assert.equal(inherited.rows[0].n, 1);
  console.log('Key usage results unchanged; index-only plan with zero heap fetches; future partition inheritance passed.');
} finally {
  await db.close();
}
