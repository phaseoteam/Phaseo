// Standalone PostgreSQL regression test for guardrail levels (phase A): workspace_guardrails.kind,
// the workspace_guardrail_assignments table, its one-way copy from key_guardrails and
// workspace_member_guardrails, resolve_key_guardrails, and workspace and department targets in
// apply_guardrail_assignment_change.
// Checks: kind backfill and constraint; assignment backfill; the copy triggers; the target
// constraints; every resolution level (workspace, department through keys.department_id and through
// the principal's grants or override, member including a former member, key), disabled guardrails
// left out; RPC validation and rollback; the Slack agent guardrail stays protected; a deleted
// department's assignments go; department changes queue a gateway publication; grants.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/guardrail-levels.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createGuardrailLevelsBase } from './fixtures/guardrail-levels-before.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_guardrail_levels.sql'));
assert(migrationName, 'the migration exists');
const migration = await read(`../migrations/${migrationName}`);
const newFiles = [
  'public/tables/workspace_guardrail_assignments.sql',
  'private/functions/sync_guardrail_assignments.sql',
  'public/functions/resolve_key_guardrails.sql',
  'public/functions/resolve_member_guardrails.sql',
];
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
// The schema files as this migration left them: the workspace baseline migration later adds a
// three-argument resolve_key_guardrails (after the two-argument form) and a protection trigger on
// workspace_guardrail_assignments.
const phaseAPart = (file, text) => {
  const later = text.indexOf('\nCREATE OR REPLACE FUNCTION public.resolve_key_guardrails (\n  p_workspace_id               uuid,');
  const withoutLaterFunction = file === 'public/functions/resolve_key_guardrails.sql' && later > 0 ? text.slice(0, later).trim() : text;
  return withoutLaterFunction.replace(/CREATE TRIGGER protect_workspace_baseline_guardrail\n[^;]*;\n\n/, '');
};
for (const file of [...newFiles, 'public/functions/apply_guardrail_assignment_change.sql']) {
  assert(normalize(migration).includes(phaseAPart(file, normalize(await read(`../schemas/${file}`)))), `${file} is in ${migrationName}`);
  for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(file), `${file} is in the manifest's ${list}`);
}
const triggerIn = async (file, name) => {
  const text = normalize(await read(`../schemas/${file}`));
  const start = text.indexOf(`CREATE TRIGGER ${name}\n`);
  assert(start >= 0, `${file} declares ${name}`);
  return text.slice(start, text.indexOf(';', start) + 1);
};
for (const [file, name] of [
  ['public/tables/key_guardrails.sql', 'sync_guardrail_assignments'],
  ['public/tables/workspace_member_guardrails.sql', 'sync_guardrail_assignments'],
  ['public/tables/workspace_departments.sql', 'sync_guardrail_assignments'],
  ['public/tables/workspace_department_grants.sql', 'gateway_workspace_publication'],
  ['public/tables/workspace_member_overrides.sql', 'gateway_workspace_publication'],
  ['public/tables/keys.sql', 'keys_department_gateway_publication'],
]) assert(normalize(migration).includes(await triggerIn(file, name)), `${file} trigger ${name} is in ${migrationName}`);
const guardrailsTable = normalize(await read('../schemas/public/tables/workspace_guardrails.sql'));
assert(guardrailsTable.includes(`"kind"                                    text                     NOT NULL DEFAULT 'access'::text,`), 'the table file declares kind');
const kindCheck = guardrailsTable.split('\n').find((line) => line.includes('workspace_guardrails_kind_check')).trim().replace(/,$/, '');
assert(migration.includes(kindCheck), 'the migration adds the same kind check');
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: .{12,}/, 'the DELETEs in function bodies are declared');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/guardrail-levels\.test\.mjs/, 'CI runs this suite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [W1, W2] = [id(1), id(2)];
const [D1, D2, DFOREIGN, DGONE] = [id(41), id(42), id(43), id(44)];
const [U1, U2, U3, ULEFT] = [id(31), id(32), id(33), id(34)];
// Guardrails. Before the migration: GA access, GS safety, GM mixed (counts as access), GN nothing on.
const [GA, GS, GM, GN] = [id(11), id(12), id(13), id(14)];
const [GWS, GD1, GD2, GU1, GLEFT, GK, GOFF, GFOREIGN, GSLACK] = [id(51), id(52), id(53), id(54), id(55), id(56), id(57), id(58), id(59)];
// Keys. KLINK is linked to D2; KU1 / KU2 / KLEFT are unlinked keys of U1 / U2 / ULEFT; KOAUTH is U1's
// OAuth key that U2 created (OAuth keys ignore department_id); KNONE's creator has no department.
const [KLINK, KU1, KU2, KLEFT, KOAUTH, KNONE, KFOREIGN, KSLACK] = [id(21), id(22), id(23), id(24), id(25), id(26), id(27), id(28)];
const short = (value) => (value ? value.slice(-2) : '--');

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const apply = (workspaceId, targetType, targetIds, add, remove) => db.query(
  'select public.apply_guardrail_assignment_change($1::uuid, $2, $3::uuid[], $4::uuid[], $5::uuid[])',
  [workspaceId, targetType, targetIds, add, remove],
);
const assignments = async () => (await rows(`select workspace_id, guardrail_id, target_type, target_id from public.workspace_guardrail_assignments
  `)).map((row) => `${short(row.workspace_id)}:${row.target_type}:${short(row.target_id)}:${short(row.guardrail_id)}`).sort();
const resolve = async (workspaceId, keyId) => (await rows('select * from public.resolve_key_guardrails($1, $2)', [workspaceId, keyId]))
  .map((row) => `${short(row.guardrail_id)}@${row.source_type}:${short(row.source_id)}`);
const resolveMember = async (workspaceId, userId) => (await rows('select * from public.resolve_member_guardrails($1, $2)', [workspaceId, userId]))
  .map((row) => `${short(row.guardrail_id)}@${row.source_type}:${short(row.source_id)}`);
const publications = async () => {
  const result = (await rows('select table_name, workspace_id from private.test_publications')).map((row) => `${row.table_name}:${short(row.workspace_id)}`);
  await db.exec('delete from private.test_publications');
  return [...new Set(result)].sort();
};

try {
  await createGuardrailLevelsBase(db);
  await db.exec(`
    insert into public.workspaces values ('${W1}'), ('${W2}');
    insert into public.users values ('${U1}'), ('${U2}'), ('${U3}'), ('${ULEFT}');
    insert into public.workspace_departments values ('${D1}', '${W1}'), ('${D2}', '${W1}'), ('${DGONE}', '${W1}'), ('${DFOREIGN}', '${W2}');
    insert into public.keys (id, workspace_id, created_by, oauth_user_id, key_kind, department_id) values
      ('${KLINK}', '${W1}', '${U1}', null, 'standard', '${D2}'),
      ('${KU1}', '${W1}', '${U1}', null, 'standard', null),
      ('${KU2}', '${W1}', '${U2}', null, 'standard', null),
      ('${KLEFT}', '${W1}', '${ULEFT}', null, 'standard', null),
      ('${KOAUTH}', '${W1}', '${U2}', '${U1}', 'oauth_delegated', '${D2}'),
      ('${KNONE}', '${W1}', '${U3}', null, 'standard', null),
      ('${KSLACK}', '${W1}', '${U3}', null, 'standard', null),
      ('${KFOREIGN}', '${W2}', '${U1}', null, 'standard', null);
    insert into public.workspace_guardrails (id, workspace_id, privacy_enable_paid_may_train, prompt_injection_enabled, sensitive_info_enabled, privacy_zdr_only) values
      ('${GA}', '${W1}', false, false, false, false),
      ('${GS}', '${W1}', true, true, false, false),
      ('${GM}', '${W1}', true, false, true, true),
      ('${GN}', '${W1}', true, false, false, false);
    insert into public.key_guardrails (key_id, guardrail_id) values ('${KU1}', '${GA}'), ('${KU2}', '${GS}');
    insert into public.workspace_member_guardrails (workspace_id, user_id, guardrail_id) values ('${W1}', '${U2}', '${GM}');
  `);

  await db.exec(migration);
  await publications();

  // ---- kind: backfilled, checked, defaulted.
  assert.deepEqual((await rows('select id, kind from public.workspace_guardrails order by id')).map((row) => `${short(row.id)}:${row.kind}`),
    ['11:access', '12:safety', '13:access', '14:access'], 'safety only when a safety check is on and no access setting is');
  await assert.rejects(db.query(`update public.workspace_guardrails set kind = 'budget' where id = '${GN}'`), /workspace_guardrails_kind_check/);

  // ---- Backfill from the legacy tables.
  assert.deepEqual(await assignments(), ['01:key:22:11', '01:key:23:12', '01:member:32:13'], 'key and member rows are copied with their workspace');

  // ---- The copy triggers follow inserts, updates and deletes.
  await db.exec(`insert into public.key_guardrails (key_id, guardrail_id) values ('${KLINK}', '${GN}')`);
  await db.exec(`insert into public.workspace_member_guardrails (workspace_id, user_id, guardrail_id) values ('${W1}', '${U1}', '${GN}')`);
  assert.deepEqual(await assignments(), ['01:key:21:14', '01:key:22:11', '01:key:23:12', '01:member:31:14', '01:member:32:13']);
  await db.exec(`update public.key_guardrails set key_id = '${KNONE}' where key_id = '${KLINK}' and guardrail_id = '${GN}'`);
  await db.exec(`delete from public.workspace_member_guardrails where user_id = '${U1}' and guardrail_id = '${GN}'`);
  assert.deepEqual(await assignments(), ['01:key:22:11', '01:key:23:12', '01:key:26:14', '01:member:32:13'], 'an update moves the row; a delete removes it');
  await db.exec(`delete from public.workspace_guardrails where id = '${GN}'`);
  assert.deepEqual(await assignments(), ['01:key:22:11', '01:key:23:12', '01:member:32:13'], 'a deleted guardrail takes its assignments');
  assert.deepEqual(await publications(), ['workspace_guardrail_assignments:01'], 'assignment changes queue a publication');

  // ---- Target constraints.
  await assert.rejects(db.query(`insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id) values ('${W1}', '${GA}', 'workspace', '${D1}')`), /workspace_guardrail_assignments_target_id_check/);
  await assert.rejects(db.query(`insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type) values ('${W1}', '${GA}', 'department')`), /workspace_guardrail_assignments_target_id_check/);
  await assert.rejects(db.query(`insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id) values ('${W1}', '${GA}', 'team', '${D1}')`), /workspace_guardrail_assignments_target_type_check/);
  await db.exec(`insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type) values ('${W1}', '${GA}', 'workspace')`);
  await assert.rejects(db.query(`insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type) values ('${W1}', '${GA}', 'workspace')`), /workspace_guardrail_assignments_unique_idx/,
    'a guardrail is assigned to the workspace at most once');
  await db.exec(`delete from public.workspace_guardrail_assignments where target_type = 'workspace'`);

  // ---- Resolution at every level.
  await db.exec(`
    delete from public.key_guardrails; delete from public.workspace_member_guardrails;
    insert into public.workspace_guardrails (id, workspace_id, enabled) values
      ('${GWS}', '${W1}', true), ('${GD1}', '${W1}', true), ('${GD2}', '${W1}', true), ('${GU1}', '${W1}', true),
      ('${GLEFT}', '${W1}', true), ('${GK}', '${W1}', true), ('${GOFF}', '${W1}', false), ('${GFOREIGN}', '${W2}', true);
    insert into public.workspace_department_grants (workspace_id, user_id, department_id, source_type, is_primary, created_at) values
      ('${W1}', '${U1}', '${D1}', 'manual', true, now() - interval '1 day'),
      ('${W1}', '${U1}', '${D2}', 'scim_group', false, now()),
      ('${W1}', '${U2}', '${D1}', 'manual', true, now());
    insert into public.workspace_member_overrides (workspace_id, user_id, department_override_enabled, department_id) values ('${W1}', '${U2}', true, '${D2}');
  `);
  await apply(W1, 'workspace', [], [GWS, GOFF], []);
  await apply(W1, 'department', [D1], [GD1], []);
  await apply(W1, 'department', [D2], [GD2], []);
  await apply(W1, 'member', [U1], [GU1], []);
  await apply(W1, 'member', [ULEFT], [GLEFT], []);
  await apply(W1, 'key', [KU1], [GK], []);
  await apply(W2, 'workspace', [], [GFOREIGN], []);

  assert.deepEqual(await resolve(W1, KLINK), ['51@workspace:--', '53@department:42', '54@member:31'],
    "a linked key counts only toward its own department; its creator's member guardrails apply");
  assert.deepEqual(await resolve(W1, KU1), ['51@workspace:--', '52@department:41', '53@department:42', '54@member:31', '56@key:22'],
    "an unlinked key counts toward all of its principal's departments");
  await db.exec(`insert into public.workspace_settings (workspace_id, department_spend_attribution) values ('${W1}', 'primary')`);
  assert.deepEqual(await resolve(W1, KU1), ['51@workspace:--', '52@department:41', '54@member:31', '56@key:22'],
    'with primary attribution only the primary department counts');
  await db.exec(`delete from public.workspace_settings`);
  assert.deepEqual(await resolve(W1, KU2), ['51@workspace:--', '53@department:42'], "an override replaces the principal's directory departments");
  assert.deepEqual(await resolve(W1, KOAUTH), ['51@workspace:--', '52@department:41', '53@department:42', '54@member:31'],
    "an OAuth key resolves through its OAuth user, not its creator or its department_id");
  assert.deepEqual(await resolve(W1, KLEFT), ['51@workspace:--', '55@member:34'], "a former member's guardrails still apply to their keys");
  assert.deepEqual(await resolve(W1, KNONE), ['51@workspace:--'], 'a key with no department, member or key guardrails gets the workspace level');
  assert.deepEqual(await resolve(W1, KFOREIGN), [], 'a key from another workspace resolves to nothing');
  assert.deepEqual(await resolve(W2, KFOREIGN), ['58@workspace:--']);
  await db.exec(`update public.workspace_guardrails set enabled = false where id = '${GD1}'`);
  assert(!(await resolve(W1, KU1)).some((row) => row.startsWith('52@')), 'a disabled guardrail is left out');
  // A member's own key with no department (their Chat key) gets what their unlinked keys get, minus key-level rows.
  for (const [keyId, userId] of [[KU1, U1], [KU2, U2]]) {
    assert.deepEqual(await resolveMember(W1, userId), (await resolve(W1, keyId)).filter((row) => !row.includes('@key:')),
      'resolve_member_guardrails matches resolve_key_guardrails for an unlinked key');
  }
  assert.deepEqual(await resolveMember(W2, U1), ['58@workspace:--'], 'another workspace only gives its workspace level');
  await db.exec(`update public.workspace_guardrails set enabled = true where id = '${GD1}'`);
  await publications();

  // ---- Department membership changes queue a publication; unrelated key edits do not.
  await db.exec(`update public.workspace_department_grants set position = 'lead' where user_id = '${U2}'`);
  await db.exec(`update public.workspace_member_overrides set department_override_enabled = false, department_id = null where user_id = '${U2}'`);
  assert.deepEqual(await publications(), ['workspace_department_grants:01', 'workspace_member_overrides:01']);
  assert.deepEqual(await resolve(W1, KU2), ['51@workspace:--', '52@department:41'], 'without the override the grants apply again');
  await db.exec(`update public.keys set name = 'renamed' where id = '${KU1}'`);
  assert.deepEqual(await publications(), [], 'a key edit that leaves its department alone queues nothing');
  await db.exec(`update public.keys set department_id = '${D1}' where id = '${KU1}'`);
  assert.deepEqual(await publications(), ['keys:01']);
  assert.deepEqual(await resolve(W1, KU1), ['51@workspace:--', '52@department:41', '54@member:31', '56@key:22']);

  // ---- Workspace and department targets in the RPC.
  await apply(W1, 'department', [D1, D2], [GA], [GD1]);
  assert.deepEqual((await assignments()).filter((row) => row.includes(':department:')), ['01:department:41:11', '01:department:42:11', '01:department:42:53']);
  await apply(W1, 'workspace', null, [], [GOFF]);
  assert.deepEqual((await assignments()).filter((row) => row.startsWith('01:workspace:')), ['01:workspace:--:51'], 'NULL target ids mean the workspace too');
  await assert.rejects(apply(W1, 'workspace', [D1], [GA], []), /invalid_guardrail_assignment_target/, 'workspace changes take no target ids');
  await assert.rejects(apply(W1, 'department', [D1, DFOREIGN], [GD1], []), /guardrail_assignment_target_not_found/);
  await assert.rejects(apply(W1, 'department', [KU1], [GD1], []), /guardrail_assignment_target_not_found/, 'a key id is not a department');
  await assert.rejects(apply(W1, 'workspace', [], [GFOREIGN], []), /guardrail_not_found/);
  // A legacy member row pointing at another workspace's guardrail is refused (and its insert rolled
  // back) instead of taking that guardrail's member slot from the workspace that owns it.
  const beforeForeign = await assignments();
  await assert.rejects(db.query(`insert into public.workspace_member_guardrails (workspace_id, user_id, guardrail_id) values ('${W1}', '${U1}', '${GFOREIGN}')`),
    /workspace_guardrail_assignments_guardrail_workspace_fkey/);
  assert.equal((await rows(`select count(*)::int n from public.workspace_member_guardrails where guardrail_id = '${GFOREIGN}'`))[0].n, 0, 'the legacy insert is rolled back');
  assert.deepEqual(await assignments(), beforeForeign, 'nothing is stored');
  await assert.rejects(db.query(`insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id) values ('${W1}', '${GFOREIGN}', 'department', '${D1}')`),
    /workspace_guardrail_assignments_guardrail_workspace_fkey/, 'a direct cross-workspace row is refused too');
  await assert.rejects(apply(W1, null, [], [GA], []), /invalid_guardrail_assignment_target/);

  // ---- Key and member changes go through the legacy tables and are copied.
  await apply(W1, 'key', [KU2, KNONE], [GA], [GK]);
  assert.deepEqual((await rows('select key_id, guardrail_id from public.key_guardrails order by 1, 2')).map((row) => `${short(row.key_id)}:${short(row.guardrail_id)}`),
    ['22:56', '23:11', '26:11']);
  assert.deepEqual((await assignments()).filter((row) => row.includes(':key:')), ['01:key:22:56', '01:key:23:11', '01:key:26:11']);
  await apply(W1, 'member', [ULEFT], [], [GLEFT]);
  assert.deepEqual((await assignments()).filter((row) => row.includes(':member:')), ['01:member:31:54'], "a former member's row can be removed");

  // ---- A failure part-way leaves every assignment as it was.
  const before = await assignments();
  await db.exec(`
    create function public.fail_on_d2() returns trigger language plpgsql as $$
    begin if new.target_id = '${D2}' then raise exception 'simulated failure'; end if; return new; end $$;
    create trigger fail_on_d2 before insert on public.workspace_guardrail_assignments for each row execute function public.fail_on_d2();
  `);
  await assert.rejects(apply(W1, 'department', [D1, D2], [GD1], [GA]), /simulated failure/);
  await db.exec('drop trigger fail_on_d2 on public.workspace_guardrail_assignments');
  assert.deepEqual(await assignments(), before, 'the department removals are rolled back with the failed additions');

  // ---- The Slack agent guardrail stays on its key.
  await db.exec(`
    insert into public.workspace_guardrails (id, workspace_id, privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts)
      values ('${GSLACK}', '${W1}', false, false, false);
    insert into public.key_guardrails (key_id, guardrail_id) values ('${KSLACK}', '${GSLACK}');
    insert into public.slack_installations (key_id, guardrail_id) values ('${KSLACK}', '${GSLACK}');
  `);
  const withSlack = await assignments();
  assert(withSlack.includes('01:key:28:59'));
  await assert.rejects(apply(W1, 'key', [KSLACK, KNONE], [GD2], [GSLACK]), /slack_agent_guardrail_protected/);
  assert.deepEqual(await assignments(), withSlack, 'the refused change writes nothing');

  // ---- A deleted department's assignments go with it.
  await apply(W1, 'department', [DGONE], [GA], []);
  await db.exec(`delete from public.workspace_departments where id = '${DGONE}'`);
  assert(!(await assignments()).some((row) => row.includes(`:department:${short(DGONE)}:`)), "the department's rows are deleted");
  await publications();
  await db.exec(`delete from public.workspace_departments where id = '${D2}'`);
  assert.equal((await rows(`select department_id from public.keys where id = '${KLINK}'`))[0].department_id, null, 'its keys are unlinked');
  assert.deepEqual(await publications(), ['keys:01', 'workspace_department_grants:01', 'workspace_guardrail_assignments:01'],
    'deleting a department queues a publication through its grants, keys and assignments');

  // ---- Service role only.
  const functionGrants = await rows(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') authenticated, has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.proname in ('apply_guardrail_assignment_change', 'resolve_key_guardrails', 'resolve_member_guardrails', 'sync_guardrail_assignments') order by 1`);
  assert.deepEqual(functionGrants, [
    { proname: 'apply_guardrail_assignment_change', anon: false, authenticated: false, service: true },
    { proname: 'resolve_key_guardrails', anon: false, authenticated: false, service: true },
    { proname: 'resolve_member_guardrails', anon: false, authenticated: false, service: true },
    { proname: 'sync_guardrail_assignments', anon: false, authenticated: false, service: false },
  ]);
  const tableGrants = await rows(`select r.rolname,
      has_table_privilege(r.rolname, 'public.workspace_guardrail_assignments', 'select') sel,
      has_table_privilege(r.rolname, 'public.workspace_guardrail_assignments', 'insert') ins,
      has_table_privilege(r.rolname, 'public.workspace_guardrail_assignments', 'delete') del,
      has_table_privilege(r.rolname, 'public.workspace_guardrail_assignments', 'truncate') trunc
    from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') order by 1`);
  assert.deepEqual(tableGrants, [
    { rolname: 'anon', sel: false, ins: false, del: false, trunc: false },
    { rolname: 'authenticated', sel: false, ins: false, del: false, trunc: false },
    { rolname: 'service_role', sel: true, ins: true, del: true, trunc: false },
  ]);
  assert.deepEqual(await rows(`select relrowsecurity from pg_class where oid = 'public.workspace_guardrail_assignments'::regclass`), [{ relrowsecurity: true }]);
  console.log('guardrail levels: ok');
} finally {
  await db.close();
}
