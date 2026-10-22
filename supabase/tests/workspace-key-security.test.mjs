import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trimEnd());
const migration = await read('../migrations/20261022140410_workspace_key_security.sql');
const listFile = await read('../schemas/public/functions/workspace_key_security.sql');
const summaryFile = await read('../schemas/public/functions/workspace_key_security_summary.sql');

// The migration must carry the declarative files exactly.
assert.ok(migration.includes(listFile), 'migration includes workspace_key_security verbatim');
assert.ok(migration.includes(summaryFile), 'migration includes workspace_key_security_summary verbatim');

const workspace = '00000000-0000-4000-8000-0000000000aa';
const other = '00000000-0000-4000-8000-0000000000bb';
const owner = '00000000-0000-4000-8000-0000000000c1';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create table public.users (user_id uuid primary key, display_name text);
    create table public.keys (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      name text not null,
      prefix text not null default 'abc123',
      status text not null default 'active',
      key_kind text not null default 'standard',
      created_by uuid,
      created_at timestamptz not null default now(),
      last_used_at timestamptz default now(),
      expires_at timestamptz,
      daily_limit_cost_nanos bigint not null default 0,
      weekly_limit_cost_nanos bigint not null default 0,
      monthly_limit_cost_nanos bigint not null default 0,
      ip_allowlist jsonb not null default '[]'::jsonb,
      storage_locations text[] not null default '{}'::text[]
    );
    insert into auth.users values ('${owner}', 'ada@example.com');
    insert into public.users values ('${owner}', 'Ada');
    insert into public.keys (workspace_id, name, created_by, created_at, last_used_at, expires_at, monthly_limit_cost_nanos, ip_allowlist, storage_locations) values
      -- Fully configured and in use: no risks.
      ('${workspace}', 'locked down', '${owner}', now() - interval '10 days', now() - interval '1 hour', now() + interval '30 days', 5000000000, '[{"label":"office","address":"203.0.113.1"}]', array['vercel']),
      -- Brand new and never used: risky settings, but not idle yet.
      ('${workspace}', 'new', '${owner}', now() - interval '1 day', now() - interval '1 day', null, 0, '[]', array['railway', 'github']),
      -- Never used for 100 days: idle and safe to remove.
      ('${workspace}', 'forgotten', null, now() - interval '100 days', now() - interval '100 days', null, 0, '[]', array['railway']),
      -- Used 120 days ago: idle, but not safe to remove yet.
      ('${workspace}', 'old', null, now() - interval '300 days', now() - interval '120 days', null, 0, '[]', '{}'),
      -- Used 200 days ago: safe to remove.
      ('${workspace}', 'ancient', null, now() - interval '400 days', now() - interval '200 days', null, 0, '[]', '{}');
    insert into public.keys (workspace_id, name, status, key_kind, expires_at, storage_locations) values
      -- None of these are live dashboard keys.
      ('${workspace}', 'revoked', 'revoked', 'standard', null, array['railway']),
      ('${workspace}', 'deleted', 'deleted', 'standard', null, array['railway']),
      ('${workspace}', 'expired', 'active', 'standard', now() - interval '1 day', array['railway']),
      ('${workspace}', '__chat_route_managed_key__', 'active', 'standard', null, '{}'),
      ('${workspace}', 'oauth app', 'active', 'oauth_delegated', null, '{}'),
      ('${other}', 'other workspace', 'active', 'standard', null, array['railway']);
    insert into public.keys (workspace_id, name, status) values ('${workspace}', 'paused', 'paused');
  `);
  await db.exec(migration);

  const rows = (await db.query(`select * from public.workspace_key_security($1)`, [workspace])).rows;
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.deepEqual(Object.keys(byName).sort(), ['ancient', 'forgotten', 'locked down', 'new', 'old', 'paused']);

  assert.equal(byName['locked down'].risk, 0);
  assert.equal(byName['locked down'].owner_name, 'Ada');
  assert.equal(byName['locked down'].owner_email, 'ada@example.com');
  assert.equal(byName['new'].never_used, true);
  assert.equal(byName['new'].last_used_at, null, 'a never-used key reports no last use');
  assert.equal(byName['new'].idle, false);
  assert.equal(byName['forgotten'].idle, true);
  assert.equal(byName['forgotten'].safe_to_remove, true);
  assert.equal(byName['old'].idle, true);
  assert.equal(byName['old'].safe_to_remove, false);
  assert.equal(byName['ancient'].safe_to_remove, true);
  // Riskiest first.
  assert.equal(rows.at(-1).name, 'locked down');

  const summary = (await db.query(`select public.workspace_key_security_summary($1) as summary`, [workspace])).rows[0].summary;
  assert.deepEqual(summary, {
    total: 6,
    paused: 1,
    no_spend_limit: 5,
    never_expires: 5,
    idle: 3,
    safe_to_remove: 2,
    no_ip_allowlist: 5,
    no_storage_location: 3,
    locations: [{ id: 'railway', keys: 2 }, { id: 'github', keys: 1 }, { id: 'vercel', keys: 1 }],
  });

  const empty = (await db.query(`select public.workspace_key_security_summary($1) as summary`, ['00000000-0000-4000-8000-0000000000ff'])).rows[0].summary;
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.locations, []);

  // Only the service role may call them.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query(`select * from public.workspace_key_security($1)`, [workspace]), /permission denied/, role);
    await assert.rejects(db.query(`select public.workspace_key_security_summary($1)`, [workspace]), /permission denied/, role);
    await db.exec('reset role');
  }

  console.log('workspace-key-security: ok');
} finally {
  await db.close();
}
