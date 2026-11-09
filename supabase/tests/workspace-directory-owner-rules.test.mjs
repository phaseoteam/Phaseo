// Standalone PostgreSQL regression test for the 2026-11-05 review of directory roles. Runs the real
// function files (and the real SCIM reconcile, which turns group mappings into workspace roles):
// 1. Deleting a department deletes the group mappings that use it (ON DELETE CASCADE), and the reconcile
//    then removes the admins those mappings granted. management_delete_workspace_department now refuses
//    that unless the actor is the workspace owner. The old body (fixtures/directory-owner-rules-before.sql)
//    is run first to show the bug.
// 2. An admin's department change through apply_workspace_member_override re-sent the role override it had
//    read earlier, so it could restore a role the owner had just revoked. Admins now use
//    apply_workspace_member_department_override, which never writes access_role.
// 3. Lock behaviour. This PR adds no locks: the migration takes no advisory lock and adds no triggers to
//    the directory tables, so these functions lock exactly as on main. The mapped-department check is
//    atomic because it runs under the department row lock (a new mapping's foreign-key check needs a
//    key-share lock on that row); scripts/workspace-directory-lock-smoke.mjs shows that with two sessions.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/workspace-directory-owner-rules.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trim());
const migrations = await readdir(new URL('../migrations/', import.meta.url));
// The migration is three files (functions, member policies, SSO index).
const migration = (await Promise.all(migrations.filter((name) => /_enforce_workspace_role_rules_\d_[a-z_]+\.sql$/.test(name)).sort().map((name) => read(`../migrations/${name}`)))).join('\n');
assert(migration.length > 0, 'the migration exists');
for (const fn of ['management_delete_workspace_department', 'apply_workspace_member_department_override']) {
  const sql = await read(`../schemas/public/functions/${fn}.sql`);
  const body = sql.slice(sql.indexOf('$function$'), sql.lastIndexOf('$function$') + 10);
  assert(body.length > 20 && migration.includes(body), `the migration ships the schema body of ${fn}`);
}
assert(!/advisory|lock_workspace_directory/i.test(migration), 'the migration takes no advisory lock');
assert(!/CREATE TRIGGER/i.test(migration), 'the migration adds no triggers');
const deleteFn = (await read('../schemas/public/functions/management_delete_workspace_department.sql')).toLowerCase();
assert(deleteFn.indexOf('for update') < deleteFn.indexOf('scim_group_mappings'), 'the mapped-department check runs under the department row lock');
const exportJson = JSON.parse(await read('../schemas/.pgdelta-export.json'));
const newFile = 'public/functions/apply_workspace_member_department_override.sql';
assert(exportJson.loadOrder.includes(newFile) && exportJson.files.includes(newFile), `${newFile} is in the declarative export`);
assert(!exportJson.files.includes('public/functions/lock_workspace_directory.sql'), 'the lock trigger function is gone');

const ws = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000001';
const admin = '20000000-0000-4000-8000-000000000002';
const scimAdmin = '20000000-0000-4000-8000-000000000003';
const member = '20000000-0000-4000-8000-000000000004';
const engineering = '30000000-0000-4000-8000-000000000001';
const sales = '30000000-0000-4000-8000-000000000002';
const group = '40000000-0000-4000-8000-000000000001';
const scimUser = '50000000-0000-4000-8000-000000000001';
const db = new PGlite();

const roleOf = async (user) => (await db.query('select role::text from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, user])).rows[0]?.role ?? null;
const overrideOf = async (user) => (await db.query('select access_role, department_id from public.workspace_member_overrides where workspace_id = $1 and user_id = $2', [ws, user])).rows[0] ?? null;
const deleteDepartment = (actor, department) => db.query('select * from public.management_delete_workspace_department($1, $2, $3)', [ws, department, actor]);
const override = (role, department) => db.query(
  'select public.apply_workspace_member_override($1, $2, $3, $4, $5, $6, $7)', [ws, member, role, department !== null, department, 'member', owner]);
const departmentOnly = (actor, department) => db.query(
  'select public.apply_workspace_member_department_override($1, $2, $3, $4, $5, $6)', [ws, member, department !== null, department, 'member', actor]);

async function seedDirectory() {
  await db.exec(`
    delete from public.scim_group_mappings; delete from public.scim_group_members; delete from public.workspace_member_overrides;
    delete from public.workspace_department_grants; delete from public.workspace_access_grants;
    delete from public.workspace_departments;
    -- Manual members have a manual access grant (capture_manual_workspace_grant in production), which the
    -- reconcile keeps.
    insert into public.workspace_members values ('${ws}', '${admin}', 'admin'), ('${ws}', '${member}', 'member')
      on conflict (workspace_id, user_id) do update set role = excluded.role;
    insert into public.workspace_access_grants values ('${ws}', '${owner}', 'manual', '${owner}', 'owner'),
      ('${ws}', '${admin}', 'manual', '${admin}', 'admin'), ('${ws}', '${member}', 'manual', '${member}', 'member');
    insert into public.workspace_departments (id, workspace_id, name, source_type) values
      ('${engineering}', '${ws}', 'Engineering', 'manual'), ('${sales}', '${ws}', 'Sales', 'manual');
    insert into public.scim_group_members (workspace_id, group_id, user_id) values ('${ws}', '${group}', '${scimUser}');
    -- Owner-made mapping: everyone in the directory group is an admin in Engineering.
    insert into public.scim_group_mappings (workspace_id, scim_group_id, department_id, access_role) values ('${ws}', '${group}', '${engineering}', 'admin');
  `);
}

try {
  await db.exec(await read('./fixtures/workspace-directory-schema.sql'));
  // Real functions: the SCIM reconcile and its trigger, and the override function admins used before.
  for (const fn of ['apply_workspace_role_overrides', 'reconcile_scim_entitlements', 'reconcile_scim_entitlements_trigger', 'apply_workspace_member_override']) {
    await db.exec(await read(`../schemas/public/functions/${fn}.sql`));
  }
  await db.exec(`
    create trigger scim_group_mappings_reconcile after insert or delete or update on public.scim_group_mappings
      for each row execute function public.reconcile_scim_entitlements_trigger();
    insert into public.workspaces values ('${ws}', '${owner}');
    insert into public.workspace_members values ('${ws}', '${owner}', 'owner'), ('${ws}', '${admin}', 'admin'), ('${ws}', '${member}', 'member');
    insert into public.scim_users (id, workspace_id, auth_user_id) values ('${scimUser}', '${ws}', '${scimAdmin}');
    insert into public.scim_groups values ('${group}', '${ws}');
  `);
  await db.exec(await read('./fixtures/directory-owner-rules-before.sql'));
  // ---------- Before the fix ----------
  await seedDirectory();
  assert.equal(await roleOf(scimAdmin), 'admin', 'the owner-made mapping grants the directory user admin');
  // 1. An admin deletes the department: the mapping cascades away and the reconcile removes the admin.
  await deleteDepartment(admin, engineering);
  assert.equal(await roleOf(scimAdmin), null, 'before the fix an admin removes a directory admin by deleting the department');
  // 2. The owner revokes a member's admin override; an admin then changes the member's department with the
  //    role override they had read before the revoke, and the admin role comes back.
  await seedDirectory();
  await override('admin', null);
  assert.equal(await roleOf(member), 'admin');
  const staleRole = (await overrideOf(member)).access_role;
  await override(null, null);
  assert.equal(await overrideOf(member), null, 'the owner revoked the override');
  await override(staleRole, sales);
  assert.equal((await overrideOf(member)).access_role, 'admin', 'before the fix a department change restores the revoked role');
  assert.equal(await roleOf(member), 'admin');

  await db.exec(`update public.workspace_members set role = 'member' where user_id = '${member}'; delete from public.workspace_member_overrides;`);
  await db.exec(await read('../schemas/public/functions/management_delete_workspace_department.sql'));
  await db.exec(await read('../schemas/public/functions/apply_workspace_member_department_override.sql'));

  // ---------- After the fix ----------
  // 1. Only the owner deletes a department that a group mapping uses.
  await seedDirectory();
  assert.equal(await roleOf(scimAdmin), 'admin');
  await assert.rejects(deleteDepartment(admin, engineering), /department_has_group_mappings/);
  assert.equal(await roleOf(scimAdmin), 'admin', 'an admin cannot remove the directory admin');
  assert.equal((await db.query('select count(*)::int as n from public.scim_group_mappings')).rows[0].n, 1, 'the mapping is untouched');
  await deleteDepartment(admin, sales);
  assert.equal((await db.query(`select 1 from public.workspace_departments where id = '${sales}'`)).rows.length, 0,
    'admins still delete departments without mappings');
  await deleteDepartment(owner, engineering);
  assert.equal(await roleOf(scimAdmin), null, 'the owner can');

  // 2. A department-only change never writes the role override.
  await seedDirectory();
  await override('admin', null);
  await override(null, null);
  await departmentOnly(admin, sales);
  assert.deepEqual(await overrideOf(member), { access_role: null, department_id: sales }, 'the revoked role stays revoked');
  assert.equal(await roleOf(member), 'member');
  await override('member', sales);
  await departmentOnly(admin, engineering);
  assert.deepEqual(await overrideOf(member), { access_role: 'member', department_id: engineering }, 'an existing role override is kept');
  await override(null, engineering);
  await departmentOnly(admin, null);
  assert.equal(await overrideOf(member), null, 'clearing the department removes an override with no role');

  console.log('workspace directory owner rules: ok');
} finally {
  await db.close();
}
