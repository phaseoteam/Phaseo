// Standalone PostgreSQL regression test for the 2026-11-04 workspace permissions review. Each case runs
// first on production's policies, grants and trigger functions from before the fix
// (fixtures/workspace-role-rules-before.sql) to show the bug, then on the real migration:
// 1. workspace_members: an admin could add any user (with a forged joined_at), promote a member to admin
//    and remove another admin through the Data API. Now nobody signed in inserts members, only the owner
//    changes roles (and only the role column), and only the owner removes others; anyone may leave.
// 2. Join requests: the write-rules trigger read the old team_invites table, so accepting an invite and
//    approving the request both failed. Now invite -> join request -> approval works.
// 3. Single sign-on: an admin could write any provider identifier, and two workspaces could claim the same
//    provider. Now the sso_* columns are written by the service role only and an enabled provider has one
//    workspace. Disabled configurations don't reserve it. If enabled duplicates already exist, the migration
//    fails and rolls back rather than leaving uniqueness unenforced.
// 4. Join-request approval: an invite created with the admin role made the requester an admin whoever
//    approved it. Now only the workspace owner can approve someone as an admin, in both approval functions.
//    The management approval function also failed on every call (ambiguous ON CONFLICT); now it works.
// 6. Management keys act with their creator's current role, so an admin who could move a hash they know onto
//    a key the owner created would act as the owner. With the key table lockdown
//    (20261104223750_lock_down_key_tables) applied as well, an admin can neither move a hash nor change or
//    forge a key's creator.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/workspace-role-rules.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
// The migration is three files, split by what they lock (see the lock plan below).
const migrationNames = migrations.filter((name) => /_enforce_workspace_role_rules_\d_[a-z_]+\.sql$/.test(name)).sort();
assert.deepEqual(migrationNames.map((name) => name.replace(/^\d+_/, '')), ['enforce_workspace_role_rules_1_functions.sql',
  'enforce_workspace_role_rules_2_member_policies.sql', 'enforce_workspace_role_rules_3_sso_index.sql'], 'the migration is three files, in order');
const migrationName = migrationNames[0];
const migrationFiles = await Promise.all(migrationNames.map(async (name) => normalize(await read(`../migrations/${name}`))));
const migration = migrationFiles.join('\n');
assert(migrationNames[0] > migrations.filter((name) => !migrationNames.includes(name)).sort().at(-1), 'the migration files are the newest');

// Lock plan: each file starts with a lock timeout and locks at most one table strongly. Functions take
// no table locks; the policies lock only workspace_members; the index locks only workspace_settings.
const strongLocks = (sql) => [...sql.matchAll(/^\s*(?:ALTER TABLE|CREATE (?:UNIQUE )?INDEX|DROP INDEX|CREATE TRIGGER|DROP TRIGGER|CREATE POLICY|DROP POLICY|ALTER POLICY|REVOKE [^;]* ON TABLE|GRANT [^;]* ON TABLE|LOCK TABLE|TRUNCATE)[^;]*?\bON (?:TABLE )?"?public"?\."?([a-z_]+)"?/gim)].map(([, table]) => table);
for (const sql of migrationFiles) assert(sql.startsWith("SET LOCAL lock_timeout = '10s';"), 'each file starts with a lock timeout');
assert.deepEqual(strongLocks(migrationFiles[0]), [], 'part 1 (functions) locks no table');
assert.deepEqual([...new Set(strongLocks(migrationFiles[1]))], ['workspace_members'], 'part 2 locks only workspace_members');
assert.deepEqual([...new Set(strongLocks(migrationFiles[2]))], ['workspace_settings'], 'part 3 locks only workspace_settings');
assert(!/CREATE (?:OR REPLACE )?FUNCTION/i.test(migrationFiles[1] + migrationFiles[2]), 'function changes are only in part 1');
// #3587 refuses OAuth client tokens on workspace_members with restrictive policies, one migration per table.
const oauthMembersName = migrations.find((name) => name.endsWith('_oauth_client_policies_workspace_members.sql'));
assert(oauthMembersName && oauthMembersName < migrationName, "#3587's workspace_members policies apply before this migration");
const oauthMembersMigration = normalize(await read(`../migrations/${oauthMembersName}`));
const keyMigrationName = migrations.find((name) => name.endsWith('_lock_down_key_tables.sql'));
assert(keyMigrationName && keyMigrationName < migrationName, 'the key table lockdown is applied before this migration');
const keyMigration = normalize(await read(`../migrations/${keyMigrationName}`));
const keysSql = normalize(await read('../schemas/public/tables/keys.sql'));
const managementKeysSql = normalize(await read('../schemas/public/tables/management_keys.sql'));
// The real key tables' columns (without constraints) and policies.
const tableColumns = (sql) => sql.slice(sql.indexOf('(') + 1, sql.indexOf('\n);')).split('\n')
  .map((line) => line.trim().replace(/,$/, '')).filter((line) => line.startsWith('"')).join(',\n');
const tablePolicies = (sql) => sql.match(/CREATE POLICY [\s\S]*?;/g).join('\n');

// The declarative files describe the same end state.
for (const fn of ['enforce_workspace_join_request_write_rules', 'protect_data_contribution_settings',
  'approve_workspace_join_request', 'management_decide_workspace_join_request']) {
  const sql = normalize(await read(`../schemas/public/functions/${fn}.sql`));
  const body = sql.slice(sql.indexOf('$function$'), sql.lastIndexOf('$function$') + 10);
  assert(body.length > 20 && migration.includes(body), `the migration ships the schema body of ${fn}`);
  assert(!body.includes('team_invites'), `${fn} uses the current tables`);
}
const membersSql = normalize(await read('../schemas/public/tables/workspace_members.sql'));
assert(!membersSql.includes('team_members_insert_admin') && !membersSql.includes('team_members_update_admin'), 'the admin insert and update policies are gone');
assert(membersSql.includes('GRANT DELETE, SELECT ON TABLE "public"."workspace_members" TO "authenticated";'), 'signed-in users can no longer insert members');
assert(membersSql.includes('GRANT UPDATE ("role") ON TABLE "public"."workspace_members" TO "authenticated";'), 'only the role column is updatable');
assert(membersSql.includes('GRANT SELECT ON TABLE "public"."workspace_members" TO "anon";'), 'anon only reads (and RLS gives it nothing)');
assert(membersSql.includes('CREATE POLICY "workspace_members_update_owner"'), 'the owner-only update policy is declared');
const settingsSql = normalize(await read('../schemas/public/tables/workspace_settings.sql'));
const ssoIndex = 'CREATE UNIQUE INDEX workspace_settings_sso_provider_identifier_key ON public.workspace_settings USING btree (sso_provider_identifier)\n  WHERE (sso_enabled AND (sso_provider_identifier IS NOT NULL));';
assert(settingsSql.includes(ssoIndex), 'the declarative settings table has the one-workspace-per-provider index');
assert(migration.includes(ssoIndex.replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS')),
  'the migration creates the same index');

const ws = '10000000-0000-4000-8000-000000000001';
const otherWs = '10000000-0000-4000-8000-000000000002';
const owner = '20000000-0000-4000-8000-000000000001';
const admin = '20000000-0000-4000-8000-000000000002';
const admin2 = '20000000-0000-4000-8000-000000000003';
const member = '20000000-0000-4000-8000-000000000004';
const outsider = '20000000-0000-4000-8000-000000000005';
const requester = '20000000-0000-4000-8000-000000000006';
const requester2 = '20000000-0000-4000-8000-000000000007';
const requester3 = '20000000-0000-4000-8000-000000000008';
const requester4 = '20000000-0000-4000-8000-000000000009';
const requester5 = '20000000-0000-4000-8000-00000000000a';
const provider = '30000000-0000-4000-8000-000000000001';
const ownerMk = '40000000-0000-4000-8000-000000000001';
const adminMk = '40000000-0000-4000-8000-000000000002';
const db = new PGlite();

async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
// A token an OAuth client (the CLI, the desktop app, a third-party app) was issued: the same person, with a client_id.
async function asApp(user, fn) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, role: 'authenticated', client_id: 'phaseo_cli' })]);
  try { return await as(user, fn); } finally { await db.exec(`select set_config('request.jwt.claims', '', false);`); }
}
async function asService(fn) {
  await db.exec('set role service_role');
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const affected = (result) => result.affectedRows ?? 0;
const roleOf = async (user) => (await db.query('select role::text from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, user])).rows[0]?.role ?? null;
const ssoIndexExists = async () => (await db.query(
  `select 1 from pg_indexes where schemaname = 'public' and indexname = 'workspace_settings_sso_provider_identifier_key'`)).rows.length === 1;
const enableSso = (workspaceId, enabled = true) => asService(() => db.query(
  `update public.workspace_settings set sso_enabled = $3, sso_mode = 'saml', sso_provider_identifier = $2 where workspace_id = $1`,
  [workspaceId, provider, enabled]));
const adminInvite = () => asService(async () => (await db.query(
  `insert into public.workspace_invites (workspace_id, creator_user_id, role) values ($1, $2, 'admin') returning id`, [ws, owner])).rows[0].id);
const joinAs = (user, inviteId) => asService(async () => (await db.query(
  `insert into public.workspace_join_requests (workspace_id, invite_id, requester_user_id) values ($1, $2, $3) returning id`, [ws, inviteId, user])).rows[0].id);
const approveAs = (user, requestId) => as(user, () => db.query('select * from public.approve_workspace_join_request($1)', [requestId]));
const decideAs = (actor, requestId) => asService(() => db.query(
  `select * from public.management_decide_workspace_join_request($1, $2, 'approve', $3)`, [ws, requestId, actor]));
const decideWithRole = (actor, requestId, role) => asService(() => db.query(
  `select * from public.management_decide_workspace_join_request(p_workspace_id => $1, p_request_id => $2, p_decision => 'approve', p_actor_user_id => $3, p_role => $4)`,
  [ws, requestId, actor, role]));
const usesOf = async (inviteId) => (await db.query('select uses_count from public.workspace_invites where id = $1', [inviteId])).rows[0].uses_count;
const statusOf = async (requestId) => (await db.query('select status::text from public.workspace_join_requests where id = $1', [requestId])).rows[0].status;
const sso = (user, workspaceId) => as(user, () => db.query(
  `update public.workspace_settings set sso_mode = 'saml', sso_provider_identifier = $2, sso_domains = array['victim.example'] where workspace_id = $1`,
  [workspaceId, provider]));
const createInvite = () => asService(async () => (await db.query(
  `insert into public.workspace_invites (workspace_id, creator_user_id, role) values ($1, $2, 'member') returning id`, [ws, admin])).rows[0].id);
const requestToJoin = (inviteId) => as(requester, () => db.query(
  `insert into public.workspace_join_requests (workspace_id, invite_id, requester_user_id) values ($1, $2, $3) returning id`, [ws, inviteId, requester]));

try {
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.jwt() to anon, authenticated, service_role;
    -- These users have no MFA factors (require_mfa_for_data_api).
    create function public.mfa_satisfied() returns boolean language sql stable as 'select true';
    grant execute on function public.mfa_satisfied() to anon, authenticated, service_role;
    ${await read('../schemas/public/types/workspace_role.sql')}
    ${await read('../schemas/public/types/join_request_status.sql')}

    create table public.users (user_id uuid primary key);
    create table public.workspaces (id uuid primary key, owner_user_id uuid references public.users(user_id));
    alter table public.workspaces enable row level security;
    create table public.workspace_members (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      user_id uuid not null references public.users(user_id) on delete cascade,
      joined_at timestamptz not null default (now() at time zone 'utc'),
      last_accessed_at timestamptz,
      role public.workspace_role not null,
      constraint workspace_members_pkey primary key (workspace_id, user_id));
    alter table public.workspace_members enable row level security;
    create table public.workspace_invites (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
      creator_user_id uuid not null, expires_at timestamptz not null default now() + interval '7 days',
      max_uses integer, uses_count integer not null default 0,
      role public.workspace_role not null default 'member');
    alter table public.workspace_invites enable row level security;
    create table public.workspace_join_requests (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
      invite_id uuid references public.workspace_invites(id) on delete set null, requester_user_id uuid not null,
      decided_by uuid, decided_at timestamptz, created_at timestamptz not null default now(),
      status public.join_request_status not null default 'pending');
    alter table public.workspace_join_requests enable row level security;
    create table public.workspace_settings (
      workspace_id uuid primary key references public.workspaces(id),
      io_logging_enabled boolean not null default false,
      sso_enabled boolean not null default false, sso_enforced boolean not null default false,
      sso_mode text not null default 'none', sso_provider_identifier text, sso_domains text[] not null default '{}'::text[],
      data_contribution_enabled boolean not null default false, data_contribution_policy_version text,
      data_contribution_consented_at timestamptz, data_contribution_consented_by uuid,
      data_contribution_sample_rate_bps integer not null default 10000,
      data_contribution_classifier_sample_rate_bps integer not null default 1000,
      data_contribution_discount_bps integer not null default 100,
      io_logging_billing_status text not null default 'active', io_logging_grace_until timestamptz,
      io_logging_last_billed_at timestamptz, io_logging_last_billing_warning_at timestamptz,
      io_logging_last_billing_warning_kind text, io_logging_price_per_million_units_nanos bigint not null default 0);
    alter table public.workspace_settings enable row level security;
    -- The directory functions and lock triggers are exercised in workspace-directory-owner-rules.test.mjs
    -- and scripts/workspace-directory-lock-smoke.mjs; here they only need to compile, with the columns the
    -- lock triggers name.
    create table public.workspace_departments (id uuid primary key, workspace_id uuid not null, name text);
    create table public.scim_group_mappings (id uuid primary key, workspace_id uuid not null, scim_group_id uuid, department_id uuid,
      access_role text, department_position text);
    create table public.scim_group_members (workspace_id uuid not null, group_id uuid, user_id uuid);
    create table public.scim_users (id uuid primary key, workspace_id uuid not null, auth_user_id uuid, active boolean, department text);
    create table public.scim_groups (id uuid primary key, workspace_id uuid not null);
    create table public.workspace_member_overrides (workspace_id uuid not null, user_id uuid not null, access_role text,
      department_override_enabled boolean, department_id uuid, department_position text);
    create table public.workspace_department_grants (workspace_id uuid not null, user_id uuid, department_id uuid, source_type text,
      source_id uuid, position text, is_primary boolean);
  `);
  // Unchanged function files, loaded as they are declared.
  for (const fn of ['request_is_oauth_client', 'is_workspace_member', 'is_workspace_admin', 'is_active_invite_for_workspace',
    'enforce_workspace_member_role_policy', 'enforce_workspace_invite_role_policy']) {
    await db.exec(await read(`../schemas/public/functions/${fn}.sql`));
  }
  await db.exec(await read('./fixtures/workspace-role-rules-before.sql'));
  await db.exec(`
    create table public.keys (${tableColumns(keysSql)}, constraint keys_pkey primary key (id), constraint keys_hash_key unique (hash));
    alter table public.keys enable row level security;
    create table public.management_keys (${tableColumns(managementKeysSql)},
      constraint management_keys_pkey primary key (id), constraint provisioning_keys_hash_key unique (hash));
    alter table public.management_keys enable row level security;
    ${tablePolicies(keysSql)}
    ${tablePolicies(managementKeysSql)}
    ${await read('../schemas/public/functions/protect_key_created_by.sql')}
    ${await read('../schemas/public/functions/protect_revoked_key_status.sql')}
    create trigger protect_management_key_created_by before insert or update of created_by on public.management_keys
      for each row execute function public.protect_key_created_by();
    create table public.gateway_provider_events (id bigint primary key, workspace_id uuid);
    create table public.gateway_wallet_reservations (id bigint primary key, workspace_id uuid, amount bigint);
    -- Production's key table grants before the lockdown.
    grant delete, insert, select, update on public.keys, public.management_keys to anon, authenticated;
    grant all on public.keys, public.management_keys, public.gateway_provider_events, public.gateway_wallet_reservations to service_role;
  `);

  await db.exec(`
    insert into public.users values ('${owner}'), ('${admin}'), ('${admin2}'), ('${member}'), ('${outsider}'), ('${requester}'),
      ('${requester2}'), ('${requester3}'), ('${requester4}'), ('${requester5}');
    insert into public.workspaces values ('${ws}', '${owner}'), ('${otherWs}', '${outsider}');
    insert into public.workspace_members (workspace_id, user_id, role) values
      ('${ws}', '${owner}', 'owner'), ('${ws}', '${admin}', 'admin'), ('${ws}', '${admin2}', 'admin'), ('${ws}', '${member}', 'member'),
      ('${otherWs}', '${outsider}', 'owner');
    insert into public.workspace_settings (workspace_id) values ('${ws}'), ('${otherWs}');
    insert into public.management_keys (id, workspace_id, name, hash, prefix, scopes, kid, created_by, status) values
      ('${ownerMk}', '${ws}', 'Owner key', 'owner-mk-hash', 'cccccc', '["workspaces:delete"]', 'ownermk', '${owner}', 'active'),
      ('${adminMk}', '${ws}', 'Admin key', 'admin-mk-hash', 'dddddd', '["workspaces:delete"]', 'adminmk', '${admin}', 'active');
  `);

  // ---------- Before the fix ----------
  // 1. An admin adds an arbitrary user with a backdated joined_at, promotes a member and removes an admin.
  await as(admin, () => db.query(
    `insert into public.workspace_members (workspace_id, user_id, role, joined_at) values ($1, $2, 'member', '2000-01-01')`, [ws, outsider]));
  assert.equal(await roleOf(outsider), 'member', 'before the fix an admin can add anyone');
  assert.equal(affected(await as(admin, () => db.query(`update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2`, [ws, member]))), 1);
  assert.equal(await roleOf(member), 'admin', 'before the fix an admin can make someone an admin');
  assert.equal(affected(await as(admin, () => db.query('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, admin2]))), 1);
  assert.equal(await roleOf(admin2), null, 'before the fix an admin can remove another admin');
  // 2. Accepting an invite fails.
  const oldInvite = await createInvite();
  await assert.rejects(requestToJoin(oldInvite), /team_invites/, 'before the fix every join request with an invite fails');
  // 3. Two workspaces claim the same identity provider through the Data API.
  assert.equal(affected(await sso(admin, ws)), 1);
  assert.equal(affected(await sso(outsider, otherWs)), 1, 'before the fix another workspace can claim the same provider');
  // 4. An admin approves an admin invite with either approval function. (The broken write-rules trigger is
  //    bypassed here so the old approval functions can be reached at all.)
  await db.exec('alter table public.workspace_join_requests disable trigger workspace_join_requests_write_rules_guard');
  await approveAs(admin, await joinAs(requester2, await adminInvite()));
  assert.equal(await roleOf(requester2), 'admin', 'before the fix an admin approves someone as an admin');
  // The management function could not approve anyone: its ON CONFLICT clause was ambiguous.
  await assert.rejects(decideAs(owner, await joinAs(requester3, await createInvite())), /column reference "workspace_id" is ambiguous/,
    'before the fix every management API approval fails');
  await db.exec('alter table public.workspace_join_requests enable trigger workspace_join_requests_write_rules_guard');

  // 6. An admin moves the hash of their own management key onto the owner's: the secret they hold now
  //    authenticates as the owner's key, which acts with the owner's role.
  await as(admin, async () => {
    await db.query(`update public.management_keys set hash = 'parked' where id = $1`, [adminMk]);
    await db.query(`update public.management_keys set hash = 'admin-mk-hash' where id = $1`, [ownerMk]);
  });
  assert.equal((await db.query('select hash from public.management_keys where id = $1', [ownerMk])).rows[0].hash, 'admin-mk-hash',
    "before the key table lockdown an admin's hash lands on the owner's management key");
  await db.exec(`update public.management_keys set hash = 'owner-mk-hash' where id = '${ownerMk}';
    update public.management_keys set hash = 'admin-mk-hash' where id = '${adminMk}';`);

  // Put the rows back as they were.
  await db.exec(`
    delete from public.workspace_members where workspace_id = '${ws}' and user_id = '${outsider}';
    update public.workspace_members set role = 'member' where workspace_id = '${ws}' and user_id = '${member}';
    insert into public.workspace_members (workspace_id, user_id, role) values ('${ws}', '${admin2}', 'admin');
    delete from public.workspace_members where user_id in ('${requester2}', '${requester3}');
    delete from public.workspace_join_requests;
    delete from public.workspace_invites;
  `);

  // Production applies the key table lockdown before this migration.
  await db.exec(keyMigration);

  // 5. Two enabled workspaces already share a provider. Each file is its own transaction: parts 1 and 2
  //    apply, and part 3 fails loudly without creating the index or changing any settings. Once the
  //    duplicate is resolved, all three files apply again (they are re-runnable) and create the index.
  await enableSso(ws);
  await enableSso(otherWs);
  const settingsBefore = (await db.query('select * from public.workspace_settings order by workspace_id')).rows;
  // Production order: #3587's restrictive OAuth client policies, then this migration's three files.
  await db.exec(oauthMembersMigration);
  await db.exec(migrationFiles[0]);
  await db.exec(migrationFiles[1]);
  await assert.rejects(db.exec(migrationFiles[2]), /could not create unique index "workspace_settings_sso_provider_identifier_key"/);
  assert.deepEqual((await db.query('select * from public.workspace_settings order by workspace_id')).rows, settingsBefore,
    'the failed part 3 changes no settings');
  assert.equal(await ssoIndexExists(), false);
  assert.equal((await db.query("select 1 from pg_policies where policyname = 'team_members_insert_admin'")).rows.length, 0,
    'parts 1 and 2 stay applied');
  await db.exec(`update public.workspace_settings set sso_enabled = false, sso_mode = 'none', sso_provider_identifier = null, sso_domains = '{}';`);
  for (const sql of migrationFiles) await db.exec(sql);
  assert.equal(await ssoIndexExists(), true, 'the index is created once there are no duplicates');

  // ---------- After the fix ----------
  // 1. Nobody signed in inserts members, not even the owner.
  for (const user of [admin, owner]) {
    await assert.rejects(as(user, () => db.query(
      `insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, outsider])), /permission denied/);
  }
  assert.equal(await roleOf(outsider), null);
  // Only the owner changes roles, and only the role column.
  assert.equal(affected(await as(admin, () => db.query(`update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2`, [ws, member]))), 0);
  assert.equal(await roleOf(member), 'member', 'an admin can no longer promote anyone');
  assert.equal(affected(await as(admin, () => db.query(`update public.workspace_members set role = 'member' where workspace_id = $1 and user_id = $2`, [ws, admin2]))), 0);
  assert.equal(await roleOf(admin2), 'admin', 'an admin can no longer demote another admin');
  assert.equal(affected(await as(owner, () => db.query(`update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2`, [ws, member]))), 1);
  assert.equal(await roleOf(member), 'admin', 'the owner still changes roles');
  await as(owner, () => db.query(`update public.workspace_members set role = 'member' where workspace_id = $1 and user_id = $2`, [ws, member]));
  for (const user of [owner, admin]) {
    await assert.rejects(as(user, () => db.query(`update public.workspace_members set joined_at = '2000-01-01' where workspace_id = $1 and user_id = $2`, [ws, member])), /permission denied/);
    await assert.rejects(as(user, () => db.query(`update public.workspace_members set user_id = $2 where workspace_id = $1 and user_id = $3`, [ws, outsider, member])), /permission denied/);
  }
  await assert.rejects(as(owner, () => db.query(`update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2`, [ws, member])), /owner_role_reserved_for_workspace_owner/);
  // Only the owner removes someone else; anyone may leave; nobody removes the owner.
  assert.equal(affected(await as(admin, () => db.query('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, admin2]))), 0);
  assert.equal(await roleOf(admin2), 'admin', 'an admin can no longer remove another admin');
  assert.equal(affected(await as(admin, () => db.query('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, owner]))), 0);
  assert.equal(affected(await as(owner, () => db.query('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, owner]))), 0);
  assert.equal(await roleOf(owner), 'owner', 'nobody removes the owner');
  assert.equal(affected(await as(admin2, () => db.query('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, admin2]))), 1);
  assert.equal(await roleOf(admin2), null, 'an admin can leave');
  assert.equal(affected(await as(owner, () => db.query('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, member]))), 1);
  assert.equal(await roleOf(member), null, 'the owner removes members');
  // anon writes nothing.
  await assert.rejects(db.exec(`set role anon; insert into public.workspace_members (workspace_id, user_id, role) values ('${ws}', '${outsider}', 'member');`), /permission denied/);
  await db.exec('reset role');

  // 2. Invite -> join request -> approval works, and the requester joins with the invite's role.
  const invite = await createInvite();
  const joinRequest = (await requestToJoin(invite)).rows[0].id;
  const approved = await as(admin, () => db.query('select * from public.approve_workspace_join_request($1)', [joinRequest]));
  assert.equal(approved.rows[0].requester_user_id, requester);
  assert.equal(await roleOf(requester), 'member', 'the approved requester is a member');
  const decided = (await db.query('select status::text, decided_by from public.workspace_join_requests where id = $1', [joinRequest])).rows[0];
  assert.deepEqual(decided, { status: 'approved', decided_by: admin });
  assert.equal((await db.query('select uses_count from public.workspace_invites where id = $1', [invite])).rows[0].uses_count, 1);
  // A join request that names another workspace's invite is still refused.
  const foreignInvite = await asService(async () => (await db.query(
    `insert into public.workspace_invites (workspace_id, creator_user_id) values ($1, $2) returning id`, [otherWs, outsider])).rows[0].id);
  await assert.rejects(asService(() => db.query(
    `insert into public.workspace_join_requests (workspace_id, invite_id, requester_user_id) values ($1, $2, $3)`, [ws, foreignInvite, outsider])), /invite_team_mismatch/);
  // The server (service role) still adds members, as SCIM and the approval RPCs do.
  await asService(() => db.query(`insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, member]));
  assert.equal(await roleOf(member), 'member');

  // 3. Single sign-on is written by the service role only, and one provider belongs to one workspace.
  await assert.rejects(sso(admin, ws), /single sign-on settings are platform controlled/);
  await assert.rejects(sso(owner, ws), /single sign-on settings are platform controlled/);
  await assert.rejects(as(admin, () => db.query(`update public.workspace_settings set sso_enabled = true where workspace_id = $1`, [ws])), /platform controlled/);
  assert.equal(affected(await as(admin, () => db.query('update public.workspace_settings set io_logging_enabled = true where workspace_id = $1', [ws]))), 1,
    'admins still change the other settings');
  // Disabled configurations don't reserve a provider, so they can't block the organization that owns it.
  await enableSso(ws, false);
  await enableSso(otherWs, false);
  await enableSso(otherWs);
  await assert.rejects(enableSso(ws), /duplicate key value violates unique constraint "workspace_settings_sso_provider_identifier_key"/,
    'an enabled provider belongs to one workspace');
  await enableSso(otherWs, false);
  await enableSso(ws);
  await assert.rejects(enableSso(otherWs), /workspace_settings_sso_provider_identifier_key/);

  // 6. With both migrations, the hash transplant and creator changes are refused for an admin.
  await as(admin, async () => {
    await assert.rejects(db.query(`update public.management_keys set hash = 'admin-mk-hash' where id = $1`, [ownerMk]), /permission denied/);
    await assert.rejects(db.query(`update public.management_keys set created_by = $2 where id = $1`, [adminMk, owner]), /permission denied/);
    await assert.rejects(db.query(`insert into public.management_keys (workspace_id, name, hash, prefix, scopes, kid, created_by, status)
      values ($1, 'Forged', 'forged-hash', 'ffffff', '["workspaces:delete"]', 'forgedmk', $2, 'active')`, [ws, owner]), /permission denied/);
  });
  assert.deepEqual((await db.query('select id, hash, created_by from public.management_keys order by id')).rows, [
    { id: ownerMk, hash: 'owner-mk-hash', created_by: owner },
    { id: adminMk, hash: 'admin-mk-hash', created_by: admin },
  ], 'management keys keep their hash and creator');

  // 4. Approving someone as an admin (from the invite's role) needs the owner, in both approval functions.
  const viaRpc = await joinAs(requester2, await adminInvite());
  await assert.rejects(approveAs(admin, viaRpc), /workspace_admin_owner_only/);
  assert.equal(await roleOf(requester2), null, 'an admin cannot approve an admin invite');
  assert.equal((await db.query('select status::text from public.workspace_join_requests where id = $1', [viaRpc])).rows[0].status, 'pending');
  await approveAs(owner, viaRpc);
  assert.equal(await roleOf(requester2), 'admin', 'the owner can');
  const viaManagement = await joinAs(requester3, await adminInvite());
  await assert.rejects(decideAs(admin, viaManagement), /workspace_admin_owner_only/);
  assert.equal(await roleOf(requester3), null);
  await decideAs(owner, viaManagement);
  assert.equal(await roleOf(requester3), 'admin');

  // 5. The role given with an approval is applied in the same transaction as the approval, the owner check
  //    and the invite-use increment (no second call that could fail and leave the invite's role).
  const adminInviteId = await adminInvite();
  const asMember = await joinAs(requester4, adminInviteId);
  await decideWithRole(admin, asMember, 'member');
  assert.equal(await roleOf(requester4), 'member', 'an admin invite approved as a member never makes an admin');
  assert.equal(await usesOf(adminInviteId), 1);
  const memberInviteId = await createInvite();
  const asAdmin = await joinAs(requester5, memberInviteId);
  await assert.rejects(decideWithRole(admin, asAdmin, 'admin'), /workspace_admin_owner_only/);
  assert.equal(await roleOf(requester5), null, 'an admin cannot approve someone as an admin');
  assert.equal(await statusOf(asAdmin), 'pending');
  assert.equal(await usesOf(memberInviteId), 0, 'the refused approval used nothing');
  await assert.rejects(decideWithRole(owner, asAdmin, 'owner'), /Role must be admin or member/);
  await decideWithRole(owner, asAdmin, 'admin');
  assert.equal(await roleOf(requester5), 'admin', 'the owner can');

  // 7. Combined policies (#3587 + this migration) on workspace_members, for the owner, an admin and a member,
  //    with their own session and with an OAuth client token. Every policy that grants a write is permissive
  //    and #3587's are restrictive, so a client_id token writes nothing, and a session writes only what the
  //    owner rules allow. Reads are unaffected either way.
  const memberRole = (user) => roleOf(user);
  assert.deepEqual([await memberRole(owner), await memberRole(admin), await memberRole(requester4), await memberRole(requester5)],
    ['owner', 'admin', 'member', 'admin']);
  const setRole = (user, target, role) => db.query('update public.workspace_members set role = $3 where workspace_id = $1 and user_id = $2', [ws, target, role]);
  const remove = (target) => db.query('delete from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, target]);
  const insertOutsider = () => db.query(`insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [ws, outsider]);
  const visible = async () => (await db.query('select user_id from public.workspace_members where workspace_id = $1', [ws])).rows.length;
  const membersBefore = (await db.query('select user_id, role::text from public.workspace_members where workspace_id = $1 order by user_id', [ws])).rows;
  for (const [label, actor] of [['owner', owner], ['admin', admin], ['member', requester4]]) {
    for (const [mode, run] of [['session', as], ['client_id token', asApp]]) {
      await assert.rejects(run(actor, insertOutsider), /permission denied|row-level security/, `${label} (${mode}) can't insert a member`);
      assert(await run(actor, visible) > 0, `${label} (${mode}) still reads the members`);
      if (mode === 'client_id token' || label !== 'owner') {
        assert.equal(affected(await run(actor, () => setRole(actor, requester5, 'member'))), 0, `${label} (${mode}) can't change a role`);
        assert.equal(affected(await run(actor, () => remove(requester5))), 0, `${label} (${mode}) can't remove someone else`);
      }
      if (mode === 'client_id token') {
        assert.equal(affected(await run(actor, () => remove(actor))), 0, `${label} (${mode}) can't remove themselves either`);
        await assert.rejects(run(actor, () => db.query('select * from public.approve_workspace_join_request($1)', [crypto.randomUUID()])),
          /oauth_client_refused/, `${label} (${mode}) can't approve a join request`);
      }
    }
  }
  assert.deepEqual((await db.query('select user_id, role::text from public.workspace_members where workspace_id = $1 order by user_id', [ws])).rows, membersBefore,
    'no client_id token, admin or member changed any membership');
  // The owner's own session still changes roles and removes members; a member's own session still leaves.
  assert.equal(affected(await as(owner, () => setRole(owner, requester5, 'member'))), 1);
  assert.equal(await roleOf(requester5), 'member', "the owner's session changes a role");
  assert.equal(affected(await as(owner, () => remove(requester5))), 1);
  assert.equal(await roleOf(requester5), null, "the owner's session removes a member");
  assert.equal(affected(await as(requester4, () => remove(requester4))), 1);
  assert.equal(await roleOf(requester4), null, "a member's own session leaves");
  // The owner's own session still approves a join request; the same owner's client_id token can't.
  const pendingId = await joinAs(outsider, await createInvite());
  await assert.rejects(asApp(owner, () => db.query('select * from public.approve_workspace_join_request($1)', [pendingId])), /oauth_client_refused/);
  assert.equal(await statusOf(pendingId), 'pending');
  await approveAs(owner, pendingId);
  assert.equal(await roleOf(outsider), 'member', "the owner's session approves");

  console.log('workspace role rules: ok');
} finally {
  await db.close();
}
