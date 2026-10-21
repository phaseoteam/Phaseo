import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`;
const ws = (n) => id('1', n);
const user = (n) => id('2', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migration = await readFile(new URL('../migrations/20261021142418_slack_agent_billing.sql', import.meta.url), 'utf8');
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const TABLES = ['slack_apps', 'slack_installations', 'slack_user_links', 'slack_agent_monthly_people', 'slack_agent_charges'];
const FUNCTIONS = ['record_slack_agent_people', 'list_slack_agent_due_charges', 'charge_slack_agent_month'];
const DOLLAR = 1_000_000_000n;

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    create table public.keys (id uuid primary key, workspace_id uuid not null);
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null);
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
    grant select, update on public.wallets to service_role;
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

  for (const table of TABLES) {
    assert.ok(migration.includes(await schema(`public/tables/${table}.sql`)), `${table} migration matches the declarative definition`);
  }
  for (const fn of FUNCTIONS) {
    assert.ok(migration.includes(await schema(`public/functions/${fn}.sql`)), `${fn} migration matches the declarative definition`);
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

  // One live installation per workspace and per Slack team; uninstalled rows stay for billing history.
  await assert.rejects(install(ws(1), 'T0TEAM0002'), /slack_installations_live_workspace_idx/);
  await assert.rejects(install(ws(2), 'T0TEAM0001'), /slack_installations_live_team_idx/);
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

  // Only finished months can be charged, and inputs are checked.
  await assert.rejects(charge(first.id, (await rows(`select date_trunc('month', now() at time zone 'utc')::date::text as d`))[0].d, 1, 1, 1), /period_not_finished/);
  await assert.rejects(charge(first.id, '2026-09-02', 1, 1, 1), /invalid_period_start/);
  await assert.rejects(charge(first.id, '2026-07-01', 1, 1, -1), /invalid_quantity/);
  await assert.rejects(charge(id('9', 9), '2026-07-01', 1, 1, 1), /installation_not_found/);

  // Account links follow the installation.
  await rows(`insert into public.slack_user_links (installation_id, slack_user_id, user_id) values ($1, 'U0PERSON1', $2)`, [first.id, user(1)]);
  await assert.rejects(rows(`insert into public.slack_user_links (installation_id, slack_user_id, user_id) values ($1, 'U0PERSON1', $2)`, [first.id, user(1)]), /slack_user_links_pkey/);

  console.log('slack agent billing: ok');
} finally {
  await db.close();
}
