// Standalone PostgreSQL regression test: a request whose Phaseo overhead was never measured keeps
// phaseo_overhead_ms NULL instead of 0, while a measured 0 and positive values are still copied.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/phaseo-overhead-null.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const migrationsDir = new URL('../migrations/', import.meta.url);
const migrationName = (await readdir(migrationsDir)).find((name) => name.endsWith('_keep_unknown_phaseo_overhead_null.sql'));
assert.ok(migrationName, 'overhead migration is missing');
const migration = await readFile(new URL(migrationName, migrationsDir), 'utf8');
const schemaFunction = await readFile(new URL('../schemas/public/functions/copy_v2_performance_metrics_from_metadata.sql', import.meta.url), 'utf8');
assert.doesNotMatch(migration, /^\s*(delete|drop|truncate|update)\b/im, 'the migration must not change existing rows');
assert.ok(schemaFunction.startsWith(migration.slice(migration.indexOf('CREATE OR REPLACE'), migration.indexOf('$function$;') + '$function$;'.length)),
	'the declarative schema function must match the migration');

const db = new PGlite();
await db.exec(`
  create table public.v2_request_facts (
    id int primary key, safe_metadata jsonb not null default '{}'::jsonb,
    provider_ttft_ms integer, gateway_ttft_ms integer, output_speed_tps numeric, tpot_ms numeric, itl_ms numeric,
    phaseo_overhead_ms integer
  );
`);
await db.exec(migration);
await db.exec(`
  create trigger copy_performance before insert or update of safe_metadata on public.v2_request_facts
  for each row execute function public.copy_v2_performance_metrics_from_metadata();
  insert into public.v2_request_facts (id, safe_metadata) values
    (1, '{"performance":{"phaseo_overhead_ms":null}}'),
    (2, '{"performance":{"phaseo_overhead_ms":""}}'),
    (3, '{"performance":{"phaseo_overhead_ms":0}}'),
    (4, '{"performance":{"phaseo_overhead_ms":41.6}}'),
    (5, '{"performance":{"phaseo_overhead_ms":-3}}'),
    (6, '{}');
`);

const rows = (await db.query('select id, phaseo_overhead_ms from public.v2_request_facts order by id')).rows;
assert.deepEqual(rows.map((row) => row.phaseo_overhead_ms), [null, null, 0, 42, 0, null]);

await db.close();
console.log('phaseo-overhead-null: ok');
