import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const billing = await read('../migrations/20261021203244_slack_agent_billing.sql');
const migration = await read('../migrations/20261022113514_slack_agent_uninstall_from_slack.sql');
const schemaFile = await read('../schemas/public/functions/uninstall_slack_agent_from_slack.sql');
const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const SHARED_WORKSPACE = '10000000-0000-4000-8000-000000000002';
const KEY = '20000000-0000-4000-8000-000000000001';
const SHARED_KEY = '20000000-0000-4000-8000-000000000002';
const OTHER_KEY = '20000000-0000-4000-8000-000000000003';
const GUARDRAIL = '30000000-0000-4000-8000-000000000001';
const SHARED_GUARDRAIL = '30000000-0000-4000-8000-000000000002';
const INSTALLED_AT = '2026-10-20T09:00:00Z';

try {
  // Minimal pre-existing objects the Slack billing migration and this function use (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
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
    insert into public.workspaces values ('${WORKSPACE}'), ('${SHARED_WORKSPACE}');
    insert into public.keys (id, workspace_id, hash) values ('${KEY}', '${WORKSPACE}', 'hash-1'),
      ('${SHARED_KEY}', '${SHARED_WORKSPACE}', 'hash-2'), ('${OTHER_KEY}', '${SHARED_WORKSPACE}', 'hash-3');
    insert into public.workspace_guardrails (id, workspace_id, privacy_enable_paid_may_train, privacy_enable_free_may_train,
      privacy_enable_free_may_publish_prompts, privacy_enable_input_output_logging)
      values ('${GUARDRAIL}', '${WORKSPACE}', false, false, false, false), ('${SHARED_GUARDRAIL}', '${SHARED_WORKSPACE}', false, false, false, false);
    insert into public.key_guardrails values ('${KEY}', '${GUARDRAIL}'), ('${SHARED_KEY}', '${SHARED_GUARDRAIL}'), ('${OTHER_KEY}', '${SHARED_GUARDRAIL}');
  `);
  await db.exec(billing);
  await db.exec(migration);
  assert.ok(migration.includes(schemaFile), 'the migration matches the declarative definition');

  const install = async (workspaceId, teamId, keyId, guardrailId) => (await rows(
    `insert into public.slack_installations (workspace_id, team_id, team_name, bot_user_id, secrets_ciphertext, monthly_cap_nanos, key_id, guardrail_id, installed_at)
     values ($1, $2, 'Test team', 'U0BOT0001', 'v1.iv.cipher', 25000000000, $3, $4, $5) returning id`,
    [workspaceId, teamId, keyId, guardrailId, INSTALLED_AT],
  ))[0].id;
  const installationId = await install(WORKSPACE, 'T0TEAM0001', KEY, GUARDRAIL);
  const sharedId = await install(SHARED_WORKSPACE, 'T0TEAM0002', SHARED_KEY, SHARED_GUARDRAIL);

  // Clients can't call it.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select public.uninstall_slack_agent_from_slack($1, $2, $3)', [installationId, 'app_uninstalled', '2026-10-21T10:00:00Z']), /permission denied/);
    await db.exec('reset role');
  }

  // While the installation is live, its guardrail can't be detached directly.
  await assert.rejects(rows('delete from public.key_guardrails where key_id = $1', [KEY]), /slack_agent_guardrail_protected/);

  await db.exec('set role service_role');
  const uninstall = async (id, event, at) => (await rows('select public.uninstall_slack_agent_from_slack($1, $2, $3) as removed', [id, event, at]))[0].removed;
  await assert.rejects(uninstall(installationId, 'app_home_opened', '2026-10-21T10:00:00Z'), /invalid_event/);
  assert.equal(await uninstall(installationId, 'app_uninstalled', '2026-10-19T10:00:00Z'), false, 'an event from before the install changes nothing');
  assert.equal(await uninstall('00000000-0000-4000-8000-0000000000ff', 'app_uninstalled', '2026-10-21T10:00:00Z'), false, 'an unknown installation changes nothing');
  await db.exec('reset role');
  assert.equal((await rows('select status from public.slack_installations where id = $1', [installationId]))[0].status, 'active');

  await db.exec('set role service_role');
  assert.equal(await uninstall(installationId, 'app_uninstalled', '2026-10-21T10:00:00Z'), true);
  // Slack retries events: the second delivery finds nothing to do.
  assert.equal(await uninstall(installationId, 'app_uninstalled', '2026-10-21T10:00:00Z'), false);
  assert.equal(await uninstall(installationId, 'tokens_revoked', '2026-10-21T10:00:01Z'), false);
  await db.exec('reset role');

  const [key] = await rows('select status, soft_blocked, hash, expires_at from public.keys where id = $1', [KEY]);
  assert.equal(key.status, 'deleted');
  assert.equal(key.soft_blocked, true);
  assert.equal(key.hash, `deleted:${KEY}`, 'the key can never authenticate again');
  assert.ok(key.expires_at instanceof Date);
  const [installation] = await rows('select status, uninstalled_at, guardrail_id, key_id from public.slack_installations where id = $1', [installationId]);
  assert.equal(installation.status, 'uninstalled');
  assert.ok(installation.uninstalled_at instanceof Date);
  assert.equal(installation.key_id, KEY, 'the row keeps its key for billing history');
  assert.equal(installation.guardrail_id, null, 'the guardrail is gone');
  assert.equal((await rows('select count(*)::int as n from public.workspace_guardrails where id = $1', [GUARDRAIL]))[0].n, 0);
  assert.equal((await rows('select count(*)::int as n from public.key_guardrails where key_id = $1', [KEY]))[0].n, 0);
  const audit = await rows('select workspace_id, actor_user_id, action, target_type, target_id, target_name, metadata from public.workspace_audit_events');
  assert.deepEqual(audit, [{
    workspace_id: WORKSPACE,
    actor_user_id: null,
    action: 'slack_agent.uninstalled_in_slack',
    target_type: 'slack_installation',
    target_id: installationId,
    target_name: 'Test team',
    metadata: { event: 'app_uninstalled', team_id: 'T0TEAM0001', enterprise_id: null },
  }], 'one audit row, however often Slack retries');

  // A guardrail an admin also gave to another key stays; only the agent's key lets go of it.
  await db.exec('set role service_role');
  assert.equal(await uninstall(sharedId, 'tokens_revoked', '2026-10-21T11:00:00Z'), true);
  await db.exec('reset role');
  assert.equal((await rows('select count(*)::int as n from public.workspace_guardrails where id = $1', [SHARED_GUARDRAIL]))[0].n, 1);
  assert.deepEqual((await rows('select key_id from public.key_guardrails where guardrail_id = $1', [SHARED_GUARDRAIL])).map((row) => row.key_id), [OTHER_KEY]);
  assert.equal((await rows('select status from public.keys where id = $1', [OTHER_KEY]))[0].status, 'active');
  assert.equal((await rows('select count(*)::int as n from public.workspace_audit_events')).at(0).n, 2);

  console.log('slack-agent-uninstall-from-slack: all assertions passed');
} finally {
  await db.close();
}
