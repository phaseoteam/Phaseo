// Isolated PGlite test for private.prune_artificial_analysis_public_snapshots. Never connects to Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261110103200_prune_artificial_analysis_public_snapshots.sql');
const declarative = await read('../schemas/private/functions/prune_artificial_analysis_public_snapshots.sql');
const misc = await read('../schemas/_cluster/misc.sql');
const body = sql => sql.match(/\$function\$([\s\S]*?)\$function\$/)[1];
assert.equal(body(migration), body(declarative), 'migration and declarative function bodies match');
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /m);
assert.match(migration, /cron\.schedule\('prune-artificial-analysis-public-snapshots', '37 4 \* \* 0'/);
assert.match(misc, /'prune-artificial-analysis-public-snapshots', '37 4 \* \* 0',\s*'set statement_timeout = ''60s''; set lock_timeout = ''5s''; select private\.prune_artificial_analysis_public_snapshots\(50\);'/);
assert.doesNotMatch(migration + declarative, /delete\s+from\s+public\.artificial_analysis_snapshots\b/i, 'the private API import table is never pruned');

const db = new PGlite();
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = n => new Date(Date.now() - n * 86400000).toISOString();
const snapshot = (n, version, daysAgo) => ({
    coverage: 'full_frontend_dataset', sourceUrl: 'https://artificialanalysis.ai/models', dataUrl: 'https://artificialanalysis.ai/data/abcdef.txt',
    methodologyVersions: [version], fetchedAt: day(daysAgo), contentHash: String(n).padStart(64, '0'),
    models: [{ id: id(1), name: 'Source', slug: 'source-1', sourceData: { raw: n } }],
    matching: { sources: [{ id: id(1), model_id: 'lab/visible' }] },
});
const publish = value => db.query('select public.publish_artificial_analysis_public_snapshot($1::jsonb) as id', [JSON.stringify(value)]);
const get = major => db.query('select public.get_artificial_analysis_public_models(null, $1, 50, 0) as data', [major]);
const prune = async limit => (await db.query('select private.prune_artificial_analysis_public_snapshots($1) n', [limit])).rows[0].n;
const hashes = async () => (await db.query('select content_hash from public.artificial_analysis_public_snapshots order by fetched_at')).rows.map(row => Number(row.content_hash));

try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create schema private; grant usage on schema private to service_role;
      create table public.v2_models(model_slug text primary key, hidden boolean);
      insert into public.v2_models values ('lab/visible', false);
      grant select on public.v2_models to service_role;
    `);
    await db.exec(await read('../schemas/public/tables/artificial_analysis_public_snapshots.sql'));
    for (const name of ['publish_artificial_analysis_public_snapshot', 'get_artificial_analysis_public_models']) {
        await db.exec(await read(`../schemas/public/functions/${name}.sql`));
    }
    await db.exec(declarative);

    // Published oldest first, as the publisher requires: v4.3.2 x3 (old), v5.0 x3 (old), v5.0.1 x2 old + 2 recent.
    const plan = [[1, '4.3.2', 40], [2, '4.3.2', 35], [3, '4.3.2', 30], [4, '5.0', 28], [5, '5.0', 25], [6, '5.0', 20],
        [7, '5.0.1', 18], [8, '5.0.1', 16], [9, '5.0.1', 10], [10, '5.0.1', 1]];
    await db.exec('set role service_role');
    for (const [n, version, age] of plan) await publish(snapshot(n, version, age));
    const latestV4 = (await get(4)).rows[0].data;
    const latestV5 = (await get(5)).rows[0].data;
    const latestAny = (await get(null)).rows[0].data;

    // service_role (the publisher and API) still cannot delete directly, or call the prune job.
    await assert.rejects(db.query('delete from public.artificial_analysis_public_snapshots'), /permission denied/);
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated', 'service_role']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(prune(10), /permission denied/);
        await db.exec('reset role');
    }
    assert.equal(await prune(0).catch(error => error.message), 'AA public snapshot prune batch size must be between 1 and 100');

    // Bounded batches, oldest first; keeps 3 (newest 4.3.2), 6 (newest 5.0), and 9, 10 (last 14 days, 10 is newest 5.0.1).
    assert.equal(await prune(2), 2);
    assert.deepEqual(await hashes(), [3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(await prune(50), 4);
    assert.equal(await prune(50), 0);
    assert.deepEqual(await hashes(), [3, 6, 9, 10]);

    // Readers see exactly what they saw before.
    await db.exec('set role service_role');
    assert.deepEqual((await get(4)).rows[0].data, latestV4);
    assert.deepEqual((await get(5)).rows[0].data, latestV5);
    assert.deepEqual((await get(null)).rows[0].data, latestAny);
    // The publisher's stale-data and downgrade checks still hold against the kept rows.
    await assert.rejects(publish(snapshot(11, '5.0.1', 2)), /Stale/);
    await assert.rejects(publish(snapshot(12, '4.3.2', 0)), /downgrade/);
    await assert.rejects(publish(snapshot(13, '5.0', 0)), /downgrade/);
    // Identical content is still a no-op, and new publications are accepted.
    assert.ok((await publish(snapshot(10, '5.0.1', 1))).rows[0].id);
    await publish(snapshot(14, '5.0.1', 0));
    assert.deepEqual(await hashes(), [3, 6, 9, 10, 14]);
    await db.exec('reset role');
    console.log('AA public snapshot retention: ok');
} finally {
    await db.close();
}

// The migration applies with a pg_cron stub and schedules the weekly job.
const migrated = new PGlite();
try {
    await migrated.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema private; create schema cron;
      create table cron.job(jobname text primary key, schedule text, command text);
      create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql
        as $$ insert into cron.job values (p_name, p_schedule, p_command) returning 1::bigint $$;
      create function cron.unschedule(p_name text) returns boolean language sql as $$ delete from cron.job where jobname = p_name returning true $$;
    `);
    await migrated.exec(await read('../schemas/public/tables/artificial_analysis_public_snapshots.sql'));
    await migrated.exec(`begin; ${migration} commit;`);
    const job = (await migrated.query("select schedule, command from cron.job where jobname = 'prune-artificial-analysis-public-snapshots'")).rows[0];
    assert.equal(job.schedule, '37 4 * * 0');
    assert.match(job.command, /select private\.prune_artificial_analysis_public_snapshots\(50\);$/);
    assert.equal((await migrated.query('select private.prune_artificial_analysis_public_snapshots(50) n')).rows[0].n, 0);
    console.log('AA public snapshot retention migration: ok');
} finally {
    await migrated.close();
}
