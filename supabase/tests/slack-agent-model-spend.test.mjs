import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const billing = await read('../migrations/20261021203244_slack_agent_billing.sql');
const migration = await read('../migrations/20261026210511_slack_agent_model_spend.sql');
const declarative = await read('../schemas/public/functions/get_slack_agent_model_spend.sql');
const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const OLD_KEY = '30000000-0000-4000-8000-000000000001';
const LIVE_KEY = '30000000-0000-4000-8000-000000000002';
const API_KEY = '30000000-0000-4000-8000-000000000003';
const OTHER_KEY = '30000000-0000-4000-8000-000000000004';
const OLD_INSTALLATION = '40000000-0000-4000-8000-000000000001';
const LIVE_INSTALLATION = '40000000-0000-4000-8000-000000000002';
const OTHER_INSTALLATION = '40000000-0000-4000-8000-000000000003';

const spend = (periods, workspace = WORKSPACE) => rows(
  `select installation_id, period_start::text as period, requests::int as requests, cost_nanos::bigint::text as cost
   from public.get_slack_agent_model_spend($1, $2::date[])`,
  [workspace, periods],
);

try {
  // Minimal pre-existing objects the Slack billing migration and the function depend on (production shapes, trimmed).
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
    create table public.v2_private_usage_15m (
      workspace_id uuid not null, bucket_start timestamptz not null, model_id text, key_id uuid,
      requests bigint not null default 0, cost_nanos numeric(30,0) not null default 0
    );
    create unique index v2_private_usage_15m_key on public.v2_private_usage_15m (workspace_id, bucket_start, model_id, key_id) nulls not distinct;
    grant select on public.v2_private_usage_15m to service_role;
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$ begin return NEW; end $$;
    insert into public.workspaces values ('${WORKSPACE}'), ('${OTHER}');
    insert into public.keys values ('${OLD_KEY}', '${WORKSPACE}'), ('${LIVE_KEY}', '${WORKSPACE}'),
      ('${API_KEY}', '${WORKSPACE}'), ('${OTHER_KEY}', '${OTHER}');
  `);
  await db.exec(billing);
  await db.exec(migration);
  assert.ok(migration.includes(declarative), 'the migration matches the declarative definition');

  // Clients never read spend directly: the account route checks for an owner or admin first.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(spend(['2026-10-01']), /permission denied/);
    await db.exec('reset role');
  }

  // An uninstalled installation (its key deleted but still referenced), the live one, and another workspace's.
  const install = (id, workspace, keyId, team, uninstalled) => rows(
    `insert into public.slack_installations (id, workspace_id, team_id, bot_user_id, secrets_ciphertext, monthly_cap_nanos, key_id, status, uninstalled_at)
     values ($1, $2, $3, 'U0BOT0001', 'v1.iv.cipher', 25000000000, $4, $5, $6)`,
    [id, workspace, team, keyId, uninstalled ? 'uninstalled' : 'active', uninstalled ? '2026-09-20T00:00:00Z' : null],
  );
  await install(OLD_INSTALLATION, WORKSPACE, OLD_KEY, 'T0TEAM0001', true);
  await install(LIVE_INSTALLATION, WORKSPACE, LIVE_KEY, 'T0TEAM0002', false);
  await install(OTHER_INSTALLATION, OTHER, OTHER_KEY, 'T0TEAM0003', false);

  await db.exec(`
    insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, key_id, requests, cost_nanos) values
      ('${WORKSPACE}', '2026-09-03 10:00:00+00', 'model-a', '${OLD_KEY}', 4, 1200000000),
      ('${WORKSPACE}', '2026-09-03 10:00:00+00', 'model-b', '${OLD_KEY}', 1, 300000000),
      ('${WORKSPACE}', '2026-09-30 23:45:00+00', 'model-a', '${OLD_KEY}', 2, 500000000),
      ('${WORKSPACE}', '2026-09-25 09:00:00+00', 'model-a', '${LIVE_KEY}', 3, 900000000),
      ('${WORKSPACE}', '2026-10-01 00:00:00+00', 'model-a', '${LIVE_KEY}', 10, 2000000000),
      ('${WORKSPACE}', '2026-10-14 12:15:00+00', 'model-b', '${LIVE_KEY}', 30, 9876543210),
      ('${WORKSPACE}', '2026-10-31 23:45:00+00', 'model-a', '${LIVE_KEY}', 1, 1),
      ('${WORKSPACE}', '2026-11-01 00:00:00+00', 'model-a', '${LIVE_KEY}', 7, 700000000),
      ('${WORKSPACE}', '2026-10-14 12:15:00+00', 'model-a', '${API_KEY}', 500, 99000000000),
      ('${WORKSPACE}', '2026-10-14 12:15:00+00', 'model-a', null, 50, 5000000000),
      ('${OTHER}', '2026-10-14 12:15:00+00', 'model-a', '${OTHER_KEY}', 8, 800000000),
      ('${OTHER}', '2026-10-14 12:15:00+00', 'model-a', '${LIVE_KEY}', 9, 900000000);
  `);
  await db.exec('set role service_role');
  // Months are UTC whatever the session time zone is.
  await db.exec(`set timezone to 'America/Los_Angeles'`);

  // Only the Slack keys' own requests count, in their workspace, per installation and month, newest first.
  assert.deepEqual(await spend(['2026-10-01', '2026-09-01']), [
    { installation_id: LIVE_INSTALLATION, period: '2026-10-01', requests: 41, cost: '11876543211' },
    { installation_id: OLD_INSTALLATION, period: '2026-09-01', requests: 7, cost: '2000000000' },
    { installation_id: LIVE_INSTALLATION, period: '2026-09-01', requests: 3, cost: '900000000' },
  ]);
  // A repeated month counts once; a month without spend has no row; months not asked for are left out.
  assert.deepEqual(await spend(['2026-10-01', '2026-10-01', '2026-08-01']), [
    { installation_id: LIVE_INSTALLATION, period: '2026-10-01', requests: 41, cost: '11876543211' },
  ]);
  assert.deepEqual(await spend(['2026-11-01']), [
    { installation_id: LIVE_INSTALLATION, period: '2026-11-01', requests: 7, cost: '700000000' },
  ]);
  assert.deepEqual(await spend([]), [], 'no months, no rows');
  assert.deepEqual(await spend(['2026-10-01'], OTHER), [
    { installation_id: OTHER_INSTALLATION, period: '2026-10-01', requests: 8, cost: '800000000' },
  ], 'another workspace sees only its own installation');

  // An installation whose key row is gone (key_id set to null) has nothing to attribute.
  await db.exec('reset role');
  await db.exec(`update public.slack_installations set key_id = null where id = '${OLD_INSTALLATION}'`);
  await db.exec('set role service_role');
  assert.deepEqual((await spend(['2026-09-01'])).map((row) => row.installation_id), [LIVE_INSTALLATION]);

  // Bad input is refused, not guessed at.
  await assert.rejects(spend(['2026-10-02']), /invalid_periods/, 'periods are first days of months');
  await assert.rejects(spend([null]), /invalid_periods/);
  await assert.rejects(spend(null), /invalid_periods/);
  await assert.rejects(rows(`select * from public.get_slack_agent_model_spend(null, array['2026-10-01']::date[])`), /invalid_periods/);
  const thirteen = Array.from({ length: 13 }, (_, index) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`);
  await assert.rejects(spend(thirteen), /too_many_periods/);
  assert.equal((await spend(thirteen.slice(0, 12))).length, 0, 'twelve months are allowed');

  console.log('slack-agent-model-spend: all assertions passed');
} finally {
  await db.close();
}
