// Standalone PostgreSQL regression test for guardrail levels phase B: the workspace baseline guardrail.
// Checks: the migration matches the schema files; the backfill creates a baseline only for workspaces
// whose settings restrict something, copies every value (workspace_settings.model_restriction_model_ids
// becomes allowed_api_model_ids) and assigns it at workspace level; resolve_key_guardrails returns it
// (and the three-argument form can leave it out); the protection trigger (delete, disable, kind, flag,
// client insert, unassign, other levels, cascade with the workspace); lazy creation and partial saves
// through save_workspace_baseline_guardrail; the two-way copy with workspace_settings, including older
// code writing the columns; validation; publications; grants.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/workspace-baseline-guardrail.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createGuardrailLevelsBase } from './fixtures/guardrail-levels-before.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const levelsName = migrations.find((name) => name.endsWith('_guardrail_levels.sql'));
const migrationName = migrations.find((name) => name.endsWith('_workspace_baseline_guardrail.sql'));
assert(levelsName && migrationName, 'both migrations exist');
assert(migrationName > levelsName, 'phase B runs after phase A');
const levelsMigration = await read(`../migrations/${levelsName}`);
const migration = await read(`../migrations/${migrationName}`);
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of [
  'private/functions/protect_workspace_baseline_guardrail.sql',
  'private/functions/ensure_workspace_baseline_guardrail.sql',
  'private/functions/sync_workspace_baseline_guardrail.sql',
  'public/functions/save_workspace_baseline_guardrail.sql',
]) {
  assert(normalize(migration).includes(normalize(await read(`../schemas/${file}`))), `${file} is in ${migrationName}`);
  for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(file), `${file} is in the manifest's ${list}`);
}
const resolveFile = normalize(await read('../schemas/public/functions/resolve_key_guardrails.sql'));
const threeArgStart = resolveFile.indexOf('CREATE OR REPLACE FUNCTION public.resolve_key_guardrails (\n  p_workspace_id               uuid,');
assert(threeArgStart > 0, 'the schema file declares the three-argument form after the two-argument one');
assert(normalize(levelsMigration).includes(resolveFile.slice(0, threeArgStart).trim()), 'the two-argument form is unchanged since phase A');
assert(normalize(migration).includes(resolveFile.slice(threeArgStart)), 'the three-argument form is in the migration');
const triggerIn = async (file, name) => {
  const text = normalize(await read(`../schemas/${file}`));
  const start = text.indexOf(`CREATE TRIGGER ${name}\n`);
  assert(start >= 0, `${file} declares ${name}`);
  return text.slice(start, text.indexOf(';', start) + 1);
};
for (const [file, name] of [
  ['public/tables/workspace_guardrails.sql', 'protect_workspace_baseline_guardrail'],
  ['public/tables/workspace_guardrails.sql', 'sync_workspace_baseline_guardrail'],
  ['public/tables/workspace_guardrail_assignments.sql', 'protect_workspace_baseline_guardrail'],
  ['public/tables/workspace_settings.sql', 'sync_workspace_baseline_guardrail'],
]) assert(normalize(migration).includes(await triggerIn(file, name)), `${file} trigger ${name} is in ${migrationName}`);
const guardrailsTable = normalize(await read('../schemas/public/tables/workspace_guardrails.sql'));
assert(guardrailsTable.includes('"is_workspace_baseline"                   boolean                  NOT NULL DEFAULT false,'), 'the table file declares the flag');
for (const needle of ['workspace_guardrails_baseline_kind_check', 'CREATE UNIQUE INDEX workspace_guardrails_one_baseline_idx']) {
  const statement = guardrailsTable.split('\n').find((line) => line.includes(needle)).trim().replace(/^CONSTRAINT /, '').replace(/,$/, '');
  assert(migration.includes(statement), `the migration has ${needle}`);
}
assert(!/^-- phaseo:allow-destructive-migration/m.test(migration) && !/\b(delete\s+from|drop\s+(table|column|function)|truncate)\b/i.test(migration),
  'the migration deletes and drops nothing');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/workspace-baseline-guardrail\.test\.mjs/, 'CI runs this suite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// W1 restricts (backfilled). W2 is unrestricted but has a stale provider list. W3 has no settings
// row. W4 has no keys (for the cascade). W5 is unrestricted and stays without a baseline.
const [W1, W2, W3, W4, W5] = [id(1), id(2), id(3), id(4), id(5)];
const [U1] = [id(31)];
const [K1, K2, K3] = [id(21), id(22), id(23)];
const [GOTHER, GKEY] = [id(11), id(12)];
const short = (value) => (value ? value.slice(-2) : '--');
const COLUMNS = 'privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts, privacy_enable_input_output_logging, privacy_zdr_only, provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed, model_restriction_mode';

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const baseline = async (workspaceId) => (await rows(`select * from public.workspace_guardrails where workspace_id = $1 and is_workspace_baseline`, [workspaceId]))[0] ?? null;
const settings = async (workspaceId) => (await rows(`select * from public.workspace_settings where workspace_id = $1`, [workspaceId]))[0] ?? null;
const baselineIds = async () => (await rows('select workspace_id from public.workspace_guardrails where is_workspace_baseline order by workspace_id')).map((row) => short(row.workspace_id));
const workspaceAssignments = async (workspaceId) => (await rows(`select a.guardrail_id, a.target_type, a.target_id from public.workspace_guardrail_assignments a where a.workspace_id = $1 order by a.target_type`, [workspaceId]));
const resolve = async (workspaceId, keyId, include) => (await rows(include === undefined
  ? 'select * from public.resolve_key_guardrails($1, $2)'
  : 'select * from public.resolve_key_guardrails($1, $2, $3)', include === undefined ? [workspaceId, keyId] : [workspaceId, keyId, include]))
  .map((row) => `${row.guardrail_id}@${row.source_type}`);
const save = (workspaceId, values) => db.query('select public.save_workspace_baseline_guardrail($1::uuid, $2::jsonb) as row', [workspaceId, JSON.stringify(values)]);
const mirror = (row, modelColumn) => row && ({
  paid: row.privacy_enable_paid_may_train, free: row.privacy_enable_free_may_train, publish: row.privacy_enable_free_may_publish_prompts,
  logging: row.privacy_enable_input_output_logging, zdr: row.privacy_zdr_only,
  providerMode: row.provider_restriction_mode, providers: row.provider_restriction_provider_ids, enforce: row.provider_restriction_enforce_allowed,
  modelMode: row.model_restriction_mode, models: row[modelColumn],
});
const assertInStep = async (workspaceId, message) => assert.deepEqual(
  mirror(await settings(workspaceId), 'model_restriction_model_ids'), mirror(await baseline(workspaceId), 'allowed_api_model_ids'), message);
const publications = async () => {
  const result = (await rows('select table_name, workspace_id from private.test_publications')).map((row) => `${row.table_name}:${short(row.workspace_id)}`);
  await db.exec('delete from private.test_publications');
  return [...new Set(result)].sort();
};
const protectedError = /workspace_baseline_guardrail_protected/;

try {
  await createGuardrailLevelsBase(db);
  // The columns this migration reads and writes, which the shared phase A fixture leaves out.
  await db.exec(`
    alter table public.workspace_settings
      add column updated_at timestamptz not null default now(),
      add column privacy_enable_paid_may_train boolean not null default true,
      add column privacy_enable_free_may_train boolean not null default true,
      add column privacy_enable_free_may_publish_prompts boolean not null default true,
      add column privacy_enable_input_output_logging boolean not null default true,
      add column privacy_zdr_only boolean not null default false,
      add column provider_restriction_mode text not null default 'none',
      add column provider_restriction_provider_ids text[] not null default '{}',
      add column provider_restriction_enforce_allowed boolean not null default false,
      add column model_restriction_mode text not null default 'none',
      add column model_restriction_model_ids text[] not null default '{}',
      add column routing_mode text not null default 'balanced';
    alter table public.workspace_guardrails
      alter column id set default gen_random_uuid(),
      add column name text not null default 'Guardrail',
      add column description text,
      add column provider_restriction_provider_ids text[] not null default '{}',
      add column allowed_api_model_ids text[] not null default '{}',
      add column created_at timestamptz not null default now(),
      add column updated_at timestamptz not null default now(),
      add constraint workspace_guardrails_provider_restriction_mode_check check (provider_restriction_mode in ('none', 'allowlist', 'blocklist')),
      add constraint workspace_guardrails_model_restriction_mode_check check (model_restriction_mode in ('none', 'allowlist', 'blocklist'));
    create trigger gateway_workspace_publication after insert or delete or update on public.workspace_settings
      for each row execute function private.capture_gateway_workspace_publication();
    create trigger gateway_workspace_publication after insert or delete or update on public.workspace_guardrails
      for each row execute function private.capture_gateway_workspace_publication();
  `);
  await db.exec(levelsMigration);
  await db.exec(`
    insert into public.workspaces values ('${W1}'), ('${W2}'), ('${W3}'), ('${W4}'), ('${W5}');
    insert into public.users values ('${U1}');
    insert into public.workspace_settings (workspace_id, privacy_enable_paid_may_train, privacy_zdr_only, provider_restriction_mode, provider_restriction_provider_ids, model_restriction_mode, model_restriction_model_ids) values
      ('${W1}', false, true, 'allowlist', '{openai,anthropic}', 'blocklist', '{gpt-x}');
    insert into public.workspace_settings (workspace_id, provider_restriction_provider_ids) values ('${W2}', '{mistral}');
    insert into public.workspace_settings (workspace_id) values ('${W4}'), ('${W5}');
    insert into public.keys (id, workspace_id, created_by) values ('${K1}', '${W1}', '${U1}'), ('${K2}', '${W2}', '${U1}'), ('${K3}', '${W3}', '${U1}');
    insert into public.workspace_guardrails (id, workspace_id, name, privacy_enable_free_may_train) values
      ('${GOTHER}', '${W1}', 'Other', false), ('${GKEY}', '${W1}', 'On a key', false);
    insert into public.key_guardrails (key_id, guardrail_id) values ('${K1}', '${GKEY}');
  `);
  const settingsBefore = await rows('select * from public.workspace_settings order by workspace_id');

  await db.exec(migration);
  await publications();

  // ---- Backfill: only the restricting workspace, with every value, assigned at workspace level.
  assert.deepEqual(await baselineIds(), ['01'], 'a baseline only for the workspace whose settings restrict something');
  const b1 = await baseline(W1);
  assert.equal(b1.kind, 'access');
  assert.equal(b1.enabled, true);
  assert.equal(b1.name, 'Workspace baseline');
  assert.deepEqual(mirror(b1, 'allowed_api_model_ids'), {
    paid: false, free: true, publish: true, logging: true, zdr: true,
    providerMode: 'allowlist', providers: ['openai', 'anthropic'], enforce: false, modelMode: 'blocklist', models: ['gpt-x'],
  }, 'every value is copied, the model list into allowed_api_model_ids');
  assert.deepEqual((await workspaceAssignments(W1)).filter((row) => row.guardrail_id === b1.id).map((row) => `${row.target_type}:${row.target_id}`),
    ['workspace:null'], 'assigned to the whole workspace only');
  assert.deepEqual(await rows('select * from public.workspace_settings order by workspace_id'), settingsBefore, 'the settings rows are left as they were');
  await assertInStep(W1, 'the backfilled baseline equals its settings');

  // ---- Resolution.
  assert.deepEqual(await resolve(W1, K1), [`${GKEY}@key`, `${b1.id}@workspace`].sort(), 'the two-argument form returns the baseline like any workspace guardrail');
  assert.deepEqual(await resolve(W1, K1, true), await resolve(W1, K1), 'with the baseline, the three-argument form returns the same rows');
  assert.deepEqual(await resolve(W1, K1, false), [`${GKEY}@key`], 'it can leave the baseline out');
  assert.deepEqual(await resolve(W2, K2, true), [], 'an unrestricted workspace resolves nothing');
  await db.exec(`update public.workspace_guardrails set name = 'Company rules', description = 'Ours' where id = '${b1.id}'`);
  assert.equal((await baseline(W1)).name, 'Company rules', 'the baseline can be renamed');

  // ---- Protection.
  for (const [what, sql] of [
    ['delete', `delete from public.workspace_guardrails where id = '${b1.id}'`],
    ['disable', `update public.workspace_guardrails set enabled = false where id = '${b1.id}'`],
    ['change kind', `update public.workspace_guardrails set kind = 'safety' where id = '${b1.id}'`],
    ['clear the flag', `update public.workspace_guardrails set is_workspace_baseline = false where id = '${b1.id}'`],
    ['make another guardrail the baseline', `update public.workspace_guardrails set is_workspace_baseline = true where id = '${GOTHER}'`],
    ['move it', `update public.workspace_guardrails set workspace_id = '${W2}' where id = '${b1.id}'`],
    ['delete its workspace assignment', `delete from public.workspace_guardrail_assignments where guardrail_id = '${b1.id}'`],
    ['retarget its assignment', `update public.workspace_guardrail_assignments set target_type = 'key', target_id = '${K1}' where guardrail_id = '${b1.id}'`],
    ['assign it to a key through key_guardrails', `insert into public.key_guardrails (key_id, guardrail_id) values ('${K1}', '${b1.id}')`],
    ['unassign it through the RPC', `select public.apply_guardrail_assignment_change('${W1}', 'workspace', '{}', '{}', '{${b1.id}}')`],
    ['assign it to a member through the RPC', `select public.apply_guardrail_assignment_change('${W1}', 'member', '{${U1}}', '{${b1.id}}', '{}')`],
  ]) await assert.rejects(db.query(sql), protectedError, `the baseline cannot ${what}`);
  assert.deepEqual(await baselineIds(), ['01'], 'still one baseline after the refused changes');
  assert.equal((await workspaceAssignments(W1)).filter((row) => row.guardrail_id === b1.id).length, 1, 'still assigned');
  await assert.rejects(db.query(`insert into public.workspace_guardrails (workspace_id, name, is_workspace_baseline) values ('${W1}', 'x', true)`),
    /workspace_guardrails_one_baseline_idx/, 'one baseline per workspace');
  await assert.rejects(db.query(`insert into public.workspace_guardrails (workspace_id, name, kind, is_workspace_baseline) values ('${W5}', 'x', 'safety', true)`),
    /workspace_guardrails_baseline_kind_check/, 'a baseline is always an access guardrail');
  await db.exec(`grant insert, select on public.workspace_guardrails to authenticated`);
  await db.exec('set role authenticated');
  await assert.rejects(db.query(`insert into public.workspace_guardrails (workspace_id, name, is_workspace_baseline) values ('${W5}', 'x', true)`),
    protectedError, 'clients cannot create a baseline');
  await db.exec('reset role');
  await db.exec(`revoke insert, select on public.workspace_guardrails from authenticated`);
  // The baseline may still be added to the workspace again (a no-op), and other guardrails move freely.
  await db.query(`select public.apply_guardrail_assignment_change('${W1}', 'workspace', '{}', '{${b1.id},${GOTHER}}', '{}')`);
  await db.query(`select public.apply_guardrail_assignment_change('${W1}', 'workspace', '{}', '{}', '{${GOTHER}}')`);
  await db.exec(`delete from public.workspace_guardrails where id = '${GOTHER}'`);

  // ---- Lazy creation and saves.
  await publications();
  const saved = (await save(W2, { privacy_zdr_only: true, allowed_api_model_ids: ['m-1', 'm-2'], model_restriction_mode: 'allowlist' })).rows[0].row;
  const b2 = await baseline(W2);
  assert.equal(saved.id, b2.id, 'the RPC returns the saved baseline');
  assert.equal(b2.is_workspace_baseline, true);
  assert.deepEqual(mirror(b2, 'allowed_api_model_ids'), {
    paid: true, free: true, publish: true, logging: true, zdr: true,
    providerMode: 'none', providers: ['mistral'], enforce: false, modelMode: 'allowlist', models: ['m-1', 'm-2'],
  }, 'a new baseline starts from the settings (keeping the stale list) and applies the saved values');
  assert.deepEqual((await workspaceAssignments(W2)).map((row) => `${row.target_type}:${row.guardrail_id === b2.id}`), ['workspace:true'], 'and is assigned to the workspace');
  await assertInStep(W2, 'the save is copied to workspace_settings, the model list into model_restriction_model_ids');
  assert.deepEqual(await resolve(W2, K2, true), [`${b2.id}@workspace`], 'the gateway sees it straight away');
  assert.deepEqual(await publications(), ['workspace_guardrail_assignments:02', 'workspace_guardrails:02', 'workspace_settings:02'], 'the gateway is told');
  await save(W2, { privacy_enable_input_output_logging: false });
  assert.deepEqual(mirror(await baseline(W2), 'allowed_api_model_ids'), { ...mirror(b2, 'allowed_api_model_ids'), logging: false }, 'a partial save keeps the other values');
  await assertInStep(W2, 'still in step after a partial save');
  await save(W2, { privacy_zdr_only: false, privacy_enable_input_output_logging: true, model_restriction_mode: 'none' });
  assert.equal((await baseline(W2)).id, b2.id, 'saving the defaults keeps the baseline (one per workspace, never removed)');
  assert.equal((await rows(`select count(*)::int as n from public.workspace_guardrails where workspace_id = '${W2}' and is_workspace_baseline`))[0].n, 1);

  await save(W3, { provider_restriction_mode: 'blocklist', provider_restriction_provider_ids: ['groq'] });
  await assertInStep(W3, 'a workspace without a settings row gets one with the copied values');
  assert.equal((await settings(W3)).routing_mode, 'balanced', 'with defaults for everything else');

  for (const [what, values, pattern] of [
    ['an unknown key', { routing_mode: 'price' }, /invalid_workspace_baseline_settings/],
    ['the old model column name', { model_restriction_model_ids: ['x'] }, /invalid_workspace_baseline_settings/],
    ['an invalid mode', { provider_restriction_mode: 'sometimes' }, /provider_restriction_mode_check/],
    ['a non-boolean', { privacy_zdr_only: 'perhaps' }, /boolean/],
  ]) await assert.rejects(save(W5, values), pattern, `the RPC refuses ${what}`);
  assert.equal(await baseline(W5), null, 'a refused save leaves no baseline behind');

  // ---- Older code writing workspace_settings keeps the baseline in step.
  await db.exec(`update public.workspace_settings set privacy_enable_free_may_train = false, model_restriction_model_ids = '{gpt-y}' where workspace_id = '${W1}'`);
  assert.equal((await baseline(W1)).privacy_enable_free_may_train, false, 'a settings write reaches the baseline');
  assert.deepEqual((await baseline(W1)).allowed_api_model_ids, ['gpt-y']);
  await assertInStep(W1, 'in step after a legacy write');
  await db.exec(`update public.workspace_guardrails set privacy_zdr_only = false, provider_restriction_provider_ids = '{openai}' where id = '${b1.id}'`);
  await assertInStep(W1, 'in step after a direct baseline edit');
  await db.exec(`update public.workspace_settings set routing_mode = 'price', privacy_enable_paid_may_train = true where workspace_id = '${W5}'`);
  assert.equal(await baseline(W5), null, 'an unrestricted legacy write creates no baseline');
  await db.exec(`update public.workspace_settings set privacy_enable_input_output_logging = false where workspace_id = '${W5}'`);
  const b5 = await baseline(W5);
  assert(b5, 'a restricting legacy write creates the baseline');
  assert.equal(b5.privacy_enable_input_output_logging, false);
  assert.deepEqual((await workspaceAssignments(W5)).map((row) => row.target_type), ['workspace']);
  await db.exec(`insert into public.workspaces values ('${id(6)}'); insert into public.workspace_settings (workspace_id, privacy_zdr_only) values ('${id(6)}', true)`);
  assert.equal((await baseline(id(6)))?.privacy_zdr_only, true, 'a restricting legacy insert creates the baseline');
  await db.exec(`update public.workspace_settings set privacy_enable_input_output_logging = true where workspace_id = '${W5}'`);
  assert.equal((await baseline(W5)).privacy_enable_input_output_logging, true, 'and later legacy writes follow');

  // ---- A deleted workspace takes its baseline with it.
  await save(W4, { privacy_zdr_only: true });
  await db.exec(`delete from public.workspaces where id = '${W4}'`);
  assert.equal(await baseline(W4), null, 'the cascade from a deleted workspace is allowed');
  assert.deepEqual(await workspaceAssignments(W4), []);

  // ---- Grants.
  const grant = async (role, signature) => (await rows(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, signature]))[0].ok;
  for (const signature of ['public.save_workspace_baseline_guardrail(uuid, jsonb)', 'public.resolve_key_guardrails(uuid, uuid, boolean)']) {
    assert.equal(await grant('service_role', signature), true, `service_role may call ${signature}`);
    for (const role of ['anon', 'authenticated']) assert.equal(await grant(role, signature), false, `${role} may not call ${signature}`);
  }
  for (const signature of ['private.ensure_workspace_baseline_guardrail(uuid)', 'private.sync_workspace_baseline_guardrail()', 'private.protect_workspace_baseline_guardrail()']) {
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await grant(role, signature), false, `${role} may not call ${signature}`);
  }

  console.log('workspace baseline guardrail checks passed');
} finally {
  await db.close();
}
