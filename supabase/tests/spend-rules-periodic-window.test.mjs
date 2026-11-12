// Standalone PostgreSQL regression test for the spend rules sweep's hourly periodic pass.
// A slot with more workspaces than p_limit rotates hourly, so every workspace in it is evaluated
// within ceil(n / p_limit) hours. Workspaces the dirty set already evaluates must not shift that
// window: when a different workspace is dirty each hour, the others are still all reached.
// Runs public.sweep_spend_rules from the newest migration that defines it on stub tables, with
// an evaluator that only logs the workspace.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-rules-periodic-window.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const migrationName = migrations.find((name) => name.endsWith('_spend_rules_periodic_window.sql'));
assert(migrationName, 'the periodic window migration exists');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
let newest = migrationName;
for (const name of migrations.filter((name) => name > migrationName)) {
  if ((await read(`../migrations/${name}`)).includes('FUNCTION public.sweep_spend_rules')) newest = name;
}
const migration = await read(`../migrations/${newest}`);
assert(normalize(migration).includes(normalize(await read('../schemas/public/functions/sweep_spend_rules.sql'))),
  `public/functions/sweep_spend_rules.sql is in ${newest}`);
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-rules-periodic-window\.test\.mjs/, 'CI runs this suite');

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];

try {
  await db.exec(`
    set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private;
    create table public.workspace_spend_rules (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      metric text not null default 'spend', period text not null default 'month', base_kind text, time_zone text,
      enabled boolean not null default true, deleted_at timestamptz);
    create table public.workspace_settings (workspace_id uuid primary key, billing_time_zone text);
    create table public.workspace_spend_rule_state (rule_id uuid not null, period_start timestamptz not null);
    create table public.workspace_spend_rule_dirty (workspace_id uuid primary key, dirtied_at timestamptz not null default now());
    create table public.workspace_spend_blocks (workspace_id uuid not null, lifted_at timestamptz, resets_at timestamptz not null);
    create function private.spend_rule_evaluable(p_metric text, p_period text, p_base_kind text) returns boolean language sql as $$ select true $$;
    create function private.spend_rule_period(p_period text, p_time_zone text, p_now timestamptz)
      returns table (period_start timestamptz) language sql as $$ select date_trunc('month', p_now) $$;
    create table evaluated (workspace_id uuid);
    create function private.evaluate_workspace_spend_rules(p_workspace_id uuid, p_now timestamptz, p_blocks boolean default false)
      returns jsonb language plpgsql as $$
    begin
      insert into public.evaluated values (p_workspace_id);
      return jsonb_build_object('rules', 1, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb);
    end $$;
  `);
  await db.exec(migration);

  // 240 workspaces with one rule each, every rule already has state for its period (no rollover).
  await db.exec(`
    insert into public.workspace_spend_rules (workspace_id)
    select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 240) n;
    insert into public.workspace_spend_rule_state (rule_id, period_start) select id, '2026-10-01' from public.workspace_spend_rules;
  `);
  const slotStart = Date.parse('2026-10-20T15:10:00Z');
  const hour = (h) => new Date(slotStart + h * 3600e3).toISOString();
  const slot = (await one(`select (floor(extract(epoch from $1::timestamptz) / 300)::bigint % 12)::int s`, [hour(0)])).s;
  const inSlot = (await rows(`select workspace_id from public.workspace_spend_rules
    where (pg_catalog.hashtextextended(workspace_id::text, 0) % 12 + 12) % 12 = $1 order by workspace_id`, [slot])).map((row) => row.workspace_id);
  assert.ok(inSlot.length >= 4, `the slot has enough workspaces to rotate (${inSlot.length})`);
  const limit = Math.ceil(inSlot.length / 3);
  const visits = Math.ceil(inSlot.length / limit);

  // With nothing dirty, the slot is covered in ceil(n / limit) hours.
  for (let h = 1; h <= visits; h += 1) {
    const result = (await one('select public.sweep_spend_rules($1::timestamptz, $2) r', [hour(h), limit])).r;
    assert.equal(result.rollover, 0);
    assert.equal(result.periodic, limit);
  }
  assert.equal((await one('select count(distinct workspace_id)::int n from evaluated')).n, inSlot.length, 'every workspace in the slot is reached');

  // Each hour, a workspace from that hour's window is dirty (usage marked it). It is evaluated
  // through the dirty set and dropped from the window; the window itself does not move, so the
  // rest of the slot is still reached within ceil(n / limit) hours.
  for (let start = 1; start <= visits; start += 1) {
    await db.exec('truncate evaluated');
    for (let h = start; h < start + visits; h += 1) {
      const round = Math.floor(Date.parse(hour(h)) / 3600e3);
      const first = ((round * limit) % inSlot.length + inSlot.length) % inSlot.length;
      await db.query('insert into public.workspace_spend_rule_dirty (workspace_id) values ($1)', [inSlot[first]]);
      const result = (await one('select public.sweep_spend_rules($1::timestamptz, $2) r', [hour(h), limit])).r;
      assert.equal(result.dirty, 1);
      assert.equal(result.periodic, limit - 1, 'the dirty workspace is dropped from the window, not replaced');
    }
    const reached = (await rows('select distinct workspace_id from evaluated')).map((row) => row.workspace_id);
    const missed = inSlot.filter((id) => !reached.includes(id));
    assert.deepEqual(missed, [], `every workspace in the slot is reached while the dirty set changes (start ${start})`);
  }

  // The periodic and dirty sets never evaluate a workspace twice in one call.
  await db.exec('truncate evaluated');
  await db.query('insert into public.workspace_spend_rule_dirty (workspace_id) select unnest($1::uuid[])', [inSlot]);
  const all = (await one('select public.sweep_spend_rules($1::timestamptz, 1000) r', [hour(0)])).r;
  assert.equal(all.dirty, inSlot.length);
  assert.equal(all.periodic, 0);
  assert.equal((await one('select count(*)::int n, count(distinct workspace_id)::int d from evaluated')).n, inSlot.length);
  console.log(JSON.stringify({ periodic_window: { slot_workspaces: inSlot.length, limit, visits } }));
} finally {
  await db.close();
}
