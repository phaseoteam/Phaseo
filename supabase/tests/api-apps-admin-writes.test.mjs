// Standalone PostgreSQL regression test for the 2026-11-04 access review: any workspace member could
// publish (is_public), rename or delete a workspace's apps through PostgREST. Writes to api_apps are now
// for workspace owners and admins; members still read their workspace's apps.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/api-apps-admin-writes.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_api_apps_admin_writes.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));
const tableSql = normalize(await read('../schemas/public/tables/api_apps.sql'));
const adminSql = normalize(await read('../schemas/public/functions/is_workspace_admin.sql'));

const db = new PGlite();
const workspace = '20000000-0000-4000-8000-000000000001';
const otherWorkspace = '20000000-0000-4000-8000-000000000002';
const owner = '10000000-0000-4000-8000-000000000001';
const admin = '10000000-0000-4000-8000-000000000002';
const member = '10000000-0000-4000-8000-000000000003';
const app = '30000000-0000-4000-8000-000000000001';

async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
async function rejects(promise, message) {
  await assert.rejects(promise, (error) => /row-level security/.test(String(error?.message ?? error)), message);
}

try {
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.workspaces (id uuid primary key, owner_user_id uuid);
    create table public.workspace_members (workspace_id uuid, user_id uuid, role text, primary key (workspace_id, user_id));
    create function public.is_workspace_member(p_team_id uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p_team_id and m.user_id = auth.uid()) $$;
    grant execute on function public.is_workspace_member(uuid) to authenticated;
    create or replace function public.mfa_satisfied() returns boolean language sql stable as 'select true';
    grant execute on function public.mfa_satisfied() to authenticated;
    -- The table file also carries the OAuth-client refusal (refuse_oauth_client_writes); these sessions have no client_id.
    create or replace function public.request_is_oauth_client() returns boolean language sql stable as 'select false';
    grant execute on function public.request_is_oauth_client() to authenticated;
  `);
  await db.exec(adminSql);
  await db.exec(tableSql);
  // The migration applies cleanly on top of the declared state and leaves it unchanged.
  await db.exec(migration);
  // The permissive policies grant writes; restrictive ones (MFA, OAuth clients) only narrow them.
  const policies = (await db.query(`select policyname, cmd, qual, with_check from pg_policies where tablename = 'api_apps' and permissive = 'PERMISSIVE' order by policyname`)).rows;
  for (const policy of policies.filter((row) => ['DELETE', 'INSERT', 'UPDATE'].includes(row.cmd))) {
    assert.match(`${policy.qual ?? ''} ${policy.with_check ?? ''}`, /is_workspace_admin/, `${policy.policyname} requires an owner or admin`);
    assert.doesNotMatch(`${policy.qual ?? ''} ${policy.with_check ?? ''}`, /is_workspace_member/, `${policy.policyname} no longer accepts any member`);
  }
  assert.match(policies.find((row) => row.cmd === 'SELECT').qual, /is_workspace_member/, 'members still read their apps');

  await db.exec(`
    insert into public.workspaces values ('${workspace}', '${owner}'), ('${otherWorkspace}', null);
    insert into public.workspace_members values ('${workspace}', '${owner}', 'owner'), ('${workspace}', '${admin}', 'admin'), ('${workspace}', '${member}', 'member');
    insert into public.api_apps (id, workspace_id, app_key, title, is_public) values ('${app}', '${workspace}', 'app', 'App', false);
  `);

  // A plain member reads the app but cannot publish, rename, add or delete apps.
  await as(member, async () => {
    assert.equal((await db.query(`select id from public.api_apps`)).rows.length, 1, 'members read their workspace apps');
    assert.equal((await db.query(`update public.api_apps set is_public = true, title = 'Mine' where id = '${app}' returning id`)).rows.length, 0, 'a member cannot publish or rename an app');
    assert.equal((await db.query(`delete from public.api_apps where id = '${app}' returning id`)).rows.length, 0, 'a member cannot delete an app');
    await rejects(db.query(`insert into public.api_apps (workspace_id, app_key, title, url) values ('${workspace}', 'new', 'New', 'https://new.example')`), 'a member cannot add an app');
  });
  const unchanged = (await db.query(`select is_public, title from public.api_apps where id = '${app}'`)).rows[0];
  assert.deepEqual(unchanged, { is_public: false, title: 'App' });

  // Admins and the workspace owner can.
  await as(admin, async () => {
    assert.equal((await db.query(`update public.api_apps set is_public = true where id = '${app}' returning id`)).rows.length, 1, 'an admin publishes an app');
    await db.query(`insert into public.api_apps (workspace_id, app_key, title, url) values ('${workspace}', 'admin', 'Admin', 'https://admin.example')`);
    await rejects(db.query(`insert into public.api_apps (workspace_id, app_key, title, url) values ('${otherWorkspace}', 'x', 'X', 'https://x.example')`), 'an admin cannot add apps to another workspace');
  });
  await as(owner, async () => {
    assert.equal((await db.query(`delete from public.api_apps where app_key = 'admin' returning id`)).rows.length, 1, 'the owner deletes an app');
  });
  console.log('api-apps-admin-writes: ok');
} finally {
  await db.close();
}
