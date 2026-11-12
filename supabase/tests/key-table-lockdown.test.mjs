// Standalone PostgreSQL regression test for the 2026-11-04 security review of the key tables.
// Before the fix, a signed-in workspace admin could, through PostgREST:
// - read every key hash and copy one onto another member's key row (the gateway looks a key up by kid
//   and checks the secret against hash, so a secret the admin holds then authenticates as that key),
// - turn a key into an OAuth-delegated key for another member,
// - bring a revoked management key back and widen its scopes,
// - delete workspaces and their own users row without the API's checks.
// The test reproduces each of these on production's old grants, applies the real migration and shows
// each is refused, while the service role still creates and changes keys.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/key-table-lockdown.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trim());
const migration = await read('../migrations/20261104223750_lock_down_key_tables.sql');
const keysSql = await read('../schemas/public/tables/keys.sql');
const managementSql = await read('../schemas/public/tables/management_keys.sql');
const identityFn = await read('../schemas/public/functions/protect_key_identity_columns.sql');
const createdByFn = await read('../schemas/public/functions/protect_key_created_by.sql');
const revokedFn = await read('../schemas/public/functions/protect_revoked_key_status.sql');

// The declarative files describe the same end state as the migration.
const statement = (sql, pattern) => sql.match(pattern)?.[0];
assert(migration.includes(identityFn), 'the migration ships protect_key_identity_columns verbatim');
for (const [sql, pattern] of [
  [keysSql, /CREATE TRIGGER protect_key_identity_columns\n[\s\S]*?;/],
  [managementSql, /CREATE TRIGGER protect_management_key_identity_columns\n[\s\S]*?;/],
  [managementSql, /CREATE TRIGGER protect_revoked_management_key_status\n[\s\S]*?;/],
  [keysSql, /GRANT SELECT \([^)]*\) ON TABLE "public"\."keys" TO "authenticated";/],
  [managementSql, /GRANT SELECT \([^)]*\) ON TABLE "public"\."management_keys" TO "authenticated";/],
]) {
  const found = statement(sql, pattern);
  assert(found && migration.includes(found), `the migration ships ${pattern}`);
}
for (const [table, sql] of [['keys', keysSql], ['management_keys', managementSql]]) {
  const clientGrants = sql.split('\n').filter((line) => /^GRANT .* TO "(anon|authenticated)"/.test(line));
  assert.equal(clientGrants.length, 1, `${table}.sql grants clients one thing`);
  assert(clientGrants[0].startsWith('GRANT SELECT (') && !clientGrants[0].includes('"hash"'), `${table}.sql grants clients SELECT without hash`);
}
for (const [table, line] of [
  ['workspaces', 'GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."workspaces" TO "authenticated";'],
  ['users', 'GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."users" TO "authenticated";'],
  ['gateway_provider_events', 'GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_provider_events" TO "service_role";'],
  ['gateway_wallet_reservations', 'GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."gateway_wallet_reservations" TO "anon";'],
]) {
  assert((await read(`../schemas/public/tables/${table}.sql`)).includes(line), `${table}.sql has the narrowed grant`);
}

// Columns of the real tables, without their constraints, so the column grants are checked against the
// schema as it is.
function columns(sql) {
  const body = sql.slice(sql.indexOf('(') + 1, sql.indexOf('\n);'));
  return body.split('\n').map((line) => line.trim().replace(/,$/, ''))
    .filter((line) => line.startsWith('"'))
    .join(',\n');
}
const policies = (sql) => sql.match(/CREATE POLICY [\s\S]*?;/g).join('\n');

const workspace = '20000000-0000-4000-8000-000000000001';
const owner = '10000000-0000-4000-8000-000000000001';
const admin = '10000000-0000-4000-8000-000000000002';
const member = '10000000-0000-4000-8000-000000000003';
const ownerKey = '30000000-0000-4000-8000-000000000001';
const adminKey = '30000000-0000-4000-8000-000000000002';
const ownerMk = '40000000-0000-4000-8000-000000000001';
const adminMk = '40000000-0000-4000-8000-000000000002';
const revokedMk = '40000000-0000-4000-8000-000000000003';

const db = new PGlite();
async function as(role, user, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
async function rejects(promise, pattern, message) {
  await assert.rejects(promise, (error) => pattern.test(String(error?.message ?? error)), message);
}
const row = async (table, id, cols) => (await db.query(`select ${cols} from public.${table} where id = $1`, [id])).rows[0];
const privilege = async (role, table, priv) => (await db.query(`select has_table_privilege($1, $2, $3) as ok`, [role, `public.${table}`, priv])).rows[0].ok;
const anyColumn = async (role, table, priv) => (await db.query(`select has_any_column_privilege($1, $2, $3) as ok`, [role, `public.${table}`, priv])).rows[0].ok;

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create function public.mfa_satisfied() returns boolean language sql stable as $$ select true $$;

    create table public.workspaces (id uuid primary key, owner_user_id uuid not null);
    create table public.users (user_id uuid primary key);
    create table public.workspace_members (workspace_id uuid, user_id uuid, role text, primary key (workspace_id, user_id));
    create function public.is_workspace_member(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid()) $$;
    create function public.is_workspace_admin(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid() and m.role in ('owner', 'admin')) $$;
    grant execute on function public.is_workspace_member(uuid), public.is_workspace_admin(uuid), public.mfa_satisfied() to authenticated;
    alter table public.workspaces enable row level security;
    create policy "teams: delete if owner" on public.workspaces for delete to authenticated using (owner_user_id = auth.uid());
    create policy workspaces_select on public.workspaces for select to authenticated using (public.is_workspace_member(id));
    alter table public.users enable row level security;
    create policy "users: delete self" on public.users for delete to authenticated using (user_id = auth.uid());
    create policy users_select on public.users for select to authenticated using (user_id = auth.uid());

    create table public.keys (
      ${columns(keysSql)},
      constraint keys_pkey primary key (id),
      constraint keys_hash_key unique (hash)
    );
    alter table public.keys enable row level security;
    create table public.management_keys (
      ${columns(managementSql)},
      constraint management_keys_pkey primary key (id),
      constraint provisioning_keys_hash_key unique (hash)
    );
    alter table public.management_keys enable row level security;
    ${policies(keysSql)}
    ${policies(managementSql)}
    ${createdByFn}
    ${revokedFn}
    create trigger protect_key_created_by before insert or update of created_by on public.keys
      for each row execute function public.protect_key_created_by();
    create trigger protect_revoked_key_status before update of status on public.keys
      for each row execute function public.protect_revoked_key_status();
    create trigger protect_management_key_created_by before insert or update of created_by on public.management_keys
      for each row execute function public.protect_key_created_by();

    create table public.gateway_provider_events (id bigint primary key, workspace_id uuid);
    alter table public.gateway_provider_events enable row level security;
    create policy gateway_provider_events_select_service on public.gateway_provider_events for select to service_role using (true);
    create table public.gateway_wallet_reservations (id bigint primary key, workspace_id uuid, amount bigint);
    alter table public.gateway_wallet_reservations enable row level security;

    -- Production's grants before the fix (2026-11-04 catalog).
    grant delete, insert, select, update on public.keys, public.management_keys to anon, authenticated;
    grant all on public.keys, public.management_keys, public.workspaces, public.users, public.gateway_provider_events,
      public.gateway_wallet_reservations to service_role;
    grant delete, references, select, trigger on public.workspaces, public.users to anon, authenticated;
    grant all on public.gateway_provider_events, public.gateway_wallet_reservations to anon, authenticated;
    grant insert (amount), update (amount) on public.gateway_wallet_reservations to anon;

    insert into public.users values ('${owner}'), ('${admin}'), ('${member}');
    insert into public.workspaces values ('${workspace}', '${owner}');
    insert into public.workspace_members values ('${workspace}', '${owner}', 'owner'), ('${workspace}', '${admin}', 'admin'),
      ('${workspace}', '${member}', 'member');
    insert into public.keys (id, workspace_id, name, hash, prefix, scopes, kid, created_by) values
      ('${ownerKey}', '${workspace}', 'Owner key', 'owner-hash', 'aaaaaa', '[]', 'ownerkid', '${owner}'),
      ('${adminKey}', '${workspace}', 'Admin key', 'admin-hash', 'bbbbbb', '[]', 'adminkid', '${admin}');
    insert into public.management_keys (id, workspace_id, name, hash, prefix, scopes, kid, created_by, status) values
      ('${ownerMk}', '${workspace}', 'Owner mk', 'owner-mk-hash', 'cccccc', '["settings:read"]', 'ownermk', '${owner}', 'active'),
      ('${adminMk}', '${workspace}', 'Admin mk', 'admin-mk-hash', 'dddddd', '["settings:read"]', 'adminmk', '${admin}', 'active'),
      ('${revokedMk}', '${workspace}', 'Leaked mk', 'leaked-mk-hash', 'eeeeee', '["settings:read"]', 'leakedmk', '${owner}', 'compromised');
  `);

  // Before the fix: the attacks work for a signed-in admin.
  await db.exec('begin');
  await as('authenticated', admin, async () => {
    const hashes = await db.query(`select id, hash from public.management_keys`);
    assert.equal(hashes.rows.length, 3, 'before the fix an admin reads every management key hash');
    await db.query(`update public.management_keys set hash = 'parked' where id = $1`, [adminMk]);
    await db.query(`update public.management_keys set hash = 'admin-mk-hash' where id = $1`, [ownerMk]);
    await db.query(`update public.keys set hash = 'parked' where id = $1`, [adminKey]);
    await db.query(`update public.keys set hash = 'admin-hash' where id = $1`, [ownerKey]);
    await db.query(`update public.keys set key_kind = 'oauth_delegated', oauth_user_id = $1, oauth_client_id = 'phaseo_desktop',
      issued_via = 'desktop', oauth_scopes = array['gateway:access'] where id = $2`, [owner, adminKey]);
    await db.query(`update public.management_keys set status = 'active', scopes = '["settings:read","billing:write"]' where id = $1`, [revokedMk]);
  });
  assert.equal((await row('management_keys', ownerMk, 'hash')).hash, 'admin-mk-hash', "before the fix an admin's hash lands on the owner's management key");
  assert.equal((await row('keys', ownerKey, 'hash')).hash, 'admin-hash', "before the fix an admin's hash lands on the owner's API key");
  assert.equal((await row('keys', adminKey, 'oauth_user_id')).oauth_user_id, owner, 'before the fix an admin forges a key delegated by the owner');
  assert.equal((await row('management_keys', revokedMk, 'status')).status, 'active', 'before the fix a compromised management key comes back');
  await db.exec('rollback');
  assert.equal(await privilege('authenticated', 'workspaces', 'DELETE'), true);
  assert.equal(await privilege('authenticated', 'users', 'DELETE'), true);

  await db.exec(migration);

  // 1. Grants: signed-in clients read keys without the hash and write nothing.
  for (const table of ['keys', 'management_keys']) {
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.equal(await privilege('authenticated', table, priv), false, `authenticated has no ${priv} on ${table}`);
      assert.equal(await privilege('anon', table, priv), false, `anon has no ${priv} on ${table}`);
    }
    assert.equal(await anyColumn('anon', table, 'SELECT'), false, `anon reads nothing from ${table}`);
    assert.equal(await anyColumn('authenticated', table, 'INSERT'), false, `authenticated inserts no column of ${table}`);
    assert.equal(await anyColumn('authenticated', table, 'UPDATE'), false, `authenticated updates no column of ${table}`);
    assert.equal((await db.query(`select has_column_privilege('authenticated', $1, 'hash', 'SELECT') as ok`, [`public.${table}`])).rows[0].ok, false,
      `authenticated cannot read ${table}.hash`);
    assert.equal(await privilege('service_role', table, 'UPDATE'), true, `service_role keeps UPDATE on ${table}`);
  }

  // 2. The attacks are refused for the admin; members still list keys without hashes.
  await as('authenticated', admin, async () => {
    await rejects(db.query(`select hash from public.management_keys`), /permission denied/, 'an admin cannot read management key hashes');
    await rejects(db.query(`select hash from public.keys`), /permission denied/, 'an admin cannot read API key hashes');
    await rejects(db.query(`select * from public.keys`), /permission denied/, 'select * is refused, so readers name their columns');
    await rejects(db.query(`update public.keys set hash = 'admin-hash' where id = $1`, [ownerKey]), /permission denied/, 'an admin cannot swap a key hash');
    await rejects(db.query(`update public.keys set kid = 'ownerkid2' where id = $1`, [adminKey]), /permission denied/, 'an admin cannot change a kid');
    await rejects(db.query(`update public.management_keys set hash = 'admin-mk-hash' where id = $1`, [ownerMk]), /permission denied/,
      'an admin cannot swap a management key hash');
    await rejects(db.query(`update public.keys set key_kind = 'oauth_delegated', oauth_user_id = $1 where id = $2`, [owner, adminKey]),
      /permission denied/, 'an admin cannot forge an OAuth-delegated key');
    await rejects(db.query(`insert into public.keys (workspace_id, name, hash, prefix, scopes, kid, key_kind, oauth_user_id, created_by)
      values ($1, 'forged', 'forged-hash', 'ffffff', '[]', 'forgedkid', 'oauth_delegated', $2, $3)`, [workspace, owner, admin]),
      /permission denied/, 'an admin cannot insert a key');
    await rejects(db.query(`update public.management_keys set status = 'active' where id = $1`, [revokedMk]), /permission denied/,
      'an admin cannot reactivate a management key');
    await rejects(db.query(`update public.management_keys set scopes = '["billing:write"]' where id = $1`, [adminMk]), /permission denied/,
      'an admin cannot widen a management key');
    await rejects(db.query(`delete from public.keys where id = $1`, [ownerKey]), /permission denied/, 'an admin cannot delete keys directly');
    const listed = await db.query(`select id, name, kid, status, key_kind from public.keys order by name`);
    assert.deepEqual(listed.rows.map((r) => r.name), ['Admin key', 'Owner key'], 'an admin still lists workspace keys');
  });
  await as('authenticated', member, async () => {
    assert.equal((await db.query(`select id, prefix from public.management_keys`)).rows.length, 3, 'members still list management keys');
    await rejects(db.query(`select hash from public.management_keys`), /permission denied/, 'members cannot read management key hashes');
  });
  await as('anon', null, () => rejects(db.query(`select id from public.keys`), /permission denied/, 'anon reads no keys'));

  // 3. Belt and braces: if a write grant comes back, the trigger still refuses identity changes.
  await db.exec(`grant insert, update on public.keys, public.management_keys to authenticated;`);
  await as('authenticated', admin, async () => {
    for (const [column, value] of [
      ['hash', `'admin-hash-2'`], ['kid', `'otherkid'`], ['key_kind', `'oauth_delegated'`], ['oauth_user_id', `'${owner}'`],
      ['oauth_client_id', `'phaseo_desktop'`], ['oauth_scopes', `array['gateway:access']`], ['oauth_resource', `'https://example.com'`],
      ['issued_via', `'desktop'`], ['scopes', `'["billing:write"]'`], ['workspace_id', `'${owner}'`],
    ]) {
      await rejects(db.query(`update public.keys set ${column} = ${value} where id = $1`, [adminKey]), /key_identity_locked/, `the trigger locks keys.${column}`);
    }
    for (const [column, value] of [['hash', `'x'`], ['kid', `'x'`], ['scopes', `'["billing:write"]'`]]) {
      await rejects(db.query(`update public.management_keys set ${column} = ${value} where id = $1`, [adminMk]), /key_identity_locked/,
        `the trigger locks management_keys.${column}`);
    }
    await rejects(db.query(`insert into public.keys (workspace_id, name, hash, prefix, scopes, kid, created_by)
      values ($1, 'direct', 'direct-hash', 'gggggg', '[]', 'directkid', $2)`, [workspace, admin]), /key_identity_locked/, 'the trigger refuses client inserts');
    await rejects(db.query(`insert into public.management_keys (workspace_id, name, hash, prefix, scopes, kid, created_by)
      values ($1, 'direct', 'direct-hash', 'gggggg', '[]', 'directkid', $2)`, [workspace, admin]), /key_identity_locked/,
      'the trigger refuses client management key inserts');
    await rejects(db.query(`update public.management_keys set status = 'active' where id = $1`, [revokedMk]), /key_revoked_locked/,
      'a compromised management key stays out of service');
    await db.query(`update public.keys set name = 'Renamed' where id = $1`, [adminKey]);
  });
  await db.exec(`revoke insert, update on public.keys, public.management_keys from authenticated;`);
  assert.equal((await row('keys', adminKey, 'name')).name, 'Renamed', 'harmless columns stay writable if a grant is added on purpose');

  // 4. The service role still creates and changes keys; revoked management keys stay revoked for it too.
  await as('service_role', null, async () => {
    await db.query(`insert into public.keys (workspace_id, name, hash, prefix, scopes, kid, created_by, key_kind, oauth_user_id,
      oauth_client_id, oauth_scopes, issued_via) values ($1, 'Desktop', 'desktop-hash', 'hhhhhh', '[]', 'desktopkid', $2,
      'oauth_delegated', $2, 'phaseo_desktop', array['gateway:access'], 'desktop')`, [workspace, owner]);
    await db.query(`update public.keys set hash = 'rotated-hash', kid = 'rotatedkid' where id = $1`, [adminKey]);
    await db.query(`insert into public.management_keys (workspace_id, name, hash, prefix, scopes, kid, created_by)
      values ($1, 'New mk', 'new-mk-hash', 'iiiiii', '[]', 'newmk', $2)`, [workspace, admin]);
    await db.query(`update public.management_keys set status = 'paused' where id = $1`, [adminMk]);
    await db.query(`update public.management_keys set status = 'active', scopes = '["settings:write"]' where id = $1`, [adminMk]);
    await rejects(db.query(`update public.management_keys set status = 'active' where id = $1`, [revokedMk]), /key_revoked_locked/,
      'nobody brings a compromised management key back');
    await db.query(`update public.management_keys set status = 'revoked' where id = $1`, [ownerMk]);
  });
  assert.equal((await row('keys', adminKey, 'hash')).hash, 'rotated-hash');
  assert.equal((await row('management_keys', adminMk, 'status')).status, 'active');
  assert((await row('management_keys', ownerMk, 'revoked_at')).revoked_at, 'revoking a management key stamps revoked_at');

  // 5. Hygiene grants.
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await privilege(role, 'workspaces', 'DELETE'), false, `${role} cannot delete workspaces directly`);
    assert.equal(await privilege(role, 'users', 'DELETE'), false, `${role} cannot delete users rows directly`);
    assert.equal(await anyColumn(role, 'gateway_provider_events', 'SELECT'), false, `${role} cannot read gateway_provider_events`);
    assert.equal(await privilege(role, 'gateway_provider_events', 'INSERT'), false, `${role} cannot write gateway_provider_events`);
  }
  for (const table of ['gateway_wallet_reservations']) {
    for (const priv of ['INSERT', 'UPDATE']) assert.equal(await anyColumn('anon', table, priv), false, `anon cannot ${priv} ${table}`);
    for (const priv of ['DELETE', 'TRUNCATE']) assert.equal(await privilege('anon', table, priv), false, `anon cannot ${priv} ${table}`);
    assert.equal(await privilege('service_role', table, 'INSERT'), true, `service_role keeps INSERT on ${table}`);
  }
  await as('authenticated', owner, async () => {
    await rejects(db.query(`delete from public.workspaces where id = $1`, [workspace]), /permission denied/, 'an owner deletes workspaces through the API only');
    await rejects(db.query(`delete from public.users where user_id = $1`, [owner]), /permission denied/, 'accounts are deleted through the API only');
  });

  console.log('key-table-lockdown: all checks passed');
} finally {
  await db.close();
}
