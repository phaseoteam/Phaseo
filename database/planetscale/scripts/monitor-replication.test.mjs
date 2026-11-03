// monitor-replication: verdict unit tests plus a real logical replication
// subscription between two databases on a throwaway PostgreSQL 17
// (wal_level = logical; see lib/test-cluster.mjs).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, rowsOf } from './lib/common.mjs';
import { testCluster } from './lib/test-cluster.mjs';
import { compareCounts, readSource, readTarget, verdict } from './monitor-replication.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'monitor-replication.mjs');

describe('verdict', () => {
  const target = { exists: true, enabled: true, tables: [{ schema: 'public', name: 'a', state: 'r' }], errors: { apply: 0, sync: 0 } };
  const source = { slot: { active: true, lagBytes: 10 }, publication: { name: 'p', exists: true }, tables: [{ schema: 'public', name: 'a' }] };

  it('is ready when everything is caught up', () => {
    expect(verdict({ target, source, counts: [] })).toEqual({ ready: true, reasons: [] });
  });

  it('lists every reason it is not ready', () => {
    const r = verdict({
      target: { ...target, enabled: false, tables: [{ schema: 'public', name: 'a', state: 'd' }], errors: { apply: 2, sync: 0 } },
      source: { ...source, slot: { active: false, lagBytes: 10_000_000 }, tables: [...source.tables, { schema: 'public', name: 'b' }] },
      counts: [{ schema: 'public', name: 'a', method: 'exact', diff: -3 }],
    });
    expect(r.ready).toBe(false);
    const text = r.reasons.join('\n');
    expect(text).toMatch(/disabled/);
    expect(text).toMatch(/1 table\(s\) not ready/);
    expect(text).toMatch(/apply 2/);
    expect(text).toMatch(/not active/);
    expect(text).toMatch(/slot lag/);
    expect(text).toMatch(/not in the subscription.*public\.b/);
    expect(text).toMatch(/different exact counts/);
  });

  it('estimate-only count differences do not block', () => {
    expect(verdict({ target, source, counts: [{ method: 'estimate', diff: 5 }] }).ready).toBe(true);
  });
});

const PORT = 55463;
const cluster = testCluster('replication', PORT);
const SRC = 'ps_cutover_test_repl_src';
const TGT = 'ps_cutover_test_repl_tgt';
const SUB = 'replicate_from_supabase';
const PUB = 'replicate_to_planetscale';

const SCHEMA = `
  create table public.items (id bigint primary key, payload jsonb);
  create table public.gateway_requests (id bigint not null, created_at timestamptz not null, primary key (id, created_at)) partition by range (created_at);
  create table public.gateway_requests_2026_10 partition of public.gateway_requests for values from ('2026-10-01') to ('2026-11-01');
  create table public.gateway_requests_2026_11 partition of public.gateway_requests for values from ('2026-11-01') to ('2026-12-01');
`;

async function until(fn, timeoutMs = 60_000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('timed out');
}

describe.skipIf(!cluster.available)(`monitor-replication end to end (${cluster.reason})`, () => {
  let srcUrl;
  let tgtUrl;
  let src;
  let tgt;

  beforeAll(async () => {
    await cluster.start();
    srcUrl = await cluster.createDatabase(SRC);
    tgtUrl = await cluster.createDatabase(TGT);
    src = await connect(srcUrl);
    tgt = await connect(tgtUrl);
    await src.query(SCHEMA);
    await tgt.query(SCHEMA);
    await src.query(`
      insert into public.items select g, jsonb_build_object('n', g) from generate_series(1, 500) g;
      insert into public.gateway_requests select g, timestamptz '2026-10-15' + (g || ' minutes')::interval from generate_series(1, 300) g;
      insert into public.gateway_requests select g, timestamptz '2026-11-02' from generate_series(301, 350) g;
      create publication ${PUB} for table public.items, public.gateway_requests with (publish_via_partition_root = true);
    `);
    // A slot cannot be created in a transaction that wrote (one multi-statement query is one transaction).
    await src.query(`select pg_create_logical_replication_slot('${SUB}', 'pgoutput')`);
  }, 120_000);

  afterAll(async () => {
    // A subscription and its slot pin both databases; remove them before dropping.
    await tgt?.query(`alter subscription ${SUB} disable`).catch(() => {});
    await tgt?.query(`alter subscription ${SUB} set (slot_name = none)`).catch(() => {});
    await tgt?.query(`drop subscription if exists ${SUB}`).catch(() => {});
    await src?.query(`select pg_drop_replication_slot(slot_name) from pg_replication_slots where database = current_database()`).catch(() => {});
    await src?.end().catch(() => {});
    await tgt?.end().catch(() => {});
    await cluster.dropDatabase(TGT).catch(() => {});
    await cluster.dropDatabase(SRC).catch(() => {});
    await cluster.stop();
  }, 60_000);

  const runScript = (args) =>
    spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, SOURCE_DATABASE_URL: srcUrl, TARGET_DATABASE_URL: tgtUrl } });

  it('reports a missing subscription as NOT READY (exit 3 with --check)', () => {
    const r = runScript(['--check', '--publication', PUB, '--slot', SUB]);
    expect(r.status).toBe(3);
    expect(r.stdout).toMatch(/subscription: NOT FOUND/);
    expect(r.stdout).toMatch(/VERDICT: NOT READY/);
  });

  it('follows the initial copy to READY with equal exact counts, partitions counted via the root', async () => {
    const conn = new URL(srcUrl);
    await tgt.query(
      `create subscription ${SUB} connection 'host=${conn.hostname} port=${conn.port} user=${decodeURIComponent(conn.username)} dbname=${SRC}'
         publication ${PUB} with (create_slot = false, slot_name = '${SUB}', copy_data = true)`,
    );
    await until(async () => {
      const t = await readTarget(rowsOf(tgt), SUB);
      return t.tables.length === 2 && t.tables.every((x) => x.state === 'r');
    });
    const s = await readSource(rowsOf(src), { slot: SUB, publication: PUB });
    expect(s.tables.map((t) => `${t.schema}.${t.name}`)).toEqual(['public.gateway_requests', 'public.items']);
    const counts = await compareCounts(rowsOf(src), rowsOf(tgt), s.tables, { mode: 'exact' });
    expect(counts.map((c) => [c.name, c.source, c.target, c.diff])).toEqual([
      ['gateway_requests', 350, 350, 0],
      ['items', 500, 500, 0],
    ]);

    const r = await until(() => {
      const out = runScript(['--counts', 'exact', '--check', '--max-lag-bytes', '16000000']);
      return out.status === 0 ? out : null;
    }, 60_000, 1000);
    expect(r.stdout).toMatch(/subscription replicate_from_supabase: enabled/);
    expect(r.stdout).toMatch(/2 ready/);
    expect(r.stdout).toMatch(/VERDICT: READY/);
  }, 120_000);

  it('streams new writes and shows them in the counts and the JSON output', async () => {
    await src.query(`insert into public.items select g, '{}' from generate_series(501, 650) g; delete from public.items where id <= 10;`);
    await until(async () => {
      const [{ n }] = (await tgt.query('select count(*)::int as n from public.items')).rows;
      return n === 640;
    });
    const r = runScript(['--counts', 'exact', '--json', '--max-lag-bytes', '16000000']);
    expect(r.status).toBe(0);
    const line = JSON.parse(r.stdout.trim().split('\n').pop());
    const items = line.counts.find((c) => c.name === 'items');
    expect(items).toMatchObject({ source: 640, target: 640, diff: 0, method: 'exact' });
    expect(line.target.applyWorker).not.toBeNull();
    expect(line.source.slot.active).toBe(true);
  }, 120_000);

  it('opens both sides read-only', async () => {
    const t = await connect(tgtUrl, { readOnly: true });
    await expect(t.query('insert into public.items values (999999, null)')).rejects.toMatchObject({ code: '25006' });
    await t.end();
  });
});
