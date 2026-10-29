import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const ws = (n) => `20000000-0000-4000-8000-00000000000${n}`;
const owner = '30000000-0000-4000-8000-000000000001';
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migrations = new URL('../migrations/', import.meta.url);
const migration = async (suffix) => {
  const name = (await readdir(migrations)).find((file) => file.endsWith(suffix));
  assert.ok(name, `migration *${suffix} exists`);
  return readFile(new URL(name, migrations), 'utf8');
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (
      id uuid primary key, created_at timestamptz not null default now(),
      billing_mode text not null default 'wallet' check (billing_mode in ('wallet','invoice'))
    );
    create table public.credit_ledger (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, kind text not null,
      amount_nanos bigint not null, ref_type text not null, ref_id text not null, status text,
      created_at timestamptz not null default now(),
      event_time timestamptz not null default now(),
      unique (ref_type, ref_id)
    );
    grant select, insert, update, delete on public.workspaces, public.credit_ledger to service_role;
    grant usage on schema auth to service_role;
    grant select, references on auth.users to service_role;
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$
    begin return NEW; end $$;
  `);
  await db.exec(await migration('_customer_rate_limit_tiers.sql'));
  await db.exec(await migration('_rate_limit_self_serve_raises.sql'));

  await db.exec(`
    insert into auth.users(id) values ('${owner}');
    insert into public.workspaces(id, created_at) values
      ('${ws(1)}', now() - interval '20 days'),
      ('${ws(2)}', now() - interval '20 days'),
      ('${ws(3)}', now() - interval '20 days'),
      ('${ws(4)}', now() - interval '20 days'),
      ('${ws(5)}', now() - interval '20 days'),
      ('${ws(6)}', now() - interval '20 days'),
      ('${ws(7)}', now() - interval '20 days');
    insert into public.workspace_rate_limit_raises(workspace_id, from_tier, to_tier, requested_by, created_at, expires_at, revoked_at) values
      -- ws1: an active raise, after an older expired one.
      ('${ws(1)}', 'standard', 'trusted', '${owner}', now() - interval '70 days', now() - interval '40 days', null),
      ('${ws(1)}', 'standard', 'trusted', '${owner}', now() - interval '1 day', now() + interval '29 days', null),
      -- ws2: expired.
      ('${ws(2)}', 'standard', 'trusted', '${owner}', now() - interval '31 days', now() - interval '1 day', null),
      -- ws3: revoked by an operator.
      ('${ws(3)}', 'standard', 'trusted', '${owner}', now() - interval '1 day', now() + interval '29 days', now()),
      -- ws4: refunded after the raise.
      ('${ws(4)}', 'standard', 'trusted', '${owner}', now() - interval '2 days', now() + interval '28 days', null),
      -- ws5: refunded before the raise, so it still applies.
      ('${ws(5)}', 'standard', 'trusted', '${owner}', now() - interval '1 day', now() + interval '29 days', null),
      -- ws7: a refund pending before the raise that succeeded after it.
      ('${ws(7)}', 'standard', 'trusted', '${owner}', now() - interval '2 days', now() + interval '28 days', null);
    insert into public.credit_ledger(workspace_id, kind, amount_nanos, ref_type, ref_id, status, created_at, event_time) values
      ('${ws(4)}', 'refund', -1000, 'Stripe_Refund', 're_after', 'succeeded', now() - interval '1 day', now() - interval '1 day'),
      ('${ws(4)}', 'refund', -1000, 'Stripe_Refund', 're_pending', 'pending', now(), now()),
      ('${ws(5)}', 'refund', -1000, 'Stripe_Refund', 're_before', 'succeeded', now() - interval '5 days', now() - interval '5 days'),
      ('${ws(7)}', 'refund', -1000, 'Stripe_Refund', 're_late', 'succeeded', now() - interval '5 days', now() - interval '1 day');
  `);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select * from public.workspace_rate_limit_raises'), /permission denied/);
    await assert.rejects(rows('select * from public.gateway_customer_rate_limit_inputs()'), /permission denied/);
    await assert.rejects(rows(`select * from public.request_workspace_rate_limit_raise($1::uuid, 'standard', 'trusted', null, now() + interval '30 days', $2::timestamptz)`, [ws(6), null]), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  // The publisher's two-argument call keeps working.
  const all = await rows('select * from public.gateway_customer_rate_limit_inputs($1::uuid, $2)', [null, 500]);
  const raises = Object.fromEntries(all.map((row) => [row.workspace_id, row.raise_tier]));
  assert.deepEqual(raises, {
    [ws(1)]: 'trusted',
    [ws(2)]: null,
    [ws(3)]: null,
    [ws(4)]: null,
    [ws(5)]: 'trusted',
    [ws(6)]: null,
    [ws(7)]: null,
  });
  const active = all.find((row) => row.workspace_id === ws(1));
  assert.ok(new Date(active.raise_expires_at) > new Date(Date.now() + 28 * 86_400_000), 'the newest raise is returned');

  // One workspace, for the raise endpoint.
  const one = await rows('select * from public.gateway_customer_rate_limit_inputs(p_workspace_id => $1::uuid)', [ws(5)]);
  assert.deepEqual(one.map((row) => row.workspace_id), [ws(5)]);
  assert.equal(one[0].raise_tier, 'trusted');

  await assert.rejects(
    rows(`insert into public.workspace_rate_limit_raises(workspace_id, from_tier, to_tier, expires_at) values ('${ws(6)}', 'trusted', 'enterprise', now() + interval '1 day')`),
    /check constraint/,
    'raises never reach enterprise',
  );
  await assert.rejects(
    rows(`insert into public.workspace_rate_limit_raises(workspace_id, from_tier, to_tier, expires_at) values ('${ws(6)}', 'standard', 'trusted', now() - interval '1 day')`),
    /check constraint/,
    'a raise must expire after it starts',
  );

  // A raise is recorded only if the caller saw the newest raise, so of two
  // concurrent requests that both read "no raise yet", only one inserts.
  const request = (lastRequestedAt) => rows(`select * from public.request_workspace_rate_limit_raise($1::uuid, 'standard', 'trusted', null, now() + interval '30 days', $2::timestamptz)`, [ws(6), lastRequestedAt]);
  const first = await request(null);
  assert.equal(first.length, 1, "the first request records a raise");
  assert.equal(first[0].to_tier, "trusted");
  assert.deepEqual(await request(null), [], "a request that read before that raise records nothing");
  const [{ created_at: newest }] = await rows("select max(created_at) as created_at from public.workspace_rate_limit_raises where workspace_id = $1", [ws(6)]);
  assert.equal((await request(newest)).length, 1, "a request that saw the newest raise records one");
  assert.equal((await rows("select 1 from public.workspace_rate_limit_raises where workspace_id = $1", [ws(6)])).length, 2);

  console.log('rate limit self-serve raises: ok');
} finally {
  await db.close();
}
