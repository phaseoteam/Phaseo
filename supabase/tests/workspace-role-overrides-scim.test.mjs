// Standalone PostgreSQL regression test for the 2026-11-06 review: a role the owner set as an override
// must survive every SCIM write. The SCIM functions that write a group in bulk suppress the per-row
// directory triggers (which normally reapply overrides after the reconcile), so each must reapply them
// itself. Before the fix, renaming a group, or creating an unrelated empty one, gave an owner-demoted
// member of a mapped group the admin role back in workspace_members (which API authorization reads).
// Runs the real reconcile, override function, triggers from the table files and the real effective
// entitlement refresh (no stub), and checks both workspace_members.role and the effective role.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/workspace-role-overrides-scim.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trim());
const body = (sql) => sql.slice(0, sql.lastIndexOf('$function$;') + 11);
const migrations = await readdir(new URL('../migrations/', import.meta.url));
// The migration is three files (functions, member policies, SSO index).
const migration = (await Promise.all(migrations.filter((name) => /_enforce_workspace_role_rules_\d_[a-z_]+\.sql$/.test(name)).sort().map((name) => read(`../migrations/${name}`)))).join('\n');
const FUNCTIONS = ['reconcile_scim_entitlements', 'reconcile_scim_entitlements_trigger', 'refresh_effective_entitlements_after_directory_change',
  'refresh_workspace_effective_entitlements', 'capture_manual_workspace_grant', 'enforce_workspace_member_role_policy',
  'apply_workspace_role_overrides', 'apply_workspace_member_override', 'apply_workspace_member_department_override',
  'create_scim_group', 'apply_scim_group_patch', 'replace_scim_group', 'replace_scim_group_members'];
const REWRITTEN = ['apply_workspace_role_overrides', 'refresh_effective_entitlements_after_directory_change', 'apply_workspace_member_override',
  'apply_workspace_member_department_override', 'create_scim_group', 'apply_scim_group_patch', 'replace_scim_group', 'replace_scim_group_members'];
for (const fn of REWRITTEN) {
  assert(migration.includes(body(await read(`../schemas/public/functions/${fn}.sql`))), `the migration ships the current ${fn}`);
}
for (const fn of ['create_scim_group', 'apply_scim_group_patch', 'replace_scim_group', 'replace_scim_group_members']) {
  const sql = await read(`../schemas/public/functions/${fn}.sql`);
  assert(sql.includes("set_config('phaseo.scim_group_replace','on',true)"), `${fn} suppresses the per-row triggers`);
  assert(/reconcile_scim_entitlements\(p_workspace_id\);[\s\S]*apply_workspace_role_overrides\(p_workspace_id\);[\s\S]*refresh_workspace_effective_entitlements/.test(sql),
    `${fn} reapplies overrides after its reconcile and before the refresh`);
}
const exportJson = JSON.parse(await read('../schemas/.pgdelta-export.json'));
assert(exportJson.loadOrder.includes('public/functions/apply_workspace_role_overrides.sql')
  && exportJson.files.includes('public/functions/apply_workspace_role_overrides.sql'), 'the shared function is in the declarative export');

const TRIGGERS = {
  scim_group_mappings: ['scim_group_mappings_reconcile', 'zz_scim_group_mappings_refresh_effective'],
  scim_group_members: ['scim_group_members_reconcile', 'zz_scim_group_members_refresh_effective'],
  workspace_members: ['workspace_members_capture_manual_grant', 'workspace_members_role_policy_guard', 'zz_workspace_members_refresh_effective'],
  workspace_departments: ['workspace_departments_reconcile'],
};
const triggers = [];
for (const [table, names] of Object.entries(TRIGGERS)) {
  const sql = await read(`../schemas/public/tables/${table}.sql`);
  for (const name of names) {
    const trigger = sql.match(new RegExp(`CREATE TRIGGER ${name}\\n[\\s\\S]*?;`))?.[0];
    assert(trigger, `${table} declares ${name}`);
    triggers.push(trigger);
  }
}

const ws = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000001';
const demoted = '20000000-0000-4000-8000-000000000002';
const colleague = '20000000-0000-4000-8000-000000000003';
const engineering = '30000000-0000-4000-8000-000000000001';
const admins = '40000000-0000-4000-8000-000000000001';
const demotedScim = '50000000-0000-4000-8000-000000000001';
const colleagueScim = '50000000-0000-4000-8000-000000000002';
const db = new PGlite();

const roles = async (user) => {
  const member = (await db.query('select role::text from public.workspace_members where workspace_id = $1 and user_id = $2', [ws, user])).rows[0]?.role ?? null;
  const effective = (await db.query('select access_role from public.workspace_member_effective_entitlements where workspace_id = $1 and user_id = $2', [ws, user])).rows[0]?.access_role ?? null;
  return { member, effective };
};
const stillDemoted = async (after) => assert.deepEqual(await roles(demoted), { member: 'member', effective: 'member' },
  `the owner's override (member) survives ${after}, in workspace_members and effective entitlements`);

try {
  await db.exec(await read('./fixtures/workspace-directory-schema.sql'));
  for (const fn of FUNCTIONS) await db.exec(await read(`../schemas/public/functions/${fn}.sql`));
  for (const trigger of triggers) await db.exec(trigger);
  await db.exec(`
    insert into public.workspaces values ('${ws}', '${owner}');
    insert into public.workspace_members (workspace_id, user_id, role) values ('${ws}', '${owner}', 'owner');
    insert into public.workspace_departments (id, workspace_id, name) values ('${engineering}', '${ws}', 'Engineering');
    insert into public.scim_users (id, workspace_id, auth_user_id) values ('${demotedScim}', '${ws}', '${demoted}'), ('${colleagueScim}', '${ws}', '${colleague}');
    insert into public.scim_groups (id, workspace_id, display_name) values ('${admins}', '${ws}', 'Platform admins');
    insert into public.scim_group_members values ('${ws}', '${admins}', '${demotedScim}');
    -- Owner-made mapping: everyone in the group is an admin.
    insert into public.scim_group_mappings (workspace_id, scim_group_id, department_id, access_role) values ('${ws}', '${admins}', '${engineering}', 'admin');
  `);
  assert.deepEqual(await roles(demoted), { member: 'admin', effective: 'admin' }, 'the mapping makes the group member an admin');

  // The owner overrides that member to member.
  await db.query('select public.apply_workspace_member_override($1, $2, $3, false, null, null, $4)', [ws, demoted, 'member', owner]);
  await stillDemoted('the override itself');

  // Rename-only PATCH: no membership changes at all.
  await db.query('select * from public.apply_scim_group_patch($1, $2, $3::jsonb)', [ws, admins, JSON.stringify([{ kind: 'attributes', values: { display_name: 'Platform admins (renamed)' } }])]);
  await stillDemoted('a rename-only Group PATCH');

  // Member PATCH: adding someone else to the mapped group makes them admin, not the overridden member.
  await db.query('select * from public.apply_scim_group_patch($1, $2, $3::jsonb)', [ws, admins, JSON.stringify([{ kind: 'members-add', user_ids: [colleagueScim] }])]);
  await stillDemoted('a member PATCH on the mapped group');
  assert.deepEqual(await roles(colleague), { member: 'admin', effective: 'admin' }, 'the added member gets the mapped admin role');

  // An unrelated, empty group.
  await db.query('select * from public.create_scim_group($1, $2, $3, $4)', [ws, 'ext-unrelated', 'Unrelated', []]);
  await stillDemoted('creating an unrelated empty group');

  // The existing Group replace functions (SCIM PUT) suppress the same triggers.
  await db.query('select * from public.replace_scim_group($1, $2, $3, $4, $5)', [ws, admins, null, 'Platform admins', [demotedScim, colleagueScim]]);
  await stillDemoted('a Group PUT');
  await db.query('select public.replace_scim_group_members($1, $2, $3)', [ws, admins, [demotedScim, colleagueScim]]);
  await stillDemoted('a Group member replace');

  // The override was never saved as a manual grant, and removing it gives the mapped role back.
  assert.equal(Number((await db.query(`select count(*) from public.workspace_access_grants where user_id = $1 and source_type = 'manual'`, [demoted])).rows[0].count), 0,
    'reapplying the override writes no manual grant');
  await db.query('select public.apply_workspace_member_override($1, $2, null, false, null, null, $3)', [ws, demoted, owner]);
  assert.deepEqual(await roles(demoted), { member: 'admin', effective: 'admin' }, 'removing the override restores the mapped role');

  console.log('workspace role overrides survive SCIM writes: ok');
} finally {
  await db.close();
}
