// Standalone PostgreSQL regression test. Install @electric-sql/pglite@0.5.8 in
// a temporary directory and set PGLITE_MODULE to its dist/index.js file URL.
// Run: node supabase/tests/compare-usage-daily.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const migration = await readFile(new URL('../migrations/20261022123227_compare_usage_daily.sql', import.meta.url), 'utf8');
const schemaFile = await readFile(new URL('../schemas/public/functions/get_compare_usage_daily.sql', import.meta.url), 'utf8');
assert.ok(migration.includes(schemaFile), 'the migration creates exactly the declarative function');

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.v2_public_usage_daily (
    rollup_id uuid primary key, usage_date date not null, model_slug text not null,
    provider_model_id text not null, requests bigint not null default 0, hidden boolean not null default false
  );
  create table public.v2_public_usage_daily_meters (
    rollup_id uuid references public.v2_public_usage_daily, meter_key text, modality text default 'text',
    unit text default 'token', quantity numeric(30,12), primary key (rollup_id, meter_key, modality, unit)
  );
  -- Stands in for the visibility filter: stealth routes are left out.
  create view public.reporting_usage_daily as select * from public.v2_public_usage_daily where not hidden;
  insert into public.v2_public_usage_daily values
    ('00000000-0000-0000-0000-00000000000a', current_date - 1, 'openai/gpt-5', 'openai:gpt-5', 3, false),
    ('00000000-0000-0000-0000-00000000000b', current_date - 1, 'openai/gpt-5', 'azure:gpt-5', 2, false),
    ('00000000-0000-0000-0000-00000000000c', current_date - 2, 'openai/gpt-5', 'openai:gpt-5', 1, false),
    ('00000000-0000-0000-0000-00000000000d', current_date - 1, 'openai/gpt-5', 'stealth:gpt-5', 50, true),
    ('00000000-0000-0000-0000-00000000000e', current_date - 1, 'google/gemma', 'google:gemma', 4, false),
    ('00000000-0000-0000-0000-00000000000f', current_date - 1, 'other/model', 'other:model', 9, false),
    ('00000000-0000-0000-0000-000000000010', current_date - 40, 'openai/gpt-5', 'openai:gpt-5', 7, false);
  insert into public.v2_public_usage_daily_meters (rollup_id, meter_key, modality, quantity) values
    ('00000000-0000-0000-0000-00000000000a', 'input_tokens', 'text', 100),
    ('00000000-0000-0000-0000-00000000000a', 'input_tokens', 'image', 20),
    ('00000000-0000-0000-0000-00000000000a', 'output_tokens', 'text', 30),
    ('00000000-0000-0000-0000-00000000000a', 'reasoning_tokens', 'text', 5),
    ('00000000-0000-0000-0000-00000000000b', 'input_tokens', 'text', 50),
    ('00000000-0000-0000-0000-00000000000b', 'cached_input_tokens', 'text', 40),
    ('00000000-0000-0000-0000-00000000000c', 'output_tokens', 'text', 8),
    ('00000000-0000-0000-0000-00000000000d', 'input_tokens', 'text', 99999),
    ('00000000-0000-0000-0000-00000000000f', 'input_tokens', 'text', 99999),
    ('00000000-0000-0000-0000-000000000010', 'input_tokens', 'text', 99999);
`);
await db.exec(migration);

const rows = (await db.query(
  `select (current_date - day_bucket) as days_ago, model_id, requests::int, input_tokens::int, output_tokens::int, reasoning_tokens::int
   from public.get_compare_usage_daily($1, 30)`,
  [['openai/gpt-5', 'google/gemma', 'missing/model']],
)).rows;
assert.deepEqual(rows, [
  { days_ago: 1, model_id: 'google/gemma', requests: 4, input_tokens: 0, output_tokens: 0, reasoning_tokens: 0 },
  { days_ago: 2, model_id: 'openai/gpt-5', requests: 1, input_tokens: 0, output_tokens: 8, reasoning_tokens: 0 },
  { days_ago: 1, model_id: 'openai/gpt-5', requests: 5, input_tokens: 170, output_tokens: 30, reasoning_tokens: 5 },
], 'one row per model and day, summed across visible routes and modalities, inside the window only');

const week = (await db.query(`select count(*)::int as n from public.get_compare_usage_daily($1, 2)`, [['openai/gpt-5']])).rows[0].n;
assert.equal(week, 1, 'p_days limits the window to that many days, today included');
const capped = (await db.query(`select count(*)::int as n from public.get_compare_usage_daily($1, 100000)`, [['openai/gpt-5']])).rows[0].n;
assert.equal(capped, 3, 'the window is capped at 90 days');

console.log('compare-usage-daily: ok');
