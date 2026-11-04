// Standalone PostgreSQL regression test for guardrail levels phase C: rate guardrails.
// Checks: the migration matches the schema files; every rate limit policy becomes a rate guardrail
// with the same id and values; key, member, department and end-user default assignments become
// guardrail assignments with the same ids (key and member rows also in the legacy tables, whose copy
// keeps the id); a policy on a guardrail becomes a second rate guardrail counted each_key, assigned
// wherever that guardrail is; the constraints keep rate guardrails to rate settings only.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/rate-guardrails.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createGuardrailLevelsBase } from './fixtures/guardrail-levels-before.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const levelsName = migrations.find((name) => name.endsWith('_guardrail_levels.sql'));
const migrationName = migrations.find((name) => name.endsWith('_rate_guardrails.sql'));
assert(levelsName && migrationName && migrationName > levelsName, 'the migration exists and runs after phase A');
const migration = await read(`../migrations/${migrationName}`);
assert(normalize(migration).includes(normalize(await read('../schemas/public/functions/enqueue_rate_limit_throttle_alerts.sql'))),
  'enqueue_rate_limit_throttle_alerts is in the migration');
// The only DELETEs are in the recreated refresh_rate_limit_throttle_rollups, which replaces and prunes its own rollup rows.
const outsideRollups = migration.slice(0, migration.indexOf('CREATE OR REPLACE FUNCTION public.refresh_rate_limit_throttle_rollups'));
assert(/^-- phaseo:allow-destructive-migration reason: /m.test(migration), 'the migration explains its DELETEs');
assert(!/\b(delete\s+from|truncate)\b/i.test(outsideRollups) && !/\bdrop\s+(table|column|function)\b/i.test(migration),
  'the migration deletes no rows itself and drops no table, column or function');
assert(normalize(migration).includes(normalize(await read('../schemas/public/functions/refresh_rate_limit_throttle_rollups.sql'))),
  'refresh_rate_limit_throttle_rollups is in the migration');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/rate-guardrails\.test\.mjs/, 'CI runs this suite');
const guardrailsTable = normalize(await read('../schemas/public/tables/workspace_guardrails.sql'));

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [W1, W2] = [id(1), id(2)];
const [U1, U2] = [id(31), id(32)];
const [K1, K2] = [id(21), id(22)];
const [D1] = [id(41)];
const [GACCESS, GOFF] = [id(11), id(12)];
const [KW2] = [id(29)];
const [POFF] = [id(67)];
const [AOFF] = [id(77)];
const [PKEY, PMEMBER, PDEPT, PEND, PGUARD, PIDLE] = [id(61), id(62), id(63), id(64), id(65), id(66)];
const [AKEY, AMEMBER, ADEPT, AEND, AGUARD] = [id(71), id(72), id(73), id(74), id(75)];
// Postgres md5(text)::uuid: the 32 hex digits read as a uuid.
// The migration sets the version (4) and variant (8) digits, so the API accepts the id.
const eachKeyId = (policyId) => createHash('md5').update(`${policyId}:each_key`).digest('hex')
  .replace(/^(.{12}).(.{3}).(.*)$/, (_, a, b, c) => a + '4' + b + '8' + c)
  .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;

try {
  await createGuardrailLevelsBase(db);
  await db.exec(`
    alter table public.workspace_guardrails
      add column name text not null default 'Guardrail',
      add column description text,
      add column created_at timestamptz not null default now(),
      add column updated_at timestamptz not null default now();
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, primary key (workspace_id, user_id));
    -- The policy tables as they are in production, cut down to the columns the migration reads.
    create table public.workspace_rate_limit_policies (
      id uuid primary key, workspace_id uuid not null, name text not null, description text,
      requests_per_minute integer, tokens_per_minute bigint, concurrent_requests integer,
      fail_closed boolean not null default false,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table public.workspace_rate_limit_policy_assignments (
      id uuid primary key, workspace_id uuid not null, policy_id uuid not null references public.workspace_rate_limit_policies(id),
      target_type text not null, key_id uuid, user_id uuid, department_id uuid, guardrail_id uuid,
      created_by uuid, created_at timestamptz not null default now());
    create table public.workspace_rate_limit_throttles_minute (
      limit_scope text not null,
      constraint workspace_rate_limit_throttles_minute_limit_scope_check
        check (limit_scope = any (array['key', 'member', 'guardrail', 'end_user', 'department'])));
    insert into public.workspaces values ('${W1}'), ('${W2}');
    insert into public.users values ('${U1}'), ('${U2}');
    insert into public.workspace_members values ('${W1}', '${U1}'), ('${W1}', '${U2}');
    insert into public.workspace_departments values ('${D1}', '${W1}');
    insert into public.keys (id, workspace_id, created_by) values ('${K1}', '${W1}', '${U1}'), ('${K2}', '${W1}', '${U2}');
    insert into public.workspace_guardrails (id, workspace_id, name, privacy_zdr_only) values ('${GACCESS}', '${W1}', 'ZDR', true);
    -- A switched-off guardrail in W2 with a rate limit policy on it.
    insert into public.workspace_guardrails (id, workspace_id, name, privacy_zdr_only, enabled) values ('${GOFF}', '${W2}', 'Paused', true, false);
    insert into public.keys (id, workspace_id, created_by) values ('${KW2}', '${W2}', '${U1}');
  `);
  await db.exec(await read(`../migrations/${levelsName}`));
  await db.exec(`
    insert into public.key_guardrails (key_id, guardrail_id) values ('${K2}', '${GACCESS}'), ('${KW2}', '${GOFF}');
    insert into public.workspace_member_guardrails (workspace_id, user_id, guardrail_id) values ('${W1}', '${U1}', '${GACCESS}');
    insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id) values ('${W1}', '${GACCESS}', 'department', '${D1}');
    insert into public.workspace_rate_limit_policies (id, workspace_id, name, description, requests_per_minute, tokens_per_minute, concurrent_requests, fail_closed, created_at) values
      ('${PKEY}', '${W1}', 'Batch keys', 'For batch jobs', 60, null, null, false, '2026-10-01T00:00:00Z'),
      ('${PMEMBER}', '${W1}', 'Members', null, null, 100000, null, false, now()),
      ('${PDEPT}', '${W1}', 'Engineering', null, 600, 2000000, 20, true, now()),
      ('${PEND}', '${W1}', 'End users', null, 10, null, null, false, now()),
      ('${PGUARD}', '${W1}', 'ZDR keys', null, null, null, 2, false, now()),
      ('${PIDLE}', '${W2}', 'Unassigned', null, 5, null, null, false, now()),
      ('${POFF}', '${W2}', 'Paused keys', null, 3, null, null, false, now());
    insert into public.workspace_rate_limit_policy_assignments (id, workspace_id, policy_id, target_type, key_id, user_id, department_id, guardrail_id, created_by) values
      ('${AKEY}', '${W1}', '${PKEY}', 'key', '${K1}', null, null, null, '${U1}'),
      ('${AMEMBER}', '${W1}', '${PMEMBER}', 'member', null, '${U2}', null, null, null),
      ('${ADEPT}', '${W1}', '${PDEPT}', 'department', null, null, '${D1}', null, null),
      ('${AEND}', '${W1}', '${PEND}', 'end_user_default', null, null, null, null, null),
      ('${AGUARD}', '${W1}', '${PGUARD}', 'guardrail', null, null, null, '${GACCESS}', null),
      ('${AOFF}', '${W2}', '${POFF}', 'guardrail', null, null, null, '${GOFF}', null);
  `);
  await db.exec(migration);

  // The table file declares exactly the constraints the migration adds.
  for (const row of await rows(`
    select conname, pg_get_constraintdef(oid) as definition from pg_constraint
    where conrelid = 'public.workspace_guardrails'::regclass and contype = 'c' and conname like 'workspace_guardrails_rate_%' order by conname`)) {
    assert(guardrailsTable.includes(`CONSTRAINT "${row.conname}" ${row.definition},`), `the table file declares ${row.conname}: ${row.definition}`);
  }
  for (const column of ['"rate_requests_per_minute"                integer', '"rate_tokens_per_minute"                  bigint',
    '"rate_concurrent_requests"                integer', '"rate_fail_closed"                        boolean                  NOT NULL DEFAULT false',
    '"rate_counting"                           text']) {
    assert(guardrailsTable.includes(column), `the table file declares ${column}`);
  }

  // 1. Every policy is a rate guardrail with the same id and values.
  const guardrails = await rows(`
    select id, workspace_id, name, description, kind, enabled, rate_requests_per_minute as rpm, rate_tokens_per_minute::text as tpm,
      rate_concurrent_requests as cc, rate_fail_closed as strict, rate_counting as counting, created_at
    from public.workspace_guardrails where kind = 'rate' order by name`);
  assert.deepEqual(guardrails.map(({ created_at, ...row }) => row), [
    { id: PEND, workspace_id: W1, name: 'End users', description: null, kind: 'rate', enabled: true, rpm: 10, tpm: null, cc: null, strict: false, counting: null },
    { id: PDEPT, workspace_id: W1, name: 'Engineering', description: null, kind: 'rate', enabled: true, rpm: 600, tpm: '2000000', cc: 20, strict: true, counting: null },
    { id: PKEY, workspace_id: W1, name: 'Batch keys', description: 'For batch jobs', kind: 'rate', enabled: true, rpm: 60, tpm: null, cc: null, strict: false, counting: null },
    { id: PMEMBER, workspace_id: W1, name: 'Members', description: null, kind: 'rate', enabled: true, rpm: null, tpm: '100000', cc: null, strict: false, counting: null },
    { id: PIDLE, workspace_id: W2, name: 'Unassigned', description: null, kind: 'rate', enabled: true, rpm: 5, tpm: null, cc: null, strict: false, counting: null },
    { id: POFF, workspace_id: W2, name: 'Paused keys', description: null, kind: 'rate', enabled: true, rpm: 3, tpm: null, cc: null, strict: false, counting: null },
    // Its guardrail is switched off, so the replacement starts off too.
    { id: eachKeyId(POFF), workspace_id: W2, name: 'Paused keys (each key)', description: null, kind: 'rate', enabled: false, rpm: 3, tpm: null, cc: null, strict: false, counting: 'each_key' },
    { id: PGUARD, workspace_id: W1, name: 'ZDR keys', description: null, kind: 'rate', enabled: true, rpm: null, tpm: null, cc: 2, strict: false, counting: null },
    { id: eachKeyId(PGUARD), workspace_id: W1, name: 'ZDR keys (each key)', description: null, kind: 'rate', enabled: true, rpm: null, tpm: null, cc: 2, strict: false, counting: 'each_key' },
  ].sort((a, b) => a.name.localeCompare(b.name)), 'policies became rate guardrails');
  assert.equal(new Date(guardrails.find((row) => row.id === PKEY).created_at).toISOString(), '2026-10-01T00:00:00.000Z', 'created_at is kept');

  // 2. Assignments keep their ids; the end-user default is a workspace assignment.
  const assignments = await rows(`
    select a.id, a.guardrail_id, a.target_type, a.target_id, a.created_by from public.workspace_guardrail_assignments a
    join public.workspace_guardrails g on g.id = a.guardrail_id and g.kind = 'rate' order by a.guardrail_id, a.target_type`);
  const eachKey = eachKeyId(PGUARD);
  assert.match(eachKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/, 'the replacement id is a version 4 uuid');
  const expected = [
    { guardrail_id: PKEY, target_type: 'key', target_id: K1, id: AKEY, created_by: U1 },
    { guardrail_id: PMEMBER, target_type: 'member', target_id: U2, id: AMEMBER, created_by: null },
    { guardrail_id: PDEPT, target_type: 'department', target_id: D1, id: ADEPT, created_by: null },
    { guardrail_id: PEND, target_type: 'workspace', target_id: null, id: AEND, created_by: null },
    { guardrail_id: eachKeyId(POFF), target_type: 'key', target_id: KW2 },
    // 3. The policy on the ZDR guardrail: each key wherever the ZDR guardrail is.
    { guardrail_id: eachKey, target_type: 'department', target_id: D1 },
    { guardrail_id: eachKey, target_type: 'key', target_id: K2 },
    { guardrail_id: eachKey, target_type: 'member', target_id: U1 },
  ];
  const strip = (row) => ({ guardrail_id: row.guardrail_id, target_type: row.target_type, target_id: row.target_id });
  assert.deepEqual(assignments.map(strip).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    expected.map(strip).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), 'every assignment is at its level');
  for (const want of expected.filter((row) => row.id)) {
    const got = assignments.find((row) => row.guardrail_id === want.guardrail_id && row.target_type === want.target_type);
    assert.equal(got.id, want.id, `${want.target_type} assignment kept its id`);
    assert.equal(got.created_by, want.created_by, `${want.target_type} assignment kept created_by`);
  }
  assert.deepEqual((await rows(`select key_id, guardrail_id from public.key_guardrails where guardrail_id <> $1 and key_id <> $2 order by key_id`, [GACCESS, KW2])),
    [{ key_id: K1, guardrail_id: PKEY }, { key_id: K2, guardrail_id: eachKey }], 'key rows are in key_guardrails');
  assert.deepEqual((await rows(`select user_id, guardrail_id from public.workspace_member_guardrails where guardrail_id <> $1 order by user_id`, [GACCESS])),
    [{ user_id: U1, guardrail_id: eachKey }, { user_id: U2, guardrail_id: PMEMBER }], 'member rows are in workspace_member_guardrails');

  // Removing a legacy row still removes its copy (the copy found the row the migration wrote).
  await db.query('delete from public.key_guardrails where key_id = $1 and guardrail_id = $2', [K1, PKEY]);
  assert.equal((await rows('select count(*)::int as n from public.workspace_guardrail_assignments where id = $1', [AKEY]))[0].n, 0, 'the key assignment goes with its legacy row');
  // The policy tables are left as they were.
  assert.equal((await rows('select count(*)::int as n from public.workspace_rate_limit_policies'))[0].n, 7);
  assert.equal((await rows('select count(*)::int as n from public.workspace_rate_limit_policy_assignments'))[0].n, 6);

  // 4. Rate guardrails set only rate settings, and only they set rate columns.
  const insert = (columns) => db.query(`insert into public.workspace_guardrails (id, workspace_id, ${Object.keys(columns).join(', ')}) values (gen_random_uuid(), $1, ${Object.keys(columns).map((_, i) => `$${i + 2}`).join(', ')})`, [W1, ...Object.values(columns)]);
  await insert({ kind: 'rate', rate_requests_per_minute: 1, rate_counting: 'shared' });
  await insert({ kind: 'rate', rate_tokens_per_minute: 1, rate_counting: 'each_end_user', rate_fail_closed: true });
  await assert.rejects(insert({ kind: 'rate', rate_counting: 'shared' }), /rate_kind_check/, 'a rate guardrail needs a limit');
  await assert.rejects(insert({ kind: 'rate', rate_requests_per_minute: 1, privacy_zdr_only: true }), /rate_kind_check/, 'a rate guardrail sets no access rule');
  await assert.rejects(insert({ kind: 'rate', rate_requests_per_minute: 1, prompt_injection_enabled: true }), /rate_kind_check/, 'a rate guardrail sets no safety rule');
  await assert.rejects(insert({ kind: 'access', rate_requests_per_minute: 1 }), /rate_kind_check/, 'an access guardrail sets no rate limit');
  await assert.rejects(insert({ kind: 'access', rate_fail_closed: true }), /rate_kind_check/, 'an access guardrail does not fail closed');
  await assert.rejects(insert({ kind: 'rate', rate_requests_per_minute: 1, rate_counting: 'pooled' }), /rate_counting_check/);
  await assert.rejects(insert({ kind: 'rate', rate_requests_per_minute: 0 }), /rate_requests_per_minute_check/);
  await assert.rejects(insert({ kind: 'rate', rate_tokens_per_minute: -1 }), /rate_tokens_per_minute_check/);
  await assert.rejects(insert({ kind: 'rate', rate_concurrent_requests: 0 }), /rate_concurrent_requests_check/);
  await insert({ kind: 'access', privacy_zdr_only: true });

  // 5. Throttles from an allowance shared by the whole workspace can be recorded.
  await db.query('insert into public.workspace_rate_limit_throttles_minute values ($1)', ['workspace']);
  await assert.rejects(db.query('insert into public.workspace_rate_limit_throttles_minute values ($1)', ['team']), /limit_scope_check/);

  console.log('rate-guardrails: ok');
} finally {
  await db.close();
}
