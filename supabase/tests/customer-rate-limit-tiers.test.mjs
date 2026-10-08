import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const ws = (n) => `10000000-0000-4000-8000-00000000000${n}`;
const usd = (n) => Math.round(n * 1e9);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const inputs = (after = null, limit = 500) =>
  rows('select * from public.gateway_customer_rate_limit_inputs($1::uuid,$2)', [after, limit]);

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    -- Supabase's service_role bypasses row level security.
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.workspaces (
      id uuid primary key, created_at timestamptz not null default now(),
      billing_mode text not null default 'wallet' check (billing_mode in ('wallet','invoice'))
    );
    create table public.credit_ledger (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, kind text not null,
      amount_nanos bigint not null, ref_type text not null, ref_id text not null, status text,
      unique (ref_type, ref_id)
    );
    grant select, insert, update, delete on public.workspaces, public.credit_ledger to service_role;
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$
    begin
      if row(NEW.*) is distinct from row(OLD.*) and NEW.updated_at is not distinct from OLD.updated_at then
        NEW.updated_at := now();
      end if;
      return NEW;
    end $$;
  `);
  await db.exec(await readFile(new URL('../migrations/20261009100000_customer_rate_limit_tiers.sql', import.meta.url), 'utf8'));

  await db.exec(`
    insert into public.workspaces(id, created_at, billing_mode) values
      ('${ws(1)}', now() - interval '40 days', 'wallet'),
      ('${ws(2)}', now() - interval '2 days', 'wallet'),
      ('${ws(3)}', now() - interval '1 day', 'invoice'),
      ('${ws(4)}', now() - interval '90 days', 'wallet');
    insert into public.credit_ledger(workspace_id, kind, amount_nanos, ref_type, ref_id, status) values
      -- ws1: two settled top-ups, one succeeded and one pending refund, and non-payment entries.
      ('${ws(1)}', 'top_up', ${usd(40)}, 'Stripe_Payment_Intent', 'pi_1', 'Paid'),
      ('${ws(1)}', 'auto_top_up', ${usd(30)}, 'Stripe_Payment_Intent', 'pi_2', 'succeeded'),
      ('${ws(1)}', 'refund', ${-usd(15)}, 'Stripe_Refund', 're_1', 'Succeeded'),
      ('${ws(1)}', 'refund', ${-usd(10)}, 'Stripe_Refund', 're_2', 'Pending'),
      ('${ws(1)}', 'charge', ${-usd(5)}, 'async_job_charge', 'job_1', 'captured'),
      -- ws2: only a promo code (recorded as "paid") and an unsettled payment.
      ('${ws(2)}', 'promo_code', ${usd(100)}, 'promo_code_redeem', 'promo_1', 'paid'),
      ('${ws(2)}', 'top_up', ${usd(100)}, 'Stripe_Payment_Intent', 'pi_3', 'Processing'),
      ('${ws(2)}', 'top_up', ${usd(100)}, 'Stripe_Payment_Intent', 'pi_4', 'Failed'),
      -- ws4: fully refunded top-up.
      ('${ws(4)}', 'top_up_one_off', ${usd(20)}, 'Stripe_Payment_Intent', 'pi_5', 'Paid'),
      ('${ws(4)}', 'refund', ${-usd(25)}, 'Stripe_Refund', 're_3', 'Succeeded');
    insert into public.workspace_rate_limit_overrides(workspace_id, requests_per_minute, reason, expires_at)
      values ('${ws(3)}', 500, 'contract', now() + interval '1 day');
  `);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(inputs(), /permission denied/);
    await assert.rejects(rows('select * from public.workspace_rate_limit_overrides'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  const all = await inputs();
  assert.deepEqual(all.map((row) => row.workspace_id), [ws(1), ws(2), ws(3), ws(4)]);
  const [one, two, three, four] = all;
  assert.equal(one.has_paid_top_up, true);
  assert.equal(Number(one.lifetime_paid_spend_nanos), usd(55), 'settled top-ups net of succeeded refunds');
  assert.equal(one.billing_mode, 'wallet');
  assert.equal(one.override_requests_per_minute, null);
  assert.equal(two.has_paid_top_up, false, 'promo grants and unsettled payments are not paid top-ups');
  assert.equal(Number(two.lifetime_paid_spend_nanos), 0);
  assert.equal(three.billing_mode, 'invoice');
  assert.equal(three.override_requests_per_minute, 500);
  assert.equal(three.override_free_requests_per_day, null);
  assert.ok(three.override_expires_at instanceof Date);
  assert.equal(four.has_paid_top_up, true);
  assert.equal(Number(four.lifetime_paid_spend_nanos), 0, 'net spend never goes negative');
  assert.ok(Date.now() - one.created_at.getTime() > 39 * 86_400_000);

  // Keyset pagination by workspace id, with a clamped page size.
  const first = await inputs(null, 2);
  assert.deepEqual(first.map((row) => row.workspace_id), [ws(1), ws(2)]);
  const second = await inputs(first.at(-1).workspace_id, 2);
  assert.deepEqual(second.map((row) => row.workspace_id), [ws(3), ws(4)]);
  assert.equal((await inputs(ws(4), 2)).length, 0);
  assert.equal((await inputs(null, 0)).length, 1);

  // Overrides: validated, timestamped, removed with their workspace.
  await assert.rejects(db.query(`insert into public.workspace_rate_limit_overrides(workspace_id) values ('${ws(1)}')`), /limit_present_check/);
  await assert.rejects(db.query(`insert into public.workspace_rate_limit_overrides(workspace_id, requests_per_minute) values ('${ws(1)}', 0)`), /requests_per_minute_check/);
  await assert.rejects(db.query(`insert into public.workspace_rate_limit_overrides(workspace_id, free_requests_per_day) values ('${ws(1)}', -1)`), /free_requests_per_day_check/);
  await db.exec('reset role');
  await db.exec(`update public.workspace_rate_limit_overrides set updated_at = now() - interval '1 hour' where workspace_id='${ws(3)}'`);
  await db.exec('set role service_role');
  await db.exec(`update public.workspace_rate_limit_overrides set free_requests_per_day = 5000 where workspace_id='${ws(3)}'`);
  const after = (await rows(`select updated_at from public.workspace_rate_limit_overrides where workspace_id='${ws(3)}'`))[0].updated_at;
  assert.ok(Date.now() - after.getTime() < 60_000, 'updated_at is bumped on change');
  await db.exec(`delete from public.workspaces where id='${ws(3)}'`);
  assert.equal((await rows('select * from public.workspace_rate_limit_overrides')).length, 0);
  console.log('customer rate limit tier SQL contract passed');
} finally {
  await db.close();
}
