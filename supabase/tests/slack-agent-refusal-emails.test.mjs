import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const billing = await read('../migrations/20261021203244_slack_agent_billing.sql');
const migration = await read('../migrations/20261022113516_slack_agent_refusal_emails.sql');
const schemaFile = await read('../schemas/public/functions/queue_slack_agent_refusal_email.sql');
const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const OWNER = '40000000-0000-4000-8000-000000000001';
const ADMIN = '40000000-0000-4000-8000-000000000002';
const MEMBER = '40000000-0000-4000-8000-000000000003';
const DELETED_ADMIN = '40000000-0000-4000-8000-000000000004';
const NO_EMAIL_ADMIN = '40000000-0000-4000-8000-000000000005';

try {
  // Minimal pre-existing objects the Slack billing migration and this function use (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, deleted_at timestamptz);
    create table public.workspaces (id uuid primary key, name text not null, owner_user_id uuid not null);
    create type public.workspace_role as enum ('owner', 'admin', 'member');
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, role public.workspace_role not null,
      primary key (workspace_id, user_id));
    create table public.email_outbox (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
      kind text not null, template text not null default 'generic', to_email text not null, subject text, workspace_id uuid,
      user_id uuid, payload jsonb not null default '{}'::jsonb, attempts integer not null default 0, last_error text,
      sent_at timestamptz, dedupe_key text);
    create unique index email_outbox_dedupe_key_unique on public.email_outbox (dedupe_key);
    create table public.keys (id uuid primary key, workspace_id uuid not null, hash text not null,
      status text not null default 'active', soft_blocked boolean not null default false, expires_at timestamptz);
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null, enabled boolean not null default true,
      privacy_enable_paid_may_train boolean not null default true, privacy_enable_free_may_train boolean not null default true,
      privacy_enable_free_may_publish_prompts boolean not null default true, privacy_enable_input_output_logging boolean not null default true);
    create table public.key_guardrails (key_id uuid not null references public.keys(id) on delete cascade,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade, primary key (key_id, guardrail_id));
    create table public.workspace_member_guardrails (workspace_id uuid not null, user_id uuid not null,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade, primary key (workspace_id, user_id, guardrail_id));
    create table public.workspace_audit_events (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      actor_user_id uuid, action text not null, target_type text not null, target_id text not null, target_name text,
      metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
    create table public.wallets (workspace_id uuid primary key, balance_nanos bigint not null default 0,
      reserved_nanos bigint not null default 0, updated_at timestamptz not null default now());
    create table public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      event_time timestamptz not null default now(), kind text not null, amount_nanos bigint not null,
      before_balance_nanos bigint not null, after_balance_nanos bigint not null, ref_type text not null,
      ref_id text not null, created_at timestamptz not null default now(), status text, source_ref_type text, source_ref_id text);
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$ begin return NEW; end $$;
    insert into auth.users values ('${OWNER}', 'owner@example.com', null), ('${ADMIN}', 'admin@example.com', null),
      ('${MEMBER}', 'member@example.com', null), ('${DELETED_ADMIN}', 'gone@example.com', '2026-10-01T00:00:00Z'),
      ('${NO_EMAIL_ADMIN}', null, null);
    insert into public.workspaces values ('${WORKSPACE}', 'Acme', '${OWNER}');
    insert into public.workspace_members values ('${WORKSPACE}', '${OWNER}', 'owner'), ('${WORKSPACE}', '${ADMIN}', 'admin'),
      ('${WORKSPACE}', '${MEMBER}', 'member'), ('${WORKSPACE}', '${DELETED_ADMIN}', 'admin'), ('${WORKSPACE}', '${NO_EMAIL_ADMIN}', 'admin');
  `);
  await db.exec(billing);
  await db.exec(migration);
  assert.ok(migration.includes(schemaFile), 'the migration matches the declarative definition');

  const install = async (teamId, status = 'active') => (await rows(
    `insert into public.slack_installations (workspace_id, team_id, team_name, bot_user_id, secrets_ciphertext, monthly_cap_nanos, plan_people, max_people, status, uninstalled_at)
     values ($1, $2, 'Acme Slack', 'U0BOT0001', 'v1.iv.cipher', 25000000000, 10, 40, $3, case when $3 = 'uninstalled' then now() end) returning id`,
    [WORKSPACE, teamId, status],
  ))[0].id;
  const installationId = await install('T0TEAM0001');

  // Clients can't call it.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select public.queue_slack_agent_refusal_email($1, $2, $3)', [installationId, 'plan_full', 10]), /permission denied/);
    await db.exec('reset role');
  }

  await db.exec('set role service_role');
  const queue = async (id, reason, people) => (await rows('select public.queue_slack_agent_refusal_email($1, $2, $3) as queued', [id, reason, people]))[0].queued;
  for (const reason of ['guest', 'external_user', 'hourly_limit', 'paused', null]) {
    await assert.rejects(queue(installationId, reason, 1), /invalid_reason/, `${reason} is not emailed`);
  }
  assert.equal(await queue('00000000-0000-4000-8000-0000000000ff', 'plan_full', 1), 0, 'an unknown installation queues nothing');

  assert.equal(await queue(installationId, 'plan_full', 10), 2, 'the owner and the admin, once each');
  assert.equal(await queue(installationId, 'plan_full', 11), 0, 'the next refusal this month adds nothing');
  await db.exec('reset role');

  const month = (await rows(`select to_char(now() at time zone 'UTC', 'YYYY-MM') as month`))[0].month;
  const emails = await rows('select kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key from public.email_outbox order by to_email');
  assert.deepEqual(emails.map((email) => email.to_email), ['admin@example.com', 'owner@example.com'], 'members, deleted accounts and accounts without an email get nothing');
  for (const email of emails) {
    assert.equal(email.kind, 'slack_agent_refused');
    assert.equal(email.template, 'slack_agent_refused');
    assert.equal(email.subject, null, 'the gateway renders the subject');
    assert.equal(email.workspace_id, WORKSPACE);
    assert.equal(email.dedupe_key, `slack_agent_refused:${installationId}:plan_full:${month}:${email.user_id}`);
    assert.deepEqual(email.payload, {
      workspace_name: 'Acme',
      team_name: 'Acme Slack',
      reason: 'plan_full',
      people: 10,
      plan_people: 10,
      max_people: 40,
      monthly_cap_usd: 25,
    }, 'no Slack user and no message text');
  }

  // Another reason is its own email.
  await db.exec('set role service_role');
  assert.equal(await queue(installationId, 'monthly_cap', -3), 2);
  await db.exec('reset role');
  const capped = await rows(`select payload from public.email_outbox where payload ->> 'reason' = 'monthly_cap'`);
  assert.equal(capped.length, 2);
  assert.equal(capped[0].payload.people, 0, 'a negative count is clamped');

  // An uninstalled installation emails nobody.
  const gone = await install('T0TEAM0002', 'uninstalled');
  await db.exec('set role service_role');
  assert.equal(await queue(gone, 'payment_due', 1), 0);
  await db.exec('reset role');
  assert.equal((await rows('select count(*)::int as n from public.email_outbox')).at(0).n, 4);

  console.log('slack-agent-refusal-emails: all assertions passed');
} finally {
  await db.close();
}
