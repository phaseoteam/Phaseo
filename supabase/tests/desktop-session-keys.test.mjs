import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// The desktop app's key for a Phaseo login: members only, the desktop client's two scopes, 30 days, an authorisation it
// can use (restored if revoked, widened rather than narrowed if not), and earlier keys left alone: one per signed-in
// computer. keys_oauth_delegated_active_idx still allows OAuth sign-ins one active key per person, app and workspace.
const db = new PGlite();
const user = '10000000-0000-4000-8000-000000000001';
const ws = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const colleague = '10000000-0000-4000-8000-000000000002';
let sequence = 0;
const issue = async (workspace, ttl = 30 * 86400) => {
  const n = ++sequence;
  return (await db.query('select public.issue_desktop_session_key($1,$2,$3,$4,$5,$6,$7,$8) as expires_at',
    [user, workspace, `hash${n}`, `kid${n}`, `pre${n}`, 'Phaseo desktop', 'https://api.phaseo.app/v1', ttl])).rows[0].expires_at;
};
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, primary key (workspace_id, user_id));
    create table public.oauth_authorizations (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id text not null, workspace_id uuid not null,
      scopes text[] not null default '{}', created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz,
      constraint oauth_authorizations_user_client_workspace_unique unique (user_id, client_id, workspace_id));
    create table public.keys (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text, hash text, prefix text, status text,
      scopes jsonb, created_by uuid, kid text unique, key_kind text not null default 'standard', oauth_client_id text, oauth_user_id uuid,
      oauth_scopes text[], oauth_resource text, issued_via text not null default 'dashboard', expires_at timestamptz,
      constraint keys_issued_via_check check (issued_via in ('dashboard', 'oauth_pkce', 'cli', 'workload_identity')));
    -- Production's index before this change. Without it, keeping the earlier key looked fine here and failed there.
    create unique index keys_oauth_delegated_active_idx on public.keys (oauth_user_id, workspace_id, oauth_client_id)
      where key_kind = 'oauth_delegated' and status = 'active';
    insert into public.workspace_members values ('${ws}', '${user}');
    insert into public.keys (workspace_id, issued_via) values ('${ws}', 'oauth_pkce'), ('${ws}', 'workload_identity');
    -- An OAuth sign-in's key, expired but still marked active, and a colleague's desktop key in the same workspace.
    insert into public.keys (workspace_id, kid, status, key_kind, oauth_client_id, oauth_user_id, issued_via, expires_at) values
      ('${ws}', 'oauth-old', 'active', 'oauth_delegated', 'phaseo_desktop', '${user}', 'oauth_pkce', now() - interval '1 day'),
      ('${ws}', 'colleague', 'active', 'oauth_delegated', 'phaseo_desktop', '${colleague}', 'oauth_pkce', now() + interval '1 day');
  `);
  const migration = await readFile(new URL('../migrations/20261027094126_desktop_session_keys.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const perComputer = await readFile(new URL('../migrations/20261027121328_desktop_keys_one_per_computer.sql', import.meta.url), 'utf8');
  await db.exec(perComputer);
  const where = perComputer.slice(perComputer.indexOf('WHERE (('), perComputer.lastIndexOf(';'));
  const schema = await readFile(new URL('../schemas/public/functions/issue_desktop_session_key.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes(schema.slice(schema.indexOf('declare'), schema.indexOf('$function$;'))), 'the schema file matches the migration');
  const check = migration.match(/CONSTRAINT "keys_issued_via_check" CHECK \(.*\)(?= NOT VALID;)/)[0];
  const keysSchema = await readFile(new URL('../schemas/public/tables/keys.sql', import.meta.url), 'utf8');
  assert.ok(keysSchema.includes(`${check},`), 'keys.sql has the same issued_via check');
  assert.ok(keysSchema.includes(`CREATE UNIQUE INDEX keys_oauth_delegated_active_idx ON public.keys USING btree (oauth_user_id, workspace_id, oauth_client_id)
  ${where};`), 'keys.sql has the same index');

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(issue(ws), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal(await issue(other), null, 'not a member, no key');
  const expiresAt = await issue(ws);
  const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 29.99 && days < 30.01, `30 days, got ${days}`);
  assert.ok((await issue(ws, 10 * 365 * 86400)).getTime() - Date.now() <= 90 * 86_400_000 + 1000, 'capped at 90 days');
  await db.exec('reset role');

  const keys = (await db.query(`select key_kind, oauth_client_id, oauth_user_id, oauth_scopes, oauth_resource, issued_via, status, created_by
    from public.keys where issued_via = 'desktop' order by kid`)).rows;
  assert.deepEqual(keys.map(key => key.status), ['active', 'active'], 'each sign-in keeps its own key');
  assert.deepEqual((await db.query(`select kid, status from public.keys where kid in ('oauth-old', 'colleague') order by kid`)).rows,
    [{ kid: 'colleague', status: 'active' }, { kid: 'oauth-old', status: 'active' }], 'other keys are left alone');
  // OAuth sign-ins still get one active key per person, app and workspace.
  await assert.rejects(db.exec(`insert into public.keys (workspace_id, kid, status, key_kind, oauth_client_id, oauth_user_id, issued_via)
    values ('${ws}', 'oauth-new', 'active', 'oauth_delegated', 'phaseo_desktop', '${user}', 'oauth_pkce')`), /keys_oauth_delegated_active_idx/);
  assert.deepEqual(keys[0], { key_kind: 'oauth_delegated', oauth_client_id: 'phaseo_desktop', oauth_user_id: user, oauth_scopes: ['gateway:access', 'models:read'],
    oauth_resource: 'https://api.phaseo.app/v1', issued_via: 'desktop', status: 'active', created_by: user });
  assert.deepEqual((await db.query('select scopes, revoked_at from public.oauth_authorizations')).rows, [{ scopes: ['gateway:access', 'models:read'], revoked_at: null }]);

  // An earlier OAuth sign-in's wider authorisation stays wide; a revoked one comes back with only what the app needs.
  await db.exec(`update public.oauth_authorizations set scopes = array['email','gateway:access','openid']`);
  await db.exec('set role service_role'); await issue(ws); await db.exec('reset role');
  assert.deepEqual((await db.query('select scopes from public.oauth_authorizations')).rows[0].scopes, ['email', 'gateway:access', 'models:read', 'openid']);
  await db.exec(`update public.oauth_authorizations set revoked_at = now()`);
  await db.exec('set role service_role'); await issue(ws); await db.exec('reset role');
  assert.deepEqual((await db.query('select scopes, revoked_at from public.oauth_authorizations')).rows, [{ scopes: ['gateway:access', 'models:read'], revoked_at: null }]);
  // Keys from OIDC workload identity (#3243) still pass the widened check.
  await db.exec(`insert into public.keys (workspace_id, issued_via) values ('${ws}', 'workload_identity')`);
  await assert.rejects(db.exec(`insert into public.keys (workspace_id, issued_via) values ('${ws}', 'other')`), /keys_issued_via_check/);
  console.log('desktop session keys: ok');
} finally {
  await db.close();
}
