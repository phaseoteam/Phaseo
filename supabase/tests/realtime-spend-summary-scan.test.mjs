import assert from 'node:assert/strict';
import { applyMigration, createBudgetDatabase, readMigration, readSchema } from './fixtures/budget-enforcement-db.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = await createBudgetDatabase(PGlite);
const workspace = '70000000-0000-4000-8000-000000000001';
const key = '80000000-0000-4000-8000-000000000001';
try {
  await applyMigration(db, await readMigration());
  await db.exec(await readSchema('private/functions/unbilled_spend.sql'));
  await db.exec(`
    insert into public.keys(id, workspace_id) values ('${key}', '${workspace}');
    insert into public.keys(id, workspace_id) values ('80000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002');
    create index realtime_summary_scan_idx on public.gateway_requests (realtime_session_id, created_at);
    insert into public.gateway_requests(workspace_id, key_id, request_id, created_at, endpoint, success, cost_nanos)
      select '70000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 'ordinary-' || n, '2026-10-01', 'chat.completions', false, 1 from generate_series(1, 10000) n;
    insert into public.gateway_realtime_sessions(workspace_id, key_id, session_id, started_at, ended_at, captured_nanos)
      values ('${workspace}', '${key}', 'session-fixture', '2026-10-31 23:59Z', '2026-11-01 00:01Z', 70);
    insert into public.gateway_requests(workspace_id, key_id, request_id, created_at, realtime_session_id, endpoint, success, cost_nanos)
      values ('${workspace}', '${key}', 'summary', '2026-10-31 23:59Z', 'session-fixture', 'audio.realtime', true, 80);
    analyze public.gateway_requests; analyze public.gateway_realtime_sessions;
    -- Exercise the merge plan seen in production, including a session crossing the period boundary.
    set enable_hashjoin = off; set enable_nestloop = off; set enable_seqscan = off; set enable_sort = off;
    set plan_cache_mode = force_generic_plan;
  `);
  const definition = await readSchema('private/functions/unbilled_spend.sql');
  const branch = definition.slice(definition.indexOf("select 'realtime'::text, session.session_id"), definition.indexOf("  union all\n  select 'unpaid'::text"))
    .replaceAll('p_workspace_id', '$1').replaceAll('p_since', '$2').replaceAll('p_key_ids', '$3');
  await db.exec(`prepare realtime_summary(uuid, timestamptz, uuid[]) as select * from (${branch}) as remainder(kind, billing_request_id, key_id, at, nanos)`);
  const [{ 'QUERY PLAN': plan }] = (await db.query(`explain (analyze, format json) execute realtime_summary('${workspace}', '2026-11-01', array['${key}']::uuid[])`)).rows;
  const scans = [];
  const walk = node => {
    if (node.Alias?.startsWith('summary') && /Scan$/.test(node['Node Type'])) scans.push(node);
    for (const child of node.Plans ?? []) walk(child);
  };
  walk(plan[0].Plan);
  const visited = scans.reduce((sum, node) => sum + ((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0)) * node['Actual Loops'], 0);
  assert.ok(scans.length > 0, 'the plan must exercise the summary lookup');
  assert.equal(visited, 1, 'the realtime join must not scan the 10,000 ordinary requests whose session id is null');
  const result = (await db.query(`execute realtime_summary('${workspace}', '2026-11-01', array['${key}']::uuid[])`)).rows;
  assert.equal(result.length, 1);
  assert.equal(result[0].nanos, 10, 'a session started last month still counts its uncollected remainder when it ends');
  console.log(`realtime spend summary scan: ok (${visited} summary row visited; cross-period remainder = 10)`);
} finally {
  await db.close();
}
