import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ws = (n) => id('1', n);
const user = (n) => id('2', n);
const route = (n) => id('4', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const alertsMigration = await read('../migrations/20261021135140_broadcast_destination_alerts.sql');
const enqueue = async () => (await rows('select public.enqueue_broadcast_destination_alerts() as n'))[0].n;
const alerts = () => rows(`select workspace_id, to_email, payload, dedupe_key from public.email_outbox where kind = 'broadcast_destination_failing' order by created_at, workspace_id`);
// Destinations are created a day ago unless createdMinutesAgo says otherwise.
const destination = async (workspace, name, type = 'langfuse', createdMinutesAgo = 24 * 60) => (await rows(
  `insert into public.workspace_broadcast_destinations(workspace_id,destination_id,name,enabled,created_at) values($1,$2,$3,true, now() - make_interval(mins => $4::int)) returning id`,
  [workspace, type, name, createdMinutesAgo],
))[0].id;
// Sets a destination's health as if its last `failures` requests failed `minutesAgo` minutes ago.
const failing = (destinationId, workspace, failures, { successMinutesAgo = null, minutesAgo = 1, alertedMinutesAgo = null } = {}) => db.query(`
  insert into public.broadcast_destination_health(destination_id,workspace_id,last_success_at,last_failure_at,last_http_status,last_error,consecutive_failures,alerted_at)
  values($1,$2,
    case when $4::int is null then null else now() - make_interval(mins => $4::int) end,
    now() - make_interval(mins => $5::int), 401, 'OTLP endpoint returned 401', $3,
    case when $6::int is null then null else now() - make_interval(mins => $6::int) end)
  on conflict (destination_id) do update set
    last_success_at = excluded.last_success_at, last_failure_at = excluded.last_failure_at,
    consecutive_failures = excluded.consecutive_failures, alerted_at = excluded.alerted_at`,
  [destinationId, workspace, failures, successMinutesAgo, minutesAgo, alertedMinutesAgo]);

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create table public.workspaces (id uuid primary key, name text, owner_user_id uuid);
    create function public.is_workspace_admin(uuid) returns boolean language sql as 'select true';
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as 'begin new.updated_at = now(); return new; end';
    create table public.notification_destinations (id uuid primary key, workspace_id uuid not null, status text not null default 'active');
    create table public.notification_event_destinations (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      event_kind text not null,
      destination_id uuid not null references public.notification_destinations(id) on delete cascade,
      created_at timestamptz not null default now(),
      constraint notification_event_destinations_event_kind_check
        check ((event_kind = any (array['low_balance'::text, 'rate_limit_throttled'::text]))),
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
  await db.exec(await read('../schemas/public/functions/enforce_broadcast_destination_limit.sql'));
  await db.exec(await read('../schemas/public/tables/workspace_broadcast_destination_limits.sql'));
  await db.exec(await read('../schemas/public/tables/workspace_broadcast_destinations.sql'));
  // Health as #3102's migration creates it, without alerted_at.
  await db.exec((await read('../migrations/20261021130717_broadcast_destination_health.sql')));
  await db.exec(alertsMigration);

  const schema = (path) => read(`../schemas/${path}`);
  assert.ok(alertsMigration.includes(await schema('public/functions/enqueue_broadcast_destination_alerts.sql')), 'enqueue function matches the declarative definition');
  assert.ok(alertsMigration.includes(await schema('public/functions/set_notification_event_destinations.sql')), 'route setter matches the declarative definition');
  const table = await schema('public/tables/notification_event_destinations.sql');
  const check = alertsMigration.match(/CHECK \(\(event_kind = ANY \(ARRAY\[[^\]]+\]\)\)\)/)?.[0];
  assert.ok(check && table.includes(check), 'event kind constraint matches the declarative definition');

  await db.query(`insert into auth.users values ($1, 'owner@example.com'), ($2, 'other@example.com')`, [user(1), user(2)]);
  await db.query(`insert into public.workspaces values ($1, 'Acme', $3), ($2, 'Other', $4), ($5, 'Unrouted', $3)`, [ws(1), ws(2), user(1), user(2), ws(3)]);
  await db.query(`insert into public.notification_destinations values ($1, $3, 'active'), ($2, $4, 'disabled')`, [route(1), route(2), ws(1), ws(2)]);
  // The new kind is accepted by the route CHECK and the setter.
  await db.query(`select public.set_notification_event_destinations($1, 'broadcast_destination_failing', array[$2]::uuid[])`, [ws(1), route(1)]);
  await db.query(`insert into public.notification_event_destinations values ($1, 'broadcast_destination_failing', $2)`, [ws(2), route(2)]);
  await assert.rejects(db.query(`select public.set_notification_event_destinations($1, 'not_a_kind', array[]::uuid[])`, [ws(1)]), /invalid_notification_event_kind/);

  const broken = await destination(ws(1), 'Langfuse prod');
  const flaky = await destination(ws(1), 'Datadog', 'datadog');
  const recovering = await destination(ws(1), 'Honeycomb', 'honeycomb');
  const otherWorkspace = await destination(ws(2), 'Disabled route');
  const unrouted = await destination(ws(3), 'Unrouted');
  const fresh = await destination(ws(1), 'New destination', 'axiom', 2);

  // Below the streak threshold, with a recent success, never delivered but created
  // within the quiet period, or unrouted: no alert.
  await failing(broken, ws(1), 4);
  await failing(fresh, ws(1), 9);
  await failing(recovering, ws(1), 9, { successMinutesAgo: 5 });
  await failing(otherWorkspace, ws(2), 20);
  await failing(unrouted, ws(3), 20);
  assert.equal(await enqueue(), 0);

  await db.query('delete from public.workspace_broadcast_destinations where id = $1', [fresh]);

  // Five failures in a row with no success for 15 minutes alerts once for the workspace.
  await failing(broken, ws(1), 12);
  await failing(flaky, ws(1), 6, { successMinutesAgo: 40 });
  assert.equal(await enqueue(), 1);
  let [alert] = await alerts();
  assert.equal(alert.workspace_id, ws(1));
  assert.equal(alert.to_email, 'owner@example.com');
  assert.equal(alert.payload.failing_destinations, 2);
  assert.deepEqual(alert.payload.destinations.map((entry) => [entry.name, entry.destination_type, entry.consecutive_failures, entry.last_http_status]), [
    ['Langfuse prod', 'langfuse', 12, 401],
    ['Datadog', 'datadog', 6, 401],
  ]);
  assert.equal(alert.payload.destinations[0].last_error, 'OTLP endpoint returned 401');
  assert.match(alert.dedupe_key, /^broadcast_destination_failing:10000000-0000-4000-8000-000000000001:\d{4}-\d{2}-\d{2}T\d{2}$/);
  assert.equal((await rows('select count(*)::int as n from public.broadcast_destination_health where alerted_at is not null'))[0].n, 2);

  // The same streak does not alert again, and the workspace waits an hour.
  assert.equal(await enqueue(), 0);
  await failing(recovering, ws(1), 9, { successMinutesAgo: 30 });
  assert.equal(await enqueue(), 0, 'a new failing destination waits for the hourly limit');
  await db.query(`update public.email_outbox set created_at = now() - interval '2 hours', dedupe_key = 'old'`);
  assert.equal(await enqueue(), 1);
  [, alert] = await alerts();
  assert.deepEqual(alert.payload.destinations.map((entry) => entry.name), ['Honeycomb']);

  // After recovering, a destination alerts again only once six hours have passed since its last alert.
  await db.query(`delete from public.email_outbox`);
  await failing(broken, ws(1), 8, { successMinutesAgo: 20, alertedMinutesAgo: 60 });
  assert.equal(await enqueue(), 0);
  await failing(broken, ws(1), 8, { successMinutesAgo: 20, alertedMinutesAgo: 7 * 60 });
  assert.equal(await enqueue(), 1);
  assert.deepEqual((await alerts())[0].payload.destinations.map((entry) => entry.name), ['Langfuse prod']);

  // Disabled destinations and failures older than a day are not alerted.
  await db.query(`delete from public.email_outbox`);
  await db.query(`update public.broadcast_destination_health set alerted_at = null`);
  await db.query(`update public.workspace_broadcast_destinations set enabled = false where workspace_id = $1 and id <> $2`, [ws(1), flaky]);
  await failing(flaky, ws(1), 6, { minutesAgo: 25 * 60 });
  assert.equal(await enqueue(), 0);

  // Clients cannot run the function.
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select public.enqueue_broadcast_destination_alerts()'), /permission denied/);
  await db.exec('reset role');

  console.log('broadcast destination alerts: ok');
} finally {
  await db.close();
}
