#!/usr/bin/env node
// Applies the PlanetScale migrations to a throwaway local PostgreSQL 17 and
// checks the result against supabase/schemas.
//
//   node database/planetscale/scripts/verify-baseline.mjs [--keep]
//
// Steps
//   1. Start (or reuse) a local PostgreSQL 17 cluster from @embedded-postgres
//      on port 55433, and create a fresh database for this run.
//   2. Apply 0000_platform.sql, then 0001_auth.sql (or, while that file does not
//      exist yet, a clearly marked auth.users STUB), then 0002_baseline.sql.
//      Statements run one by one inside one transaction; the first error stops
//      the run (the equivalent of psql --single-transaction -v ON_ERROR_STOP=1).
//   3. Check, against counts derived from supabase/schemas: tables, views,
//      functions, policies, indexes, triggers (names, per schema), foreign keys
//      (all resolve, 79 to auth.users), RLS switched on where it was, every
//      function body compiles with check_function_bodies on, auth.users has
//      the columns the schema reads, auth.uid()/role()/jwt() behave like
//      Supabase's, RLS works as authenticated/anon, and the signup trigger
//      provisions public.users.
//   4. 0003_cron.sql needs pg_cron. If the server lacks it, 0003 is not applied;
//      instead each job's command runs once in a rolled-back transaction.
//
// Exit code 0 only when every check passes.
//
// Environment
//   PS_SCHEMA_PG_DIR        tools dir with node_modules/@embedded-postgres/<platform> and pg
//                           (default E:/tmp/ps-schema-pg on Windows, <tmp>/ps-schema-pg elsewhere)
//   PS_VERIFY_DATABASE_URL  use this server instead of the embedded one (must be a superuser
//                           connection to a maintenance database; a fresh database is created)
//
// Install the tools once (outside the repo, so the workspace is untouched):
//   mkdir E:/tmp/ps-schema-pg && cd E:/tmp/ps-schema-pg && npm init -y
//   npm install @embedded-postgres/windows-x64@17.6.0-beta.15 pg@8.13.1

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, render, baselinePath, loadSource, splitSql, maskLiterals, normName, pgStrictScan } from './build-baseline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../migrations');
const toolsDir = process.env.PS_SCHEMA_PG_DIR || (process.platform === 'win32' ? 'E:/tmp/ps-schema-pg' : path.join(os.tmpdir(), 'ps-schema-pg'));
const PORT = 55433;
const KEEP = process.argv.includes('--keep');
const APP_SCHEMAS = ['public', 'private', 'catalogue_private'];

const toolsRequire = createRequire(path.join(toolsDir, 'package.json'));
const pg = (() => {
  try { return toolsRequire('pg'); } catch { return createRequire(import.meta.url)('pg'); }
})();

const failures = [];
const notes = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok   ${msg}`);

// ---------------------------------------------------------------------------
// Server

function embeddedBin() {
  const pkg = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const dir = path.join(toolsDir, 'node_modules', ...pkg.split('/'), 'native', 'bin');
  if (!fs.existsSync(dir)) throw new Error(`${pkg} not found under ${toolsDir}; see the install note at the top of this script`);
  const exe = (n) => path.join(dir, process.platform === 'win32' ? `${n}.exe` : n);
  return { initdb: exe('initdb'), pg_ctl: exe('pg_ctl'), dir };
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function startEmbedded() {
  const bin = embeddedBin();
  const dataDir = path.join(toolsDir, 'cluster');
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    const r = run(bin.initdb, ['-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale-provider=icu', '--icu-locale=en-US', '--locale=C', '-D', dataDir]);
    if (r.code !== 0) throw new Error(`initdb failed:\n${r.out}`);
  }
  const status = run(bin.pg_ctl, ['status', '-D', dataDir]);
  if (status.code === 0) return { url: `postgres://postgres@127.0.0.1:${PORT}/postgres`, stop: () => {}, reused: true, bin };
  // stdio is ignored and -l is used so the detached postmaster does not hold our pipes open.
  const r = spawnSync(bin.pg_ctl, ['start', '-w', '-t', '60', '-D', dataDir, '-l', path.join(toolsDir, 'postgres.log'), '-o', `-p ${PORT}`], { stdio: 'ignore', windowsHide: true });
  if (r.status !== 0) throw new Error(`pg_ctl start failed; see ${path.join(toolsDir, 'postgres.log')}`);
  return { url: `postgres://postgres@127.0.0.1:${PORT}/postgres`, stop: () => run(bin.pg_ctl, ['stop', '-m', 'fast', '-D', dataDir]), reused: false, bin };
}

// ---------------------------------------------------------------------------
// Apply

async function applyFile(client, label, sql) {
  const statements = splitSql(sql.replace(/\r\n/g, '\n'));
  for (let i = 0; i < statements.length; i++) {
    const st = statements[i];
    try {
      await client.query(st);
    } catch (e) {
      const marker = findMarker(sql, st);
      throw new Error(`${label}: statement ${i + 1}/${statements.length}${marker ? ` (${marker})` : ''} failed: ${e.message}\n${st.slice(0, 600)}`);
    }
  }
  return statements.length;
}

function findMarker(sql, st) {
  const at = sql.indexOf(st);
  if (at < 0) return null;
  const before = sql.slice(0, at);
  const m = [...before.matchAll(/^-- source: (.*)$/gm)].pop();
  return m ? m[1] : null;
}

/** Columns of auth.users the schema reads, from `auth.users <alias>` joins. */
function authUserColumnsUsed(statements) {
  const cols = new Set(['id']);
  for (const s of statements) {
    if (s.info.kind !== 'function') continue;
    const text = maskLiterals(s.text);
    for (const m of text.matchAll(/\bauth\.users\s+(?:as\s+)?([a-z_][a-z0-9_]*)/gi)) {
      const alias = m[1].toLowerCase();
      if (['on', 'where', 'join', 'left', 'inner', 'set', 'using', 'for', 'limit', 'order', 'group'].includes(alias)) continue;
      for (const c of text.matchAll(new RegExp(String.raw`(?<![a-z0-9_.])${alias}\.([a-z_][a-z0-9_]*)`, 'gi'))) cols.add(c[1].toLowerCase());
    }
  }
  return cols;
}

const AUTH_USERS_STUB = `
-- STUB: stands in for 0001_auth.sql, which does not exist yet. It has the
-- auth.users columns from the README identity contract plus the columns that
-- the baseline reads (deleted_at, is_anonymous). Replace by the real file.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  name text,
  email text UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  two_factor_enabled boolean DEFAULT false,
  role text,
  banned boolean DEFAULT false,
  ban_reason text,
  ban_expires timestamptz,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  last_sign_in_at timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean NOT NULL DEFAULT false
);`;

// ---------------------------------------------------------------------------
// Expected objects, from supabase/schemas

function expectedObjects(statements) {
  const exp = { tables: new Set(), views: new Set(), functions: new Map(), policies: new Set(), indexes: new Set(), triggers: new Set(), rls: new Set(), fkCount: 0, fkToAuthUsers: 0 };
  for (const s of statements) {
    const i = s.info;
    const masked = maskLiterals(s.text);
    if (i.kind === 'table') {
      exp.tables.add(i.name);
      const fks = [...masked.matchAll(/\bREFERENCES\s+((?:"[^"]+"|[a-z_][a-z0-9_]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][a-z0-9_]*))?)/gi)];
      exp.fkCount += fks.length;
      exp.fkToAuthUsers += fks.filter((m) => normName(m[1]) === 'auth.users').length;
    } else if (i.kind === 'alter_table' || i.kind === 'fk') {
      if (i.rls) exp.rls.add(i.table);
      const fks = [...masked.matchAll(/\bREFERENCES\s+((?:"[^"]+"|[a-z_][a-z0-9_]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][a-z0-9_]*))?)/gi)];
      exp.fkCount += fks.length;
      exp.fkToAuthUsers += fks.filter((m) => normName(m[1]) === 'auth.users').length;
    } else if (i.kind === 'view') exp.views.add(i.name);
    else if (i.kind === 'function') exp.functions.set(i.name, (exp.functions.get(i.name) ?? 0) + 1);
    else if (i.kind === 'policy') exp.policies.add(`${i.table}:${i.name}`);
    else if (i.kind === 'index') exp.indexes.add(`${i.table.split('.')[0]}.${i.name}`);
    else if (i.kind === 'trigger') exp.triggers.add(`${i.table}:${i.name}`);
  }
  return exp;
}

const schemaOf = (q) => q.split('.')[0].split(':')[0];
function perSchema(set) {
  const c = {};
  for (const x of set) c[schemaOf(x)] = (c[schemaOf(x)] ?? 0) + 1;
  return c;
}

function compareSets(label, expected, actual) {
  const missing = [...expected].filter((x) => !actual.has(x));
  const extra = [...actual].filter((x) => !expected.has(x));
  const e = perSchema(expected), a = perSchema(actual);
  const schemas = [...new Set([...Object.keys(e), ...Object.keys(a)])].sort();
  const counts = schemas.map((s) => `${s} ${a[s] ?? 0}/${e[s] ?? 0}`).join(', ');
  if (missing.length || extra.length) {
    fail(`${label}: ${counts}${missing.length ? `; missing ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` (+${missing.length - 10})` : ''}` : ''}${extra.length ? `; unexpected ${extra.slice(0, 10).join(', ')}` : ''}`);
  } else ok(`${label}: ${counts} (actual/expected)`);
  return { label, counts: Object.fromEntries(schemas.map((s) => [s, [a[s] ?? 0, e[s] ?? 0]])) };
}

// ---------------------------------------------------------------------------

async function main() {
  const { statements } = loadSource();
  console.log('Generator');
  const fresh = render(build());
  if (fresh !== fs.readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n')) fail('0002_baseline.sql is stale against supabase/schemas; run build-baseline.mjs');
  else ok('0002_baseline.sql matches a fresh build from supabase/schemas');
  for (const h of pgStrictScan(statements)) notes.push(`pg_strict would reject ${h.kind.toUpperCase()} without WHERE in ${h.fn}: ${h.snippet.slice(0, 70)}`);
  const files = Object.fromEntries(['0000_platform.sql', '0001_auth.sql', '0002_baseline.sql', '0003_cron.sql'].map((f) => [f, path.join(migrationsDir, f)]));
  for (const f of ['0000_platform.sql', '0002_baseline.sql', '0003_cron.sql']) if (!fs.existsSync(files[f])) throw new Error(`missing ${files[f]}`);

  let server;
  if (process.env.PS_VERIFY_DATABASE_URL) server = { url: process.env.PS_VERIFY_DATABASE_URL, stop: () => {}, reused: true };
  else server = startEmbedded();
  const admin = new pg.Client({ connectionString: server.url });
  await admin.connect();
  const version = (await admin.query('show server_version')).rows[0].server_version;
  const dbName = `ps_verify_${Date.now()}`;
  await admin.query(`create database ${dbName}`);
  console.log(`PostgreSQL ${version}${server.reused ? ' (existing server)' : ` (embedded, port ${PORT})`}; database ${dbName}`);

  const url = new URL(server.url);
  url.pathname = `/${dbName}`;
  const client = new pg.Client({ connectionString: url.toString() });
  client.on('notice', (n) => { if (n.severity === 'WARNING') notes.push(`server warning: ${n.message}`); });
  await client.connect();

  const summary = {};
  try {
    console.log('\nApply');
    await client.query('begin');
    summary.applied = {};
    summary.applied['0000_platform.sql'] = await applyFile(client, '0000_platform.sql', fs.readFileSync(files['0000_platform.sql'], 'utf8'));
    ok(`0000_platform.sql (${summary.applied['0000_platform.sql']} statements)`);
    await applyFile(client, '0000_platform.sql (second run)', fs.readFileSync(files['0000_platform.sql'], 'utf8'));
    ok('0000_platform.sql re-runs cleanly (idempotent)');
    const hasAuth = fs.existsSync(files['0001_auth.sql']);
    if (hasAuth) {
      summary.applied['0001_auth.sql'] = await applyFile(client, '0001_auth.sql', fs.readFileSync(files['0001_auth.sql'], 'utf8'));
      ok(`0001_auth.sql (${summary.applied['0001_auth.sql']} statements)`);
    } else {
      await applyFile(client, 'auth.users STUB', AUTH_USERS_STUB);
      notes.push('0001_auth.sql not found: applied an auth.users STUB (README contract columns + deleted_at, is_anonymous)');
      ok('auth.users STUB (0001_auth.sql not present)');
    }
    const t0 = Date.now();
    summary.applied['0002_baseline.sql'] = await applyFile(client, '0002_baseline.sql', fs.readFileSync(files['0002_baseline.sql'], 'utf8'));
    await client.query('commit');
    ok(`0002_baseline.sql (${summary.applied['0002_baseline.sql']} statements, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

    console.log('\nObjects vs supabase/schemas');
    const exp = expectedObjects(statements);
    const inList = `(${APP_SCHEMAS.map((s) => `'${s}'`).join(',')})`;
    const rows = async (sql) => (await client.query(sql)).rows;

    const tables = new Set((await rows(`select n.nspname||'.'||c.relname q from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ${inList}`)).map((r) => r.q));
    summary.tables = compareSets('tables', exp.tables, tables);
    const views = new Set((await rows(`select n.nspname||'.'||c.relname q from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('v','m') and n.nspname in ${inList}`)).map((r) => r.q));
    summary.views = compareSets('views', exp.views, views);

    const fnRows = await rows(`select n.nspname||'.'||p.proname q, count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ${inList} and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') group by 1`);
    const fnActual = new Map(fnRows.map((r) => [r.q, r.n]));
    const expandFns = (m) => new Set([...m].flatMap(([k, v]) => Array.from({ length: v }, (_, i) => (i ? `${k}#${i + 1}` : k))));
    summary.functions = compareSets('functions (overloads counted)', expandFns(exp.functions), expandFns(fnActual));

    const policies = new Set((await rows(`select schemaname||'.'||tablename||':'||policyname q from pg_policies where schemaname in ${inList}`)).map((r) => r.q));
    summary.policies = compareSets('policies', exp.policies, policies);

    const indexes = new Set((await rows(`select n.nspname||'.'||ic.relname q from pg_index i join pg_class ic on ic.oid=i.indexrelid join pg_namespace n on n.oid=ic.relnamespace
      where n.nspname in ${inList}
        and not exists (select 1 from pg_constraint k where k.conindid=i.indexrelid and k.contype in ('p','u','x'))
        and not exists (select 1 from pg_inherits h where h.inhrelid=i.indexrelid)`)).map((r) => r.q));
    summary.indexes = compareSets('indexes (excluding constraint and partition-child indexes)', exp.indexes, indexes);

    const triggers = new Set((await rows(`select n.nspname||'.'||c.relname||':'||t.tgname q from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and t.tgparentid=0 and n.nspname in ('public','private','catalogue_private','auth')`)).map((r) => r.q));
    // 0001_auth.sql may add its own triggers on auth tables; only compare the ones the baseline owns.
    const ownTriggers = new Set([...triggers].filter((t) => !t.startsWith('auth.') || exp.triggers.has(t)));
    summary.triggers = compareSets('triggers (excluding partition clones)', exp.triggers, ownTriggers);

    const rlsOn = new Set((await rows(`select n.nspname||'.'||c.relname q from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and c.relrowsecurity and n.nspname in ${inList}`)).map((r) => r.q));
    summary.rls = compareSets('RLS enabled', exp.rls, rlsOn);

    console.log('\nForeign keys');
    const fk = (await rows(`select count(*)::int total,
        count(*) filter (where not k.convalidated)::int not_valid,
        count(*) filter (where fn.nspname='auth' and f.relname='users')::int to_auth_users,
        count(*) filter (where f.oid is null)::int dangling
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      left join pg_class f on f.oid=k.confrelid left join pg_namespace fn on fn.oid=f.relnamespace
      where k.contype='f' and k.conparentid=0 and n.nspname in ${inList}`))[0];
    summary.fks = { ...fk, expected: exp.fkCount, expectedToAuthUsers: exp.fkToAuthUsers };
    if (fk.total !== exp.fkCount) fail(`foreign keys: ${fk.total} in database, ${exp.fkCount} in supabase/schemas`);
    else ok(`foreign keys: ${fk.total}/${exp.fkCount}`);
    if (fk.to_auth_users !== exp.fkToAuthUsers) fail(`foreign keys to auth.users: ${fk.to_auth_users}, expected ${exp.fkToAuthUsers}`);
    else ok(`foreign keys to auth.users: ${fk.to_auth_users}`);
    if (fk.not_valid || fk.dangling) fail(`foreign keys not validated: ${fk.not_valid}, dangling: ${fk.dangling}`);
    else ok('every foreign key resolves and is validated');

    console.log('\nFunction bodies (check_function_bodies = on)');
    const defs = await rows(`select p.oid, n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, l.lanname, pg_get_functiondef(p.oid) def
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
      where n.nspname in ('public','private','catalogue_private','auth') and p.prokind in ('f','p')
        and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`);
    const bodyFailures = [];
    for (const d of defs) {
      await client.query('begin');
      try {
        await client.query('set local check_function_bodies = on');
        await client.query(d.def);
      } catch (e) {
        bodyFailures.push(`${d.sig} [${d.lanname}]: ${e.message}`);
      } finally {
        await client.query('rollback');
      }
    }
    const byLang = defs.reduce((a, d) => ({ ...a, [d.lanname]: (a[d.lanname] ?? 0) + 1 }), {});
    if (bodyFailures.length) { fail(`${bodyFailures.length}/${defs.length} function bodies do not compile`); bodyFailures.slice(0, 25).forEach((f) => console.log(`         ${f}`)); }
    else ok(`${defs.length} functions compile (${Object.entries(byLang).map(([k, v]) => `${k} ${v}`).join(', ')}; plpgsql is syntax-checked only)`);
    summary.functionBodies = { checked: defs.length, failed: bodyFailures.length };

    console.log('\nauth.users and the auth.* compat functions');
    const needCols = authUserColumnsUsed(statements);
    const haveCols = new Set((await rows(`select column_name from information_schema.columns where table_schema='auth' and table_name='users'`)).map((r) => r.column_name));
    const missingCols = [...needCols].filter((c) => !haveCols.has(c));
    if (missingCols.length) fail(`auth.users lacks columns the schema reads: ${missingCols.join(', ')}`);
    else ok(`auth.users has every column the schema reads (${[...needCols].sort().join(', ')})`);

    await client.query('begin');
    try {
      const uid = '11111111-1111-4111-8111-111111111111';
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated', email: 'a@example.com' })]);
      const r = (await client.query(`select auth.uid()::text uid, auth.role() role, auth.jwt()->>'email' email`)).rows[0];
      if (r.uid !== uid || r.role !== 'authenticated' || r.email !== 'a@example.com') fail(`auth.uid()/role()/jwt() from request.jwt.claims returned ${JSON.stringify(r)}`);
      else ok('auth.uid(), auth.role(), auth.jwt() read request.jwt.claims');
      const legacy = '22222222-2222-4222-8222-222222222222';
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [legacy]);
      const l = (await client.query('select auth.uid()::text uid')).rows[0];
      if (l.uid !== legacy) fail(`legacy request.jwt.claim.sub not preferred (got ${l.uid})`);
      else ok('legacy request.jwt.claim.sub takes precedence, as on Supabase');
    } finally {
      await client.query('rollback');
    }

    console.log('\nRuntime smoke (rolled back)');
    await client.query('begin');
    try {
      const uid = '33333333-3333-4333-8333-333333333333';
      const required = await rows(`select column_name, data_type from information_schema.columns
        where table_schema='auth' and table_name='users' and is_nullable='NO' and column_default is null and column_name not in ('id','email')`);
      const filler = { text: `'x'`, boolean: 'false', 'timestamp with time zone': 'now()', 'timestamp without time zone': 'now()', uuid: 'gen_random_uuid()', jsonb: `'{}'`, integer: '0', bigint: '0' };
      const cols = ['id', 'email', ...required.map((c) => c.column_name)];
      const vals = [`'${uid}'`, `'signup-smoke@example.com'`, ...required.map((c) => filler[c.data_type] ?? 'null')];
      await client.query(`insert into auth.users (${cols.map((c) => `"${c}"`).join(', ')}) values (${vals.join(', ')})`);
      const provisioned = (await client.query('select count(*)::int n from public.users where user_id = $1', [uid])).rows[0].n;
      if (provisioned !== 1) fail('signup trigger did not create the public.users row');
      else ok('insert into auth.users runs on_auth_user_created_enqueue_welcome and creates public.users');

      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await client.query('set local role authenticated');
      await client.query('select count(*) from public.workspaces');
      await client.query('select count(*) from public.users');
      await client.query('reset role');
      await client.query('set local role anon');
      await client.query('select count(*) from public.v2_models');
      await client.query('reset role');
      ok('SET LOCAL ROLE authenticated/anon can query RLS-protected tables');
    } catch (e) {
      fail(`runtime smoke: ${e.message}`);
    } finally {
      await client.query('rollback');
    }

    console.log('\nSupabase-only leftovers');
    const leftovers = await rows(`select n.nspname||'.'||p.proname q from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ${inList} and (p.prosrc ~ '\\mnet\\.http_' or p.prosrc ~ 'index_advisor' or p.prosrc ~ '\\mcron\\.')`);
    if (leftovers.length) fail(`functions still calling pg_net/index_advisor/pg_cron: ${leftovers.map((r) => r.q).join(', ')}`);
    else ok('no function calls pg_net, index_advisor or pg_cron');
    const roles = await rows(`select rolname from pg_roles where rolname in ('anon','authenticated','service_role') order by 1`);
    if (roles.length !== 3) fail(`roles missing: ${roles.map((r) => r.rolname)}`);
    else ok('roles anon, authenticated, service_role exist');

    console.log('\n0003_cron.sql');
    const cronAvailable = (await rows(`select 1 from pg_available_extensions where name='pg_cron'`)).length > 0;
    const cronSql = fs.readFileSync(files['0003_cron.sql'], 'utf8');
    const jobs = [...cronSql.matchAll(/cron\.schedule\('([^']+)',\s*'([^']+)',\s*\$cmd\$([\s\S]*?)\$cmd\$\)/g)].map((m) => ({ name: m[1], schedule: m[2], command: m[3] }));
    if (jobs.length !== 8) fail(`0003_cron.sql schedules ${jobs.length} jobs, expected 8`);
    if (cronAvailable) {
      try {
        await applyFile(client, '0003_cron.sql', cronSql);
        ok('0003_cron.sql applied');
      } catch (e) {
        fail(e.message);
      }
    } else {
      notes.push('pg_cron is not available on this server: 0003_cron.sql was NOT applied; each job command ran once in a rolled-back transaction instead');
      console.log('  skip pg_cron not available on this server; 0003_cron.sql not applied');
    }
    for (const job of jobs) {
      await client.query('begin');
      try {
        for (const st of splitSql(job.command)) await client.query(st);
        ok(`job ${job.name} (${job.schedule}) command runs`);
      } catch (e) {
        fail(`job ${job.name} command failed: ${e.message}`);
      } finally {
        await client.query('rollback');
      }
    }
  } finally {
    await client.end().catch(() => {});
    if (!KEEP) await admin.query(`drop database if exists ${dbName}`).catch((e) => notes.push(`could not drop ${dbName}: ${e.message}`));
    else notes.push(`kept database ${dbName} on ${server.url}`);
    await admin.end().catch(() => {});
    if (!server.reused && !KEEP) server.stop();
  }

  console.log('\nSummary');
  for (const n of new Set(notes)) console.log(`  note ${n}`);
  if (failures.length) {
    console.log(`  ${failures.length} check(s) FAILED`);
    process.exit(1);
  }
  console.log('  all checks passed');
}

main().catch((e) => {
  console.error(`\nverify-baseline: ${e.message}`);
  process.exit(1);
});
