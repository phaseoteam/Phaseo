// Isolated PGlite test for private.prune_provider_catalog_sync_runs. Never connects to Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261110104000_prune_provider_catalog_sync_runs.sql');
const declarative = await read('../schemas/private/functions/prune_provider_catalog_sync_runs.sql');
const misc = await read('../schemas/_cluster/misc.sql');
const body = sql => sql.match(/\$function\$([\s\S]*?)\$function\$/)[1];
assert.equal(body(migration), body(declarative), 'migration and declarative function bodies match');
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /m);
assert.match(migration, /cron\.schedule\('prune-provider-catalog-sync-runs', '47 3 \* \* \*'/);
assert.match(misc, /'prune-provider-catalog-sync-runs', '47 3 \* \* \*',\s*'set statement_timeout = ''60s''; set lock_timeout = ''5s''; select private\.prune_provider_catalog_sync_runs\(50, 1000\);'/);

// Every table with a foreign key to provider_catalog_sync_runs, loaded from its real declarative file.
const tables = ['provider_catalog_sync_runs', 'provider_catalog_sync_models', 'provider_catalog_sync_model_capabilities',
    'provider_catalog_review_events', 'provider_catalog_events', 'provider_catalog_model_requests',
    'provider_catalog_route_candidates', 'provider_catalog_models', 'provider_catalog_model_capabilities'];
const setup = async db => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create schema private; grant usage on schema private to service_role;
      create table public.v2_providers(provider_slug text primary key);
      create table public.v2_models(model_slug text primary key);
      create table public.workspaces(id uuid primary key);
      create function public.enqueue_provider_catalog_event_email() returns trigger language plpgsql as $$ begin return new; end $$;
      insert into public.v2_providers values ('noise'), ('applied'), ('small'), ('recent');
      insert into public.v2_models values ('lab/m');
      insert into auth.users values ('00000000-0000-4000-8000-000000000001');
    `);
    for (const table of tables) await db.exec(await read(`../schemas/public/tables/${table}.sql`));
};

const db = new PGlite();
const reviewer = '00000000-0000-4000-8000-000000000001';
const run = async (provider, status, daysAgo, reviewStatus = 'pending', extra = {}) => (await db.query(
    `insert into public.provider_catalog_sync_runs(provider_slug, trigger, status, review_status, created_at, reviewed_by, reviewed_at)
     values ($1, 'poll', $2, $3, now() - $4::interval, $5, $6) returning id`,
    [provider, status, reviewStatus, `${daysAgo} days`, extra.reviewedBy ?? null, extra.reviewedAt ?? null],
)).rows[0].id;
const syncModel = (runId, provider, slug, reviewedBy = null) => db.query(
    `insert into public.provider_catalog_sync_models(run_id, provider_slug, model_slug, provider_model_slug, name, decision, reviewed_by, reviewed_at, route_projection_status)
     values ($1, $2, $3, $3, 'Model', 'approved', $4, now(), 'enabled')`, [runId, provider, slug, reviewedBy]);
const exists = async id => (await db.query('select 1 from public.provider_catalog_sync_runs where id = $1', [id])).rows.length === 1;
const count = async (table, where = 'true') => (await db.query(`select count(*)::int n from public.${table} where ${where}`)).rows[0].n;
const prune = async (keep, batch) => (await db.query('select private.prune_provider_catalog_sync_runs($1, $2) n', [keep, batch])).rows[0].n;

try {
    await setup(db);
    await db.exec(declarative);

    // Provider "noise": 80 not_modified polls 30-109 days old, plus an old stuck processing run and an old failed run with an event.
    const processing = await run('noise', 'processing', 200);
    const failedWithEvent = await run('noise', 'failed', 150);
    await db.query("insert into public.provider_catalog_events(provider_slug, run_id, event_type, title, message) values ('noise', $1, 'catalog_needs_changes', 't', 'm')", [failedWithEvent]);
    const polls = [];
    for (let i = 109; i >= 30; i -= 1) polls.push(await run('noise', 'not_modified', i));

    // Provider "applied": an old applied run with automatic decisions, the newest applied-not-rejected and newest applied runs,
    // then 70 failed runs; the 20 oldest failed runs are outside every window and 8 of them are referenced or reviewed.
    const appliedOld = await run('applied', 'applied', 310, 'needs_changes');
    await syncModel(appliedOld, 'applied', 'lab/a');
    await db.query("insert into public.provider_catalog_sync_model_capabilities(run_id, model_slug, capability_id) values ($1, 'lab/a', 'text.generate')", [appliedOld]);
    const appliedOk = await run('applied', 'applied', 305, 'needs_changes');
    const appliedRejected = await run('applied', 'applied', 300, 'rejected');
    const failed = [];
    for (let i = 0; i < 70; i += 1) failed.push(await run('applied', 'failed', 200 - i, 'needs_changes'));
    const [reviewEvent, catalogEvent, modelRequest, routeCandidate, catalogModel, catalogCapability, humanDecision] = failed;
    await syncModel(reviewEvent, 'applied', 'lab/r');
    await db.query("insert into public.provider_catalog_review_events(run_id, model_slug, decision) values ($1, 'lab/r', 'approved')", [reviewEvent]);
    await db.query("insert into public.provider_catalog_events(provider_slug, run_id, event_type, title, message) values ('applied', $1, 'catalog_needs_changes', 't', 'm')", [catalogEvent]);
    await db.query("insert into public.provider_catalog_model_requests(provider_slug, model_slug, source_run_id, model) values ('applied', 'lab/q', $1, '{}')", [modelRequest]);
    await db.query("insert into public.provider_catalog_route_candidates(run_id, provider_slug, submitted_model_slug, canonical_model_slug, provider_model_slug, availability) values ($1, 'applied', 'lab/m', 'lab/m', 'm', 'ready')", [routeCandidate]);
    await db.query("insert into public.provider_catalog_models(provider_slug, model_slug, provider_model_slug, name, source_run_id) values ('applied', 'lab/c', 'c', 'C', $1)", [catalogModel]);
    await db.query("insert into public.provider_catalog_models(provider_slug, model_slug, provider_model_slug, name) values ('applied', 'lab/d', 'd', 'D')");
    await db.query("insert into public.provider_catalog_model_capabilities(provider_slug, model_slug, capability_id, source_run_id) values ('applied', 'lab/d', 'text.generate', $1)", [catalogCapability]);
    await syncModel(humanDecision, 'applied', 'lab/h', reviewer);
    const reviewedRun = failed[7];
    await db.query('update public.provider_catalog_sync_runs set reviewed_by = $2, reviewed_at = now() where id = $1', [reviewedRun, reviewer]);

    // Provider "small": a few old runs, all within the window. Provider "recent": 70 polls from the last 3 days.
    const small = [];
    for (let i = 0; i < 5; i += 1) small.push(await run('small', 'not_modified', 300 + i));
    for (let i = 0; i < 70; i += 1) await run('recent', 'not_modified', (i / 24).toFixed(3));

    // Only the backend job can prune, and its bounds are checked.
    for (const role of ['anon', 'authenticated', 'service_role']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(prune(50, 10), /permission denied/);
        await db.exec('reset role');
    }
    await assert.rejects(prune(5, 10), /keep between 20 and 1000/);
    await assert.rejects(prune(50, 0), /batch size must be between 1 and 5000/);

    // Bounded batches, oldest first.
    const before = await count('provider_catalog_sync_runs');
    assert.equal(await prune(50, 10), 10);
    assert.equal(await exists(appliedOld), false, 'the oldest unreferenced run goes first');
    assert.equal(await count('provider_catalog_sync_models', `run_id = '${appliedOld}'`), 0, 'its sync models cascade');
    assert.equal(await count('provider_catalog_sync_model_capabilities', `run_id = '${appliedOld}'`), 0, 'its capabilities cascade');
    // Expected: 1 old applied + 12 unreferenced old failed + 30 oldest polls = 43.
    let total = 10;
    for (let n = await prune(50, 1000); n > 0; n = await prune(50, 1000)) total += n;
    assert.equal(total, 43);
    assert.equal(await count('provider_catalog_sync_runs'), before - 43);

    // Kept: the windows, the newest applied runs, in-flight work, and everything referenced or reviewed.
    assert.ok(await exists(appliedOk), 'newest applied run that was not rejected (onboarding preview)');
    assert.ok(await exists(appliedRejected), 'newest applied run (chat preview access)');
    assert.ok(await exists(processing), 'processing run');
    for (const id of [failedWithEvent, reviewEvent, catalogEvent, modelRequest, routeCandidate, catalogModel, catalogCapability, humanDecision, reviewedRun]) {
        assert.ok(await exists(id), 'referenced or reviewed run kept');
    }
    assert.equal(await count('provider_catalog_review_events'), 1);
    assert.equal(await count('provider_catalog_events'), 2);
    assert.equal(await count('provider_catalog_model_requests'), 1);
    assert.equal(await count('provider_catalog_route_candidates'), 1);
    assert.equal(await count('provider_catalog_models', 'source_run_id is not null'), 1, 'catalog model provenance kept');
    assert.equal(await count('provider_catalog_model_capabilities', 'source_run_id is not null'), 1, 'capability provenance kept');
    assert.equal(await count('provider_catalog_sync_models', `run_id = '${humanDecision}' and reviewed_by is not null`), 1);
    for (const id of failed.slice(20)) assert.ok(await exists(id), 'newest 50 failed runs kept');
    for (const id of failed.slice(8, 20)) assert.equal(await exists(id), false, 'old unreferenced failed run deleted');
    for (const id of polls.slice(30)) assert.ok(await exists(id), 'newest 50 polls kept');
    for (const id of polls.slice(0, 30)) assert.equal(await exists(id), false, 'oldest polls deleted');
    for (const id of small) assert.ok(await exists(id), 'providers with few runs keep them all');
    assert.equal(await count('provider_catalog_sync_runs', "provider_slug = 'recent'"), 70, 'runs from the last 7 days are kept');
    console.log('provider catalog sync run retention: ok');
} finally {
    await db.close();
}

// The migration applies with a pg_cron stub and schedules the daily job.
const migrated = new PGlite();
try {
    await setup(migrated);
    await migrated.exec(`
      create schema cron;
      create table cron.job(jobname text primary key, schedule text, command text);
      create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql
        as $$ insert into cron.job values (p_name, p_schedule, p_command) returning 1::bigint $$;
      create function cron.unschedule(p_name text) returns boolean language sql as $$ delete from cron.job where jobname = p_name returning true $$;
    `);
    await migrated.exec(`begin; ${migration} commit;`);
    const job = (await migrated.query("select schedule, command from cron.job where jobname = 'prune-provider-catalog-sync-runs'")).rows[0];
    assert.equal(job.schedule, '47 3 * * *');
    assert.match(job.command, /select private\.prune_provider_catalog_sync_runs\(50, 1000\);$/);
    assert.equal((await migrated.query('select private.prune_provider_catalog_sync_runs(50, 1000) n')).rows[0].n, 0);
    console.log('provider catalog sync run retention migration: ok');
} finally {
    await migrated.close();
}
