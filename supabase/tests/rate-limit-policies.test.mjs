import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`;
const ws = (n) => id('1', n);
const user = (n) => id('2', n);
const key = (n) => id('3', n);
const dept = (n) => id('4', n);
const guardrail = (n) => id('5', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migrationUrl = new URL('../migrations/20261012210000_rate_limit_policies.sql', import.meta.url);
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    -- Supabase's service_role bypasses row level security.
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.oauth_clients (id text primary key, allowed_scopes text[], updated_at timestamptz);
    create table public.workspaces (id uuid primary key);
    create table public.workspace_members (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      user_id uuid not null, primary key (workspace_id, user_id)
    );
    create table public.workspace_departments (
      id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
      unique (id, workspace_id)
    );
    create table public.workspace_guardrails (
      id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade
    );
    create table public.keys (
      id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade
    );
    grant select, insert, update, delete on public.workspaces, public.workspace_members, public.workspace_departments,
      public.workspace_guardrails, public.keys to service_role;
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$
    begin
      if row(NEW.*) is distinct from row(OLD.*) and NEW.updated_at is not distinct from OLD.updated_at then
        NEW.updated_at := now();
      end if;
      return NEW;
    end $$;
    insert into public.oauth_clients values ('phaseo_cli', array['keys:read'], null), ('other', array['keys:read'], null);
    insert into auth.users values ('${user(1)}'), ('${user(2)}');
    insert into public.workspaces values ('${ws(1)}'), ('${ws(2)}');
    insert into public.workspace_members values ('${ws(1)}', '${user(1)}'), ('${ws(2)}', '${user(2)}');
    insert into public.workspace_departments values ('${dept(1)}', '${ws(1)}'), ('${dept(2)}', '${ws(2)}');
    insert into public.workspace_guardrails values ('${guardrail(1)}', '${ws(1)}');
    insert into public.keys values ('${key(1)}', '${ws(1)}'), ('${key(2)}', '${ws(1)}');
  `);
  const migration = await readFile(migrationUrl, 'utf8');
  await db.exec(migration);

  for (const table of ['workspace_rate_limit_policies', 'workspace_rate_limit_policy_assignments']) {
    assert.ok(migration.includes(await schema(`public/tables/${table}.sql`)), `${table} migration matches the declarative definition`);
  }
  const keysSchema = await schema('public/tables/keys.sql');
  assert.ok(keysSchema.includes('"department_id"            uuid,'), 'keys declares department_id');
  assert.ok(keysSchema.includes('ON DELETE SET NULL (department_id)'), 'keys declares the department foreign key');

  const [cli] = await rows(`select allowed_scopes from public.oauth_clients where id = 'phaseo_cli'`);
  assert.deepEqual(cli.allowed_scopes, ['keys:read', 'rate_limits:delete', 'rate_limits:read', 'rate_limits:write']);
  const [other] = await rows(`select allowed_scopes from public.oauth_clients where id = 'other'`);
  assert.deepEqual(other.allowed_scopes, ['keys:read'], 'only the first-party CLI client gains the scopes');

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select * from public.workspace_rate_limit_policies'), /permission denied/);
    await assert.rejects(rows('select * from public.workspace_rate_limit_policy_assignments'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  const policy = async (workspace, name, limits = 'requests_per_minute => 60') => {
    const columns = Object.fromEntries(limits.split(',').map((part) => part.split('=>').map((s) => s.trim())));
    const names = Object.keys(columns);
    const [row] = await rows(
      `insert into public.workspace_rate_limit_policies (workspace_id, name, ${names.join(', ')})
       values ($1, $2, ${names.map((_, i) => `$${i + 3}`).join(', ')}) returning id`,
      [workspace, name, ...Object.values(columns)],
    );
    return row.id;
  };
  const assign = (workspace, policyId, target, column = null, value = null) =>
    rows(
      `insert into public.workspace_rate_limit_policy_assignments (workspace_id, policy_id, target_type${column ? `, ${column}` : ''})
       values ($1, $2, $3${column ? ', $4' : ''}) returning id`,
      column ? [workspace, policyId, target, value] : [workspace, policyId, target],
    );

  // Policies need at least one positive limit and a unique, non-blank name.
  const standard = await policy(ws(1), 'Standard');
  const strict = await policy(ws(1), 'Strict', 'requests_per_minute => 10, tokens_per_minute => 20000, concurrent_requests => 2');
  await assert.rejects(rows(`insert into public.workspace_rate_limit_policies (workspace_id, name) values ('${ws(1)}', 'Empty')`), /limit_present_check/);
  await assert.rejects(policy(ws(1), 'Zero', 'requests_per_minute => 0'), /requests_per_minute_check/);
  await assert.rejects(policy(ws(1), 'Negative', 'tokens_per_minute => -1'), /tokens_per_minute_check/);
  await assert.rejects(policy(ws(1), '  standard '), /workspace_name_idx/, 'names are unique ignoring case and padding');
  await assert.rejects(policy(ws(1), '   '), /name_check/);
  const otherWorkspacePolicy = await policy(ws(2), 'Standard');
  const [{ fail_closed: failClosed }] = await rows(`select fail_closed from public.workspace_rate_limit_policies where id = $1`, [standard]);
  assert.equal(failClosed, false, 'policies fail open unless configured otherwise');

  // Each target type sets exactly its own column, and each target has at most one policy.
  await assign(ws(1), standard, 'key', 'key_id', key(1));
  await assign(ws(1), strict, 'member', 'user_id', user(1));
  await assign(ws(1), standard, 'department', 'department_id', dept(1));
  await assign(ws(1), standard, 'guardrail', 'guardrail_id', guardrail(1));
  await assign(ws(1), strict, 'end_user_default');
  await assert.rejects(assign(ws(1), strict, 'key', 'key_id', key(1)), /key_uidx/);
  await assert.rejects(assign(ws(1), strict, 'end_user_default'), /end_user_uidx/);
  await assert.rejects(assign(ws(1), strict, 'department', 'department_id', dept(1)), /department_uidx/);
  await assert.rejects(assign(ws(1), strict, 'key'), /target_check/, 'a key assignment needs a key');
  await assert.rejects(assign(ws(1), strict, 'member', 'key_id', key(2)), /target_check/, 'columns must match the target type');
  await assert.rejects(assign(ws(1), strict, 'team', 'key_id', key(2)), /target_check/);
  await assert.rejects(
    rows(
      `insert into public.workspace_rate_limit_policy_assignments (workspace_id, policy_id, target_type, key_id, user_id)
       values ($1, $2, 'key', $3, $4)`,
      [ws(1), strict, key(2), user(1)],
    ),
    /target_check/,
  );

  // Targets and policies must belong to the assignment's workspace.
  await assert.rejects(assign(ws(1), otherWorkspacePolicy, 'key', 'key_id', key(2)), /policy_fkey/);
  await assert.rejects(assign(ws(1), standard, 'member', 'user_id', user(2)), /member_fkey/);
  await assert.rejects(assign(ws(1), standard, 'department', 'department_id', dept(2)), /department_fkey/);

  // Keys can be linked to a department in their own workspace only.
  await db.exec(`update public.keys set department_id = '${dept(1)}' where id = '${key(1)}'`);
  await assert.rejects(rows(`update public.keys set department_id = '${dept(2)}' where id = '${key(2)}'`), /keys_department_fkey/);

  // Removing a department unlinks its keys and drops its assignment; removing a policy drops its assignments.
  await db.exec(`delete from public.workspace_departments where id = '${dept(1)}'`);
  const [linked] = await rows(`select workspace_id, department_id from public.keys where id = '${key(1)}'`);
  assert.deepEqual(linked, { workspace_id: ws(1), department_id: null }, 'only department_id is cleared');
  const targetsAfterDepartment = await rows(`select target_type from public.workspace_rate_limit_policy_assignments order by target_type`);
  assert.deepEqual(targetsAfterDepartment.map((row) => row.target_type), ['end_user_default', 'guardrail', 'key', 'member']);
  await db.exec(`delete from public.workspace_rate_limit_policies where id = '${strict}'`);
  const targetsAfterPolicy = await rows(`select target_type from public.workspace_rate_limit_policy_assignments order by target_type`);
  assert.deepEqual(targetsAfterPolicy.map((row) => row.target_type), ['guardrail', 'key']);

  // Removing a member drops their assignment; changing a policy bumps updated_at.
  await assign(ws(1), standard, 'member', 'user_id', user(1));
  await db.exec(`delete from public.workspace_members where workspace_id = '${ws(1)}' and user_id = '${user(1)}'`);
  assert.equal((await rows(`select 1 from public.workspace_rate_limit_policy_assignments where target_type = 'member'`)).length, 0);
  await db.exec(`update public.workspace_rate_limit_policies set updated_at = now() - interval '1 day' where id = '${standard}'`);
  await db.exec(`update public.workspace_rate_limit_policies set requests_per_minute = 30 where id = '${standard}'`);
  const [{ fresh }] = await rows(`select updated_at > now() - interval '1 minute' as fresh from public.workspace_rate_limit_policies where id = '${standard}'`);
  assert.equal(fresh, true);

  console.log('rate limit policy schema tests passed');
} finally {
  await db.close();
}
