import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`;
const ws = (n) => id('1', n);
const user = (n) => id('2', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migration = await readFile(new URL('../migrations/20261021203244_slack_agent_billing.sql', import.meta.url), 'utf8');
// Allows providers that keep logs: replaces protect_slack_agent_guardrail and updates live guardrails.
const guardrailMigration = await readFile(new URL('../migrations/20261026223103_slack_agent_guardrail_allows_logging_providers.sql', import.meta.url), 'utf8');
// Adds per-message model choice to slack_installations: two columns, a check and their comments.
const modelChoiceMigration = await readFile(new URL('../migrations/20261027131100_slack_agent_model_choice.sql', import.meta.url), 'utf8');
const MODEL_CHOICE_LINES = /^ {2}"(?:model_choice_enabled|allowed_models)" .*\n|^ {2}CONSTRAINT "slack_installations_allowed_models_check" .*\n|^COMMENT ON COLUMN "public"\."slack_installations"\."(?:model_choice_enabled|allowed_models)" .*\n\n/gm;
// The memory migration adds the memory switch to slack_installations: a column and its comment.
const memoryMigrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_slack_agent_memory_and_skills.sql'));
const memoryMigration = await readFile(new URL(`../migrations/${memoryMigrationName}`, import.meta.url), 'utf8');
const MEMORY_LINES = /^ {2}"memory_enabled" .*\n|^COMMENT ON COLUMN "public"\."slack_installations"\."memory_enabled" .*\n\n/gm;
// Records the bot scopes Slack granted: one column, a check and its comment.
const botScopesMigrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_slack_agent_bot_scopes.sql'));
const botScopesMigration = await readFile(new URL(`../migrations/${botScopesMigrationName}`, import.meta.url), 'utf8');
const BOT_SCOPES_LINES = /^ {2}"bot_scopes" .*\n|^ {2}CONSTRAINT "slack_installations_bot_scopes_check" .*\n|^COMMENT ON COLUMN "public"\."slack_installations"\."bot_scopes" .*\n\n/gm;
const words = (text) => text.trim().replace(/[,;]$/, '').replace(/\s+/g, ' ');
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const TABLES = ['slack_apps', 'slack_installations', 'slack_user_links', 'slack_agent_monthly_people', 'slack_agent_charges'];
const FUNCTIONS = ['record_slack_agent_people', 'list_slack_agent_due_charges', 'charge_slack_agent_month'];
const OLD_GUARDRAIL_DESCRIPTION = "Managed by the Slack agent. Slack's API terms do not allow training on Slack data or keeping it, so training, prompt publishing and providers that log prompts are off.";
const GUARDRAIL_DESCRIPTION = "Managed by the Slack agent. Slack's API terms do not allow training on Slack data, so training and prompt publishing are off.";
const DOLLAR = 1_000_000_000n;

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    create table public.keys (id uuid primary key, workspace_id uuid not null);
    create table public.workspace_guardrails (
      id uuid primary key, workspace_id uuid not null, name text not null default 'Guardrail', description text, enabled boolean not null default true,
      privacy_enable_paid_may_train boolean not null default true, privacy_enable_free_may_train boolean not null default true,
      privacy_enable_free_may_publish_prompts boolean not null default true, privacy_enable_input_output_logging boolean not null default true,
      updated_at timestamptz not null default now()
    );
    create table public.key_guardrails (
      key_id uuid not null references public.keys(id) on delete cascade,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade,
      primary key (key_id, guardrail_id)
    );
    grant select, insert, update, delete on public.keys, public.workspace_guardrails, public.key_guardrails to service_role;
    create table public.wallets (
      workspace_id uuid primary key, balance_nanos bigint not null default 0,
      reserved_nanos bigint not null default 0, updated_at timestamptz not null default now()
    );
    create table public.credit_ledger (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      event_time timestamptz not null default now(), kind text not null, amount_nanos bigint not null,
      before_balance_nanos bigint not null, after_balance_nanos bigint not null,
      ref_type text not null, ref_id text not null, created_at timestamptz not null default now(),
      status text, source_ref_type text, source_ref_id text
    );
    create unique index credit_ledger_ref_type_ref_id_key on public.credit_ledger (ref_type, ref_id);
    grant select, insert, update on public.wallets to service_role;
    grant select on public.credit_ledger to service_role;
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$
    begin
      if row(NEW.*) is distinct from row(OLD.*) and NEW.updated_at is not distinct from OLD.updated_at then
        NEW.updated_at := now();
      end if;
      return NEW;
    end $$;
    insert into auth.users values ('${user(1)}');
    insert into public.workspaces values ('${ws(1)}'), ('${ws(2)}'), ('${ws(3)}');
    insert into public.wallets (workspace_id, balance_nanos) values ('${ws(1)}', 500000000), ('${ws(2)}', 100000000000);
  `);
  await db.exec(migration);
  await db.exec(modelChoiceMigration);
  await db.exec(botScopesMigration);

  // The memory migration added the trigger that deletes the agent's memory on uninstall (slack-agent-memory.test.mjs).
  const MEMORY_TRIGGER = /\nCREATE TRIGGER slack_installations_delete_agent_memory\n[\s\S]*?;\n/;
  for (const table of TABLES) {
    let definition = (await schema(`public/tables/${table}.sql`)).replace(MEMORY_TRIGGER, '');
    if (table === 'slack_installations') {
      // The first migration's table, plus what the model choice migration added to it.
      const added = definition.match(MODEL_CHOICE_LINES) ?? [];
      assert.equal(added.length, 5, 'slack_installations declares the model choice columns, check and comments');
      for (const line of added) assert.ok(words(modelChoiceMigration).includes(words(line)), `the model choice migration adds ${words(line).slice(0, 60)}`);
      definition = definition.replace(MODEL_CHOICE_LINES, '');
      // And what the memory migration added.
      const memoryLines = definition.match(MEMORY_LINES) ?? [];
      assert.equal(memoryLines.length, 2, 'slack_installations declares the memory switch and its comment');
      for (const line of memoryLines) assert.ok(words(memoryMigration).includes(words(line)), `the memory migration adds ${words(line).slice(0, 60)}`);
      definition = definition.replace(MEMORY_LINES, '');
      // And what the bot scopes migration added.
      const scopes = definition.match(BOT_SCOPES_LINES) ?? [];
      assert.equal(scopes.length, 3, 'slack_installations declares the bot scopes column, check and comment');
      for (const line of scopes) assert.ok(words(botScopesMigration).includes(words(line)), `the bot scopes migration adds ${words(line).slice(0, 60)}`);
      definition = definition.replace(BOT_SCOPES_LINES, '');
    }
    assert.ok(migration.includes(definition), `${table} migration matches the declarative definition`);
  }
  for (const fn of FUNCTIONS) {
    assert.ok(migration.includes(await schema(`public/functions/${fn}.sql`)), `${fn} migration matches the declarative definition`);
  }
  assert.ok(guardrailMigration.includes(await schema('public/functions/protect_slack_agent_guardrail.sql')), 'protect_slack_agent_guardrail migration matches the declarative definition');
  for (const table of ['workspace_guardrails', 'key_guardrails']) {
    const trigger = (await schema(`public/tables/${table}.sql`)).match(/CREATE TRIGGER protect_slack_agent_guardrail\n[\s\S]*?;/)?.[0];
    assert.ok(trigger && migration.includes(trigger), `${table} guardrail trigger matches the declarative definition`);
  }

  // Clients never read Slack credentials, links, usage or charges directly.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of TABLES) {
      await assert.rejects(rows(`select * from public.${table}`), /permission denied/, `${role} cannot read ${table}`);
    }
    await assert.rejects(rows(`select public.list_slack_agent_due_charges('2026-10-01')`), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  const install = (workspace, team, extra = {}) => {
    const columns = { workspace_id: workspace, team_id: team, bot_user_id: 'U0BOT0001', secrets_ciphertext: 'v1.cipher', monthly_cap_nanos: String(25n * DOLLAR), ...extra };
    const names = Object.keys(columns);
    return rows(
      `insert into public.slack_installations (${names.join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      Object.values(columns),
    );
  };

  // Defaults match the settings the user chose: refuse new people over the plan, 60 answers per person an hour.
  const [first] = await install(ws(1), 'T0TEAM0001');
  assert.equal(first.status, 'active');
  assert.equal(first.over_plan, 'refuse');
  assert.equal(first.plan_people, 3);
  assert.equal(first.max_people, null);
  assert.equal(first.answers_per_person_hour, 60);
  assert.equal(first.access_mode, 'everyone');
  assert.equal(first.usage_data_mode, 'dm');
  assert.equal(first.model, 'phaseo/auto');
  assert.equal(first.allow_external_users, false);
  // Model choice is off, with no models, until an admin turns it on; at most 10 models.
  assert.equal(first.model_choice_enabled, false);
  assert.deepEqual(first.allowed_models, []);
  const tenModels = Array.from({ length: 10 }, (_, index) => `acme/model-${index}`);
  await rows('update public.slack_installations set model_choice_enabled = true, allowed_models = $2 where id = $1', [first.id, tenModels]);
  await assert.rejects(rows('update public.slack_installations set allowed_models = $2 where id = $1', [first.id, [...tenModels, 'acme/model-10']]), /slack_installations_allowed_models_check/);
  await rows("update public.slack_installations set model_choice_enabled = false, allowed_models = '{}' where id = $1", [first.id]);
  // Installations from before scopes were recorded have none; the scopes Slack granted are kept, up to 50.
  assert.equal(first.bot_scopes, null);
  const [scoped] = await rows('update public.slack_installations set bot_scopes = $2 where id = $1 returning bot_scopes', [first.id, ['chat:write', 'files:read', 'files:write']]);
  assert.deepEqual(scoped.bot_scopes, ['chat:write', 'files:read', 'files:write']);
  await assert.rejects(rows('update public.slack_installations set bot_scopes = $2 where id = $1', [first.id, Array.from({ length: 51 }, (_, index) => `scope:${index}`)]), /slack_installations_bot_scopes_check/);
  await rows('update public.slack_installations set bot_scopes = null where id = $1', [first.id]);

  // One live installation per workspace and per Slack team; uninstalled rows stay for billing history.
  await assert.rejects(install(ws(1), 'T0TEAM0002'), /slack_installations_live_workspace_idx/);
  await assert.rejects(install(ws(2), 'T0TEAM0001'), /slack_installations_live_team_idx/);
  // Whichever app it uses: a team live on the hosted app can't also go live through a company's own app.
  const [ownApp] = await rows(`insert into public.slack_apps (workspace_id, slack_app_id, client_id, secrets_ciphertext) values ($1, 'A0APPTEAM1', '123.111', 'v1.cipher') returning id`, [ws(2)]);
  await assert.rejects(install(ws(2), 'T0TEAM0001', { slack_app_id: ownApp.id }), /slack_installations_live_team_idx/);
  await rows('delete from public.slack_apps where id = $1', [ownApp.id]);
  await assert.rejects(install(ws(2), 'not-a-team'), /slack_installations_team_id_check/);
  await assert.rejects(install(ws(2), 'T0TEAM0003', { over_plan: 'bill_everyone' }), /over_plan_check/);
  await assert.rejects(install(ws(2), 'T0TEAM0003', { monthly_cap_nanos: '0' }), /monthly_cap_check/);
  await assert.rejects(install(ws(2), 'T0TEAM0003', { status: 'uninstalled' }), /uninstalled_check/, 'uninstalled rows carry uninstalled_at');
  const [second] = await install(ws(2), 'T0TEAM0003', { monthly_cap_nanos: String(2n * DOLLAR) });
  await rows(`update public.slack_installations set status = 'uninstalled', uninstalled_at = now() where id = $1`, [second.id]);
  const [reinstalled] = await install(ws(2), 'T0TEAM0003', { monthly_cap_nanos: String(2n * DOLLAR) });
  assert.notEqual(reinstalled.id, second.id, 'reinstalling makes a new row and keeps the old one');

  // Usage: the meter sends running totals, so repeats and stale flushes never double count or go down.
  const record = (installation, period, people) => rows(
    'select public.record_slack_agent_people($1, $2, $3) as changed', [installation, period, JSON.stringify(people)],
  ).then(([row]) => row.changed);
  const september = [
    { slack_user_id: 'U0PERSON1', first_answer_at: '2026-09-02T10:00:00Z', answers: 40 },
    { slack_user_id: 'U0PERSON2', first_answer_at: '2026-09-03T10:00:00Z', answers: 500 },
    { slack_user_id: 'W0PERSON3', first_answer_at: '2026-09-04T10:00:00Z', answers: 500 },
  ];
  assert.equal(await record(first.id, '2026-09-01', september), 3);
  assert.equal(await record(first.id, '2026-09-01', september), 0, 'an identical flush changes nothing');
  assert.equal(await record(first.id, '2026-09-01', [{ ...september[0], answers: 10 }]), 0, 'a stale lower total is ignored');
  assert.equal(await record(first.id, '2026-09-01', [{ ...september[0], answers: 60 }]), 1);
  assert.equal(await record(first.id, '2026-09-01', [{ ...september[0], first_answer_at: '2026-09-01T09:00:00Z', answers: 60 }]), 1);
  const [person] = await rows(`select answers, first_answer_at from public.slack_agent_monthly_people where slack_user_id = 'U0PERSON1'`);
  assert.equal(Number(person.answers), 60);
  assert.equal(new Date(person.first_answer_at).toISOString(), '2026-09-01T09:00:00.000Z');
  assert.equal(await record(id('9', 9), '2026-09-01', september), 0, 'an unknown installation records nothing');
  await assert.rejects(record(first.id, '2026-09-15', september), /invalid_period_start/);
  await assert.rejects(record(first.id, '2026-09-01', { slack_user_id: 'U0PERSON1' }), /invalid_people/);
  await assert.rejects(record(first.id, '2026-09-01', [{ ...september[0], slack_user_id: 'bot' }]), /slack_user_id_check/);
  assert.equal(await record(reinstalled.id, '2026-09-01', [september[0]]), 1);
  assert.equal(await record(first.id, '2026-10-01', [september[0]]), 1, 'the current month is recorded but not yet due');
  // A person listed twice in one flush keeps the earliest first answer and the highest total, instead of failing the batch.
  assert.equal(await record(reinstalled.id, '2026-10-01', [
    { slack_user_id: 'U0REPEAT1', first_answer_at: '2026-10-05T10:00:00Z', answers: 65 },
    { slack_user_id: 'U0REPEAT1', first_answer_at: '2026-10-02T08:00:00Z', answers: 70 },
    { slack_user_id: 'U0PERSON2', first_answer_at: '2026-10-03T10:00:00Z', answers: 4 },
  ]), 2);
  const [repeated] = await rows(`select answers, first_answer_at from public.slack_agent_monthly_people where slack_user_id = 'U0REPEAT1'`);
  assert.equal(Number(repeated.answers), 70);
  assert.equal(new Date(repeated.first_answer_at).toISOString(), '2026-10-02T08:00:00.000Z');

  // Due charges aggregate in the database: people and pooled answers per installation and month.
  const due = () => rows(`select * from public.list_slack_agent_due_charges('2026-10-01')`);
  const firstDue = await due();
  assert.deepEqual(
    firstDue.map((row) => [row.installation_id, row.period_start.toISOString().slice(0, 10), row.people, Number(row.answers)]),
    [first.id, reinstalled.id].sort().map((installation) => installation === first.id
      ? [first.id, '2026-09-01', 3, 1060]
      : [reinstalled.id, '2026-09-01', 1, 40]),
  );
  assert.equal(Number(firstDue.find((row) => row.installation_id === first.id).monthly_cap_nanos), 25 * 1e9);

  const charge = (installation, period, people, answers, amount) => rows(
    'select * from public.charge_slack_agent_month($1, $2, $3, $4, $5)', [installation, period, people, answers, String(amount)],
  ).then(([row]) => ({ ...row, amount_nanos: Number(row.amount_nanos) }));
  const status = async (installation) => (await rows('select status from public.slack_installations where id = $1', [installation]))[0].status;
  const balance = async (workspace) => Number((await rows('select balance_nanos from public.wallets where workspace_id = $1', [workspace]))[0].balance_nanos);

  // $0.99 against a $0.50 balance: the month waits for credits and answers pause.
  const short = await charge(first.id, '2026-09-01', 3, 1060, 990_000_000);
  assert.equal(short.status, 'insufficient_balance');
  assert.equal(await status(first.id), 'payment_due');
  assert.equal(await balance(ws(1)), 500_000_000);
  assert.equal((await rows('select count(*)::int as n from public.credit_ledger'))[0].n, 0);
  const retryOrder = await due();
  assert.equal(retryOrder.at(-1).installation_id, first.id, 'a retry waits behind never-tried months');

  // Reserved gateway spend is not available for the charge.
  await rows(`update public.wallets set balance_nanos = 1500000000, reserved_nanos = 600000000 where workspace_id = $1`, [ws(1)]);
  assert.equal((await charge(first.id, '2026-09-01', 3, 1060, 990_000_000)).status, 'insufficient_balance');

  await rows(`update public.wallets set reserved_nanos = 0 where workspace_id = $1`, [ws(1)]);
  const paid = await charge(first.id, '2026-09-01', 3, 1060, 990_000_000);
  assert.deepEqual(
    [paid.status, paid.amount_nanos, Number(paid.before_balance_nanos), Number(paid.after_balance_nanos)],
    ['charged', 990_000_000, 1_500_000_000, 510_000_000],
  );
  assert.equal(await balance(ws(1)), 510_000_000);
  assert.equal(await status(first.id), 'active', 'paying the month resumes answers');
  const ledger = await rows('select * from public.credit_ledger');
  assert.equal(ledger.length, 1);
  assert.deepEqual(
    [ledger[0].workspace_id, ledger[0].kind, Number(ledger[0].amount_nanos), ledger[0].ref_type, ledger[0].ref_id, ledger[0].source_ref_id, ledger[0].status],
    [ws(1), 'charge', -990_000_000, 'slack_agent_month', `${first.id}:2026-09`, first.id, 'captured'],
  );
  const [stored] = await rows('select * from public.slack_agent_charges where installation_id = $1', [first.id]);
  assert.deepEqual([stored.status, stored.people, Number(stored.answers), Number(stored.amount_nanos), stored.ledger_ref_id], ['charged', 3, 1060, 990_000_000, `${first.id}:2026-09`]);

  // Charging is idempotent: a second run takes nothing and reports the original amount.
  const again = await charge(first.id, '2026-09-01', 3, 1060, 990_000_000);
  assert.deepEqual([again.status, again.amount_nanos], ['already_charged', 990_000_000]);
  assert.equal(await balance(ws(1)), 510_000_000);
  assert.equal((await rows('select count(*)::int as n from public.credit_ledger'))[0].n, 1);
  assert.deepEqual((await due()).map((row) => row.installation_id), [reinstalled.id], 'a charged month is no longer due');

  // The month-end charge never exceeds the installation's spending cap.
  const capped = await charge(reinstalled.id, '2026-09-01', 1, 40, 5n * DOLLAR);
  assert.deepEqual([capped.status, capped.amount_nanos], ['charged', 2 * 1e9]);
  assert.equal(await balance(ws(2)), 98 * 1e9);

  // A month with nothing to pay is closed without a ledger row.
  await record(first.id, '2026-08-01', [september[0]]);
  const free = await charge(first.id, '2026-08-01', 1, 60, 0);
  assert.equal(free.status, 'charged');
  assert.equal((await rows(`select count(*)::int as n from public.credit_ledger where ref_id like '%2026-08'`))[0].n, 0);
  assert.equal((await rows(`select ledger_ref_id from public.slack_agent_charges where period_start = '2026-08-01'`))[0].ledger_ref_id, null);

  // A workspace with no wallet keeps its month pending.
  const [noWallet] = await install(ws(3), 'T0TEAM0004');
  assert.equal((await charge(noWallet.id, '2026-09-01', 1, 1, 990_000_000)).status, 'wallet_not_found');
  assert.equal(await status(noWallet.id), 'payment_due');

  // The first attempt fixes the month: a retry after a price change charges the original amount.
  await rows(`insert into public.wallets (workspace_id, balance_nanos) values ($1, 10000000000)`, [ws(3)]);
  const retried = await charge(noWallet.id, '2026-09-01', 7, 9_999, 4_990_000_000);
  assert.deepEqual([retried.status, retried.amount_nanos], ['charged', 990_000_000]);
  const [frozen] = await rows('select people, answers, amount_nanos from public.slack_agent_charges where installation_id = $1', [noWallet.id]);
  assert.deepEqual([frozen.people, Number(frozen.answers), Number(frozen.amount_nanos)], [1, 1, 990_000_000]);
  assert.equal(await balance(ws(3)), 9_010_000_000);
  assert.equal(await status(noWallet.id), 'active');

  // Only finished months can be charged, and inputs are checked.
  await assert.rejects(charge(first.id, (await rows(`select date_trunc('month', now() at time zone 'utc')::date::text as d`))[0].d, 1, 1, 1), /period_not_finished/);
  await assert.rejects(charge(first.id, '2026-09-02', 1, 1, 1), /invalid_period_start/);
  await assert.rejects(charge(first.id, '2026-07-01', 1, 1, -1), /invalid_quantity/);
  await assert.rejects(charge(id('9', 9), '2026-07-01', 1, 1, 1), /installation_not_found/);

  // A live installation's privacy guardrail stays in force: it can't be deleted, disabled,
  // allow training or prompt publishing, or be detached from the agent's key until the agent is uninstalled.
  const [key] = await rows(`insert into public.keys (id, workspace_id) values (gen_random_uuid(), $1) returning id`, [ws(1)]);
  const slackGuardrail = async (workspaceId) => (await rows(`
    insert into public.workspace_guardrails (id, workspace_id, name, description, privacy_enable_paid_may_train, privacy_enable_free_may_train,
      privacy_enable_free_may_publish_prompts, privacy_enable_input_output_logging)
    values (gen_random_uuid(), $1, 'Slack agent', $2, false, false, false, false) returning id`, [workspaceId, OLD_GUARDRAIL_DESCRIPTION]))[0];
  const guardrail = await slackGuardrail(ws(1));
  await rows('insert into public.key_guardrails (key_id, guardrail_id) values ($1, $2)', [key.id, guardrail.id]);
  await rows('update public.slack_installations set key_id = $2, guardrail_id = $3 where id = $1', [first.id, key.id, guardrail.id]);
  // Before the change, logging providers stayed off too.
  await assert.rejects(rows('update public.workspace_guardrails set privacy_enable_input_output_logging = true where id = $1', [guardrail.id]), /slack_agent_guardrail_protected/);

  // The migration lets live installations' guardrails allow providers that keep logs, and
  // leaves past installations' guardrails and other guardrails alone.
  const pastGuardrail = await slackGuardrail(ws(2));
  await rows('update public.slack_installations set guardrail_id = $2 where id = $1', [second.id, pastGuardrail.id]);
  const unrelated = await slackGuardrail(ws(3));
  await rows(`update public.workspace_guardrails set description = 'Renamed by an admin' where id = $1`, [guardrail.id]);
  // Migrations run as the database owner, not as the service role these checks use.
  const applyGuardrailMigration = () => db.exec(`reset role; ${guardrailMigration}; set role service_role;`);
  await applyGuardrailMigration();
  const guardrailState = async (guardrailId) => (await rows(
    'select privacy_enable_input_output_logging as logging, description from public.workspace_guardrails where id = $1', [guardrailId]))[0];
  assert.deepEqual(await guardrailState(guardrail.id), { logging: true, description: 'Renamed by an admin' }, 'an edited description is kept');
  assert.deepEqual(await guardrailState(pastGuardrail.id), { logging: false, description: OLD_GUARDRAIL_DESCRIPTION });
  assert.deepEqual(await guardrailState(unrelated.id), { logging: false, description: OLD_GUARDRAIL_DESCRIPTION });
  await rows('update public.workspace_guardrails set privacy_enable_input_output_logging = false, description = $2 where id = $1', [guardrail.id, OLD_GUARDRAIL_DESCRIPTION]);
  await applyGuardrailMigration();
  assert.deepEqual(await guardrailState(guardrail.id), { logging: true, description: GUARDRAIL_DESCRIPTION }, 'the install\'s description says what is off');
  await applyGuardrailMigration();
  assert.deepEqual(await guardrailState(guardrail.id), { logging: true, description: GUARDRAIL_DESCRIPTION }, 'running it again changes nothing');

  await rows(`update public.workspace_guardrails set name = 'Slack agent (renamed)' where id = $1`, [guardrail.id]);
  // Logging providers can be turned off and on again; they never see training or published prompts.
  await rows('update public.workspace_guardrails set privacy_enable_input_output_logging = false where id = $1', [guardrail.id]);
  await rows('update public.workspace_guardrails set privacy_enable_input_output_logging = true where id = $1', [guardrail.id]);
  for (const change of ['enabled = false', 'privacy_enable_paid_may_train = true', 'privacy_enable_free_may_train = true', 'privacy_enable_free_may_publish_prompts = true']) {
    await assert.rejects(rows(`update public.workspace_guardrails set ${change} where id = $1`, [guardrail.id]), /slack_agent_guardrail_protected/, change);
  }
  await assert.rejects(rows('delete from public.workspace_guardrails where id = $1', [guardrail.id]), /slack_agent_guardrail_protected/);
  await assert.rejects(rows('delete from public.key_guardrails where key_id = $1', [key.id]), /slack_agent_guardrail_protected/);
  // Other guardrails on the same key are not locked.
  const [other] = await rows(`insert into public.workspace_guardrails (id, workspace_id) values (gen_random_uuid(), $1) returning id`, [ws(1)]);
  await rows('insert into public.key_guardrails (key_id, guardrail_id) values ($1, $2)', [key.id, other.id]);
  await rows('delete from public.key_guardrails where key_id = $1 and guardrail_id = $2', [key.id, other.id]);
  await rows('update public.workspace_guardrails set privacy_enable_paid_may_train = true where id = $1', [other.id]);
  // Deleting the key itself cascades (fail-closed: the agent has no working key), and uninstalling unlocks the guardrail.
  const [spareKey] = await rows(`insert into public.keys (id, workspace_id) values (gen_random_uuid(), $1) returning id`, [ws(1)]);
  await rows('insert into public.key_guardrails (key_id, guardrail_id) values ($1, $2)', [spareKey.id, guardrail.id]);
  await rows('update public.slack_installations set key_id = $2 where id = $1', [first.id, spareKey.id]);
  await rows('delete from public.keys where id = $1', [spareKey.id]);
  assert.equal((await rows('select key_id from public.slack_installations where id = $1', [first.id]))[0].key_id, null);
  await rows(`update public.slack_installations set status = 'uninstalled', uninstalled_at = now() where id = $1`, [first.id]);
  await rows('delete from public.key_guardrails where key_id = $1', [key.id]);
  await rows('delete from public.workspace_guardrails where id = $1', [guardrail.id]);
  assert.equal((await rows('select guardrail_id from public.slack_installations where id = $1', [first.id]))[0].guardrail_id, null);

  // A company's own Slack app can't be deleted while any installation (live or past) points at it,
  // so deleting it never cascades away billing history.
  const [app] = await rows(`insert into public.slack_apps (workspace_id, slack_app_id, client_id, secrets_ciphertext) values ($1, 'A0APP0001', '123.456', 'v1.cipher') returning id`, [ws(2)]);
  await rows('update public.slack_installations set slack_app_id = $2 where id = $1', [second.id, app.id]);
  await assert.rejects(rows('delete from public.slack_apps where id = $1', [app.id]), /slack_installations_slack_app_id_fkey/);
  // One company app per workspace, so two admins saving at once can't both insert one.
  await assert.rejects(
    rows(`insert into public.slack_apps (workspace_id, slack_app_id, client_id, secrets_ciphertext) values ($1, 'A0APP0002', '123.789', 'v1.cipher')`, [ws(2)]),
    /slack_apps_workspace_idx/,
  );
  await rows('update public.slack_installations set slack_app_id = null where id = $1', [second.id]);
  await rows('delete from public.slack_apps where id = $1', [app.id]);
  await rows(`insert into public.slack_apps (workspace_id, slack_app_id, client_id, secrets_ciphertext) values ($1, 'A0APP0002', '123.789', 'v1.cipher')`, [ws(2)]);

  // Account links follow the installation.
  await rows(`insert into public.slack_user_links (installation_id, slack_user_id, user_id) values ($1, 'U0PERSON1', $2)`, [first.id, user(1)]);
  await assert.rejects(rows(`insert into public.slack_user_links (installation_id, slack_user_id, user_id) values ($1, 'U0PERSON1', $2)`, [first.id, user(1)]), /slack_user_links_pkey/);

  console.log('slack agent billing: ok');
} finally {
  await db.close();
}
