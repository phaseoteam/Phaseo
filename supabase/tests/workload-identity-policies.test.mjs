import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const ws = '20000000-0000-4000-8000-000000000001';
const admin = '30000000-0000-4000-8000-000000000001';
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migrations = new URL('../migrations/', import.meta.url);
const schemas = new URL('../schemas/', import.meta.url);
const migration = async (suffix) => {
  const name = (await readdir(migrations)).find((file) => file.endsWith(suffix));
  assert.ok(name, `migration *${suffix} exists`);
  return readFile(new URL(name, migrations), 'utf8');
};
const create = `select * from public.create_workload_identity_policy($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8)`;
const vercel = (overrides = {}) => {
  const value = {
    name: 'Production website', provider: 'vercel', issuer: 'https://oidc.vercel.com/acme', owner: 'team_123',
    conditions: { project_id: ['prj_1'], environment: ['production'] }, lifetime: null,
    ...overrides,
  };
  return [ws, admin, value.name, value.provider, value.issuer, value.owner, JSON.stringify(value.conditions), value.lifetime];
};

try {
  const sql = await migration('_workload_identity_policies.sql');
  // The migration must carry the declarative definitions verbatim.
  for (const file of ['public/tables/workload_identity_policies.sql', 'public/functions/create_workload_identity_policy.sql']) {
    assert.ok(sql.includes(await readFile(new URL(file, schemas), 'utf8')), `migration includes ${file}`);
  }
  const keysSchema = await readFile(new URL('public/tables/keys.sql', schemas), 'utf8');
  for (const constraint of sql.match(/ADD CONSTRAINT "keys_[a-z_]+" CHECK \(.*\);/g)) {
    assert.ok(keysSchema.includes(constraint.replace(/^ADD /, '').replace(/;$/, '')), `keys.sql has ${constraint}`);
  }

  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    create table public.keys (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      name text not null, hash text not null unique, prefix text not null,
      status text not null default 'active', scopes text not null, created_by uuid not null,
      kid text unique, key_kind text not null default 'standard', issued_via text not null default 'dashboard',
      constraint keys_key_kind_check check (key_kind = any (array['standard'::text, 'oauth_delegated'::text])),
      constraint keys_issued_via_check check (issued_via = any (array['dashboard'::text, 'oauth_pkce'::text, 'cli'::text]))
    );
    grant select, insert, update, delete on public.workspaces, public.keys to service_role;
    grant usage on schema auth to service_role;
    grant select, references on auth.users to service_role;
    insert into auth.users(id) values ('${admin}');
    insert into public.workspaces(id) values ('${ws}');
  `);
  await db.exec(sql);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select * from public.workload_identity_policies'), /permission denied/);
    await assert.rejects(rows(create, vercel()), /permission denied/);
    await db.exec('reset role');
  }

  await db.exec('set role service_role');
  const [created] = await rows(create, vercel());
  assert.ok(created.policy_id && created.key_id);
  const [key] = await rows('select * from public.keys where id = $1', [created.key_id]);
  assert.equal(key.key_kind, 'workload_identity');
  assert.equal(key.issued_via, 'workload_identity');
  assert.equal(key.status, 'active');
  assert.equal(key.created_by, admin);
  assert.match(key.kid, /^[0-9a-f]{32}$/);
  assert.match(key.hash, /^workload_identity:/);
  const [policy] = await rows('select * from public.workload_identity_policies where id = $1', [created.policy_id]);
  assert.equal(policy.max_token_lifetime_seconds, 43200);
  assert.deepEqual(policy.claim_conditions, { project_id: ['prj_1'], environment: ['production'] });

  // A rejected policy must not leave a stray secretless key behind.
  const before = (await rows('select count(*)::int as n from public.keys'))[0].n;
  for (const [overrides, pattern] of [
    [{ provider: 'custom' }, /provider_check/],
    [{ lifetime: 10 }, /lifetime_check/],
    [{ owner: ' ' }, /pinned_owner_id_check/],
    [{ name: '' }, /name_check/],
  ]) {
    await assert.rejects(rows(create, vercel(overrides)), pattern);
  }
  await assert.rejects(rows(create, [...vercel().slice(0, 6), '[]', null]), /claim_conditions_check/);
  assert.equal((await rows('select count(*)::int as n from public.keys'))[0].n, before);

  // Standard keys are unaffected; unknown kinds still fail.
  await rows(`insert into public.keys(workspace_id, name, hash, prefix, scopes, created_by) values ($1, 'plain', 'h1', 'p', '[]', $2)`, [ws, admin]);
  await assert.rejects(rows(`insert into public.keys(workspace_id, name, hash, prefix, scopes, created_by, key_kind) values ($1, 'odd', 'h2', 'p', '[]', $2, 'other')`, [ws, admin]), /keys_key_kind_check/);

  // Deleting the key removes its policy.
  await rows('delete from public.keys where id = $1', [created.key_id]);
  assert.equal((await rows('select count(*)::int as n from public.workload_identity_policies'))[0].n, 0);
  await db.exec('reset role');
  console.log('workload identity policy contracts passed');
} finally {
  await db.close();
}
