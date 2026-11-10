// Isolated PGlite test for private.prune_catalogue_row_history. Never connects to Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261110102400_prune_catalogue_row_history_benchmark_noise.sql');
const schemaFiles = {
    reject: await read('../schemas/public/functions/reject_catalogue_history_change.sql'),
    guard: await read('../schemas/catalogue_private/functions/guard_row_history_delete.sql'),
    prune: await read('../schemas/private/functions/prune_catalogue_row_history.sql'),
    table: await read('../schemas/public/tables/v2_catalogue_row_history.sql'),
    misc: await read('../schemas/_cluster/misc.sql'),
};

// The migration and the declarative files must define the same function bodies, trigger and schedule.
const body = sql => sql.match(/\$function\$([\s\S]*?)\$function\$/)[1];
const migrationBody = name => body(migration.slice(migration.indexOf(`FUNCTION ${name}`)));
assert.equal(migrationBody('public.reject_catalogue_history_change'), body(schemaFiles.reject));
assert.equal(migrationBody('catalogue_private.guard_row_history_delete'), body(schemaFiles.guard));
assert.equal(migrationBody('private.prune_catalogue_row_history'), body(schemaFiles.prune));
assert.match(schemaFiles.table, /CREATE TRIGGER catalogue_history_prune_guard\s+BEFORE DELETE ON public\.v2_catalogue_row_history\s+FOR EACH ROW/);
assert.match(migration, /CREATE TRIGGER catalogue_history_prune_guard\s+BEFORE DELETE ON public\.v2_catalogue_row_history\s+FOR EACH ROW/);
assert.match(migration, /cron\.schedule\('prune-catalogue-row-history', '23 \* \* \* \*'/);
assert.match(schemaFiles.misc, /'prune-catalogue-row-history', '23 \* \* \* \*',\s*'set statement_timeout = ''60s''; set lock_timeout = ''5s''; select private\.prune_catalogue_row_history\(5000\);'/);
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /m);

const db = new PGlite();
const count = async (where = 'true') => (await db.query(`select count(*)::int n from public.v2_catalogue_row_history where ${where}`)).rows[0].n;
const prune = async limit => (await db.query('select private.prune_catalogue_row_history($1) n', [limit])).rows[0].n;
const shown = async model => (await db.query(
    "select event_id from public.v2_catalogue_row_history where model_slug=$1 and operation<>'BASELINE' order by event_id desc limit 100", [model],
)).rows.map(row => Number(row.event_id));
const insert = (table, model, operation, before, after, age = '1 hour') => db.query(
    `insert into public.v2_catalogue_row_history(table_name, model_slug, operation, before_state, after_state, recorded_at)
     values ($1, $2, $3, $4, $5, now() - $6::interval)`,
    [table, model, operation, before, after, age],
);
const bench = (score, updated) => ({ result_id: 'r', score, updated_at: updated });

try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema catalogue_private; create schema private;
      grant usage on schema private, catalogue_private to service_role;
    `);
    // Trigger functions first: the table file creates the triggers that call them.
    await db.exec(schemaFiles.reject.replace(/REVOKE ALL[^;]*FROM PUBLIC, "anon", "authenticated", "service_role";/, ''));
    await db.exec(schemaFiles.guard);
    await db.exec(schemaFiles.table);
    await db.exec(await read('../schemas/public/tables/catalogue_notification_cursors.sql'));
    await db.exec(schemaFiles.prune);

    // No cursor yet: nothing is deleted, because nothing is known to be read.
    await insert('v2_benchmark_results', 'lab/a', 'UPDATE', bench('1', 't0'), bench('1', 't1'));
    assert.equal(await prune(100), 0);

    // lab/a: baseline, benchmark noise, a real recent change, benchmark insert/delete, and noise on another table.
    await insert('v2_benchmark_results', 'lab/a', 'BASELINE', null, bench('1', 't0'), '70 days');
    await insert('v2_benchmark_results', 'lab/a', 'UPDATE', bench('1', 't1'), bench('1', 't2'));
    await insert('v2_benchmark_results', 'lab/a', 'UPDATE', bench('1', 't2'), bench('2', 't3'));
    await insert('v2_benchmark_results', 'lab/a', 'INSERT', null, bench('3', 't4'), '120 days');
    await insert('v2_benchmark_results', 'lab/a', 'DELETE', bench('3', 't4'), null, '120 days');
    await insert('v2_model_provider_routes', 'lab/a', 'UPDATE', { id: 'x', updated_at: 'a' }, { id: 'x', updated_at: 'b' }, '120 days');
    // lab/b: 5 real benchmark changes 100 days old, then 100 newer route changes, so the admin view no longer shows them.
    for (let i = 0; i < 5; i += 1) await insert('v2_benchmark_results', 'lab/b', 'UPDATE', bench(String(i), 'a'), bench(String(i + 1), 'b'), '100 days');
    for (let i = 0; i < 100; i += 1) await insert('v2_model_provider_routes', 'lab/b', 'UPDATE', { n: i }, { n: i + 1 });
    // lab/c: old real benchmark changes the admin view still shows (fewer than 100 newer rows).
    for (let i = 0; i < 3; i += 1) await insert('v2_benchmark_results', 'lab/c', 'UPDATE', bench(String(i), 'a'), bench(String(i + 1), 'b'), '100 days');
    // Old benchmark change with no model: never shown, so it goes after 90 days. A recent one with no model stays.
    await insert('v2_benchmark_results', null, 'UPDATE', bench('1', 'a'), bench('2', 'b'), '100 days');
    await insert('v2_benchmark_results', null, 'UPDATE', bench('1', 'a'), bench('2', 'b'), '10 days');
    const cursor = (await db.query('select max(event_id)::bigint id from public.v2_catalogue_row_history')).rows[0].id;
    await db.query("insert into public.catalogue_notification_cursors(source, last_history_event_id) values ('v2_catalogue_row_history', $1)", [cursor]);
    // Noise the notification capture has not read yet.
    await insert('v2_benchmark_results', 'lab/a', 'UPDATE', bench('2', 't3'), bench('2', 't5'));

    const total = await count();
    const shownB = await shown('lab/b');
    const shownC = await shown('lab/c');

    // Only the backend job may prune: API roles cannot call it.
    for (const role of ['anon', 'authenticated', 'service_role']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(prune(10), /permission denied/);
        await db.exec('reset role');
    }

    // Direct changes stay blocked, with or without the prune flag set by the session.
    await assert.rejects(db.exec('delete from public.v2_catalogue_row_history'), /append-only/);
    await assert.rejects(db.exec('truncate public.v2_catalogue_row_history'), /append-only/);
    await assert.rejects(db.exec('update public.v2_catalogue_row_history set actor_user_id = null'), /append-only/);
    await db.exec("set phaseo.catalogue_history_prune = 'on'");
    await assert.rejects(db.exec("delete from public.v2_catalogue_row_history where operation = 'BASELINE'"), /append-only/);
    await assert.rejects(db.exec("delete from public.v2_catalogue_row_history where table_name = 'v2_model_provider_routes'"), /append-only/);
    await assert.rejects(db.exec("delete from public.v2_catalogue_row_history where table_name = 'v2_benchmark_results' and operation in ('INSERT', 'DELETE')"), /append-only/);
    await assert.rejects(db.exec('update public.v2_catalogue_row_history set actor_user_id = null'), /append-only/);
    await assert.rejects(db.exec('truncate public.v2_catalogue_row_history'), /append-only/);
    await db.exec('reset phaseo.catalogue_history_prune');
    assert.equal(await count(), total);
    assert.equal(await prune(0).catch(error => error.message), 'Catalogue history prune batch size must be between 1 and 10000');

    // Batches are bounded: read noise goes first (2 rows for lab/a), then the hidden old rows (5 for lab/b, 1 without a model).
    assert.equal(await prune(1), 1);
    assert.equal(await count("model_slug = 'lab/a' and operation = 'UPDATE' and table_name = 'v2_benchmark_results'"), 3);
    assert.equal(await prune(5000), 7);
    assert.equal(await prune(5000), 0);
    assert.equal(await count(), total - 8);
    // The flag does not leak out of the job's transaction.
    assert.notEqual((await db.query("select coalesce(current_setting('phaseo.catalogue_history_prune', true), '') v")).rows[0].v, 'on');
    await assert.rejects(db.exec("delete from public.v2_catalogue_row_history where model_slug = 'lab/a' and operation = 'UPDATE' and table_name = 'v2_benchmark_results'"), /append-only/);

    // What the admin model history view shows is unchanged.
    assert.deepEqual(await shown('lab/b'), shownB);
    assert.deepEqual(await shown('lab/c'), shownC);
    assert.equal(await count("model_slug = 'lab/b' and table_name = 'v2_benchmark_results'"), 0);
    assert.equal(await count("model_slug = 'lab/c' and table_name = 'v2_benchmark_results'"), 3);
    // Kept: baseline, benchmark insert/delete, real recent change, other-table noise, unread noise, recent model-less change.
    assert.equal(await count("operation = 'BASELINE'"), 1);
    assert.equal(await count("table_name = 'v2_benchmark_results' and operation in ('INSERT', 'DELETE')"), 2);
    assert.equal(await count("table_name = 'v2_model_provider_routes'"), 101);
    assert.equal(await count("model_slug is null"), 1);
    // lab/a keeps its real change and the noise row the capture has not read yet.
    assert.equal(await count("model_slug = 'lab/a' and table_name = 'v2_benchmark_results' and operation = 'UPDATE' and after_state->>'score' = '2'"), 2);

    // Once the capture reads the newer noise row, the next run removes it.
    await db.query("update public.catalogue_notification_cursors set last_history_event_id = (select max(event_id) from public.v2_catalogue_row_history)");
    assert.equal(await prune(5000), 1);
    assert.equal(await count("model_slug = 'lab/a' and table_name = 'v2_benchmark_results' and operation = 'UPDATE'"), 1);
    // lab/d: one real 100-day-old change followed by 100 noise rows. The noise is deleted, so it must not count
    // toward the 100 newer rows: the real change stays visible in the admin view.
    await insert('v2_benchmark_results', 'lab/d', 'UPDATE', bench('1', 'a'), bench('2', 'b'), '100 days');
    for (let i = 0; i < 100; i += 1) await insert('v2_benchmark_results', 'lab/d', 'UPDATE', bench('2', `n${i}`), bench('2', `n${i + 1}`));
    await db.query("update public.catalogue_notification_cursors set last_history_event_id = (select max(event_id) from public.v2_catalogue_row_history)");
    assert.equal(await prune(5000), 100);
    assert.equal(await prune(5000), 0);
    assert.equal(await count("model_slug = 'lab/d'"), 1);
    assert.equal((await shown('lab/d')).length, 1);
    console.log('catalogue row history prune: ok');
} finally {
    await db.close();
}

// The migration applies on top of the previous schema (the old reject function and statement trigger).
const migrated = new PGlite();
try {
    await migrated.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema catalogue_private; create schema private; create schema cron;
      create table cron.job(jobname text primary key, schedule text, command text);
      create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql
        as $$ insert into cron.job values (p_name, p_schedule, p_command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
      create function cron.unschedule(p_name text) returns boolean language sql as $$ delete from cron.job where jobname = p_name returning true $$;
      create function public.reject_catalogue_history_change() returns trigger language plpgsql
        set search_path to 'public', 'pg_temp' as $f$ begin raise exception 'catalogue history is append-only'; end $f$;
    `);
    await migrated.exec(schemaFiles.table.replace(/CREATE TRIGGER catalogue_history_prune_guard[\s\S]*?guard_row_history_delete\(\);\n/, ''));
    await migrated.exec(await read('../schemas/public/tables/catalogue_notification_cursors.sql'));
    await migrated.exec(`begin; ${migration} commit;`);
    const job = (await migrated.query("select schedule, command from cron.job where jobname = 'prune-catalogue-row-history'")).rows[0];
    assert.equal(job.schedule, '23 * * * *');
    assert.match(job.command, /select private\.prune_catalogue_row_history\(5000\);$/);
    await migrated.query("insert into public.v2_catalogue_row_history(table_name, model_slug, operation, before_state, after_state) values ('v2_benchmark_results', 'lab/a', 'UPDATE', '{\"s\":1,\"updated_at\":\"a\"}', '{\"s\":1,\"updated_at\":\"b\"}')");
    await migrated.query("insert into public.catalogue_notification_cursors(source, last_history_event_id) values ('v2_catalogue_row_history', 1)");
    await assert.rejects(migrated.exec('delete from public.v2_catalogue_row_history'), /append-only/);
    assert.equal((await migrated.query('select private.prune_catalogue_row_history(10) n')).rows[0].n, 1);
    console.log('catalogue row history prune migration: ok');
} finally {
    await migrated.close();
}
