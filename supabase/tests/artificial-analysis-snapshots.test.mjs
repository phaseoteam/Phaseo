import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const prefixes = ['aa-intelligence-index', 'aa-coding-index', 'aa-agentic-index', 'aa-intelligence-index-cost'];
const snapshot = (n, major = 4) => ({
  snapshot_id: id(n), major_version: major, methodology_version: `${major}.3.2`,
  fetched_at: `2026-10-${String(n).padStart(2, '0')}T00:00:00Z`,
  benchmarks: prefixes.map(prefix => ({ benchmark_id: `${prefix}-v${major}`, name: prefix, total_models: 3, ascending_order: true })),
  results: [0, 1].map(i => ({ result_id: id(100 + n * 10 + i), model_slug: 'lab/one', benchmark_id: `${prefixes[0]}-v${major}`,
    score: String(40 + i), score_numeric: 40 + i, result_key: `one:${major}:${i}`,
    other_info: `Artificial Analysis ID source-${i}; Intelligence Index v${major}.3.2` })),
  model_slugs: ['lab/one'], source_owners: { 'source-0': 'lab/one', 'source-1': 'lab/one' },
});
const publish = payload => db.query('select public.publish_artificial_analysis_snapshot($1::jsonb) as id', [JSON.stringify(payload)]);
const count = async table => Number((await db.query(`select count(*) as count from public.${table}`)).rows[0].count);
const rejects = async (promise, pattern) => assert.match((await promise.then(() => { throw Error('Expected rejection'); }, error => error)).message, pattern);
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role; create table public.v2_models(model_slug text primary key, hidden boolean not null default false);');
  for (const name of ['v2_benchmarks', 'v2_benchmark_results']) {
    const sql = await read(`../schemas/public/tables/${name}.sql`);
    await db.exec(sql.slice(0, sql.indexOf('\n);') + 3));
    await db.exec(`grant select, insert, update on public.${name} to service_role;`);
  }
  await db.exec('grant select on public.v2_models to service_role;');
  await db.exec(await read('../schemas/public/tables/artificial_analysis_snapshots.sql'));
  await db.exec(await read('../schemas/public/functions/publish_artificial_analysis_snapshot.sql'));
  await db.exec(await read('../schemas/public/functions/get_artificial_analysis_coverage.sql'));
  await db.exec("insert into public.v2_models values ('lab/one', false), ('lab/unmatched', false), ('lab/hidden', true);");
  await db.exec("alter table public.v2_models add column name text default 'Model', add column lab_slug text default 'lab'; create table public.v2_labs(lab_slug text primary key,name text); grant select on public.v2_labs to service_role;");
  await db.exec(await read('../schemas/public/functions/get_public_intelligence_index.sql'));
  await db.exec(`insert into public.v2_benchmarks(benchmark_id,name) values ('aa-intelligence-index-v4','Current'),('aa-intelligence-index-v5','Future');
    insert into public.v2_benchmark_results(result_id,model_slug,benchmark_id,score_numeric,other_info) values
    ('${id(999)}','lab/one','aa-intelligence-index-v4',50,'Artificial Analysis ID existing; Intelligence Index v4.3.2');`);
  const seedName = (await readdir(new URL('../migrations/', import.meta.url))).find(name => name.endsWith('_seed_artificial_analysis_publications.sql'));
  const seed = await read(`../migrations/${seedName}`);
  await db.exec(seed); await db.exec(seed);
  assert.equal(await count('artificial_analysis_snapshots'), 1, 'bootstrap is idempotent and ignores empty v5');
  assert.equal(await count('v2_benchmark_results'), 1, 'bootstrap does not rewrite existing scores');
  assert.equal((await db.query("select published from public.get_artificial_analysis_coverage() where benchmark_id='aa-intelligence-index-v4'")).rows[0].published, true);
  await db.exec('truncate public.artificial_analysis_snapshots, public.v2_benchmark_results, public.v2_benchmarks;');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await rejects(publish(snapshot(1)), /permission denied/);
    await rejects(db.query('select * from public.get_artificial_analysis_coverage()'), /permission denied/);
    await rejects(db.query('select * from public.artificial_analysis_snapshots'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await rejects(db.query('delete from public.artificial_analysis_snapshots'), /permission denied/);
  await rejects(db.query("update public.artificial_analysis_snapshots set methodology_version='4.0'"), /permission denied/);
  const first = snapshot(1);
  assert.equal((await publish(first)).rows[0].id, first.snapshot_id);
  await publish(first);
  assert.equal(await count('artificial_analysis_snapshots'), 1, 'retry is idempotent');
  await rejects(publish({ ...first, methodology_version: '4.3.1' }), /identity reused/);
  assert.equal((await db.query('select * from public.get_artificial_analysis_coverage() where benchmark_id=$1', ['aa-intelligence-index-v4'])).rows[0].total_models, 1, 'configs count as one model');
  await db.exec(`insert into public.v2_benchmark_results(result_id,model_slug,benchmark_id,score_numeric,other_info) values
    ('${id(800)}','lab/unmatched','aa-intelligence-index-v4',20,'Intelligence Index v4.3.2'),
    ('${id(801)}','lab/hidden','aa-intelligence-index-v4',90,'Intelligence Index v4.3.2'),
    ('${id(802)}','lab/one','aa-intelligence-index-v4',null,'Intelligence Index v4.3.2');
    update public.v2_benchmark_results set effective_to='2020-01-01' where result_id='${id(802)}';`);
  assert.equal(Number((await db.query("select total_models from public.get_artificial_analysis_coverage() where benchmark_id='aa-intelligence-index-v4'")).rows[0].total_models), 2);
  const broken = snapshot(2, 5);
  broken.results[1].model_slug = 'missing'; broken.model_slugs.push('missing'); broken.source_owners['source-1'] = 'missing';
  await rejects(publish(broken), /foreign key/);
  assert.equal(await count('artificial_analysis_snapshots'), 1, 'projection failure rolls back publication');
  assert.equal(Number((await db.query("select count(*) as n from public.v2_benchmarks where benchmark_id like '%-v5'")).rows[0].n), 0, 'metadata rolled back too');
  await publish(snapshot(2));
  assert.equal(await count('artificial_analysis_snapshots'), 2, 'older payload retained');
  assert.equal(Number((await db.query("select count(*) as n from public.v2_benchmark_results where model_slug='lab/one' and score_numeric is not null and effective_to is null")).rows[0].n), 2, 'old matched configs retired');
  assert.equal(Number((await db.query("select count(*) as n from public.v2_benchmark_results where model_slug='lab/unmatched' and effective_to is null")).rows[0].n), 1, 'unmatched results retained');
  assert.equal((await db.query("select * from public.get_public_intelligence_index(100) where model_id='lab/one'")).rows.length, 2, 'retired configurations do not reappear in intelligence ranking');
  await rejects(publish({ ...snapshot(3), fetched_at: first.fetched_at }), /stale/);
  await rejects(publish({ ...snapshot(3), methodology_version: '4.2.0' }), /stale/);
  const invalid = snapshot(3); invalid.results[0].score_numeric = 'NaN';
  await rejects(publish(invalid), /invalid results/);
  const mismatched = snapshot(3); mismatched.results[0].other_info = 'Artificial Analysis ID source-0; Intelligence Index v4.3.1';
  await rejects(publish(mismatched), /invalid results/);
  const small = snapshot(3); small.results[0].score = '1e-7'; small.results[0].score_numeric = 1e-7;
  await publish(small);
  assert.equal(Number((await db.query('select score_numeric from public.v2_benchmark_results where result_id=$1', [small.results[0].result_id])).rows[0].score_numeric), 1e-7);
  await db.exec("insert into public.v2_benchmarks(benchmark_id,name) values ('aa-intelligence-index-v5','Future');");
  await db.exec(`insert into public.v2_benchmark_results(result_id,model_slug,benchmark_id,score_numeric) values ('${id(900)}','lab/one','aa-intelligence-index-v5',99);`);
  assert.equal((await db.query("select published from public.get_artificial_analysis_coverage() where benchmark_id='aa-intelligence-index-v5'")).rows[0].published, false, 'partial future import cannot become current');
  await publish(snapshot(4, 5));
  assert.equal((await db.query("select published from public.get_artificial_analysis_coverage() where benchmark_id='aa-intelligence-index-v5'")).rows[0].published, true);
  assert.equal(await count('artificial_analysis_snapshots'), 4);
  console.log('AA snapshots: atomic rollback, retry identity, freshness, history, permissions, coverage and publication gating passed');
} finally { await db.close(); }
