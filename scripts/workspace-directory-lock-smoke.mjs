import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Two real PostgreSQL sessions racing directory writes, with the real functions and triggers.
// Postgres can deadlock (40P01) whenever two transactions lock the same rows and advisory locks in
// different orders, and direct row writes always lock their row before any trigger runs, so no lock
// trigger can give every path one order. Callers therefore retry a whole transaction on 40P01/40001
// (as the API and web-api do), and this test checks that every race below finishes, deadlock or not:
// 1. A direct role update against a mapped-department delete (a test-only pause makes the role update
//    hold its row before its trigger takes the workspace lock).
// 2. A direct department rename against management_update_workspace_department (a pause before the
//    function's first row lock), which must not deadlock at all.
// 3. A mapping inserted while an admin deletes its department: the delete's owner check runs under the
//    department row lock, so it sees the new mapping and refuses.
//
// `connect(database)` returns the command and arguments for a psql session on that database. CI runs this
// in the declarative schema smoke job (docker exec into the Supabase container); locally:
//   node scripts/workspace-directory-lock-smoke.mjs --psql <psql path> --host 127.0.0.1 --port 5432 --user postgres
// `--root <dir>` reads the schema files from another checkout, to compare against main.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATABASE = 'workspace_directory_lock_smoke';
const RETRYABLE = /\b(40P01|40001)\b|deadlock detected|could not serialize access/;
const ws = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000001';
const admin = '20000000-0000-4000-8000-000000000002';
const scimAdmin = '20000000-0000-4000-8000-000000000003';
const engineering = '30000000-0000-4000-8000-000000000001';
const sales = '30000000-0000-4000-8000-000000000002';
const group = '40000000-0000-4000-8000-000000000001';
const scimUser = '50000000-0000-4000-8000-000000000001';
const TRIGGERS = {
  scim_group_mappings: ['scim_group_mappings_reconcile', 'zz_scim_group_mappings_refresh_effective'],
  scim_group_members: ['scim_group_members_reconcile', 'zz_scim_group_members_refresh_effective'],
  workspace_members: ['zz_workspace_members_refresh_effective'],
  workspace_departments: ['workspace_departments_reconcile'],
};

function schemaSql(root, { pauseDepartmentUpdate = false } = {}) {
  const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
  const triggerSql = (table, name) => read(`supabase/schemas/public/tables/${table}.sql`)
    .match(new RegExp(`CREATE TRIGGER ${name}\\n[\\s\\S]*?;`))?.[0];
  const triggers = Object.entries(TRIGGERS).flatMap(([table, names]) => names.map((name) => {
    const sql = triggerSql(table, name);
    assert(sql, `${table} declares ${name}`);
    return sql;
  }));
  // A checkout that still has the round-4 lock trigger (for comparison runs) loads it too.
  const lockFile = 'supabase/schemas/public/functions/lock_workspace_directory.sql';
  const lockTriggers = existsSync(join(root, lockFile))
    ? [read(lockFile), ...['scim_group_mappings', 'scim_group_members', 'workspace_members', 'workspace_departments', 'scim_users',
      'workspace_member_overrides', 'workspace_department_grants'].map((table) => triggerSql(table, 'aaa_lock_workspace_directory')).filter(Boolean)]
    : [];
  let update = read('supabase/schemas/public/functions/management_update_workspace_department.sql');
  // Test-only scheduling barrier: pause after the function's entry work, before its first row lock.
  if (pauseDepartmentUpdate) update = update.replace('select * into before_row', 'perform pg_catalog.pg_sleep(1.5);\n  select * into before_row');
  return [
    read('supabase/tests/fixtures/workspace-directory-schema.sql'),
    // The shared override function the directory trigger calls (absent in checkouts from before it existed).
    ...['supabase/schemas/public/functions/apply_workspace_role_overrides.sql'].filter((file) => existsSync(join(root, file))).map(read),
    ...['reconcile_scim_entitlements', 'reconcile_scim_entitlements_trigger', 'refresh_effective_entitlements_after_directory_change',
      'management_delete_workspace_department'].map((fn) => read(`supabase/schemas/public/functions/${fn}.sql`)),
    update,
    ...lockTriggers,
    ...triggers,
    // Test-only: lets a role update hold its row for a moment before its AFTER triggers run.
    `create function public.smoke_pause() returns trigger language plpgsql as $$
     begin if current_setting('smoke.pause', true) = 'on' then perform pg_catalog.pg_sleep(1.5); end if; return new; end $$;
     create trigger smoke_pause before update on public.workspace_members for each row execute function public.smoke_pause();
     insert into public.workspaces values ('${ws}', '${owner}');
     insert into public.workspace_members (workspace_id, user_id, role) values ('${ws}', '${owner}', 'owner'), ('${ws}', '${admin}', 'admin');
     insert into public.workspace_access_grants values ('${ws}', '${owner}', 'manual', '${owner}', 'owner'), ('${ws}', '${admin}', 'manual', '${admin}', 'admin');
     insert into public.scim_users (id, workspace_id, auth_user_id) values ('${scimUser}', '${ws}', '${scimAdmin}');
     insert into public.scim_groups values ('${group}', '${ws}');
     insert into public.workspace_departments (id, workspace_id, name) values ('${engineering}', '${ws}', 'Engineering'), ('${sales}', '${ws}', 'Sales');
     insert into public.scim_group_members values ('${ws}', '${group}', '${scimUser}');
     -- Owner-made mapping: the directory user becomes an admin.
     insert into public.scim_group_mappings (workspace_id, scim_group_id, department_id, access_role) values ('${ws}', '${group}', '${engineering}', 'admin');`,
  ].join('\n;\n');
}

class Session {
  constructor(connect) {
    const { command, args } = connect(DATABASE);
    this.output = '';
    this.errors = '';
    this.markers = 0;
    this.child = spawn(command, [...args, '-XqAt', '-v', 'VERBOSITY=verbose', '-v', 'ON_ERROR_STOP=0'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', (chunk) => { this.output += chunk; });
    this.child.stderr.on('data', (chunk) => { this.errors += chunk; });
    this.closed = new Promise((resolve) => this.child.once('close', resolve));
  }
  async run(sql) {
    const marker = `smoke_done_${++this.markers}`;
    const errorsBefore = this.errors.length;
    this.child.stdin.write(`${sql}\nselect '${marker}';\n`);
    const deadline = Date.now() + 20000;
    while (!this.output.includes(marker)) {
      assert(Date.now() < deadline, `a statement did not finish within 20 s: ${this.errors}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return this.errors.slice(errorsBefore);
  }
  /** Runs `body` as one transaction, retrying the whole transaction on 40P01/40001, up to 3 attempts. */
  async transaction(body) {
    for (let attempt = 1; ; attempt += 1) {
      const errors = await this.run(`begin;\n${body}\ncommit;`);
      if (!errors.includes('ERROR')) return { attempts: attempt, errors: '' };
      if (!RETRYABLE.test(errors) || attempt >= 3) return { attempts: attempt, errors };
      await this.run('rollback;');
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
    }
  }
  async end() {
    this.child.stdin.end('rollback;\n');
    const timer = setTimeout(() => this.child.kill(), 10000);
    await this.closed;
    clearTimeout(timer);
  }
}

export async function runWorkspaceDirectoryLockSmoke(connect, { root = repoRoot, log = console.log } = {}) {
  const once = (database, sql) => {
    const { command, args } = connect(database);
    const result = spawnSync(command, [...args, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { input: sql, encoding: 'utf8', timeout: 30000 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const fresh = (options) => {
    once('postgres', `drop database if exists ${DATABASE} with (force);`);
    once('postgres', `create database ${DATABASE};`);
    once(DATABASE, schemaSql(root, options));
    assert.equal(once(DATABASE, `select role from public.workspace_members where user_id = '${scimAdmin}';`), 'admin', 'the mapping made the directory user an admin');
  };
  const race = async (first, second, delayMs) => {
    const a = new Session(connect);
    const b = new Session(connect);
    try {
      const firstRun = a.transaction(first);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const [aResult, bResult] = await Promise.all([firstRun, b.transaction(second)]);
      return { a: aResult, b: bResult, deadlocked: aResult.attempts > 1 || bResult.attempts > 1 };
    } finally {
      await a.end();
      await b.end();
    }
  };
  const describe = (result) => (result.deadlocked ? `deadlocked, recovered by retry (attempts ${result.a.attempts}/${result.b.attempts})` : 'no deadlock');
  const results = {};
  try {
    // 1. Direct role update vs mapped-department delete.
    fresh();
    const role = await race(
      `set local smoke.pause = 'on'; update public.workspace_members set role = 'member' where workspace_id = '${ws}' and user_id = '${scimAdmin}';`,
      `select public.management_delete_workspace_department('${ws}', '${engineering}', '${owner}');`,
      400,
    );
    assert.equal(role.a.errors, '', `the role update failed after ${role.a.attempts} attempts: ${role.a.errors}`);
    assert.equal(role.b.errors, '', `the department delete failed after ${role.b.attempts} attempts: ${role.b.errors}`);
    assert.equal(once(DATABASE, `select count(*) from public.workspace_departments where id = '${engineering}';`), '0', 'the department is deleted');
    results.roleUpdateVsDepartmentDelete = describe(role);

    // 2. Direct department rename vs management_update_workspace_department.
    fresh({ pauseDepartmentUpdate: true });
    const rename = await race(
      `select public.management_update_workspace_department('${ws}', '${engineering}', 'Engineering via API', null, 'users', 'slate', '${owner}');`,
      `update public.workspace_departments set name = 'Engineering via Settings' where id = '${engineering}';`,
      300,
    );
    assert.equal(rename.a.errors, '', `the management update failed after ${rename.a.attempts} attempts: ${rename.a.errors}`);
    assert.equal(rename.b.errors, '', `the direct rename failed after ${rename.b.attempts} attempts: ${rename.b.errors}`);
    results.directRenameVsManagementUpdate = describe(rename);

    // 3. A mapping inserted while an admin deletes its department (only where the delete checks the owner).
    const deleteFn = readFileSync(join(root, 'supabase/schemas/public/functions/management_delete_workspace_department.sql'), 'utf8');
    if (deleteFn.includes('department_has_group_mappings')) {
      fresh();
      const mapped = await race(
        `insert into public.scim_group_mappings (workspace_id, scim_group_id, department_id, access_role) values ('${ws}', '${group}', '${sales}', 'admin'); select pg_catalog.pg_sleep(1.5);`,
        `select public.management_delete_workspace_department('${ws}', '${sales}', '${admin}');`,
        300,
      );
      assert.equal(mapped.a.errors, '', `the mapping insert failed: ${mapped.a.errors}`);
      assert.match(mapped.b.errors, /department_has_group_mappings/, 'the admin delete saw the concurrently inserted mapping');
      assert.equal(once(DATABASE, `select count(*) from public.workspace_departments where id = '${sales}';`), '1', 'the department is kept');
      results.mappingInsertVsAdminDelete = 'refused: the check saw the new mapping';
    } else {
      results.mappingInsertVsAdminDelete = 'skipped (no owner check in this checkout)';
    }
    log(`Two-session workspace directory test: ${JSON.stringify(results)}`);
    assert(!rename.deadlocked, 'a direct department rename deadlocked with the management update function');
    return results;
  } finally {
    once('postgres', `drop database if exists ${DATABASE} with (force);`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const option = (name, fallback) => {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 ? process.argv[at + 1] : fallback;
  };
  const psql = option('psql', 'psql');
  const base = ['-h', option('host', '127.0.0.1'), '-p', option('port', '5432'), '-U', option('user', 'postgres')];
  await runWorkspaceDirectoryLockSmoke((database) => ({ command: psql, args: [...base, '-d', database] }), { root: option('root', repoRoot) });
}
