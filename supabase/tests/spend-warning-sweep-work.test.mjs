import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const schema = name => readFile(new URL(`../schemas/${name}`, import.meta.url), 'utf8');
const workspace = '70000000-0000-4000-8000-000000000001';
const key = '80000000-0000-4000-8000-000000000001';
const sweep = async at => (await db.query('select public.sweep_spend_limit_warnings($1) as result', [at])).rows[0].result;
const reads = async () => (await db.query('select case when is_called then last_value else 0 end as count from public.items_read')).rows[0].count;

try {
  await db.exec(`
    create role service_role; create role anon; create role authenticated;
    create schema private;
    create table public.keys (id uuid primary key, workspace_id uuid, name text, created_by uuid, status text default 'active',
      daily_limit_requests bigint default 0, weekly_limit_requests bigint default 0, monthly_limit_requests bigint default 0,
      daily_limit_cost_nanos bigint default 0, weekly_limit_cost_nanos bigint default 0, monthly_limit_cost_nanos bigint default 0);
    create table public.workspace_budgets (id uuid, workspace_id uuid, interval text, limit_nanos bigint);
    create table public.workspace_notification_events (workspace_id uuid, kind text, category text, dedupe_key text unique,
      key_id uuid, key_created_by uuid, payload jsonb, occurred_at timestamptz);
    create table public.fixture_spend (key_id uuid, at timestamptz, served boolean, nanos bigint);
    create sequence public.items_read;
    create function private.workspace_push_usd(numeric) returns text language sql as $$ select '$' || $1 $$;
    create function private.budget_spend_items(uuid, timestamptz) returns table(at timestamptz, active boolean, nanos bigint)
      language sql as $$ select now(), false, 0::bigint where false $$;
    -- Count the items the real reader would have to return, without timing assertions or sleeps.
    create function private.key_spend_items(uuid, timestamptz, uuid[]) returns table(key_id uuid, at timestamptz, served boolean, nanos bigint)
      language plpgsql stable as $$ declare item record; begin
        for item in select f.* from public.fixture_spend f join public.keys k on k.id = f.key_id
          where k.workspace_id = $1 and f.key_id = any($3) and f.at >= $2 loop
          perform nextval('public.items_read');
          return query select item.key_id, item.at, item.served, item.nanos;
        end loop;
      end $$;
    insert into public.keys(id, workspace_id, name, daily_limit_cost_nanos) values ('${key}', '${workspace}', 'Fixture', 100);
    insert into public.fixture_spend select '${key}', '2026-11-02 01:00Z', true, 1 from generate_series(1, 1000);
    insert into public.fixture_spend values ('${key}', '2026-11-11 01:00Z', true, 80);
  `);
  for (const name of ['private/functions/spend_limit_period.sql', 'private/functions/spend_limit_amount.sql', 'public/functions/sweep_spend_limit_warnings.sql']) await db.exec(await schema(name));

  assert.deepEqual(await sweep('2026-11-11 12:00Z'), { budgets: 0, limitedKeys: 1, warned: 1 });
  assert.equal(await reads(), 1, 'a daily-only limit must not read old weekly/monthly spend');
  assert.deepEqual(await sweep('2026-11-11 12:15Z'), { budgets: 0, limitedKeys: 1, warned: 0 });
  assert.equal(await reads(), 1, 'an already warned limit must not reread spend');

  // A new value can warn, and monthly and daily limits on the same key stay independent.
  await db.exec('update public.keys set daily_limit_cost_nanos = 99, monthly_limit_cost_nanos = 1300');
  assert.deepEqual(await sweep('2026-11-11 12:30Z'), { budgets: 0, limitedKeys: 1, warned: 2 });
  assert.equal(await reads(), 1002, 'read monthly history once for the remaining monthly limit');
  await db.exec(`insert into public.fixture_spend values ('${key}', '2026-11-12 01:00Z', true, 80)`);
  assert.deepEqual(await sweep('2026-11-12 12:00Z'), { budgets: 0, limitedKeys: 1, warned: 1 });
  assert.equal(await reads(), 1003, 'a new daily period must not reread an already warned month');

  // A reached event also suppresses the warning even if a later refund lowers usage.
  await db.exec(`insert into public.workspace_notification_events(dedupe_key) values ('key_limit_reached:key:${key}:cost:daily:2026-11-13:99');
    insert into public.fixture_spend values ('${key}', '2026-11-13 01:00Z', true, 80)`);
  assert.deepEqual(await sweep('2026-11-13 12:00Z'), { budgets: 0, limitedKeys: 1, warned: 0 });
  assert.equal(await reads(), 1003);

  // In the first week of a month, the previous month's Monday can be the earliest required date.
  await db.exec('truncate public.fixture_spend; update public.keys set daily_limit_cost_nanos=0, monthly_limit_cost_nanos=100, weekly_limit_cost_nanos=100');
  await db.exec(`insert into public.fixture_spend values ('${key}', '2026-10-29 01:00Z', true, 80)`);
  assert.deepEqual(await sweep('2026-11-01 12:00Z'), { budgets: 0, limitedKeys: 1, warned: 1 });
  const warning = (await db.query(`select payload from public.workspace_notification_events where payload->>'window'='weekly'`)).rows[0].payload;
  assert.equal(warning.used, 80);
  assert.equal(warning.periodStart, '2026-10-26T00:00:00+00:00');
  console.log('spend warning sweep work: ok (daily history: 1 item; repeat: 0; changed value, rollover, reached and cross-month week verified)');
} finally {
  await db.close();
}
