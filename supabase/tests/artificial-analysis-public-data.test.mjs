import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot = (day = 1) => ({ coverage: 'full_frontend_dataset', sourceUrl: 'https://artificialanalysis.ai/models', dataUrl: 'https://artificialanalysis.ai/data/abcdef.txt',
  methodologyVersions: ['4.3.2'], fetchedAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`, contentHash: String(day).padStart(64, '0'),
  models: [1, 2, 3].map(n => ({ id: id(n), name: 'Source', slug: `source-${n}`, totalTokens: n === 1 ? { output: 0, reasoning: null } : null, benchmarkScores: { omniscience: -3 }, sourceData: { raw: true } })),
  matching: { sources: [{ id: id(1), model_id: 'lab/visible' }, { id: id(2), model_id: 'lab/hidden' }, { id: id(3), model_id: null }] },
});
const publish = value => db.query('select public.publish_artificial_analysis_public_snapshot($1::jsonb) as id', [JSON.stringify(value)]);
const get = (model = null, major = null, limit = 50, offset = 0) => db.query('select public.get_artificial_analysis_public_models($1,$2,$3,$4) as data', [model, major, limit, offset]);
try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role; create table public.v2_models(model_slug text primary key, hidden boolean); insert into public.v2_models values ('lab/visible',false),('lab/hidden',true); grant select on public.v2_models to service_role;");
  const migration = (await readdir(new URL('../migrations/', import.meta.url))).find(name => name.endsWith('_artificial_analysis_public_data.sql'));
  if (migration && process.env.AA_PUBLIC_SCHEMA_ONLY !== '1') {
    await db.exec(`begin; ${await read(`../migrations/${migration}`)} commit;`);
    await db.exec(await read('../migrations/20261019143056_optimize_aa_public_snapshot_reads.sql'));
  }
  else {
    await db.exec(await read('../schemas/public/tables/artificial_analysis_public_snapshots.sql'));
    for (const name of ['publish_artificial_analysis_public_snapshot','get_artificial_analysis_public_models']) await db.exec(await read(`../schemas/public/functions/${name}.sql`));
  }
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(publish(snapshot()), /permission denied/);
    await assert.rejects(get(), /permission denied/);
    await assert.rejects(db.query('select * from public.artificial_analysis_public_snapshots'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal((await get()).rows[0].data, null);
  const first = (await publish(snapshot())).rows[0].id;
  assert.equal((await publish({ ...snapshot(), fetchedAt: '2026-09-02T00:00:00Z' })).rows[0].id, first, 'repeated content is idempotent');
  let result = (await get()).rows[0].data;
  assert.equal(result.total, 1, 'hidden and unmatched rows are excluded');
  assert.equal(result.models[0].model_id, 'lab/visible');
  assert.deepEqual(result.models[0].totalTokens, { output: 0, reasoning: null });
  assert.equal(result.models[0].benchmarkScores.omniscience, -3);
  assert.equal(result.models[0].sourceData, undefined, 'raw source payload stays server-side');
  assert.equal((await get('lab/missing')).rows[0].data.total, 0);
  assert.equal((await get(null, 5)).rows[0].data, null);
  assert.equal((await get(null, null, 1, 1)).rows[0].data.models.length, 0);
  await assert.rejects(publish({ ...snapshot(2), models: [snapshot().models[0], snapshot().models[0], snapshot().models[2]] }), /duplicate/);
  await assert.rejects(publish({ ...snapshot(2), matching: { sources: [{ id: id(1), model_id: 'not/a-model' }, ...snapshot().matching.sources.slice(1)] } }), /ownership/);
  await assert.rejects(publish({ ...snapshot(2), contentHash: snapshot().contentHash, models: snapshot().models.map(m => ({ ...m, name: 'Changed' })) }), /reused/);
  await publish(snapshot(3));
  await assert.rejects(publish(snapshot(2)), /Stale/);
  await assert.rejects(publish({ ...snapshot(4), methodologyVersions: ['4.2.0'] }), /downgrade/);
  await assert.rejects(publish({ ...snapshot(4), coverage: 'page_selection_only' }), /Invalid full/);
  await assert.rejects(db.query('delete from public.artificial_analysis_public_snapshots'), /permission denied/);
  await assert.rejects(db.query('update public.artificial_analysis_public_snapshots set methodology_version=methodology_version'), /permission denied/);
  await db.exec('reset role');
  await db.exec("update public.v2_models set hidden=true where model_slug='lab/visible'");
  await db.exec('set role service_role');
  assert.equal((await get()).rows[0].data.total, 0, 'current catalogue visibility is enforced on historical data');
  console.log('AA public snapshot publication, permissions, idempotency, history and bounded reads passed');
} finally { await db.close(); }
