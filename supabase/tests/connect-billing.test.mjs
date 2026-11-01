import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`;
const ws = (n) => id('1', n);
const user = (n) => id('2', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_connect_subscriptions.sql'));
const migration = await readFile(new URL(`../migrations/${migrationName}`, import.meta.url), 'utf8');
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const TABLES = ['connect_subscriptions', 'connect_subscription_periods', 'connect_charges'];
const FUNCTIONS = ['set_connect_enabled', 'get_connect_state', 'get_connect_entitlement', 'list_connect_due_charges', 'charge_connect_month'];

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
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
    insert into public.workspaces values ('${ws(1)}'), ('${ws(2)}'), ('${ws(3)}'), ('${ws(4)}');
    insert into public.wallets (workspace_id, balance_nanos) values ('${ws(1)}', 200000000), ('${ws(2)}', 100000000000), ('${ws(4)}', 5000000000);
  `);
  await db.exec(migration);

  for (const table of TABLES) {
    assert.ok(migration.includes((await schema(`public/tables/${table}.sql`)).trimEnd()), `${table} migration matches the declarative definition`);
  }
  for (const fn of FUNCTIONS) {
    assert.ok(migration.includes((await schema(`public/functions/${fn}.sql`)).trimEnd()), `${fn} migration matches the declarative definition`);
  }
  assert.ok(migration.includes((await schema('private/functions/connect_days_on.sql')).trimEnd()), 'connect_days_on matches the declarative definition');

  // Clients never read or change Connect billing directly.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of TABLES) {
      await assert.rejects(rows(`select * from public.${table}`), /permission denied/, `${role} cannot read ${table}`);
    }
    await assert.rejects(rows(`select public.set_connect_enabled('${ws(1)}', true, null)`), /permission denied/);
    await assert.rejects(rows(`select * from public.get_connect_entitlement('${ws(1)}')`), /permission denied/);
    await db.exec('reset role');
  }

  // Periods are written only through the functions: the service role can read but not change them.
  await db.exec('set role service_role');
  await assert.rejects(rows(`insert into public.connect_subscriptions (workspace_id) values ('${ws(1)}')`), /permission denied/);
  await assert.rejects(rows(`update public.connect_subscription_periods set ended_at = now()`), /permission denied/);
  await db.exec('reset role');

  const asService = async (sql, params) => {
    await db.exec('set role service_role');
    try { return await rows(sql, params); } finally { await db.exec('reset role'); }
  };
  const setEnabled = (workspace, enabled) => asService('select public.set_connect_enabled($1, $2, $3) as changed', [workspace, enabled, user(1)]).then(([row]) => row.changed);
  const entitlement = (workspace) => asService('select * from public.get_connect_entitlement($1)', [workspace]).then(([row]) => row);
  const state = (workspace, now) => asService('select * from public.get_connect_state($1, $2)', [workspace, now]).then(([row]) => ({
    ...row, charge_so_far_nanos: Number(row.charge_so_far_nanos), estimated_nanos: Number(row.estimated_nanos), pending_nanos: Number(row.pending_nanos),
  }));
  const charge = (workspace, period) => asService('select * from public.charge_connect_month($1, $2)', [workspace, period])
    .then(([row]) => ({ ...row, amount_nanos: Number(row.amount_nanos) }));
  const due = (before) => asService('select workspace_id, period_start::text as period_start from public.list_connect_due_charges($1)', [before]);
  const balance = async (workspace) => Number((await rows('select balance_nanos from public.wallets where workspace_id = $1', [workspace]))[0].balance_nanos);
  const ledgerCount = async () => (await rows('select count(*)::int as n from public.credit_ledger'))[0].n;
  // Past periods, written as the owner the way the functions would have at the time.
  const period = (workspace, startedAt, endedAt = null) => rows(
    `insert into public.connect_subscription_periods (workspace_id, started_at, ended_at, ended_reason) values ($1, $2, $3, $4)`,
    [workspace, startedAt, endedAt, endedAt ? 'turned_off' : null],
  );

  // Nothing set up: off, and the relay refuses.
  assert.deepEqual(await entitlement(ws(1)), { enabled: false, paid_up: false });

  // Turning it on opens one period; repeating it changes nothing; off closes it.
  assert.equal(await setEnabled(ws(3), true), true);
  assert.equal(await setEnabled(ws(3), true), false);
  assert.equal((await rows('select count(*)::int as n from public.connect_subscription_periods where workspace_id = $1 and ended_at is null', [ws(3)]))[0].n, 1);
  assert.equal(await setEnabled(ws(3), false), true);
  const [closed] = await rows('select ended_reason, ended_by from public.connect_subscription_periods where workspace_id = $1', [ws(3)]);
  assert.deepEqual([closed.ended_reason, closed.ended_by], ['turned_off', user(1)]);
  // A workspace with no wallet is not paid up even when on.
  await setEnabled(ws(3), true);
  assert.deepEqual(await entitlement(ws(3)), { enabled: true, paid_up: false });
  await setEnabled(ws(3), false);

  // Workspace 1: on for 10 UTC days of September 2026 (30 days), across two periods and a midnight edge.
  await setEnabled(ws(1), true);
  await setEnabled(ws(1), false);
  await rows('delete from public.connect_subscription_periods where workspace_id = $1', [ws(1)]);
  await period(ws(1), '2026-09-03T23:59:00Z', '2026-09-08T00:00:00Z'); // Sep 3-7: 5 days; ends exactly at midnight, so not Sep 8.
  await period(ws(1), '2026-09-20T12:00:00Z', '2026-09-20T12:00:30Z'); // Sep 20: on for 30 seconds still counts.
  await period(ws(1), '2026-09-26T08:00:00Z', '2026-09-29T09:00:00Z'); // Sep 26-29: 4 days.
  await period(ws(1), '2026-08-31T22:00:00Z', '2026-09-01T00:00:00Z'); // August 31 only.
  assert.equal((await rows(`select private.connect_days_on($1, '2026-09-01', '2026-10-01') as n`, [ws(1)]))[0].n, 10);

  // Workspace 2: on for the whole of October (31 days) and still on, plus one day of February 2027 is checked below.
  await setEnabled(ws(2), true);
  await rows(`update public.connect_subscription_periods set started_at = '2026-10-01T00:00:00Z' where workspace_id = $1`, [ws(2)]);

  // Due months: only finished months with at least one day, never-tried first.
  assert.deepEqual(await due('2026-11-01'), [
    { workspace_id: ws(1), period_start: '2026-08-01' },
    { workspace_id: ws(1), period_start: '2026-09-01' },
    { workspace_id: ws(2), period_start: '2026-10-01' },
  ]);
  assert.deepEqual(await due('2026-10-01'), [
    { workspace_id: ws(1), period_start: '2026-08-01' },
    { workspace_id: ws(1), period_start: '2026-09-01' },
  ]);

  // 10 of 30 days against a $0.20 balance: $0.333333333 (rounded down from $0.3333...), which can't be paid yet.
  const short = await charge(ws(1), '2026-09-01');
  assert.deepEqual([short.status, short.days_on, short.amount_nanos], ['insufficient_balance', 10, 333_333_333]);
  assert.equal(await balance(ws(1)), 200_000_000);
  assert.equal(await ledgerCount(), 0);
  // Connect is paused: payment due, no period open, the relay refuses, and turning it on bills nothing.
  assert.deepEqual(await entitlement(ws(1)), { enabled: false, paid_up: false });
  assert.equal(await setEnabled(ws(1), true), true);
  assert.equal((await rows('select count(*)::int as n from public.connect_subscription_periods where workspace_id = $1 and ended_at is null', [ws(1)]))[0].n, 0);
  assert.deepEqual(await entitlement(ws(1)), { enabled: true, paid_up: false });
  const paused = await state(ws(1), '2026-11-15T10:00:00Z');
  assert.deepEqual([paused.enabled, paused.payment_due, paused.pending_nanos, paused.pending_months], [true, true, 333_333_333, 1]);
  assert.equal((await due('2026-11-01')).at(-1).period_start, '2026-09-01', 'a retry waits behind never-tried months');

  // Reserved gateway spend is not available for the charge, so the wallet never goes below it.
  await rows('update public.wallets set balance_nanos = 400000000, reserved_nanos = 100000000 where workspace_id = $1', [ws(1)]);
  assert.equal((await charge(ws(1), '2026-09-01')).status, 'insufficient_balance');

  // Topped up: the retry takes exactly the amount fixed at the first attempt, as one ledger row, and Connect resumes.
  await rows('update public.wallets set balance_nanos = 1000000000, reserved_nanos = 0 where workspace_id = $1', [ws(1)]);
  const paid = await charge(ws(1), '2026-09-01');
  assert.deepEqual(
    [paid.status, paid.days_on, paid.amount_nanos, Number(paid.before_balance_nanos), Number(paid.after_balance_nanos)],
    ['charged', 10, 333_333_333, 1_000_000_000, 666_666_667],
  );
  assert.equal(await balance(ws(1)), 666_666_667);
  const ledger = await rows('select * from public.credit_ledger');
  assert.equal(ledger.length, 1);
  assert.deepEqual(
    [ledger[0].workspace_id, ledger[0].kind, Number(ledger[0].amount_nanos), ledger[0].ref_type, ledger[0].ref_id, ledger[0].source_ref_type, ledger[0].status],
    [ws(1), 'charge', -333_333_333, 'connect_month', `${ws(1)}:2026-09`, 'connect_subscription', 'captured'],
  );
  const [stored] = await rows(`select * from public.connect_charges where workspace_id = $1 and period_start = '2026-09-01'`, [ws(1)]);
  assert.deepEqual([stored.status, stored.days_on, stored.days_in_month, stored.ledger_ref_id], ['charged', 10, 30, `${ws(1)}:2026-09`]);
  // August was never attempted, so September was the only pending month and Connect is back.
  assert.deepEqual(await entitlement(ws(1)), { enabled: true, paid_up: true });
  const [subscription] = await rows('select payment_due from public.connect_subscriptions where workspace_id = $1', [ws(1)]);
  assert.equal(subscription.payment_due, false, 'September was the only pending month');
  assert.equal((await rows('select count(*)::int as n from public.connect_subscription_periods where workspace_id = $1 and ended_at is null', [ws(1)]))[0].n, 1, 'paying resumes Connect, which is still on');

  // Charging is idempotent: a second run takes nothing and reports the original amount.
  const again = await charge(ws(1), '2026-09-01');
  assert.deepEqual([again.status, again.amount_nanos], ['already_charged', 333_333_333]);
  assert.equal(await balance(ws(1)), 666_666_667);
  assert.equal(await ledgerCount(), 1);

  // One day of 31 in August: 1e9 / 31 = 32,258,064.5..., rounded down.
  const august = await charge(ws(1), '2026-08-01');
  assert.deepEqual([august.status, august.days_on, august.amount_nanos], ['charged', 1, 32_258_064]);

  // A full month is exactly $1.00.
  const october = await charge(ws(2), '2026-10-01');
  assert.deepEqual([october.status, october.days_on, october.amount_nanos], ['charged', 31, 1_000_000_000]);
  assert.equal(await balance(ws(2)), 99_000_000_000);
  assert.deepEqual(await due('2026-11-01'), [], 'charged months are no longer due');

  // A month with no days is never charged.
  const empty = await charge(ws(2), '2026-07-01');
  assert.deepEqual([empty.status, empty.amount_nanos], ['nothing_due', 0]);
  assert.equal((await rows(`select count(*)::int as n from public.connect_charges where period_start = '2026-07-01'`))[0].n, 0);

  // February 2027 has 28 days: one day is 35,714,285 nanos (35,714,285.71 rounded down). Checked through the state, which uses the same formula.
  await rows(`insert into public.connect_subscriptions (workspace_id, enabled) values ($1, false)`, [ws(4)]);
  await period(ws(4), '2027-02-10T05:00:00Z', '2027-02-10T06:00:00Z');
  const february = await state(ws(4), '2027-02-20T12:00:00Z');
  assert.deepEqual([february.days_on, february.days_in_month, february.charge_so_far_nanos, february.estimated_nanos], [1, 28, 35_714_285, 35_714_285]);

  // This month's state while on: days so far (today included) and the month-end estimate if it stays on.
  const live = await state(ws(2), '2026-11-10T09:00:00Z');
  assert.deepEqual(
    [live.enabled, live.payment_due, live.period_start.toISOString().slice(0, 10), live.days_on, live.days_in_month, live.charge_so_far_nanos, live.estimated_nanos, live.pending_months],
    [true, false, '2026-11-01', 10, 30, 333_333_333, 1_000_000_000, 0],
  );
  assert.deepEqual(await entitlement(ws(2)), { enabled: true, paid_up: true });

  // A workspace whose wallet is empty can't use the relay even with nothing unpaid.
  await rows('update public.wallets set balance_nanos = 0 where workspace_id = $1', [ws(2)]);
  assert.deepEqual(await entitlement(ws(2)), { enabled: true, paid_up: false });

  // Only finished months can be charged, and inputs are checked.
  const thisMonth = (await rows(`select date_trunc('month', now() at time zone 'utc')::date::text as d`))[0].d;
  await assert.rejects(charge(ws(1), thisMonth), /period_not_finished/);
  await assert.rejects(charge(ws(1), '2026-09-02'), /invalid_period_start/);
  await assert.rejects(charge(id('9', 9), '2026-09-01'), /subscription_not_found/);
  await assert.rejects(rows(`insert into public.connect_charges (workspace_id, period_start, days_on, days_in_month, amount_nanos) values ($1, '2026-06-01', 0, 30, 0)`, [ws(1)]), /connect_charges_quantities_check/);
  await assert.rejects(period(ws(1), '2026-11-01T00:00:00Z'), /connect_subscription_periods_open_idx/, 'one open period per workspace');

  console.log('connect billing: ok');
} finally {
  await db.close();
}
