// Shared helpers for the PlanetScale cutover scripts (assess-cutover,
// sync-sequences, monitor-replication, egress-gate).
//
// Rules every script follows:
//   * Connection strings come from flags or environment variables only, and are
//     never printed. Use redactUrl() for anything that shows a target.
//   * Source connections are opened read-only (default_transaction_read_only),
//     so a bug cannot write to Supabase.
//   * The `pg` driver is not a dependency of the repo root. It is loaded from
//     PS_TOOLS_DIR (default E:/tmp/ps-db-deps on Windows), then from
//     packages/data/db, then from normal resolution.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../../..');

// ---------------------------------------------------------------------------
// Driver

let pgModule;
export function loadPg() {
  if (pgModule) return pgModule;
  const candidates = [];
  if (process.env.PS_TOOLS_DIR) candidates.push(path.join(process.env.PS_TOOLS_DIR, 'package.json'));
  if (process.platform === 'win32') candidates.push('E:/tmp/ps-db-deps/package.json');
  candidates.push(path.join(os.tmpdir(), 'ps-db-deps', 'package.json'));
  candidates.push(path.join(repoRoot, 'packages/data/db/package.json'));
  candidates.push(fileURLToPath(import.meta.url));
  const errors = [];
  for (const from of candidates) {
    try {
      pgModule = createRequire(from)('pg');
      return pgModule;
    } catch (error) {
      errors.push(`${from}: ${error.code ?? error.message}`);
    }
  }
  throw new Error(`Cannot load the "pg" driver. Install it somewhere outside the repo (npm install pg@8) and set PS_TOOLS_DIR to that folder.\n${errors.join('\n')}`);
}

// ---------------------------------------------------------------------------
// Connection strings

/** postgres://user:***@host:port/db (password and query string removed). Never throws. */
export function redactUrl(value) {
  if (!value) return '(unset)';
  try {
    const url = new URL(value);
    const user = url.username ? `${decodeURIComponent(url.username)}${url.password ? ':***' : ''}@` : '';
    return `${url.protocol}//${user}${url.host}${url.pathname}`;
  } catch {
    return '(unparseable connection string)';
  }
}

/** Remove anything that looks like a password or a connection string with credentials from free text. */
export function scrubSecrets(text) {
  return String(text)
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+):[^@\s]+@/gi, '$1:***@')
    .replace(/(password\s*=\s*)('[^']*'|\S+)/gi, '$1***');
}

/**
 * Pick a connection string: the flag value wins, then the first set env var.
 * Throws with the names it looked at (never the values) when none is set.
 */
export function resolveUrl(flagValue, envNames, label) {
  if (flagValue) return flagValue;
  for (const name of envNames) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  throw new UsageError(`${label} connection string is required: pass it as a flag or set ${envNames.join(' or ')}`);
}

export class UsageError extends Error {}

/**
 * pg client config from a URL. libpq TLS parameters are turned into pg's
 * `ssl` object so they cannot silently weaken verification:
 *   sslmode=disable            -> no TLS
 *   sslmode=require|prefer     -> TLS without certificate verification (warned)
 *   anything else / unset      -> verify-full (localhost: no TLS unless asked)
 *   sslrootcert=<file>         -> that CA bundle (Supabase's prod CA, for example)
 *   sslrootcert=system         -> system CAs (Node's default store)
 */
export function clientConfig(connectionString, { applicationName, statementTimeoutMs } = {}) {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get('sslmode');
  const rootcert = url.searchParams.get('sslrootcert');
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslnegotiation', 'uselibpqcompat', 'sslaccept']) {
    url.searchParams.delete(key);
  }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  let ssl;
  if (sslmode === 'disable' || (local && !sslmode)) ssl = false;
  else if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'allow' || sslmode === 'no-verify') {
    ssl = { rejectUnauthorized: false };
    process.stderr.write(`warning: TLS certificate not verified for ${redactUrl(connectionString)} (sslmode=${sslmode})\n`);
  } else {
    ssl = { rejectUnauthorized: true };
    if (rootcert && rootcert !== 'system') ssl.ca = fs.readFileSync(rootcert, 'utf8');
  }
  return {
    connectionString: url.toString(),
    ssl,
    application_name: applicationName,
    statement_timeout: statementTimeoutMs,
    connectionTimeoutMillis: 15_000,
  };
}

/**
 * Connect a single pg Client. With readOnly, every transaction in the session
 * is read-only, so writes fail with SQLSTATE 25006.
 */
export async function connect(connectionString, { readOnly = false, applicationName = 'phaseo-cutover', statementTimeoutMs = 120_000 } = {}) {
  const pg = loadPg();
  const client = new pg.Client(clientConfig(connectionString, { applicationName, statementTimeoutMs }));
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`cannot connect to ${redactUrl(connectionString)}: ${scrubSecrets(error.message)}`);
  }
  // Errors on an idle client must not crash the process or print the URL.
  client.on('error', (error) => process.stderr.write(`connection error (${redactUrl(connectionString)}): ${scrubSecrets(error.message)}\n`));
  if (readOnly) {
    await client.query('SET default_transaction_read_only = on');
  }
  client.label = redactUrl(connectionString);
  return client;
}

/** `query(sql, params)` returning rows; the shape every check function takes. */
export function rowsOf(client) {
  return async (sql, params = []) => (await client.query(sql, params)).rows;
}

// ---------------------------------------------------------------------------
// Formatting

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function qualified(schema, name) {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}

export function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let v = Math.abs(n);
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  const s = i === 0 ? String(Math.round(v)) : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${n < 0 ? '-' : ''}${s} ${units[i]}`;
}

export function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : String(value);
}

/** Plain-text table. `columns` is [{ key, label, align? }]. */
export function renderTable(rows, columns) {
  if (!rows.length) return '  (none)\n';
  const cells = rows.map((row) => columns.map((c) => (row[c.key] === null || row[c.key] === undefined ? '' : String(row[c.key]))));
  const widths = columns.map((c, i) => Math.max(c.label.length, ...cells.map((r) => r[i].length)));
  const line = (values) =>
    '  ' +
    values
      .map((v, i) => (columns[i].align === 'right' ? v.padStart(widths[i]) : v.padEnd(widths[i])))
      .join('  ')
      .trimEnd();
  return [line(columns.map((c) => c.label)), line(widths.map((w) => '-'.repeat(w))), ...cells.map(line)].join('\n') + '\n';
}

export function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// LSNs

/** '16/B374D848' -> BigInt byte position. */
export function lsnToBigInt(lsn) {
  if (lsn === null || lsn === undefined) return null;
  const [hi, lo] = String(lsn).split('/');
  if (lo === undefined) return null;
  return (BigInt(`0x${hi}`) << 32n) + BigInt(`0x${lo}`);
}

export function lsnDiff(a, b) {
  const x = lsnToBigInt(a);
  const y = lsnToBigInt(b);
  if (x === null || y === null) return null;
  return Number(x - y);
}

// ---------------------------------------------------------------------------
// CLI wrapper

/**
 * Run a CLI main(). Exit codes: whatever main returns (default 0),
 * 64 for usage errors, 70 for anything thrown. Error text is scrubbed.
 */
export function runCli(main, usage) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code ?? 0;
    })
    .catch((error) => {
      if (error instanceof UsageError) {
        process.stderr.write(`${error.message}\n\n${usage}\n`);
        process.exitCode = 64;
        return;
      }
      process.stderr.write(`error: ${scrubSecrets(error?.message ?? error)}\n`);
      process.exitCode = 70;
    });
}

export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(fileURLToPath(importMetaUrl)) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
}
