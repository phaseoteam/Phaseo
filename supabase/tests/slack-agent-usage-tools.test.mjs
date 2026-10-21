import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261021221806_slack_agent_usage_tools.sql');
const FUNCTIONS = ['get_workspace_spend_buckets', 'get_workspace_key_spend'];
const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const KEY_1 = '30000000-0000-4000-8000-000000000001';
const KEY_2 = '30000000-0000-4000-8000-000000000002';

const spend = (from, to, bucket, groupBy) => rows(
  `select bucket_start::text as bucket, group_key as "group", requests::int as requests, cost_nanos::int as cost
   from public.get_workspace_spend_buckets($1, $2, $3, $4, $5)`,
  [WORKSPACE, from, to, bucket, groupBy],
);

try {
  // Minimal pre-existing objects the functions read (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.v2_model_provider_routes (provider_model_id text primary key, provider_slug text not null);
    create table public.v2_private_usage_daily (
      usage_date date not null, workspace_id uuid not null, model_slug text not null, provider_model_id text,
      requests bigint not null default 0, cost_nanos numeric(30,0) not null default 0
    );
    create table public.v2_private_usage_15m (
      workspace_id uuid not null, bucket_start timestamptz not null, key_id uuid,
      requests bigint not null default 0, cost_nanos numeric(30,0) not null default 0
    );
    create table public.keys (id uuid primary key, workspace_id uuid not null, name text, prefix text);
    grant select on public.v2_model_provider_routes, public.v2_private_usage_daily, public.v2_private_usage_15m, public.keys to service_role;
    insert into public.v2_model_provider_routes values ('openai:model-a', 'openai'), ('anthropic:model-b', 'anthropic');
  `);
  await db.exec(migration);
  for (const fn of FUNCTIONS) {
    assert.ok(migration.includes(await read(`../schemas/public/functions/${fn}.sql`)), `${fn} migration matches the declarative definition`);
  }

  // Clients never call them: the Slack agent checks the asker first.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows(`select * from public.get_workspace_spend_buckets('${WORKSPACE}', '2026-10-01', '2026-10-02')`), /permission denied/);
    await assert.rejects(rows(`select * from public.get_workspace_key_spend('${WORKSPACE}', '2026-10-01', '2026-10-02')`), /permission denied/);
    await db.exec('reset role');
  }

  // 2026-09-28 and 2026-10-05 are Mondays.
  await db.exec(`
    insert into public.v2_private_usage_daily (usage_date, workspace_id, model_slug, provider_model_id, requests, cost_nanos) values
      ('2026-09-27', '${WORKSPACE}', 'model-a', 'openai:model-a', 1, 7777),
      ('2026-09-28', '${WORKSPACE}', 'model-a', 'openai:model-a', 2, 1000),
      ('2026-09-30', '${WORKSPACE}', 'model-b', 'anthropic:model-b', 3, 2000),
      ('2026-10-04', '${WORKSPACE}', 'model-a', 'openai:model-a', 1, 500),
      ('2026-10-05', '${WORKSPACE}', 'model-a', 'openai:model-a', 4, 4000),
      ('2026-10-05', '${WORKSPACE}', 'model-c', null, 1, 100),
      ('2026-10-12', '${WORKSPACE}', 'model-a', 'openai:model-a', 10, 99999),
      ('2026-10-01', '${OTHER}', 'model-a', 'openai:model-a', 100, 1000000);
  `);
  await db.exec('set role service_role');

  // Days: every day in the range, empty ones as zero, nothing from outside it or another workspace.
  const days = await spend('2026-09-28', '2026-10-11', 'day', 'none');
  assert.equal(days.length, 14);
  assert.deepEqual(days.filter((row) => row.cost > 0), [
    { bucket: '2026-09-28', group: 'all', requests: 2, cost: 1000 },
    { bucket: '2026-09-30', group: 'all', requests: 3, cost: 2000 },
    { bucket: '2026-10-04', group: 'all', requests: 1, cost: 500 },
    { bucket: '2026-10-05', group: 'all', requests: 5, cost: 4100 },
  ]);
  assert.deepEqual(days[1], { bucket: '2026-09-29', group: 'all', requests: 0, cost: 0 });

  // Weeks start on Monday.
  assert.deepEqual(await spend('2026-09-28', '2026-10-11', 'week', 'none'), [
    { bucket: '2026-09-28', group: 'all', requests: 6, cost: 3500 },
    { bucket: '2026-10-05', group: 'all', requests: 5, cost: 4100 },
  ]);
  // A range from a Wednesday: the first week counts from that day only.
  assert.deepEqual(await spend('2026-09-30', '2026-10-04', 'week', 'none'), [
    { bucket: '2026-09-28', group: 'all', requests: 4, cost: 2500 },
  ]);
  assert.deepEqual(await spend('2026-09-28', '2026-10-11', 'week', 'model'), [
    { bucket: '2026-09-28', group: 'model-b', requests: 3, cost: 2000 },
    { bucket: '2026-09-28', group: 'model-a', requests: 3, cost: 1500 },
    { bucket: '2026-10-05', group: 'model-a', requests: 4, cost: 4000 },
    { bucket: '2026-10-05', group: 'model-c', requests: 1, cost: 100 },
  ]);
  assert.deepEqual(await spend('2026-09-28', '2026-10-11', 'week', 'provider'), [
    { bucket: '2026-09-28', group: 'anthropic', requests: 3, cost: 2000 },
    { bucket: '2026-09-28', group: 'openai', requests: 3, cost: 1500 },
    { bucket: '2026-10-05', group: 'openai', requests: 4, cost: 4000 },
    { bucket: '2026-10-05', group: 'unknown', requests: 1, cost: 100 },
  ]);
  assert.deepEqual(await spend('2026-09-28', '2026-10-11', 'month', 'none'), [
    { bucket: '2026-09-01', group: 'all', requests: 5, cost: 3000 },
    { bucket: '2026-10-01', group: 'all', requests: 6, cost: 4600 },
  ]);

  // Grouped results keep the 8 costliest groups and add the rest up as "other".
  await db.exec('reset role');
  await db.exec(`
    insert into public.v2_private_usage_daily (usage_date, workspace_id, model_slug, requests, cost_nanos)
    select '2026-08-03', '${WORKSPACE}', 'many-' || lpad(n::text, 2, '0'), 1, n from generate_series(1, 10) n;
  `);
  await db.exec('set role service_role');
  const grouped = await spend('2026-08-03', '2026-08-03', 'day', 'model');
  assert.deepEqual(grouped.map((row) => row.group), ['many-10', 'many-09', 'many-08', 'many-07', 'many-06', 'many-05', 'many-04', 'many-03', 'other']);
  assert.deepEqual(grouped.at(-1), { bucket: '2026-08-03', group: 'other', requests: 2, cost: 3 });

  // Bad arguments are refused; at most 100 buckets.
  await assert.rejects(spend('2026-10-02', '2026-10-01', 'day', 'none'), /invalid_range/);
  await assert.rejects(spend('2026-10-01', '2026-10-02', 'year', 'none'), /invalid_bucket/);
  await assert.rejects(spend('2026-10-01', '2026-10-02', 'day', 'key'), /invalid_group_by/);
  await assert.rejects(spend('2026-01-01', '2026-04-11', 'day', 'none'), /range_too_long/);
  assert.equal((await spend('2026-01-01', '2026-04-10', 'day', 'none')).length, 100);
  assert.equal((await spend('2024-01-01', '2026-10-11', 'month', 'none')).length, 34);

  // Per key, between inclusive UTC dates.
  await db.exec('reset role');
  await db.exec(`
    insert into public.keys values ('${KEY_1}', '${WORKSPACE}', 'Production', 'phaseo_v1_sk_aaaa'), ('${KEY_2}', '${WORKSPACE}', 'Slack agent', 'phaseo_v1_sk_bbbb');
    insert into public.v2_private_usage_15m (workspace_id, bucket_start, key_id, requests, cost_nanos) values
      ('${WORKSPACE}', '2026-09-30T23:45:00Z', '${KEY_1}', 50, 5000),
      ('${WORKSPACE}', '2026-10-01T00:00:00Z', '${KEY_1}', 2, 300),
      ('${WORKSPACE}', '2026-10-02T23:45:00Z', '${KEY_1}', 1, 200),
      ('${WORKSPACE}', '2026-10-02T12:00:00Z', '${KEY_2}', 5, 1000),
      ('${WORKSPACE}', '2026-10-01T08:00:00Z', null, 1, 10),
      ('${WORKSPACE}', '2026-10-03T00:00:00Z', '${KEY_1}', 99, 9900),
      ('${OTHER}', '2026-10-01T08:00:00Z', '${KEY_1}', 7, 7000);
  `);
  await db.exec('set role service_role');
  assert.deepEqual(
    await rows(`select key_id, key_name, key_prefix, requests::int as requests, cost_nanos::int as cost from public.get_workspace_key_spend($1, '2026-10-01', '2026-10-02')`, [WORKSPACE]),
    [
      { key_id: KEY_2, key_name: 'Slack agent', key_prefix: 'phaseo_v1_sk_bbbb', requests: 5, cost: 1000 },
      { key_id: KEY_1, key_name: 'Production', key_prefix: 'phaseo_v1_sk_aaaa', requests: 3, cost: 500 },
      { key_id: null, key_name: null, key_prefix: null, requests: 1, cost: 10 },
    ],
  );
  await assert.rejects(rows(`select * from public.get_workspace_key_spend($1, '2025-01-01', '2026-10-02')`, [WORKSPACE]), /range_too_long/);
  await assert.rejects(rows(`select * from public.get_workspace_key_spend($1, '2026-10-02', '2026-10-01')`, [WORKSPACE]), /invalid_range/);

  console.log('Slack agent usage tool functions passed.');
} finally {
  await db.close();
}
