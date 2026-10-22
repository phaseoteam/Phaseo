import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trimEnd());
const storageMigration = await read('../migrations/20261022100000_key_storage_locations.sql');
const migration = await read('../migrations/20261022123000_key_storage_incidents.sql');
const files = [
  'tables/key_storage_incidents.sql',
  'tables/key_storage_incident_keys.sql',
  'functions/preview_key_storage_incident.sql',
  'functions/apply_key_storage_incident.sql',
  'functions/key_storage_incident_recipients.sql',
  'functions/workspace_key_storage_incidents.sql',
];
// The migration must carry the declarative files exactly.
for (const file of files) assert.ok(migration.includes(await read(`../schemas/public/${file}`)), `migration includes ${file}`);

const a = '00000000-0000-4000-8000-0000000000aa';
const b = '00000000-0000-4000-8000-0000000000bb';
const c = '00000000-0000-4000-8000-0000000000cc';
const ownerA = '00000000-0000-4000-8000-0000000000a1';
const adminA = '00000000-0000-4000-8000-0000000000a2';
const memberA = '00000000-0000-4000-8000-0000000000a3';
const ownerB = '00000000-0000-4000-8000-0000000000b1';
const staff = '00000000-0000-4000-8000-0000000000f1';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create type public.workspace_role as enum ('owner', 'admin', 'member');
    create table public.workspaces (id uuid primary key, name text not null, owner_user_id uuid not null);
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, role public.workspace_role not null);
    create table public.workspace_audit_events (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, actor_user_id uuid, action text not null,
      target_type text not null, target_id text not null, target_name text, metadata jsonb not null default '{}', request_id text
    );
    create table public.keys (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      name text not null,
      kid text,
      prefix text not null default 'abc123',
      status text not null default 'active',
      key_kind text not null default 'standard',
      created_at timestamptz not null default now(),
      revoked_at timestamptz,
      revoked_reason text
    );
    insert into auth.users values ('${ownerA}', 'owner-a@example.com'), ('${adminA}', 'admin-a@example.com'), ('${memberA}', 'member-a@example.com'), ('${ownerB}', 'owner-b@example.com'), ('${staff}', 'staff@phaseo.app');
    insert into public.workspaces values ('${a}', 'Acme', '${ownerA}'), ('${b}', 'Beta', '${ownerB}'), ('${c}', 'Calm', '${ownerB}');
    insert into public.workspace_members values ('${a}', '${ownerA}', 'owner'), ('${a}', '${adminA}', 'admin'), ('${a}', '${memberA}', 'member'), ('${b}', '${ownerB}', 'owner');
  `);
  await db.exec(storageMigration);
  await db.exec(`
    insert into public.keys (workspace_id, name, kid, status, created_at, storage_locations) values
      ('${a}', 'a railway', 'kid-a1', 'active', now() - interval '10 days', array['railway', 'github']),
      ('${a}', 'a railway paused', 'kid-a2', 'paused', now() - interval '10 days', array['railway']),
      ('${a}', 'a vercel', 'kid-a3', 'active', now() - interval '10 days', array['vercel']),
      ('${a}', 'a railway new', 'kid-a4', 'active', now(), array['railway']),
      ('${a}', '__chat_route_managed_key__', 'kid-a5', 'active', now() - interval '10 days', array['railway']),
      ('${b}', 'b railway', 'kid-b1', 'active', now() - interval '10 days', array['railway']),
      ('${b}', 'b railway deleted', 'kid-b2', 'deleted', now() - interval '10 days', array['railway']),
      ('${c}', 'c none', 'kid-c1', 'active', now() - interval '10 days', '{}');
  `);
  await db.exec(migration);

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const preview = async (action) => (await db.query(`select * from public.preview_key_storage_incident('railway', $1, $2)`, [cutoff, action])).rows[0];
  assert.deepEqual(await preview('revoke'), { keys: 3, workspaces: 2 });
  // Pausing leaves already-paused keys alone.
  assert.deepEqual(await preview('pause'), { keys: 2, workspaces: 2 });

  // Bad incidents are refused.
  for (const [column, value] of [['location_id', 'Railway'], ['action', 'delete'], ['source_url', 'http://example.com'], ['title', ' ']]) {
    await assert.rejects(db.query(
      `insert into public.key_storage_incidents (location_id, action, keys_created_before, title, customer_message, source_url) values ($1, $2, now(), $3, 'msg', $4)`,
      [column === 'location_id' ? value : 'railway', column === 'action' ? value : 'revoke', column === 'title' ? value : 'Railway breach', column === 'source_url' ? value : null],
    ), /check constraint/, column);
  }

  const incident = (await db.query(
    `insert into public.key_storage_incidents (location_id, action, keys_created_before, title, customer_message, source_url, declared_by)
     values ('railway', 'revoke', $1, 'Railway breach', 'Railway reported that environment variables were exposed.', 'https://blog.railway.com/p/security', $2) returning id`,
    [cutoff, staff],
  )).rows[0].id;

  const changed = (await db.query(`select * from public.apply_key_storage_incident($1)`, [incident])).rows;
  assert.deepEqual(changed.map((row) => row.kid).sort(), ['kid-a1', 'kid-a2', 'kid-b1']);

  const keys = Object.fromEntries((await db.query(`select name, status, revoked_reason, revoked_at from public.keys`)).rows.map((row) => [row.name, row]));
  for (const name of ['a railway', 'a railway paused', 'b railway']) {
    assert.equal(keys[name].status, 'revoked', name);
    assert.equal(keys[name].revoked_reason, `storage_incident:${incident}`);
    assert.ok(keys[name].revoked_at instanceof Date);
  }
  // Untouched: another location, created after the cut-off, Phaseo's managed key, deleted, other workspace.
  assert.equal(keys['a vercel'].status, 'active');
  assert.equal(keys['a railway new'].status, 'active');
  assert.equal(keys['__chat_route_managed_key__'].status, 'active');
  assert.equal(keys['b railway deleted'].status, 'deleted');
  assert.equal(keys['c none'].status, 'active');
  // Revoked keys stay revoked.
  await assert.rejects(db.exec(`update public.keys set status = 'active' where name = 'a railway'`), /key_revoked_locked/);

  const record = (await db.query(`select applied_at, affected_keys, affected_workspaces from public.key_storage_incidents where id = $1`, [incident])).rows[0];
  assert.ok(record.applied_at instanceof Date);
  assert.equal(record.affected_keys, 3);
  assert.equal(record.affected_workspaces, 2);
  const previous = (await db.query(`select previous_status from public.key_storage_incident_keys where incident_id = $1 order by previous_status`, [incident])).rows.map((row) => row.previous_status);
  assert.deepEqual(previous, ['active', 'active', 'paused']);

  const audit = (await db.query(`select workspace_id, actor_user_id, action, metadata from public.workspace_audit_events order by target_name`)).rows;
  assert.equal(audit.length, 3);
  assert.ok(audit.every((row) => row.action === 'api_key.revoked' && row.actor_user_id === null && row.metadata.source === 'storage_incident' && row.metadata.storageLocation === 'railway'));

  // Applying twice is refused and changes nothing.
  await assert.rejects(db.query(`select * from public.apply_key_storage_incident($1)`, [incident]), /incident_already_applied/);
  await assert.rejects(db.query(`select * from public.apply_key_storage_incident($1)`, ['00000000-0000-4000-8000-000000000000']), /incident_not_found/);

  // Owners and admins of each affected workspace, not members, once each.
  const recipients = (await db.query(`select workspace_name, email, keys from public.key_storage_incident_recipients($1)`, [incident])).rows;
  assert.deepEqual(recipients.map((row) => `${row.workspace_name}:${row.email}:${row.keys}`).sort(), [
    'Acme:admin-a@example.com:2', 'Acme:owner-a@example.com:2', 'Beta:owner-b@example.com:1',
  ]);

  // Each workspace sees only its own changes.
  const notices = (await db.query(`select * from public.workspace_key_storage_incidents($1)`, [a])).rows;
  assert.equal(notices.length, 1);
  assert.equal(notices[0].keys, 2);
  assert.equal(notices[0].location_id, 'railway');
  assert.equal((await db.query(`select * from public.workspace_key_storage_incidents($1)`, [c])).rows.length, 0);

  // A pause incident pauses only active keys and records their status.
  const pause = (await db.query(
    `insert into public.key_storage_incidents (location_id, action, keys_created_before, title, customer_message) values ('vercel', 'pause', now(), 'Vercel check', 'Precaution.') returning id`,
  )).rows[0].id;
  assert.equal((await db.query(`select * from public.apply_key_storage_incident($1)`, [pause])).rows.length, 1);
  const vercel = (await db.query(`select status, revoked_reason from public.keys where name = 'a vercel'`)).rows[0];
  assert.deepEqual(vercel, { status: 'paused', revoked_reason: null });

  // Only the service role may use them.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query(`select * from public.preview_key_storage_incident('railway', now())`), /permission denied/, role);
    await assert.rejects(db.query(`select * from public.apply_key_storage_incident($1)`, [incident]), /permission denied/, role);
    await assert.rejects(db.query(`select * from public.key_storage_incidents`), /permission denied/, role);
    await db.exec('reset role');
  }

  console.log('key-storage-incidents: ok');
} finally {
  await db.close();
}
