// Standalone PostgreSQL regression test for guardrail levels phase D (first pass): spend guardrails.
// Checks: the migration matches the schema files and destroys nothing; the constraints keep spend
// guardrails to spend settings only, with every setting chosen; private.spend_guardrail_usage
// counts one counter per assignment for shared guardrails and one per key for each_key ones;
// gateway_spend_limit_seed lists only blocking counters, less excluded requests;
// sweep_spend_guardrail_alerts pushes once at 80% and once at 100%; and (budget enforcement and
// money hygiene) a guardrail counter counts exactly what a key cost limit counts.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-guardrails.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createGuardrailLevelsBase } from './fixtures/guardrail-levels-before.mjs';
import { installUnbilledSpend } from './fixtures/unbilled-spend.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const levelsName = migrations.find((name) => name.endsWith('_guardrail_levels.sql'));
const migrationName = migrations.find((name) => name.endsWith('_spend_guardrails.sql'));
assert(levelsName && migrationName && migrationName > levelsName, 'the migration exists and runs after phase A');
const migration = await read(`../migrations/${migrationName}`);
assert(normalize(migration).includes(normalize(await read('../schemas/public/functions/sweep_spend_guardrail_alerts.sql'))),
  'public/functions/sweep_spend_guardrail_alerts.sql is in the migration');
// The budget enforcement migration replaces the seed and the usage function after this one; the
// newest migration that does ships each schema file.
for (const [name, file] of [['spend_guardrail_usage', 'private/functions/spend_guardrail_usage.sql'],
  ['gateway_spend_limit_seed', 'public/functions/gateway_spend_limit_seed.sql']]) {
  let newest = null;
  for (const candidate of [...migrations].filter((entry) => entry.endsWith('.sql')).sort().reverse()) {
    const sql = await read(`../migrations/${candidate}`);
    if (new RegExp(`CREATE OR REPLACE FUNCTION (public|private)\\.${name} \\(`).test(sql)) { newest = sql; break; }
  }
  assert(newest && normalize(newest).includes(normalize(await read(`../schemas/${file}`))), `the newest migration replacing ${name} ships ${file}`);
}
assert(!/\b(delete\s+from|truncate)\b/i.test(migration) && !/\bdrop\s+(table|column|function|constraint)\b/i.test(migration),
  'the migration deletes and drops nothing');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-guardrails\.test\.mjs/, 'CI runs this suite');
const guardrailsTable = normalize(await read('../schemas/public/tables/workspace_guardrails.sql'));

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [W1] = [id(1)];
const [U1, U2] = [id(31), id(32)];
const [K1, K2, K3] = [id(21), id(22), id(23)];
const [D1] = [id(41)];
const [GDEPT, GEACH, GOFF, GMEMBER] = [id(51), id(52), id(53), id(54)];
const usd = (dollars) => Math.round(dollars * 1e9);

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const fails = async (sql, pattern, message) => {
  await assert.rejects(db.exec(sql), pattern, message);
};

try {
  await createGuardrailLevelsBase(db);
  await db.exec(`
    alter table public.workspace_guardrails
      add column name text not null default gen_random_uuid()::text,
      add column is_workspace_baseline boolean not null default false;
    alter table public.keys
      add column prefix text not null default 'pk_test',
      add column status text not null default 'active',
      add column soft_blocked boolean not null default false,
      add column daily_limit_requests bigint not null default 0, add column weekly_limit_requests bigint not null default 0,
      add column monthly_limit_requests bigint not null default 0, add column daily_limit_cost_nanos bigint not null default 0,
      add column weekly_limit_cost_nanos bigint not null default 0, add column monthly_limit_cost_nanos bigint not null default 0;
    create table public.gateway_requests (
      request_id text not null, workspace_id uuid not null, key_id uuid, success boolean, cost_nanos bigint,
      created_at timestamptz not null default now(), endpoint text);
    create table public.workspace_department_budgets (id uuid primary key, workspace_id uuid not null, department_id uuid not null,
      interval text not null, limit_nanos bigint not null);
    create table public.workspace_notification_events (
      id bigserial primary key, workspace_id uuid not null, kind text not null, category text not null,
      dedupe_key text unique, payload jsonb not null, occurred_at timestamptz not null);
    create function public.gateway_workspace_budget_status(uuid, bigint) returns jsonb language sql as $$ select '{"budgets": []}'::jsonb $$;
    insert into public.workspaces values ('${W1}');
    insert into public.users values ('${U1}'), ('${U2}');
    insert into public.workspace_departments values ('${D1}', '${W1}');
    insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ('${W1}', '${U1}', '${D1}');
    insert into public.keys (id, workspace_id, created_by, name) values
      ('${K1}', '${W1}', '${U1}', 'Batch'), ('${K2}', '${W1}', '${U2}', 'Website'), ('${K3}', '${W1}', '${U1}', '');
  `);
  await db.exec(await read(`../migrations/${levelsName}`));
  for (const file of ['private/functions/workspace_push_usd.sql', 'private/functions/spend_limit_period.sql', 'private/functions/spend_limit_amount.sql',
    'public/functions/resolve_key_guardrails.sql']) {
    await db.exec(await read(`../schemas/${file}`));
  }
  await db.exec(migration);
  // This release's usage function, over the shared key usage calculation (private.key_spend_items).
  await installUnbilledSpend(db);
  await db.exec(await read('../schemas/private/functions/spend_guardrail_usage.sql'));

  // The table file declares exactly the columns and constraints the migration adds.
  for (const row of await rows(`
    select conname, pg_get_constraintdef(oid) as definition from pg_constraint
    where conrelid = 'public.workspace_guardrails'::regclass and contype = 'c' and conname like 'workspace_guardrails_spend_%' order by conname`)) {
    assert(guardrailsTable.includes(`CONSTRAINT "${row.conname}" ${row.definition},`), `the table file declares ${row.conname}`);
  }
  for (const column of ['"spend_limit_nanos"                       bigint', '"spend_period"                            text',
    '"spend_action"                            text', '"spend_counting"                          text']) {
    assert(guardrailsTable.includes(column), `the table file declares ${column}`);
  }

  // 1. Spend guardrails set every spend setting and nothing else; other kinds set none.
  const spend = (guardrailId, extra = '') => `insert into public.workspace_guardrails
    (id, workspace_id, name, kind, spend_limit_nanos, spend_period, spend_action, spend_counting${extra ? ', ' + extra.split('=')[0] : ''})
    values ('${guardrailId}', '${W1}', 'x', 'spend', 1000, 'daily', 'block', 'shared'${extra ? ', ' + extra.split('=')[1] : ''})`;
  await fails(spend(id(90), 'privacy_zdr_only=true'), /workspace_guardrails_spend_kind_check/, 'a spend guardrail cannot also set access rules');
  await fails(`insert into public.workspace_guardrails (id, workspace_id, kind, spend_limit_nanos, spend_period, spend_action)
    values ('${id(91)}', '${W1}', 'spend', 1000, 'daily', 'block')`, /workspace_guardrails_spend_kind_check/, 'how it counts must be chosen');
  await fails(`insert into public.workspace_guardrails (id, workspace_id, kind, spend_period) values ('${id(92)}', '${W1}', 'access', 'daily')`,
    /workspace_guardrails_spend_kind_check/, 'an access guardrail sets no spend settings');
  await fails(spend(id(93)).replace("'daily'", "'yearly'"), /workspace_guardrails_spend_period_check/, 'periods are daily, weekly or monthly');
  await fails(spend(id(94)).replace("1000,", "0,"), /workspace_guardrails_spend_limit_nanos_check/, 'the limit is above zero');

  // 2. Counters: shared counts once per assignment over the keys it covers, each_key once per key.
  await db.exec(`
    insert into public.workspace_guardrails (id, workspace_id, name, kind, spend_limit_nanos, spend_period, spend_action, spend_counting, enabled) values
      ('${GDEPT}', '${W1}', 'Engineering daily', 'spend', ${usd(1)}, 'daily', 'block', 'shared', true),
      ('${GEACH}', '${W1}', 'Every key monthly', 'spend', ${usd(0.5)}, 'monthly', 'notify', 'each_key', true),
      ('${GOFF}', '${W1}', 'Paused', 'spend', ${usd(0.01)}, 'daily', 'block', 'shared', false),
      ('${GMEMBER}', '${W1}', 'Ada weekly', 'spend', ${usd(5)}, 'weekly', 'block', 'shared', true);
    insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id) values
      ('${W1}', '${GDEPT}', 'department', '${D1}'),
      ('${W1}', '${GEACH}', 'workspace', null),
      ('${W1}', '${GOFF}', 'workspace', null),
      ('${W1}', '${GMEMBER}', 'member', '${U2}'),
      ('${W1}', '${GMEMBER}', 'key', '${K1}');
    insert into public.gateway_requests (request_id, workspace_id, key_id, success, cost_nanos, created_at) values
      ('r1', '${W1}', '${K1}', true, ${usd(0.6)}, now()),
      ('r2', '${W1}', '${K3}', true, ${usd(0.5)}, now()),
      ('r3', '${W1}', '${K2}', true, ${usd(0.45)}, now()),
      ('r4', '${W1}', '${K1}', false, 0, now()),
      ('r5', '${W1}', '${K2}', true, ${usd(0.2)}, now() - interval '400 days');
  `);
  const usage = await rows(`select guardrail_id, spend_action, counter, key_ids, usage_nanos::text as usage
    from private.spend_guardrail_usage($1, now()) order by guardrail_name, counter`, [W1]);
  assert.deepEqual(usage.map(({ guardrail_id, counter, key_ids, usage: used }) => ({ guardrail_id, counter, key_ids, used })), [
    { guardrail_id: GMEMBER, counter: `key:${K1}`, key_ids: [K1], used: String(usd(0.6)) },
    { guardrail_id: GMEMBER, counter: `member:${U2}`, key_ids: [K2], used: String(usd(0.45)) },
    { guardrail_id: GDEPT, counter: `department:${D1}`, key_ids: [K1, K3], used: String(usd(1.1)) },
    { guardrail_id: GEACH, counter: `key:${K1}`, key_ids: [K1], used: String(usd(0.6)) },
    { guardrail_id: GEACH, counter: `key:${K2}`, key_ids: [K2], used: String(usd(0.45)) },
    { guardrail_id: GEACH, counter: `key:${K3}`, key_ids: [K3], used: String(usd(0.5)) },
  ], 'counters, their keys and this period\'s successful spend; switched-off guardrails count nothing');

  // 3. The coordinator seed lists blocking counters only, less excluded request ids.
  const [{ seed }] = await rows(`select public.gateway_spend_limit_seed($1, $2, $3) as seed`, [W1, [K1], ['r2']]);
  assert.deepEqual(seed.guardrail_budgets.map((entry) => [entry.guardrail_id, entry.counter, entry.counting, entry.interval, entry.key_ids, entry.usage_nanos]), [
    [GMEMBER, `key:${K1}`, 'shared', 'weekly', [K1], usd(0.6)],
    [GMEMBER, `member:${U2}`, 'shared', 'weekly', [K2], usd(0.45)],
    [GDEPT, `department:${D1}`, 'shared', 'daily', [K1, K3], usd(0.6)],
  ], 'blocking counters with excluded requests left out');
  assert.equal(seed.guardrail_budgets[2].limit_nanos, usd(1));
  assert.equal(seed.guardrail_budgets[2].guardrail_name, 'Engineering daily');
  await db.exec(`update public.workspace_guardrails set spend_action = 'notify' where kind = 'spend'`);
  const [{ seed: quiet }] = await rows(`select public.gateway_spend_limit_seed($1, $2) as seed`, [W1, [K1]]);
  assert.deepEqual(quiet.guardrail_budgets, [], 'notify-only guardrails are not enforced');
  await db.exec(`update public.workspace_guardrails set spend_action = 'block' where id in ('${GDEPT}', '${GMEMBER}')`);

  // 4. Alerts: one push at 80% and one at 100% per counter and period.
  const [{ result }] = await rows(`select public.sweep_spend_guardrail_alerts() as result`);
  assert.deepEqual(result, { workspaces: 1, alerted: 4 });
  const events = await rows(`select kind, payload->'push'->>'title' as title, payload->'push'->>'body' as body
    from public.workspace_notification_events order by kind, payload->'push'->>'title' collate "C"`);
  assert.deepEqual(events.map(({ kind, title }) => [kind, title]), [
    ['spend_guardrail_reached', 'Batch has used its monthly limit from Every key monthly'],
    ['spend_guardrail_reached', 'Engineering daily has used its daily spend limit'],
    ['spend_guardrail_reached', 'pk_test has used its monthly limit from Every key monthly'],
    ['spend_guardrail_warning', 'Website is at 80% of its monthly limit from Every key monthly'],
  ], 'counters at 80% or more alert, naming the key for each_key guardrails');
  assert.match(events.find((event) => event.title.startsWith('Engineering')).body, /^\$1\.10 of \$1\.00 so far today\. Requests it covers are now refused/);
  assert.doesNotMatch(events.find((event) => event.title.startsWith('Batch')).body, /refused/, 'a notify guardrail refuses nothing');
  const [{ result: again }] = await rows(`select public.sweep_spend_guardrail_alerts() as result`);
  assert.equal(again.alerted, 0, 'each alert is sent once a period');

  // 5. A counter counts exactly what a key cost limit counts (private.key_spend_items): charged
  // failures, stepped charges by their movements, an expected bill with no charge, batch and video
  // debits once, and a charge recorded without a key through its request row. Phase D's first pass
  // counted successful request rows only ($14 here).
  const K4 = id(24);
  await db.exec(`
    insert into public.keys (id, workspace_id, created_by, name) values ('${K4}', '${W1}', '${U2}', 'Money');
    insert into public.gateway_requests (request_id, workspace_id, key_id, success, cost_nanos, created_at, billing_request_id, expected_cost_nanos, endpoint) values
      ('m-failed', '${W1}', '${K4}', false, ${usd(2)}, now(), null, null, 'chat.completions'),
      ('m-stepped', '${W1}', '${K4}', true, ${usd(5)}, now(), 'b-stepped', null, 'chat.completions'),
      ('m-unpaid', '${W1}', '${K4}', false, 0, now(), 'b-unpaid', ${usd(4)}, 'chat.completions'),
      ('batch_usage:mb:1', '${W1}', '${K4}', true, ${usd(3)}, now(), null, null, 'batch'),
      ('mv', '${W1}', '${K4}', true, ${usd(6)}, now(), null, null, 'video.generation'),
      ('m-keyless', '${W1}', '${K4}', false, null, now(), 'b-keyless', ${usd(1)}, 'chat.completions');
    insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id) values
      ('${W1}', 'b-stepped', ${usd(2)}, 'applied', true, '${K4}'),
      ('${W1}', 'batch_capture:mb', ${usd(3)}, 'applied', true, '${K4}'),
      ('${W1}', 'b-keyless', ${usd(1)}, 'applied', true, null);
    insert into public.credit_ledger (workspace_id, kind, amount_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status) values
      ('${W1}', 'adjustment', ${-usd(3)}, 'gateway_request_charge', 'b-stepped:1', 'gateway_request', 'b-stepped', 'applied'),
      ('${W1}', 'adjustment', ${usd(1)}, 'gateway_request_charge', 'b-stepped:final', 'gateway_request', 'b-stepped', 'applied'),
      ('${W1}', 'charge', ${-usd(6)}, 'async_job_charge', '${W1}:video_hold:mv', 'async_job', 'mv', 'captured');
    insert into public.gateway_wallet_reservations (workspace_id, reservation_id, key_id, status) values ('${W1}', 'video_hold:mv', '${K4}', 'captured');
  `);
  const counter = async () => Number((await rows(`select usage_nanos::text as used from private.spend_guardrail_usage($1, now())
    where guardrail_id = $2 and counter = $3`, [W1, GEACH, `key:${K4}`]))[0].used);
  const keyLimit = async () => Number((await rows(`select sum(nanos)::text as used from private.key_spend_items($1, date_trunc('month', now() at time zone 'utc') at time zone 'utc', array[$2]::uuid[])`, [W1, K4]))[0].used);
  // $2 (charged failure) + $2 (stepped: -$3 then +$1, not its row's $5) + $4 (expected, no charge)
  // + $3 (batch capture, its rows once) + $6 (video debit, its row once) + $1 (keyless charge).
  assert.equal(await counter(), usd(18), 'the each_key counter counts what key limits count');
  assert.equal(await counter(), await keyLimit(), 'and equals key_spend_items for the same key');
  // The seed's blocking counters leave out a held admission by request id and by billing id.
  await db.exec(`update public.workspace_guardrails set spend_action = 'block' where id = '${GEACH}'`);
  const [{ seed: held }] = await rows(`select public.gateway_spend_limit_seed($1, $2, $3) as seed`, [W1, [K4], ['m-keyless', 'b-keyless']]);
  assert.equal(held.guardrail_budgets.find((entry) => entry.counter === `key:${K4}`).usage_nanos, usd(17));

  console.log('spend-guardrails: ok');
} finally {
  await db.close();
}
