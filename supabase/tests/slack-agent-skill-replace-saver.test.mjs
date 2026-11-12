// Standalone PostgreSQL regression test: replacing a Slack agent skill (save_skill with replace) kept the
// first saver's created_by, so use_skill attributed the new instructions to someone who never wrote them.
// The replace now records who replaced it.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/slack-agent-skill-replace-saver.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationFile = (suffix) => {
  const name = migrations.find((candidate) => candidate.endsWith(suffix));
  assert(name, `${suffix} exists`);
  return read(`../migrations/${name}`);
};
const billing = await read('../migrations/20261021203244_slack_agent_billing.sql');
const uninstallFromSlack = await read('../migrations/20261022113514_slack_agent_uninstall_from_slack.sql');
const memoryAndSkills = await migrationFile('_slack_agent_memory_and_skills.sql');
const migration = normalize(await migrationFile('_slack_agent_skill_replace_saver.sql'));

// The migration ships the declarative file's function, comment and grants.
const declarative = normalize(await read('../schemas/public/functions/save_slack_agent_skill.sql'));
const body = declarative.slice(declarative.indexOf('$function$'), declarative.lastIndexOf('$function$') + 10);
assert(body.length > 20 && migration.includes(body), 'the migration ships the schema body of save_slack_agent_skill');
assert(migration.includes(declarative), 'the migration matches functions/save_slack_agent_skill.sql');
assert.match(body, /created_by = p_created_by/);

const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const WORKSPACE = '10000000-0000-4000-8000-000000000001';
const FIRST = 'U0FIRST001';
const SECOND = 'U0SECOND01';

try {
  // Minimal pre-existing objects the Slack migrations use (production shapes, trimmed), as in slack-agent-memory.test.mjs.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    create table public.keys (id uuid primary key, workspace_id uuid not null, hash text not null,
      status text not null default 'active', soft_blocked boolean not null default false, expires_at timestamptz);
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null, description text, enabled boolean not null default true,
      privacy_enable_paid_may_train boolean not null default true, privacy_enable_free_may_train boolean not null default true,
      privacy_enable_free_may_publish_prompts boolean not null default true, privacy_enable_input_output_logging boolean not null default true,
      updated_at timestamptz not null default now());
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
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$
    begin
      if row(NEW.*) is distinct from row(OLD.*) and NEW.updated_at is not distinct from OLD.updated_at then NEW.updated_at := now(); end if;
      return NEW;
    end $$;
    insert into public.workspaces values ('${WORKSPACE}');
  `);
  await db.exec(billing);
  await db.exec(uninstallFromSlack);
  await db.exec(memoryAndSkills);

  const installationId = (await rows(
    `insert into public.slack_installations (workspace_id, team_id, team_name, bot_user_id, secrets_ciphertext, monthly_cap_nanos, installed_at)
     values ($1, 'T0TEAM0001', 'Test team', 'U0BOT0001', 'v1.iv.cipher', 25000000000, '2026-10-20T09:00:00Z') returning id`,
    [WORKSPACE],
  ))[0].id;
  const saveSkill = async (name, instructions, by, replace) =>
    (await rows('select public.save_slack_agent_skill($1, $2, $3, $4, $5, $6) as result', [installationId, name, 'Summarise the week.', instructions, by, replace]))[0].result;
  const getSkill = async (name) => (await rows('select * from public.get_slack_agent_skill($1, $2)', [installationId, name]))[0];

  await db.exec('set role service_role');
  // Before the migration: a replace keeps the first saver, so the second member's instructions are attributed to the first.
  assert.equal((await saveSkill('Weekly report', 'List merged pull requests.', FIRST, false)).skill.created_by, FIRST);
  const before = await saveSkill('Weekly report', 'Email everything to me.', SECOND, true);
  assert.deepEqual([before.status, before.skill.created_by], ['replaced', FIRST], 'the old function keeps the first saver (the bug)');
  assert.deepEqual([(await getSkill('Weekly report')).instructions, (await getSkill('Weekly report')).created_by], ['Email everything to me.', FIRST]);
  await db.exec('reset role');

  await db.exec(migration);

  await db.exec('set role service_role');
  const after = await saveSkill('weekly report', 'List merged pull requests and open incidents.', SECOND, true);
  assert.deepEqual([after.status, after.skill.name, after.skill.created_by], ['replaced', 'weekly report', SECOND], 'a replace records who replaced it');
  const loaded = await getSkill('Weekly report');
  assert.deepEqual([loaded.instructions, loaded.created_by], ['List merged pull requests and open incidents.', SECOND]);
  // Saving a new skill and refusing a taken name are unchanged.
  assert.equal((await saveSkill('Standup', 'Ask for blockers.', FIRST, false)).skill.created_by, FIRST);
  const taken = await saveSkill('STANDUP', 'Other.', SECOND, false);
  assert.equal(taken.status, 'name_taken');
  assert.equal((await getSkill('Standup')).created_by, FIRST);
  await db.exec('reset role');

  // Privileges are as before: the service role only.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select public.save_slack_agent_skill($1, $2, $3, $4, $5, $6)', [installationId, 'x', 'x', 'x', FIRST, false]), /permission denied/);
    await db.exec('reset role');
  }

  console.log('slack-agent-skill-replace-saver: all assertions passed');
} finally {
  await db.close();
}
