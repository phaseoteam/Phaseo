import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ws = (n) => id('1', n);
const user = (n) => id('2', n);
const destination = (n) => id('4', n);
const policy = (n) => id('6', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const alertsMigration = await migration('20261016153943_rate_limit_throttle_alerts.sql');

try {
  // Minimal pre-existing objects the migrations depend on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create table public.workspaces (id uuid primary key, name text, owner_user_id uuid);
    create table public.v2_request_facts (
      request_event_id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      occurred_at timestamptz not null default now(),
      key_id uuid,
      error_code text,
      safe_metadata jsonb not null default '{}'::jsonb
    );
    create table public.workspace_rate_limit_policies (id uuid primary key, workspace_id uuid not null, name text not null);
    create table public.notification_destinations (id uuid primary key, workspace_id uuid not null, status text not null default 'active');
    create table public.notification_event_destinations (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      event_kind text not null,
      destination_id uuid not null references public.notification_destinations(id) on delete cascade,
      created_at timestamptz not null default now(),
      constraint notification_event_destinations_event_kind_check
        check ((event_kind = any (array['low_balance'::text, 'auto_top_up_failed'::text, 'payment_method_expiring'::text, 'model_deprecation'::text]))),
      primary key (workspace_id, event_kind, destination_id)
    );
    create table public.email_outbox (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      kind text not null,
      template text not null default 'generic',
      to_email text not null,
      subject text,
      workspace_id uuid,
      user_id uuid,
      payload jsonb not null default '{}'::jsonb,
      sent_at timestamptz,
      dedupe_key text
    );
    create unique index email_outbox_dedupe_key_unique on public.email_outbox (dedupe_key);
  `);
  await db.exec(await migration('20261015113136_rate_limit_throttle_rollups.sql'));
  await db.exec(alertsMigration);

  assert.ok(alertsMigration.includes(await schema('public/functions/enqueue_rate_limit_throttle_alerts.sql')), 'enqueue function matches the declarative definition');
  assert.ok(alertsMigration.includes(await schema('public/functions/set_notification_event_destinations.sql')), 'route setter matches the declarative definition');
  const table = await schema('public/tables/notification_event_destinations.sql');
  const check = alertsMigration.match(/CHECK \(\(event_kind = ANY \(ARRAY\[[^\]]+\]\)\)\)/)?.[0];
  assert.ok(check && table.includes(check), 'event kind constraint matches the declarative definition');

  // Workspaces: 1 routed and throttled; 2 throttled, no route; 3 routed to a paused destination; 4 routed, many policies; 5 routed, no throttles.
  for (let n = 1; n <= 5; n += 1) {
    await db.query(`insert into auth.users values ($1, $2)`, [user(n), `owner${n}@example.com`]);
    await db.query(`insert into public.workspaces values ($1, $2, $3)`, [ws(n), `Workspace ${n}`, user(n)]);
    await db.query(`insert into public.notification_destinations values ($1, $2, $3)`, [destination(n), ws(n), 'active']);
  }
  for (const n of [1, 3, 4, 5]) {
    await rows(`select public.set_notification_event_destinations($1, 'rate_limit_throttled', array[$2]::uuid[])`, [ws(n), destination(n)]);
  }
  // A route stays in place after its destination is paused.
  await db.query(`update public.notification_destinations set status = 'paused' where id = $1`, [destination(3)]);
  await assert.rejects(rows(`select public.set_notification_event_destinations($1, 'bogus', array[]::uuid[])`, [ws(1)]), /invalid_notification_event_kind/);
  await assert.rejects(db.query(`insert into public.notification_event_destinations values ($1, 'bogus', $2)`, [ws(1), destination(1)]), /event_kind_check/);

  await db.query(`insert into public.workspace_rate_limit_policies values ($1, $2, 'Batch keys'), ($3, $2, 'Members')`, [policy(1), ws(1), policy(2)]);
  const throttle = (workspace, minutesAgo, policyId, scope, count) => db.query(
    `insert into public.workspace_rate_limit_throttles_minute (bucket_start, workspace_id, policy_id, limit_scope, key_id, throttled_requests)
     values (date_trunc('minute', now()) - make_interval(mins => $2), $1, $3, $4, null, $5)`,
    [workspace, minutesAgo, policyId, scope, count],
  );
  await throttle(ws(1), 2, policy(1), 'key', 30);
  await throttle(ws(1), 3, policy(1), 'key', 12);
  await throttle(ws(1), 4, policy(2), 'member', 5);
  // Outside the 15-minute window.
  await throttle(ws(1), 20, policy(2), 'member', 1000);
  await throttle(ws(2), 2, policy(1), 'key', 9);
  await throttle(ws(3), 2, policy(1), 'key', 9);
  for (let n = 1; n <= 7; n += 1) await throttle(ws(4), 1, policy(10 + n), 'end_user', n);

  assert.equal((await rows(`select public.enqueue_rate_limit_throttle_alerts() as n`))[0].n, 2);

  const events = await rows(`select workspace_id, kind, template, to_email, user_id, sent_at, dedupe_key, payload from public.email_outbox order by workspace_id`);
  assert.deepEqual(events.map((event) => event.workspace_id), [ws(1), ws(4)]);
  const [first, fourth] = events;
  assert.equal(first.kind, 'rate_limit_throttled');
  assert.equal(first.template, 'rate_limit_throttled');
  assert.equal(first.to_email, 'owner1@example.com');
  assert.equal(first.user_id, user(1));
  assert.equal(first.sent_at, null);
  assert.match(first.dedupe_key, new RegExp(`^rate_limit_throttled:${ws(1)}:\\d{4}-\\d{2}-\\d{2}T\\d{2}$`));
  assert.equal(first.payload.workspace_name, 'Workspace 1');
  assert.equal(first.payload.throttled_requests, 47);
  assert.equal(first.payload.window_minutes, 15);
  assert.deepEqual(first.payload.policies, [
    { policy_id: policy(1), policy_name: 'Batch keys', limit_scope: 'key', throttled_requests: 42 },
    { policy_id: policy(2), policy_name: 'Members', limit_scope: 'member', throttled_requests: 5 },
  ]);
  // The total covers every policy; the list keeps the five largest. Deleted policies have no name.
  assert.equal(fourth.payload.throttled_requests, 28);
  assert.deepEqual(fourth.payload.policies.map((entry) => entry.throttled_requests), [7, 6, 5, 4, 3]);
  assert.equal(fourth.payload.policies[0].policy_name, null);

  // At most one alert per workspace per hour.
  await throttle(ws(1), 1, policy(1), 'key', 3);
  assert.equal((await rows(`select public.enqueue_rate_limit_throttle_alerts() as n`))[0].n, 0);
  await db.query(`update public.email_outbox set created_at = now() - interval '61 minutes', dedupe_key = dedupe_key || ':earlier' where workspace_id = $1`, [ws(1)]);
  assert.equal((await rows(`select public.enqueue_rate_limit_throttle_alerts() as n`))[0].n, 1);
  assert.equal((await rows(`select count(*)::int as n from public.email_outbox where workspace_id = $1`, [ws(1)]))[0].n, 2);

  for (const role of ['anon', 'authenticated']) {
    const [grant] = await rows(`select has_function_privilege($1, 'public.enqueue_rate_limit_throttle_alerts()', 'execute') as ok`, [role]);
    assert.equal(grant.ok, false, `${role} cannot queue alerts`);
  }
  const [serviceGrant] = await rows(`select has_function_privilege('service_role', 'public.enqueue_rate_limit_throttle_alerts()', 'execute') as ok`);
  assert.equal(serviceGrant.ok, true);

  console.log('rate-limit-throttle-alerts: ok');
} finally {
  await db.close();
}
