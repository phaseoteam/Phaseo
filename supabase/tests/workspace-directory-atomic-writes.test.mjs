// Standalone PostgreSQL regression test for the 2026-11-06 review: a directory change made of several
// writes must be one transaction, so a failure (or a deadlock and its retry) never leaves it half done.
// Runs the real function files with the real SCIM reconcile (group mappings turn members into admins):
// 1. create_scim_group: the group and its members in one transaction (no orphaned group on failure).
// 2. apply_scim_group_patch: every operation of one SCIM Group PATCH in one transaction; a later failing
//    operation rolls back the earlier ones, so "add the new member, remove the old one" can't stop halfway.
// 3. management_set_workspace_department_member (now used by Settings): clearing the old primary
//    department and saving the new one are one transaction, so a failure in either step changes nothing.
// Faults are injected with test-only triggers that raise when a setting is on.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/workspace-directory-atomic-writes.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trim());
const migrations = await readdir(new URL('../migrations/', import.meta.url));
// The migration is three files (functions, member policies, SSO index).
const migration = (await Promise.all(migrations.filter((name) => /_enforce_workspace_role_rules_\d_[a-z_]+\.sql$/.test(name)).sort().map((name) => read(`../migrations/${name}`)))).join('\n');
for (const fn of ['create_scim_group', 'apply_scim_group_patch']) {
  const sql = await read(`../schemas/public/functions/${fn}.sql`);
  assert(migration.includes(sql), `the migration ships ${fn} with its grants`);
  assert(/SECURITY DEFINER\n  SET search_path TO ''/.test(sql), `${fn} is SECURITY DEFINER with an empty search_path`);
  assert(sql.includes(`FROM PUBLIC, "anon", "authenticated";`) && sql.includes(`TO "service_role";`), `${fn} is for the service role only`);
}
const exportJson = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of ['public/functions/create_scim_group.sql', 'public/functions/apply_scim_group_patch.sql']) {
  assert(exportJson.loadOrder.includes(file) && exportJson.files.includes(file), `${file} is in the declarative export`);
}

const ws = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000001';
const oldAdmin = '20000000-0000-4000-8000-000000000002';
const newAdmin = '20000000-0000-4000-8000-000000000003';
const member = '20000000-0000-4000-8000-000000000004';
const engineering = '30000000-0000-4000-8000-000000000001';
const sales = '30000000-0000-4000-8000-000000000002';
const group = '40000000-0000-4000-8000-000000000001';
const oldUser = '50000000-0000-4000-8000-000000000001';
const newUser = '50000000-0000-4000-8000-000000000002';
const unknownUser = '50000000-0000-4000-8000-0000000000ff';
const db = new PGlite();

const roleOf = async (user) => (await db.query('select role::text from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, user])).rows[0]?.role ?? null;
const groupMembers = async (groupId = group) => (await db.query('select user_id from public.scim_group_members where group_id = $1 order by user_id', [groupId])).rows.map((row) => row.user_id);
const patch = (changes) => db.query('select * from public.apply_scim_group_patch($1, $2, $3::jsonb)', [ws, group, JSON.stringify(changes)]);
const primaries = async () => (await db.query(`select department_id from public.workspace_department_grants where user_id = $1 and source_type = 'manual' and is_primary order by department_id`, [member])).rows.map((row) => row.department_id);
const setPrimary = (department) => db.query('select public.management_set_workspace_department_member($1, $2, $3, $4, true, $5)', [ws, department, member, 'member', owner]);

try {
  await db.exec(await read('./fixtures/workspace-directory-schema.sql'));
  for (const fn of ['apply_workspace_role_overrides', 'reconcile_scim_entitlements', 'reconcile_scim_entitlements_trigger', 'refresh_effective_entitlements_after_directory_change',
    'create_scim_group', 'apply_scim_group_patch', 'management_set_workspace_department_member']) {
    await db.exec(await read(`../schemas/public/functions/${fn}.sql`));
  }
  await db.exec(`
    create trigger scim_group_mappings_reconcile after insert or delete or update on public.scim_group_mappings
      for each row execute function public.reconcile_scim_entitlements_trigger();
    create trigger scim_group_members_reconcile after insert or delete on public.scim_group_members
      for each row execute function public.reconcile_scim_entitlements_trigger();
    -- Test-only fault injection: raise inside a write when the matching setting is on.
    create function public.test_fail_when() returns trigger language plpgsql as $$
    begin
      if current_setting(tg_argv[0], true) = 'on' then raise exception 'injected failure in % on %', tg_op, tg_table_name; end if;
      return coalesce(new, old);
    end $$;
    create trigger test_fail_member_delete before delete on public.scim_group_members
      for each row execute function public.test_fail_when('test.fail_member_delete');
    create trigger test_fail_grant_insert before insert on public.workspace_department_grants
      for each row execute function public.test_fail_when('test.fail_grant_insert');
    create trigger test_fail_grant_update before update on public.workspace_department_grants
      for each row execute function public.test_fail_when('test.fail_grant_update');

    insert into public.workspaces values ('${ws}', '${owner}');
    insert into public.workspace_members (workspace_id, user_id, role) values ('${ws}', '${owner}', 'owner'), ('${ws}', '${member}', 'member');
    insert into public.workspace_access_grants values ('${ws}', '${owner}', 'manual', '${owner}', 'owner'), ('${ws}', '${member}', 'manual', '${member}', 'member');
    insert into public.scim_users (id, workspace_id, auth_user_id) values ('${oldUser}', '${ws}', '${oldAdmin}'), ('${newUser}', '${ws}', '${newAdmin}');
    insert into public.scim_groups (id, workspace_id, display_name) values ('${group}', '${ws}', 'Platform admins');
    insert into public.workspace_departments (id, workspace_id, name) values ('${engineering}', '${ws}', 'Engineering'), ('${sales}', '${ws}', 'Sales');
    insert into public.scim_group_members values ('${ws}', '${group}', '${oldUser}');
    -- Owner-made mapping: everyone in the group is an admin.
    insert into public.scim_group_mappings (workspace_id, scim_group_id, department_id, access_role) values ('${ws}', '${group}', '${engineering}', 'admin');
  `);
  assert.equal(await roleOf(oldAdmin), 'admin');

  // 2. A PATCH that adds the new admin and removes the old one, then fails, changes nothing.
  await assert.rejects(patch([
    { kind: 'members-add', user_ids: [newUser] },
    { kind: 'members-remove', user_ids: [oldUser] },
    { kind: 'members-add', user_ids: [unknownUser] },
  ]), /SCIM user not found in workspace/);
  assert.deepEqual(await groupMembers(), [oldUser], 'the earlier operations rolled back');
  assert.deepEqual([await roleOf(oldAdmin), await roleOf(newAdmin)], ['admin', null], 'roles are unchanged');
  // A failure inside the removal (the second operation) rolls back the add before it.
  await db.exec(`select set_config('test.fail_member_delete', 'on', false);`);
  await assert.rejects(patch([
    { kind: 'attributes', values: { display_name: 'Renamed' } },
    { kind: 'members-add', user_ids: [newUser] },
    { kind: 'members-remove', user_ids: [oldUser] },
  ]), /injected failure in DELETE on scim_group_members/);
  await db.exec(`select set_config('test.fail_member_delete', 'off', false);`);
  assert.deepEqual(await groupMembers(), [oldUser]);
  assert.equal((await db.query('select display_name from public.scim_groups where id = $1', [group])).rows[0].display_name, 'Platform admins',
    'the attribute change rolled back too');
  await assert.rejects(patch([{ kind: 'members-add', user_ids: [newUser] }, { kind: 'members-move' }]), /Unsupported SCIM Group PATCH change/);
  assert.deepEqual(await groupMembers(), [oldUser]);
  // The same PATCH succeeds as a whole.
  const before = (await db.query('select updated_at from public.scim_groups where id = $1', [group])).rows[0].updated_at;
  const patched = (await patch([
    { kind: 'attributes', values: { display_name: 'Renamed' } },
    { kind: 'members-add', user_ids: [newUser] },
    { kind: 'members-remove', user_ids: [oldUser] },
  ])).rows[0];
  assert.equal(patched.display_name, 'Renamed');
  assert(new Date(patched.updated_at) >= new Date(before), 'the metadata change is part of the transaction');
  assert.deepEqual(await groupMembers(), [newUser]);
  assert.deepEqual([await roleOf(oldAdmin), await roleOf(newAdmin)], [null, 'admin'], 'the reconcile ran once, at the end');
  await patch([{ kind: 'members-replace', user_ids: [oldUser] }]);
  assert.deepEqual(await groupMembers(), [oldUser]);
  await assert.rejects(db.query('select * from public.apply_scim_group_patch($1, $2, $3::jsonb)', [ws, unknownUser, '[]']), /SCIM group not found/);

  // 1. Creating a group with an unknown member leaves no group behind; a valid create keeps both.
  const groupCount = async () => Number((await db.query('select count(*) from public.scim_groups')).rows[0].count);
  const countBefore = await groupCount();
  await assert.rejects(db.query('select * from public.create_scim_group($1, $2, $3, $4)', [ws, 'ext-1', 'New group', [newUser, unknownUser]]),
    /SCIM user not found in workspace/);
  assert.equal(await groupCount(), countBefore, 'no orphaned group');
  const created = (await db.query('select * from public.create_scim_group($1, $2, $3, $4)', [ws, 'ext-1', 'New group', [newUser]])).rows[0];
  assert.deepEqual(await groupMembers(created.id), [newUser]);

  // 3. Moving a member's primary department: a failure in either step changes nothing.
  await setPrimary(engineering);
  assert.deepEqual(await primaries(), [engineering]);
  for (const step of ['test.fail_grant_update', 'test.fail_grant_insert']) {
    await db.exec(`select set_config('${step}', 'on', false);`);
    await assert.rejects(setPrimary(sales), /injected failure/);
    await db.exec(`select set_config('${step}', 'off', false);`);
    assert.deepEqual(await primaries(), [engineering], `a failure in ${step.replace('test.fail_', '')} keeps exactly the old primary`);
  }
  await setPrimary(sales);
  assert.deepEqual(await primaries(), [sales], 'exactly one primary afterwards');

  console.log('workspace directory atomic writes: ok');
} finally {
  await db.close();
}
