// Runs assess-cutover against a throwaway PostgreSQL 17 (see lib/test-cluster.mjs).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectReport, renderReport } from './assess-cutover.mjs';
import { connect, rowsOf } from './lib/common.mjs';
import { testCluster } from './lib/test-cluster.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cluster = testCluster('assess', 55461);
const DB = 'ps_cutover_test_assess';

describe.skipIf(!cluster.available)(`assess-cutover (${cluster.reason})`, () => {
  let url;
  let client;

  beforeAll(async () => {
    await cluster.start();
    url = await cluster.createDatabase(DB);
    const setup = await connect(url);
    await setup.query(`
      create schema private;
      create schema storage;
      create table storage.objects (id bigserial primary key, bucket_id text, metadata jsonb);
      insert into storage.objects (bucket_id, metadata) values ('avatars', '{"size": 1200}'), ('avatars', '{"size": 800}');
      create schema analytics;
      create table analytics.stray (id int primary key);

      create table public.with_pk (id bigserial primary key, name text);
      insert into public.with_pk (name) select 'n' || g from generate_series(1, 50) g;

      create table public.no_pk (a int, b text);
      create table public.no_pk_unique (a int not null, b text);
      create unique index no_pk_unique_a on public.no_pk_unique (a);
      create table public.no_pk_full (a int);
      alter table public.no_pk_full replica identity full;
      create unlogged table public.scratch (id int primary key);

      create table private.events (id bigint generated always as identity primary key, at timestamptz default now())
        ;
      insert into private.events default values;
      insert into private.events default values;

      create table public.parts (id bigint not null, month date not null, primary key (id, month)) partition by range (month);
      create table public.parts_2026_10 partition of public.parts for values from ('2026-10-01') to ('2026-11-01');

      -- A few-row table whose TOAST is mostly dead: the shape of v2_request_routing_decisions.
      create table public.bloated (id int primary key, payload text);
      alter table public.bloated alter column payload set storage external;
      alter table public.bloated set (autovacuum_enabled = off, toast.autovacuum_enabled = off);
      insert into public.bloated select g, repeat(md5(g::text), 4000) from generate_series(1, 3) g;
      create materialized view public.mv as select count(*) as n from public.with_pk;
      select lo_create(0);
    `);
    for (let i = 0; i < 40; i++) await setup.query(`update public.bloated set payload = repeat(md5(random()::text), 4000)`);
    await setup.query('analyze');
    await setup.end();
    client = await connect(url, { readOnly: true });
  }, 120_000);

  afterAll(async () => {
    await client?.end().catch(() => {});
    await cluster.dropDatabase(DB).catch(() => {});
    await cluster.stop();
  }, 60_000);

  it('runs read-only: the session rejects writes', async () => {
    await expect(client.query('create table public.should_fail (id int)')).rejects.toMatchObject({ code: '25006' });
  });

  it('reports replication blockers, special tables, sequences, bloat and other schemas', async () => {
    const report = await collectReport(rowsOf(client), { deepMinBytes: 100_000, deepMaxRows: 1000, cronHistoryDays: 0 });
    const byName = Object.fromEntries(report.tables.map((t) => [`${t.schema}.${t.name}`, t]));

    expect(report.settings.wal_level).toBe('logical');
    expect(byName['public.with_pk'].replicationReady).toBe(true);
    expect(byName['public.no_pk'].replicationReady).toBe(false);
    expect(byName['public.no_pk'].uniqueIndexCandidate).toBeNull();
    expect(byName['public.no_pk_unique'].replicationReady).toBe(false);
    expect(byName['public.no_pk_unique'].uniqueIndexCandidate).toBe('no_pk_unique_a');
    expect(byName['public.no_pk_full'].replicationReady).toBe(true);
    expect(byName['public.parts'].kind).toBe('partitioned');
    expect(byName['public.parts_2026_10'].kind).toBe('partition');
    expect(byName['public.parts_2026_10'].replicationReady).toBe(true);
    expect(byName['public.scratch'].unlogged).toBe(true);

    const blockers = report.blockers.join('\n');
    expect(blockers).toMatch(/public\.no_pk has no usable replica identity/);
    expect(blockers).toMatch(/USING INDEX no_pk_unique_a/);
    expect(blockers).toMatch(/public\.scratch is UNLOGGED/);
    expect(blockers).toMatch(/1 large object/);
    expect(blockers).not.toMatch(/no_pk_full|with_pk/);

    // TOAST bloat: 3 live rows, ~40 versions of dead TOAST.
    const bloated = byName['public.bloated'];
    expect(bloated.live).not.toBeNull();
    expect(bloated.live.rows).toBe(3);
    expect(bloated.bloatRatio).toBeGreaterThan(5);
    expect(bloated.suspectBloat).toBe(true);
    expect(bloated.estimatedCopyBytes).toBeLessThan(bloated.heapBytes + bloated.toastBytes);

    const seqs = Object.fromEntries(report.sequences.map((s) => [`${s.schema}.${s.name}`, s]));
    expect(seqs['public.with_pk_id_seq'].lastValue).toBe('50');
    expect(seqs['public.with_pk_id_seq'].ownedBy).toBe('with_pk.id');
    expect(seqs['private.events_id_seq'].lastValue).toBe('2');

    expect(report.matviews.map((m) => m.name)).toEqual(['mv']);
    expect(report.largeObjects).toBe(1);
    const other = Object.fromEntries(report.otherSchemas.map((s) => [s.schema, s]));
    expect(other.storage.handling).toMatch(/Storage/);
    expect(other.analytics.handling).toBeNull();
    expect(report.warnings.join('\n')).toMatch(/schema analytics has 1 table/);
    expect(report.storage).toEqual([{ bucket: 'avatars', objects: 2, bytes: 2000 }]);
    expect(report.extensions.find((e) => e.name === 'plpgsql').planetscale).toBe('builtin');
    expect(report.totals.estimatedCopyBytes).toBeGreaterThan(0);
    expect(report.totals.estimatedCopyBytes).toBeLessThan(report.totals.heapAndToastBytes);

    const text = renderReport(report);
    expect(text).toMatch(/Logical replication blockers/);
    expect(text).toMatch(/BLOAT\?/);
  });

  it('reports pg_cron jobs and failures when a cron schema exists', async () => {
    // Fake just enough of pg_cron's catalog (the embedded build has no pg_cron).
    const rw = await connect(url);
    await rw.query(`
      create schema cron;
      create table cron.job (jobid bigint primary key, jobname text, schedule text, command text, database text, username text, active boolean);
      create table cron.job_run_details (jobid bigint, status text, return_message text, start_time timestamptz);
      insert into cron.job values (1, 'cleanup-dormant-enterprise-teams', '0 0 1 * *', 'SELECT public.cleanup_dormant_enterprise_teams()', 'postgres', 'postgres', true),
                                  (2, 'ok-job', '* * * * *', 'select 1', 'postgres', 'postgres', true);
      insert into cron.job_run_details values (1, 'failed', 'ERROR: function public.cleanup_dormant_enterprise_teams() does not exist', now() - interval '3 days'),
                                              (2, 'succeeded', '1 row', now() - interval '1 minute');
    `);
    await rw.end();
    const report = await collectReport(rowsOf(client), { deepMaxRows: 0, cronHistoryDays: 35 });
    const jobs = Object.fromEntries(report.cron.map((j) => [j.jobname, j]));
    expect(jobs['cleanup-dormant-enterprise-teams'].failed).toBe(1);
    expect(jobs['ok-job'].failed).toBe(0);
    expect(report.warnings.join('\n')).toMatch(/cron job cleanup-dormant-enterprise-teams failed 1 of 1/);
  });

  it('CLI: exits 2 on blockers, prints JSON, and never prints the password', () => {
    const withPassword = new URL(url);
    withPassword.password = 'sup3r-secret-pw';
    const r = spawnSync(process.execPath, [path.join(here, 'assess-cutover.mjs'), '--json', '--cron-history-days', '0'], {
      encoding: 'utf8',
      env: { ...process.env, SOURCE_DATABASE_URL: withPassword.toString() },
    });
    expect(r.stderr).not.toMatch(/sup3r-secret-pw/);
    expect(r.stdout).not.toMatch(/sup3r-secret-pw/);
    expect(r.status).toBe(2);
    const report = JSON.parse(r.stdout);
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  it('CLI: missing source is a usage error that names the env vars', () => {
    const env = { ...process.env };
    delete env.SOURCE_DATABASE_URL;
    delete env.SUPABASE_DB_URL;
    const r = spawnSync(process.execPath, [path.join(here, 'assess-cutover.mjs')], { encoding: 'utf8', env });
    expect(r.status).toBe(64);
    expect(r.stderr).toMatch(/SOURCE_DATABASE_URL or SUPABASE_DB_URL/);
  });
});
