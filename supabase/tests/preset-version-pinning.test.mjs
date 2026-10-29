import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { installCatalogPolicyContext } from './fixtures/catalog-policy-context.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

// Requests pin a preset version with "@slug@ref" / "@handle/slug@ref": an exact
// version label first, then a named label. Unpinned requests are unchanged.
const db = new PGlite();
const ws = '10000000-0000-4000-8000-000000000001';
const otherWs = '10000000-0000-4000-8000-000000000002';
const owner = '30000000-0000-4000-8000-000000000001';
const admin = '30000000-0000-4000-8000-000000000002';
const member = '30000000-0000-4000-8000-000000000003';
const outsider = '30000000-0000-4000-8000-000000000004';
const ownerKey = '20000000-0000-4000-8000-000000000001';
const memberKey = '20000000-0000-4000-8000-000000000002';
const otherKey = '20000000-0000-4000-8000-000000000003';
const preset = '40000000-0000-4000-8000-000000000001';
const privatePreset = '40000000-0000-4000-8000-000000000002';
const otherPreset = '40000000-0000-4000-8000-000000000003';
const migrations = new URL('../migrations/', import.meta.url);
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const context = async (model, key = ownerKey, workspace = ws) => (await rows(
  `select public.gateway_fetch_request_context_without_workspace_budget($1, $2, 'chat.completions', $3) as value`,
  [workspace, model, key],
))[0].value;
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const setLabel = (label, versionId, actor = owner, presetId = preset) => asService(() => rows(
  'select * from public.set_preset_version_label($1, $2, $3, $4)', [presetId, label, versionId, actor]));
const removeLabel = (label, actor = owner, presetId = preset) => asService(() => rows(
  'select public.remove_preset_version_label($1, $2, $3) as removed', [presetId, label, actor]));

try {
  const name = (await readdir(migrations)).find((file) => file.endsWith('_preset_version_labels.sql'));
  assert.ok(name, 'migration exists');
  const migration = await readFile(new URL(name, migrations), 'utf8');
  // The migration carries the declarative definitions verbatim.
  for (const file of [
    'public/tables/preset_version_labels.sql',
    'public/functions/set_preset_version_label.sql',
    'public/functions/remove_preset_version_label.sql',
    'public/functions/gateway_fetch_request_context_without_workspace_budget.sql',
  ]) assert.ok(migration.includes(await schema(file)), `migration includes ${file}`);
  const versionsSchema = await schema('public/tables/preset_versions.sql');
  const uniqueLine = '  CONSTRAINT "preset_versions_preset_id_id_key" UNIQUE (preset_id, id),\n';
  assert.ok(versionsSchema.includes(uniqueLine), 'preset_versions.sql declares the (preset_id, id) key');
  assert.ok(migration.includes('ADD CONSTRAINT "preset_versions_preset_id_id_key" UNIQUE (preset_id, id);'));

  await db.exec(await readFile(new URL('./fixtures/context-bundle-before.sql', import.meta.url), 'utf8'));
  await installCatalogPolicyContext(db);
  await db.exec(`
    alter table public.gateway_requests
      add column if not exists key_id uuid, add column if not exists success boolean,
      add column if not exists cost_nanos bigint, add column if not exists detail_metadata jsonb;
    alter table public.byok_keys add column if not exists name text;
    alter table public.presets add primary key (id);
    create table public.users (user_id uuid primary key);
    create table public.workspace_members (workspace_id uuid, user_id uuid, role text);
  `);
  // preset_versions as production has it before this change.
  await db.exec(versionsSchema.replace(uniqueLine, ''));
  await db.exec(await schema('public/tables/preset_versions.fk.sql'));

  // Context payload for unpinned references before the change, to compare after.
  await db.exec(`
    insert into public.users(user_id) values ('${owner}'), ('${admin}'), ('${member}'), ('${outsider}');
    insert into public.workspaces(id, created_at, tier, publisher_handle) values
      ('${ws}', now(), 'basic', 'acme'), ('${otherWs}', now(), 'basic', 'other');
    insert into public.wallets(workspace_id, balance_nanos, reserved_nanos) values ('${ws}', 5000000000, 0), ('${otherWs}', 5000000000, 0);
    insert into public.workspace_members(workspace_id, user_id, role) values
      ('${ws}', '${owner}', 'owner'), ('${ws}', '${admin}', 'admin'), ('${ws}', '${member}', 'member'), ('${otherWs}', '${outsider}', 'owner');
    insert into public.keys(id, workspace_id, name, status, soft_blocked, created_by, created_at) values
      ('${ownerKey}', '${ws}', 'owner', 'active', false, '${owner}', now()),
      ('${memberKey}', '${ws}', 'member', 'active', false, '${member}', now()),
      ('${otherKey}', '${otherWs}', 'other', 'active', false, '${outsider}', now());
    insert into public.presets(id, workspace_id, name, slug, config, visibility, created_by, versioning_method, draft_visibility) values
      ('${preset}', '${ws}', '@triage', 'triage', '{"model":"lab/model-v3"}', 'public', '${owner}', 'sequential', 'public'),
      ('${privatePreset}', '${ws}', '@mine', 'mine', '{"model":"lab/mine"}', 'private', '${owner}', 'sequential', 'private'),
      ('${otherPreset}', '${otherWs}', '@triage', 'triage', '{"model":"lab/other"}', 'team', '${outsider}', 'sequential', 'team');
  `);
  const versionsBefore = { local: await context('@triage'), public: await context('@acme/triage', otherKey, otherWs) };
  for (const payload of Object.values(versionsBefore)) assert.equal(payload.preset.id, preset);

  await db.exec(migration);

  // Versions: v1 private (before the preset went public), v2 team, v3 public and published.
  const [v1, v2, v3, m1] = ['50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000004'];
  await db.exec(`
    insert into public.preset_versions(id, preset_id, version_number, version_label, versioning_method, name, slug, config, visibility, created_by) values
      ('${v1}', '${preset}', 1, 'v1', 'sequential', '@triage', 'triage', '{"model":"lab/model-v1"}', 'private', '${owner}'),
      ('${v2}', '${preset}', 2, 'v2', 'sequential', '@triage', 'triage-old', '{"model":"lab/model-v2"}', 'team', '${owner}'),
      ('${v3}', '${preset}', 3, 'v3', 'sequential', '@triage', 'triage', '{"model":"lab/model-v3"}', 'public', '${owner}'),
      ('${m1}', '${privatePreset}', 1, 'v1', 'sequential', '@mine', 'mine', '{"model":"lab/mine"}', 'private', '${owner}');
    update public.presets set active_version_id = '${v3}' where id = '${preset}';
    update public.presets set active_version_id = '${m1}' where id = '${privatePreset}';
  `);

  // Unpinned references: same payload as before, plus the published version.
  const local = await context('@triage');
  const { version_id: localVersionId, version_label: localVersionLabel, ...localRest } = local.preset;
  const { version_id: _a, version_label: _b, ...beforeLocal } = versionsBefore.local.preset;
  assert.deepEqual(localRest, beforeLocal);
  assert.deepEqual([localVersionId, localVersionLabel, local.preset.ref], [v3, 'v3', undefined]);
  assert.equal(local.resolved_model, versionsBefore.local.resolved_model);
  const publicRef = await context('@acme/triage', otherKey, otherWs);
  const { version_id: _c, version_label: _d, ...publicRest } = publicRef.preset;
  const { version_id: _e, version_label: _f, ...beforePublic } = versionsBefore.public.preset;
  assert.deepEqual(publicRest, beforePublic);
  assert.equal(publicRef.preset.version_label, 'v3');
  assert.equal((await context('@triage', otherKey, otherWs)).preset.id, otherPreset, 'unqualified references stay workspace-local');

  // Pinning by version label uses that version's whole config.
  const pinned = await context('@triage@v2');
  assert.deepEqual([pinned.preset.version_id, pinned.preset.version_label, pinned.preset.ref], [v2, 'v2', 'v2']);
  assert.equal(pinned.preset.slug, 'triage-old');
  assert.deepEqual(pinned.preset.config, { model: 'lab/model-v2' });
  assert.equal(pinned.preset.id, preset);
  assert.equal(pinned.resolved_model, 'lab/model-v2');
  assert.equal((await context('@TRIAGE@v3')).preset.version_id, v3, 'slug match stays case-insensitive');

  // Label constraints and permissions.
  await assert.rejects(rows(`insert into public.preset_version_labels(preset_id, label, version_id) values ('${preset}', 'v2', '${v2}')`), /preset_version_labels_label_check/);
  for (const bad of ['pro.d', 'pro@d', '1prod', 'has space', 'a'.repeat(33), '', 'v12']) {
    await assert.rejects(setLabel(bad, v2), /invalid_preset_label/, `rejects label ${JSON.stringify(bad)}`);
  }
  await assert.rejects(rows(`insert into public.preset_version_labels(preset_id, label, version_id) values ('${preset}', 'cross', '${m1}')`), /preset_version_labels_version_fkey/, 'a label cannot point at another preset\'s version');
  await assert.rejects(setLabel('cross', m1), /preset_version_not_found/);
  await assert.rejects(setLabel('production', v2, member), /preset_label_forbidden/, 'members cannot move labels');
  await assert.rejects(setLabel('production', v2, outsider), /preset_label_forbidden/);
  await assert.rejects(setLabel('mine', m1, admin, privatePreset), /preset_label_forbidden/, 'admins cannot label a private preset');
  await assert.rejects(setLabel('x', v2, owner, '40000000-0000-4000-8000-0000000000ff'), /preset_not_found/);
  const [created] = await setLabel(' Production ', v2, admin);
  assert.deepEqual([created.label, created.version_id, created.updated_by], ['production', v2, admin]);
  await setLabel('mine', m1, owner, privatePreset);

  // Labels resolve after exact version labels; moving one back is the rollback.
  assert.equal((await context('@triage@production')).preset.version_id, v2);
  assert.equal((await context('@triage@PRODUCTION')).preset.version_id, v2, 'labels match case-insensitively');
  const [moved] = await setLabel('production', v3);
  assert.equal(moved.version_id, v3);
  assert.ok(new Date(moved.updated_at) >= new Date(created.updated_at));
  assert.equal((await rows(`select count(*)::int as n from public.preset_version_labels where preset_id = '${preset}'`))[0].n, 1, 'upsert keeps one row');
  assert.deepEqual([(await context('@triage@production')).preset.version_label, (await context('@triage@production')).preset.ref], ['v3', 'production']);
  await setLabel('production', v2);
  assert.equal((await context('@triage@production')).preset.version_id, v2);

  // Unknown refs raise a distinct error.
  for (const model of ['@triage@v9', '@triage@staging', '@triage@', '@triage@v2@x']) {
    await assert.rejects(context(model), /preset_version_not_found/, model);
  }
  await assert.rejects(context('@nothing@v1'), /preset_not_found/, 'an unknown preset is still preset_not_found');

  // Public references reach public versions only.
  assert.equal((await context('@acme/triage@v3', otherKey, otherWs)).preset.version_id, v3);
  await assert.rejects(context('@acme/triage@v2', otherKey, otherWs), /preset_version_not_found/, 'team version is not public');
  await assert.rejects(context('@acme/triage@production', otherKey, otherWs), /preset_version_not_found/, 'label pointing at a team version');
  await assert.rejects(context('@acme/triage@v1', otherKey, otherWs), /preset_version_not_found/);
  // Workspace references: private versions only for the preset's creator.
  assert.equal((await context('@triage@v1')).preset.version_id, v1);
  await assert.rejects(context('@triage@v1', memberKey), /preset_version_not_found/);
  assert.equal((await context('@triage@v2', memberKey)).preset.version_id, v2);
  assert.equal((await context('@mine@mine')).preset.version_id, m1);
  await assert.rejects(context('@mine@mine', memberKey), /preset_not_found/);

  // Removing labels.
  await assert.rejects(removeLabel('production', member), /preset_label_forbidden/);
  assert.equal((await removeLabel('production', admin))[0].removed, true);
  assert.equal((await removeLabel('production'))[0].removed, false);
  await assert.rejects(context('@triage@production'), /preset_version_not_found/);

  // Cascades: deleting the preset removes its labels.
  await setLabel('staging', v3);
  await db.exec(`delete from public.presets where id = '${preset}'`);
  assert.equal((await rows(`select count(*)::int as n from public.preset_version_labels where preset_id = '${preset}'`))[0].n, 0);

  // Service role only.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select * from public.preset_version_labels'), /permission denied/);
    await assert.rejects(rows(`select public.set_preset_version_label('${privatePreset}', 'x', '${m1}', '${owner}')`), /permission denied/);
    await assert.rejects(rows(`select public.remove_preset_version_label('${privatePreset}', 'x', '${owner}')`), /permission denied/);
    await db.exec('reset role');
  }
  const attributes = (await rows(`select proname, prosecdef from pg_proc where proname in ('set_preset_version_label', 'remove_preset_version_label', 'gateway_fetch_request_context_without_workspace_budget') order by proname`));
  assert.deepEqual(attributes.map((row) => row.prosecdef), [true, true, true]);
  assert.equal((await rows(`select relrowsecurity from pg_class where oid = 'public.preset_version_labels'::regclass`))[0].relrowsecurity, true);
  console.log('Preset version pinning: labels, permissions, resolution order, public-only refs, unknown refs and unchanged unpinned context.');
} finally {
  await db.close();
}
