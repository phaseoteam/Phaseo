import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const billing = await read('../migrations/20261021142418_slack_agent_billing.sql');
const migration = await read('../migrations/20261021203814_slack_agent_month_usage.sql');
const declarative = await read('../schemas/public/functions/get_slack_agent_month_usage.sql');
const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-0000000000ff';

try {
  // Minimal pre-existing objects the Slack billing migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    create table public.keys (id uuid primary key, workspace_id uuid not null);
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null, enabled boolean not null default true,
      privacy_enable_paid_may_train boolean not null default true, privacy_enable_free_may_train boolean not null default true,
      privacy_enable_free_may_publish_prompts boolean not null default true, privacy_enable_input_output_logging boolean not null default true);
    create table public.key_guardrails (key_id uuid not null, guardrail_id uuid not null, primary key (key_id, guardrail_id));
    create table public.wallets (workspace_id uuid primary key, balance_nanos bigint not null default 0,
      reserved_nanos bigint not null default 0, updated_at timestamptz not null default now());
    create table public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      event_time timestamptz not null default now(), kind text not null, amount_nanos bigint not null,
      before_balance_nanos bigint not null, after_balance_nanos bigint not null, ref_type text not null,
      ref_id text not null, created_at timestamptz not null default now(), status text, source_ref_type text, source_ref_id text);
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$ begin return NEW; end $$;
    insert into public.workspaces values ('${WORKSPACE}');
  `);
  await db.exec(billing);
  await db.exec(migration);
  assert.ok(migration.includes(declarative), 'the migration matches the declarative definition');

  // Clients never read usage directly.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows(`select * from public.get_slack_agent_month_usage('${OTHER}', '2026-10-01')`), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  const [installation] = await rows(
    `insert into public.slack_installations (workspace_id, team_id, bot_user_id, secrets_ciphertext, monthly_cap_nanos)
     values ($1, 'T0TEAM0001', 'U0BOT0001', 'v1.iv.cipher', 25000000000) returning id`,
    [WORKSPACE],
  );
  const record = (period, people) => rows('select public.record_slack_agent_people($1, $2, $3::jsonb) as changed',
    [installation.id, period, JSON.stringify(people)]);
  await record('2026-10-01', [
    { slack_user_id: 'U0AAA0001', first_answer_at: '2026-10-02T09:00:00Z', answers: 120 },
    { slack_user_id: 'U0AAA0002', first_answer_at: '2026-10-03T09:00:00Z', answers: 400 },
    { slack_user_id: 'W0AAA0003', first_answer_at: '2026-10-04T09:00:00Z', answers: 1 },
  ]);
  await record('2026-09-01', [{ slack_user_id: 'U0AAA0001', first_answer_at: '2026-09-02T09:00:00Z', answers: 9 }]);

  const usage = async (id, period) => {
    const result = await rows('select people, answers from public.get_slack_agent_month_usage($1, $2)', [id, period]);
    assert.equal(result.length, 1, 'always one row');
    return { people: Number(result[0].people), answers: Number(result[0].answers) };
  };
  assert.deepEqual(await usage(installation.id, '2026-10-01'), { people: 3, answers: 521 }, 'counts people and pools answers for the month');
  assert.deepEqual(await usage(installation.id, '2026-09-01'), { people: 1, answers: 9 }, 'other months are separate');
  assert.deepEqual(await usage(installation.id, '2026-11-01'), { people: 0, answers: 0 }, 'a month without answers is zero, not null');
  assert.deepEqual(await usage(OTHER, '2026-10-01'), { people: 0, answers: 0 }, 'another installation sees nothing');

  // A repeated flush with the same running totals changes nothing.
  await record('2026-10-01', [{ slack_user_id: 'U0AAA0002', first_answer_at: '2026-10-03T09:00:00Z', answers: 400 }]);
  assert.deepEqual(await usage(installation.id, '2026-10-01'), { people: 3, answers: 521 });

  console.log('slack-agent-month-usage: all assertions passed');
} finally {
  await db.close();
}
