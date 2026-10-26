import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const billing = await read('../migrations/20261021203244_slack_agent_billing.sql');
const migration = await read('../migrations/20261026210632_slack_agent_internal_installations.sql');
const schemaFile = await read('../schemas/public/functions/list_slack_agent_installations.sql');
const ACME = '10000000-0000-4000-8000-000000000001';
const GLOBEX = '10000000-0000-4000-8000-000000000002';
const INITECH = '10000000-0000-4000-8000-000000000003';
const OWNER = '40000000-0000-4000-8000-000000000001';
const ACME_KEY = '30000000-0000-4000-8000-000000000001';
const GLOBEX_KEY = '30000000-0000-4000-8000-000000000002';
const OLD_ACME_KEY = '30000000-0000-4000-8000-000000000003';
const OTHER_KEY = '30000000-0000-4000-8000-000000000004';

const list = (period, limit, offset) => rows(
  `select installation_id, workspace_id, workspace_name, team_name, custom_app, slack_app_id, status,
     uninstalled_at is not null as has_uninstalled_at, plan_people, monthly_cap_nanos::text as cap,
     people, answers::int as answers, model_requests::int as requests, model_cost_nanos::text as cost, total::int as total
   from public.list_slack_agent_installations($1, $2, $3)`,
  [period, limit ?? null, offset ?? null],
);

try {
  // Minimal pre-existing objects the Slack billing migration and this function use (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create table public.workspaces (id uuid primary key, name text not null, owner_user_id uuid not null);
    create table public.keys (id uuid primary key, workspace_id uuid not null, hash text not null,
      status text not null default 'active', soft_blocked boolean not null default false, expires_at timestamptz);
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null);
    create table public.key_guardrails (key_id uuid not null, guardrail_id uuid not null, primary key (key_id, guardrail_id));
    create table public.workspace_member_guardrails (workspace_id uuid not null, user_id uuid not null, guardrail_id uuid not null);
    create table public.workspace_audit_events (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      actor_user_id uuid, action text not null, target_type text not null, target_id text not null, target_name text,
      metadata jsonb not null default '{}'::jsonb);
    create table public.wallets (workspace_id uuid primary key, balance_nanos bigint not null default 0,
      reserved_nanos bigint not null default 0, updated_at timestamptz not null default now());
    create table public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      kind text not null, amount_nanos bigint not null, before_balance_nanos bigint not null, after_balance_nanos bigint not null,
      ref_type text not null, ref_id text not null, status text, source_ref_type text, source_ref_id text);
    create table public.v2_private_usage_15m (workspace_id uuid not null, bucket_start timestamptz not null, key_id uuid,
      requests bigint not null default 0, cost_nanos numeric(30,0) not null default 0);
    grant select on public.v2_private_usage_15m to service_role;
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$ begin return NEW; end $$;
    insert into auth.users values ('${OWNER}', 'owner@example.com');
    insert into public.workspaces values ('${ACME}', 'Acme', '${OWNER}'), ('${GLOBEX}', 'Globex', '${OWNER}'),
      ('${INITECH}', 'Initech', '${OWNER}');
    insert into public.keys (id, workspace_id, hash) values ('${ACME_KEY}', '${ACME}', 'h1'), ('${GLOBEX_KEY}', '${GLOBEX}', 'h2'),
      ('${OLD_ACME_KEY}', '${ACME}', 'h3'), ('${OTHER_KEY}', '${ACME}', 'h4');
  `);
  await db.exec(billing);
  await db.exec(migration);
  assert.ok(migration.includes(schemaFile), 'the migration matches the declarative definition');

  const app = (await rows(
    `insert into public.slack_apps (workspace_id, slack_app_id, client_id, secrets_ciphertext)
     values ($1, 'A0COMPANY01', '123.456', 'v1.iv.cipher') returning id`, [GLOBEX],
  ))[0].id;
  const install = async ({ workspace, team, key, appId = null, status = 'active', installedAt }) => (await rows(
    `insert into public.slack_installations (workspace_id, slack_app_id, team_id, team_name, bot_user_id, secrets_ciphertext,
       key_id, monthly_cap_nanos, plan_people, status, installed_at, uninstalled_at)
     values ($1, $2, $3, $4, 'U0BOT0001', 'v1.iv.cipher', $5, 25000000000, 10, $6, $7,
       case when $6 = 'uninstalled' then $7::timestamptz + interval '1 day' end) returning id`,
    [workspace, appId, team, `${team} Slack`, key, status, installedAt],
  ))[0].id;
  // Acme installed, uninstalled and reinstalled; Globex uses its own app; Initech has no key.
  const oldAcme = await install({ workspace: ACME, team: 'T0ACME0001', key: OLD_ACME_KEY, status: 'uninstalled', installedAt: '2026-09-20T10:00:00Z' });
  const acme = await install({ workspace: ACME, team: 'T0ACME0001', key: ACME_KEY, installedAt: '2026-10-05T10:00:00Z' });
  const globex = await install({ workspace: GLOBEX, team: 'T0GLOBEX01', key: GLOBEX_KEY, appId: app, status: 'payment_due', installedAt: '2026-10-10T10:00:00Z' });
  const initech = await install({ workspace: INITECH, team: 'T0INITECH1', key: null, status: 'paused', installedAt: '2026-10-12T10:00:00Z' });

  await db.exec(`
    insert into public.slack_agent_monthly_people (installation_id, period_start, slack_user_id, first_answer_at, answers) values
      ('${acme}', '2026-10-01', 'U0PERSON01', '2026-10-06T00:00:00Z', 120),
      ('${acme}', '2026-10-01', 'U0PERSON02', '2026-10-06T00:00:00Z', 30),
      ('${acme}', '2026-09-01', 'U0PERSON01', '2026-09-21T00:00:00Z', 999),
      ('${oldAcme}', '2026-10-01', 'U0PERSON03', '2026-10-01T00:00:00Z', 4),
      ('${globex}', '2026-10-01', 'U0PERSON04', '2026-10-11T00:00:00Z', 7);
    insert into public.v2_private_usage_15m (workspace_id, bucket_start, key_id, requests, cost_nanos) values
      -- In October through Acme's current key, at both edges of the month.
      ('${ACME}', '2026-10-01T00:00:00Z', '${ACME_KEY}', 2, 1000000),
      ('${ACME}', '2026-10-31T23:45:00Z', '${ACME_KEY}', 3, 2500000),
      -- Outside October, another key in the same workspace, usage without a key, and the key in another workspace.
      ('${ACME}', '2026-09-30T23:45:00Z', '${ACME_KEY}', 50, 99000000),
      ('${ACME}', '2026-11-01T00:00:00Z', '${ACME_KEY}', 50, 99000000),
      ('${ACME}', '2026-10-15T00:00:00Z', '${OTHER_KEY}', 50, 99000000),
      ('${ACME}', '2026-10-15T00:00:00Z', null, 50, 99000000),
      ('${GLOBEX}', '2026-10-15T00:00:00Z', '${ACME_KEY}', 50, 99000000),
      -- The uninstalled installation's key still counts for the days before it was removed.
      ('${ACME}', '2026-10-01T06:00:00Z', '${OLD_ACME_KEY}', 1, 400000),
      ('${GLOBEX}', '2026-10-20T12:00:00Z', '${GLOBEX_KEY}', 9, 12345678901);
  `);

  // Customers can't call it, signed in or not.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(list('2026-10-01'), /permission denied/, `${role} is refused`);
    await db.exec('reset role');
  }
  assert.ok((await rows(`select has_function_privilege('public', 'public.list_slack_agent_installations(date, integer, integer)', 'execute') as allowed`))[0].allowed === false,
    'PUBLIC has no execute grant');

  await db.exec('set role service_role');
  await assert.rejects(list('2026-10-02'), /invalid_period_start/);
  await assert.rejects(list(null), /invalid_period_start/);

  const october = await list('2026-10-01');
  assert.deepEqual(october.map((row) => row.installation_id), [initech, globex, acme, oldAcme], 'newest first');
  assert.deepEqual(october.find((row) => row.installation_id === acme), {
    installation_id: acme, workspace_id: ACME, workspace_name: 'Acme', team_name: 'T0ACME0001 Slack', custom_app: false, slack_app_id: null,
    status: 'active', has_uninstalled_at: false, plan_people: 10, cap: '25000000000',
    people: 2, answers: 150, requests: 5, cost: '3500000', total: 4,
  }, 'October people, pooled answers and spend through its own key only');
  assert.deepEqual(october.find((row) => row.installation_id === oldAcme), {
    installation_id: oldAcme, workspace_id: ACME, workspace_name: 'Acme', team_name: 'T0ACME0001 Slack', custom_app: false, slack_app_id: null,
    status: 'uninstalled', has_uninstalled_at: true, plan_people: 10, cap: '25000000000',
    people: 1, answers: 4, requests: 1, cost: '400000', total: 4,
  }, 'an uninstalled installation keeps its month');
  assert.deepEqual(october.find((row) => row.installation_id === globex), {
    installation_id: globex, workspace_id: GLOBEX, workspace_name: 'Globex', team_name: 'T0GLOBEX01 Slack', custom_app: true, slack_app_id: 'A0COMPANY01',
    status: 'payment_due', has_uninstalled_at: false, plan_people: 10, cap: '25000000000',
    people: 1, answers: 7, requests: 9, cost: '12345678901', total: 4,
  }, 'a company app shows its Slack app id; spend beyond 32 bits is exact');
  assert.deepEqual(october.find((row) => row.installation_id === initech), {
    installation_id: initech, workspace_id: INITECH, workspace_name: 'Initech', team_name: 'T0INITECH1 Slack', custom_app: false, slack_app_id: null,
    status: 'paused', has_uninstalled_at: false, plan_people: 10, cap: '25000000000',
    people: 0, answers: 0, requests: 0, cost: '0', total: 4,
  }, 'no people and no key is all zeros');

  // Another month counts only that month.
  const september = await list('2026-09-01');
  assert.deepEqual(september.find((row) => row.installation_id === acme), {
    ...october.find((row) => row.installation_id === acme), people: 1, answers: 999, requests: 50, cost: '99000000',
  });

  // Paging: total always counts every installation; the limit is clamped to 1..200.
  const firstPage = await list('2026-10-01', 2, 0);
  assert.deepEqual(firstPage.map((row) => [row.installation_id, row.total]), [[initech, 4], [globex, 4]]);
  const secondPage = await list('2026-10-01', 2, 2);
  assert.deepEqual(secondPage.map((row) => row.installation_id), [acme, oldAcme]);
  assert.equal((await list('2026-10-01', 0, 0)).length, 1, 'a zero limit still returns one row');
  assert.equal((await list('2026-10-01', 5000, -10)).length, 4, 'a negative offset starts at the beginning');
  assert.deepEqual(await list('2026-10-01', 10, 10), [], 'past the end is empty');
  await db.exec('reset role');

  console.log('slack-agent-internal-installations: all assertions passed');
} finally {
  await db.close();
}
