// Test-only helper: a throwaway PostgreSQL cluster with wal_level = logical,
// so the cutover scripts can be tested against real logical replication.
//
// Resolution order:
//   1. PS_CUTOVER_TEST_DATABASE_URL: an existing superuser connection (for
//      example a Docker postgres:17 started with -c wal_level=logical). Tests
//      create and drop their own databases on it.
//   2. Embedded binaries: PS_CUTOVER_PG_BIN (a folder with initdb and pg_ctl),
//      else @embedded-postgres/<platform> under E:/tmp/ps-auth-pg (17.x),
//      PS_TOOLS_DIR or E:/tmp/ps-db-deps. The cluster lives in
//      PS_CUTOVER_PG_DATA (default <tmp>/ps-cutover-pg/<name>) and is stopped
//      by stop().
//   3. Otherwise tests are skipped (available() returns false).
//
// Nothing here touches the repo or any non-scratch database.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { loadPg } from './common.mjs';

const exe = process.platform === 'win32' ? '.exe' : '';

function platformPackage() {
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  if (process.platform === 'win32') return `@embedded-postgres/windows-${arch}`;
  if (process.platform === 'darwin') return `@embedded-postgres/darwin-${arch}`;
  return `@embedded-postgres/linux-${arch}`;
}

export function findPgBin() {
  const candidates = [];
  if (process.env.PS_CUTOVER_PG_BIN) candidates.push(process.env.PS_CUTOVER_PG_BIN);
  const toolDirs = [process.env.PS_TOOLS_DIR, process.platform === 'win32' ? 'E:/tmp/ps-auth-pg' : null, process.platform === 'win32' ? 'E:/tmp/ps-db-deps' : null, path.join(os.tmpdir(), 'ps-db-deps')].filter(Boolean);
  // The package's exports map hides package.json, so look on disk instead of require.resolve.
  for (const dir of toolDirs) candidates.push(path.join(dir, 'node_modules', platformPackage(), 'native', 'bin'));
  for (const bin of candidates) {
    if (fs.existsSync(path.join(bin, `initdb${exe}`)) && fs.existsSync(path.join(bin, `pg_ctl${exe}`))) return bin;
  }
  return null;
}

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, ...opts });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} ${args.join(' ')} failed (${r.status}): ${r.stderr || r.stdout || r.error?.message}`);
  return r.stdout;
}

async function waitForServer(url, timeoutMs = 30_000) {
  const pg = loadPg();
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
    try {
      await c.connect();
      await c.end();
      return;
    } catch (error) {
      lastError = error;
      await c.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`server did not accept connections: ${lastError?.message}`);
}

/**
 * Create a cluster handle. `name` keeps data dirs and ports apart per test file.
 * Returns { available, start(), stop(), createDatabase(name), dropDatabase(name), url(db), adminUrl }.
 */
export function testCluster(name, port) {
  const external = process.env.PS_CUTOVER_TEST_DATABASE_URL || null;
  const bin = external ? null : findPgBin();
  const dataDir = path.join(process.env.PS_CUTOVER_PG_DATA || path.join(os.tmpdir(), 'ps-cutover-pg'), name);
  const baseUrl = external ? new URL(external) : new URL(`postgres://postgres@127.0.0.1:${port}/postgres`);
  let started = false;

  const url = (db) => {
    const u = new URL(baseUrl.toString());
    u.pathname = `/${db}`;
    return u.toString();
  };

  async function admin(fn) {
    const pg = loadPg();
    const c = new pg.Client({ connectionString: baseUrl.toString() });
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end();
    }
  }

  return {
    available: Boolean(external || bin),
    reason: external ? 'PS_CUTOVER_TEST_DATABASE_URL' : bin ? `embedded ${bin}` : 'no PostgreSQL found: set PS_CUTOVER_PG_BIN or PS_CUTOVER_TEST_DATABASE_URL',
    adminUrl: baseUrl.toString(),
    url,
    async start() {
      if (external) {
        await waitForServer(baseUrl.toString());
        return;
      }
      if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
        fs.mkdirSync(dataDir, { recursive: true });
        run(path.join(bin, `initdb${exe}`), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C']);
      }
      const opts = [`-p ${port}`, '-c listen_addresses=127.0.0.1', '-c wal_level=logical', '-c max_replication_slots=20', '-c max_wal_senders=20', '-c max_worker_processes=16', '-c max_logical_replication_workers=8', '-c TimeZone=UTC', '-c fsync=off'].join(' ');
      // pg_ctl start keeps inherited handles open on Windows; detach and wait on the port instead.
      const child = spawn(path.join(bin, `pg_ctl${exe}`), ['-D', dataDir, '-l', path.join(dataDir, 'server.log'), '-o', opts, 'start'], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      started = true;
      await waitForServer(baseUrl.toString());
    },
    async stop() {
      if (!started || external) return;
      spawnSync(path.join(bin, `pg_ctl${exe}`), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore', windowsHide: true, timeout: 30_000 });
      started = false;
    },
    async createDatabase(db) {
      await admin(async (c) => {
        await dropDatabaseWith(c, db);
        await c.query(`create database "${db}"`);
      });
      return url(db);
    },
    async dropDatabase(db) {
      await admin((c) => dropDatabaseWith(c, db));
    },
    admin,
  };
}

async function dropDatabaseWith(client, db) {
  // Scratch databases only: names are generated by the tests.
  if (!/^ps_cutover_test_[a-z0-9_]+$/.test(db)) throw new Error(`refusing to drop non-scratch database ${db}`);
  // Subscriptions keep a connection to their publisher; drop them first so the database can go.
  const exists = await client.query('select 1 from pg_database where datname = $1', [db]);
  if (!exists.rowCount) return;
  await client.query(`drop database "${db}" with (force)`);
}
