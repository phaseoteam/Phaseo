#!/usr/bin/env node
// Builds database/planetscale/migrations/0002_baseline.sql from the declarative
// Supabase schema in supabase/schemas, in .pgdelta-export.json load order, with
// the PlanetScale transforms described in database/planetscale/SCHEMA-PORT.md.
//
//   node database/planetscale/scripts/build-baseline.mjs           write the file
//   node database/planetscale/scripts/build-baseline.mjs --check   fail if it is stale
//   node database/planetscale/scripts/build-baseline.mjs --report  also print the pg_strict scan
//
// The declarative files are not dependency ordered at statement level (a table
// file carries its own triggers, policies and foreign keys), so statements are
// regrouped into pg_dump-style phases. Within a phase the original load order is
// kept, except views, which are sorted by their references to each other.
// Any statement shape the generator does not recognise stops the build, so a new
// shape on main is noticed instead of being silently misplaced.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../..');
export const schemasDir = path.join(repoRoot, 'supabase/schemas');
export const baselinePath = path.join(repoRoot, 'database/planetscale/migrations/0002_baseline.sql');

// ---------------------------------------------------------------------------
// SQL lexing helpers

/** Calls visit(i, c) for every character outside comments, string literals, quoted identifiers and dollar-quoted bodies. */
function scanTopLevel(sql, visit) {
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') { const j = sql.indexOf('\n', i); i = j < 0 ? n : j + 1; continue; }
    if (c === '/' && sql[i + 1] === '*') {
      let depth = 1; i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; } else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; } else i++;
      }
      continue;
    }
    if (c === "'") {
      const escape = /[Ee]/.test(sql[i - 1] ?? '') && !/[A-Za-z0-9_]/.test(sql[i - 2] ?? '');
      i++;
      while (i < n) {
        if (escape && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === "'") { if (sql[i + 1] === "'") { i += 2; continue; } i++; break; }
        i++;
      }
      continue;
    }
    if (c === '"') { i++; while (i < n) { if (sql[i] === '"') { if (sql[i + 1] === '"') { i += 2; continue; } i++; break; } i++; } continue; }
    if (c === '$' && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? '')) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 80));
      if (m) { const j = sql.indexOf(m[0], i + m[0].length); i = j < 0 ? n : j + m[0].length; continue; }
    }
    if (visit(i, c) === false) return;
    i++;
  }
}

/** Splits a SQL script into statements (each keeps its trailing semicolon). Comment-only fragments are dropped. */
export function splitSql(sql) {
  const out = [];
  let start = 0;
  scanTopLevel(sql, (i, c) => { if (c === ';') { out.push(sql.slice(start, i + 1)); start = i + 1; } });
  if (sql.slice(start).trim()) out.push(sql.slice(start));
  return out.map((s) => stripLeadingComments(s.trim())).filter((s) => s && s !== ';');
}

export function stripLeadingComments(s) {
  let t = s;
  for (;;) {
    const before = t;
    t = t.replace(/^\s*--[^\n]*(\n|$)/, '').replace(/^\s*\/\*[\s\S]*?\*\//, '');
    if (t === before) return t.trim();
  }
}

/** Splits on a separator character at parenthesis depth 0 (outside literals). */
function splitTopLevel(text, sep = ',') {
  const parts = [];
  let depth = 0, start = 0;
  scanTopLevel(text, (i, c) => {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  });
  parts.push(text.slice(start));
  return parts;
}

/** Index of the parenthesis that closes the one at `open`. */
function matchParen(text, open) {
  let depth = 0, close = -1;
  scanTopLevel(text.slice(open), (i, c) => {
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) { close = open + i; return false; }
  });
  return close;
}

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = String.raw`${IDENT}\s*\.\s*${IDENT}`;
const unquote = (id) => (id.startsWith('"') ? id.slice(1, -1).replace(/""/g, '"') : id.toLowerCase());
export const normName = (q) => {
  const m = new RegExp(String.raw`^(${IDENT})\s*\.\s*(${IDENT})$`).exec(q.trim());
  return m ? `${unquote(m[1])}.${unquote(m[2])}` : unquote(q.trim());
};

// ---------------------------------------------------------------------------
// Statement classification

export function classify(s) {
  const m = (re) => re.exec(s);
  let r;
  if ((r = m(new RegExp(String.raw`^CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT})`, 'i')))) return { kind: 'schema', name: unquote(r[1]) };
  if ((r = m(new RegExp(String.raw`^CREATE\s+TYPE\s+(${QNAME})`, 'i')))) return { kind: 'type', name: normName(r[1]) };
  if ((r = m(new RegExp(String.raw`^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QNAME})`, 'i')))) {
    const p = new RegExp(String.raw`PARTITION\s+OF\s+(${QNAME})`, 'i').exec(s);
    return { kind: 'table', name: normName(r[1]), partitionOf: p ? normName(p[1]) : null };
  }
  if ((r = m(new RegExp(String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?(?:RECURSIVE\s+)?VIEW\s+(${QNAME})`, 'i')))) return { kind: 'view', name: normName(r[1]) };
  if ((r = m(new RegExp(String.raw`^CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QNAME})`, 'i')))) return { kind: 'view', name: normName(r[1]), materialized: true };
  if ((r = m(new RegExp(String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(${QNAME})`, 'i')))) return { kind: 'function', name: normName(r[1]) };
  if ((r = m(new RegExp(String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT})\s+ON\s+(?:ONLY\s+)?(${QNAME})`, 'i')))) return { kind: 'index', name: unquote(r[1]), table: normName(r[2]) };
  if ((r = m(new RegExp(String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(${IDENT})[\s\S]*?\bON\s+(${QNAME})`, 'i')))) return { kind: 'trigger', name: unquote(r[1]), table: normName(r[2]) };
  if ((r = m(new RegExp(String.raw`^CREATE\s+POLICY\s+(${IDENT})\s+ON\s+(${QNAME})`, 'i')))) return { kind: 'policy', name: unquote(r[1]), table: normName(r[2]) };
  if (/^CREATE\s+EVENT\s+TRIGGER/i.test(s)) return { kind: 'event_trigger' };
  if (/^CREATE\s+EXTENSION/i.test(s)) return { kind: 'extension' };
  if (/^ALTER\s+DEFAULT\s+PRIVILEGES/i.test(s)) return { kind: 'default_privileges' };
  if ((r = m(new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?(${QNAME})`, 'i')))) {
    const fk = new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?${QNAME}\s+ADD\s+CONSTRAINT\s+(${IDENT})\s+FOREIGN\s+KEY`, 'i').exec(s);
    if (fk) return { kind: 'fk', table: normName(r[1]), name: unquote(fk[1]) };
    return { kind: 'alter_table', table: normName(r[1]), rls: /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(s) };
  }
  if ((r = m(new RegExp(String.raw`^ALTER\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+EXISTS\s+)?(${QNAME})`, 'i')))) return { kind: 'alter_view', table: normName(r[1]) };
  if ((r = m(new RegExp(String.raw`^ALTER\s+(?:FUNCTION|PROCEDURE)\s+(${QNAME})`, 'i')))) return { kind: 'alter_function', target: normName(r[1]) };
  if ((r = m(/^COMMENT\s+ON\s+(SCHEMA|TYPE|TABLE|VIEW|MATERIALIZED\s+VIEW|COLUMN|FUNCTION|PROCEDURE|INDEX|POLICY|TRIGGER|CONSTRAINT|EXTENSION|SEQUENCE)\s+([\s\S]*?)\s+IS\s/i))) {
    return { kind: 'comment', on: r[1].toUpperCase().replace(/\s+/g, ' '), ...commentTarget(r[1].toUpperCase(), r[2]) };
  }
  if (/^(GRANT|REVOKE)\b/i.test(s)) return { kind: 'acl', ...aclTarget(s) };
  if (/^SELECT\s+cron\./i.test(s)) return { kind: 'cron' };
  return { kind: 'unknown' };
}

function commentTarget(on, rest) {
  if (on === 'COLUMN') {
    const c = new RegExp(String.raw`^(${IDENT})\s*\.\s*(${IDENT})\s*\.\s*${IDENT}`, 'i').exec(rest);
    return { target: `${unquote(c[1])}.${unquote(c[2])}` };
  }
  if (on === 'POLICY' || on === 'TRIGGER' || on === 'CONSTRAINT') {
    const t = new RegExp(String.raw`^(${IDENT})\s+ON\s+(${QNAME})`, 'i').exec(rest);
    return { name: unquote(t[1]), target: normName(t[2]) };
  }
  if (on === 'SCHEMA' || on === 'EXTENSION') return { target: unquote(rest.trim()) };
  const q = new RegExp(String.raw`^(${QNAME})`, 'i').exec(rest)?.[1];
  return { target: q ? normName(q) : rest.trim() };
}

function aclTarget(s) {
  const on = /\bON\s+(?:(TABLE|SEQUENCE|FUNCTION|PROCEDURE|ROUTINE|SCHEMA|TYPE|ALL\s+\w+\s+IN\s+SCHEMA)\s+)?/i.exec(s);
  if (!on) return { on: 'ROLE' };
  const rest = s.slice(on.index + on[0].length);
  const kind = (on[1] || 'TABLE').toUpperCase().replace(/\s+/g, ' ');
  if (kind === 'SCHEMA') return { on: kind, target: unquote(new RegExp(`^(${IDENT})`).exec(rest)[1]) };
  const q = new RegExp(String.raw`^(${QNAME})`, 'i').exec(rest);
  return { on: kind === 'PROCEDURE' || kind === 'ROUTINE' ? 'FUNCTION' : kind, target: q ? normName(q[1]) : null };
}

/** Text of a CREATE FUNCTION statement before its body. */
function functionSignature(s) {
  const m = /\bAS\s+(\$[A-Za-z_]*\$|')/i.exec(s);
  return m ? s.slice(0, m.index) : s;
}

export function functionBody(s) {
  const m = /\bAS\s+(\$[A-Za-z_]*\$)/i.exec(s);
  if (!m) return '';
  const start = m.index + m[0].length;
  const end = s.indexOf(m[1], start);
  return s.slice(start, end < 0 ? s.length : end);
}

/** Replaces comments and string literals with spaces (identifiers and dollar bodies are kept). */
export function maskLiterals(sql, collect = null) {
  const chars = sql.split('');
  let i = 0;
  const n = sql.length;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (chars[k] !== '\n') chars[k] = ' '; };
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') { const j = sql.indexOf('\n', i); const e = j < 0 ? n : j; blank(i, e); i = e; continue; }
    if (c === '/' && sql[i + 1] === '*') { const j = sql.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; blank(i, e); i = e; continue; }
    if (c === "'") {
      const escape = /[Ee]/.test(sql[i - 1] ?? '') && !/[A-Za-z0-9_]/.test(sql[i - 2] ?? '');
      let j = i + 1;
      while (j < n) { if (escape && sql[j] === '\\') { j += 2; continue; } if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } j++; break; } j++; }
      if (collect) collect.push(sql.slice(i + 1, j - 1).replace(/''/g, "'"));
      blank(i, j);
      i = j; continue;
    }
    if (c === '"') { let j = i + 1; while (j < n) { if (sql[j] === '"') { if (sql[j + 1] === '"') { j += 2; continue; } j++; break; } j++; } i = j; continue; }
    i++;
  }
  return chars.join('');
}

/** Schema-qualified names (normalised) mentioned in some SQL, outside literals and comments. */
export function qualifiedRefs(sql) {
  const masked = maskLiterals(sql);
  const refs = new Set();
  for (const m of masked.matchAll(new RegExp(String.raw`(?<![A-Za-z0-9_$."])(${QNAME})(?![A-Za-z0-9_$"])`, 'g'))) refs.add(normName(m[1]));
  return refs;
}

// ---------------------------------------------------------------------------
// Transforms

/** Supabase platform roles that do not exist (or mean something else) on PlanetScale. */
const SUPABASE_ONLY_ROLES = new Set(['postgres']);

/** Drops Supabase platform roles from a GRANT/REVOKE grantee list. Returns null when nothing is left. */
function stripGrantees(s) {
  const m = /^([\s\S]*\b(?:TO|FROM)\s+)([\s\S]*?)(\s+WITH\s+GRANT\s+OPTION|\s+GRANTED\s+BY\s+[\s\S]*|\s+CASCADE|\s+RESTRICT)?\s*;$/i.exec(s);
  if (!m) throw new Error(`Cannot parse grantee list: ${s.slice(0, 200)}`);
  const grantees = splitTopLevel(m[2]).map((g) => g.trim());
  const kept = grantees.filter((g) => !SUPABASE_ONLY_ROLES.has(unquote(g.replace(/^GROUP\s+/i, ''))));
  if (kept.length === grantees.length) return s;
  if (!kept.length) return null;
  return `${m[1]}${kept.join(', ')}${m[3] ?? ''};`;
}

const quoteQ = (q) => q.split('.').map((p) => `"${p.replace(/"/g, '""')}"`).join('.');

const COLUMN_REFERENCES = new RegExp(
  String.raw`\s+(?:CONSTRAINT\s+${IDENT}\s+)?REFERENCES\s+(?:${QNAME}|${IDENT})(?:\s*\([^)]*\))?(?:\s+MATCH\s+(?:FULL|PARTIAL|SIMPLE))?` +
    String.raw`(?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|NO\s+ACTION|SET\s+NULL|SET\s+DEFAULT)(?:\s*\([^)]*\))?)*` +
    String.raw`(?:\s+(?:NOT\s+)?DEFERRABLE)?(?:\s+INITIALLY\s+(?:DEFERRED|IMMEDIATE))?`,
  'i',
);

/** Moves `CONSTRAINT x FOREIGN KEY ...` elements out of a CREATE TABLE into separate ALTER TABLE statements. */
function extractInlineForeignKeys(s, table) {
  const open = s.indexOf('(');
  if (open < 0 || /\bPARTITION\s+OF\b/i.test(s.slice(0, open))) return { create: s, fks: [] };
  const close = matchParen(s, open);
  const elements = splitTopLevel(s.slice(open + 1, close));
  const kept = [];
  const fks = [];
  for (const el of elements) {
    const t = el.trim();
    // Table-level FK (named or not): PostgreSQL picks the same default name in ALTER TABLE.
    if (new RegExp(String.raw`^(?:CONSTRAINT\s+${IDENT}\s+)?FOREIGN\s+KEY\b`, 'i').test(t)) { fks.push({ sql: `ALTER TABLE ${quoteQ(table)}\n  ADD ${t};` }); continue; }
    if (/^(CONSTRAINT|CHECK|PRIMARY\s+KEY|UNIQUE|EXCLUDE)\b/i.test(t)) {
      if (/\bREFERENCES\b/i.test(maskLiterals(t))) throw new Error(`Unexpected REFERENCES in table constraint of ${table}: ${t.slice(0, 160)}`);
      kept.push(el.replace(/^\n/, '').replace(/\s+$/, ''));
      continue;
    }
    let column = el.replace(/^\n/, '').replace(/\s+$/, '');
    const ref = COLUMN_REFERENCES.exec(maskLiterals(column));
    if (ref) {
      // Column-level REFERENCES: PostgreSQL names it <table>_<column>_fkey either way.
      const clause = column.slice(ref.index, ref.index + ref[0].length);
      const colName = new RegExp(`^\\s*(${IDENT})`).exec(column)[1];
      fks.push({ name: null, sql: `ALTER TABLE ${quoteQ(table)}\n  ADD${clause.replace(/^\s*REFERENCES/i, ` FOREIGN KEY (${colName}) REFERENCES`).replace(/^\s*CONSTRAINT\s+(\S+)\s+REFERENCES/i, ` CONSTRAINT $1 FOREIGN KEY (${colName}) REFERENCES`)};` });
      column = column.slice(0, ref.index) + column.slice(ref.index + ref[0].length);
      if (/\bREFERENCES\b/i.test(maskLiterals(column))) throw new Error(`Several REFERENCES on one column in ${table}: ${t.slice(0, 160)}`);
    }
    kept.push(column);
  }
  if (!fks.length) return { create: s, fks };
  return { create: `${s.slice(0, open + 1)}\n${kept.join(',\n')}\n${s.slice(close)}`, fks };
}

const SIGNUP_FUNCTION = 'public.handle_auth_user_created';
const SIGNUP_DISCORD_BLOCK = /\n  -- Optional: direct Discord notify[\s\S]*?\n(?=  return new;\nexception when others then)/;
const SIGNUP_UNUSED_DECLS = ['  v_webhook_url text;\n', '  v_request_id bigint;\n', '  v_created_at text;\n'];

function transformSignupFunction(s) {
  if (!SIGNUP_DISCORD_BLOCK.test(s)) throw new Error(`${SIGNUP_FUNCTION}: Discord/pg_net block not found; update the transform in build-baseline.mjs`);
  let out = s.replace(SIGNUP_DISCORD_BLOCK, '\n  -- PlanetScale port: the optional Discord signup notification (pg_net) moved to the\n  -- Better Auth databaseHooks.user.create.after hook. See database/planetscale/SCHEMA-PORT.md.\n\n');
  for (const d of SIGNUP_UNUSED_DECLS) {
    if (!out.includes(d)) throw new Error(`${SIGNUP_FUNCTION}: expected declaration ${d.trim()} not found`);
    out = out.replace(d, '');
  }
  if (/\bnet\./.test(out)) throw new Error(`${SIGNUP_FUNCTION}: pg_net reference survived the transform`);
  return out;
}

function wrapEventTrigger(s) {
  const name = unquote(/^CREATE\s+EVENT\s+TRIGGER\s+(\S+)/i.exec(s)[1]);
  return `DO $event_trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_event_trigger WHERE evtname = '${name}') THEN
    ${s.replace(/;$/, '').replace(/\n/g, '\n    ')};
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  -- Event triggers need superuser. Without one, new tables in public do not get
  -- RLS switched on automatically, so every migration must enable it explicitly.
  RAISE WARNING 'event trigger ${name} not created: %', SQLERRM;
END
$event_trigger$;`;
}

// ---------------------------------------------------------------------------
// Build

export const PHASES = [
  ['schemas', 'Schemas, schema privileges, cleared default privileges'],
  ['types', 'Types'],
  ['functions_early', 'Functions whose signatures use no tables or views (bodies are checked later: check_function_bodies is off)'],
  ['tables', 'Tables, partitions, columns, checks, RLS switches, table comments and privileges (foreign keys come later)'],
  ['views', 'Views, sorted by their references to each other'],
  ['functions_late', 'Functions whose signatures use table or view row types'],
  ['indexes', 'Indexes (ON ONLY dropped so partitioned-table indexes cascade to the partitions created above)'],
  ['fks', 'Foreign keys'],
  ['triggers', 'Triggers (including the auth.users signup trigger; auth.users comes from 0001_auth.sql)'],
  ['policies', 'RLS policies'],
  ['final', 'Event trigger and default privileges'],
];

export function loadSource() {
  const manifest = JSON.parse(fs.readFileSync(path.join(schemasDir, '.pgdelta-export.json'), 'utf8'));
  const statements = [];
  for (const file of manifest.loadOrder) {
    const sql = fs.readFileSync(path.join(schemasDir, file), 'utf8').replace(/\r\n/g, '\n');
    splitSql(sql).forEach((text, i) => statements.push({ file, i, text, info: classify(text) }));
  }
  return { manifest, statements };
}

export function build() {
  const { manifest, statements } = loadSource();
  const removed = { files: [], grants: 0, revokes: 0, granteesStripped: 0 };

  const tableNames = new Set(statements.filter((s) => s.info.kind === 'table').map((s) => s.info.name));
  const viewNames = new Set(statements.filter((s) => s.info.kind === 'view').map((s) => s.info.name));

  // Functions whose signature references a table/view row type have to wait for it.
  const lateFunctions = new Set();
  for (const s of statements) {
    if (s.info.kind !== 'function') continue;
    if ([...qualifiedRefs(functionSignature(s.text))].some((r) => tableNames.has(r) || viewNames.has(r))) lateFunctions.add(s.info.name);
  }

  const out = Object.fromEntries(PHASES.map(([k]) => [k, []]));
  const push = (phase, s, text = s.text) => out[phase].push({ file: s.file, text });
  const relPhase = (name) => (viewNames.has(name) ? 'views' : 'tables');
  const fnPhase = (name) => (lateFunctions.has(name) ? 'functions_late' : 'functions_early');
  const skippedFiles = new Set();

  for (const s of statements) {
    const { file, info } = s;
    let text = s.text;

    if (file.startsWith('_cluster/extensions/')) { skippedFiles.add(file); continue; }
    if (file === '_cluster/misc.sql') {
      if (info.kind !== 'cron') throw new Error(`Unexpected statement in _cluster/misc.sql: ${text.slice(0, 120)}`);
      skippedFiles.add(file);
      continue;
    }

    switch (info.kind) {
      case 'schema':
        push('schemas', s, text.replace(/^CREATE\s+SCHEMA\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE SCHEMA IF NOT EXISTS '));
        break;
      case 'type':
        push('types', s);
        break;
      case 'function':
        if (info.name === SIGNUP_FUNCTION) text = transformSignupFunction(text);
        push(fnPhase(info.name), s, text);
        break;
      case 'alter_function':
        push(fnPhase(info.target), s);
        break;
      case 'table': {
        const { create, fks } = extractInlineForeignKeys(text, info.name);
        push('tables', s, create);
        for (const fk of fks) push('fks', s, fk.sql);
        break;
      }
      case 'alter_table':
        if (!tableNames.has(info.table)) throw new Error(`ALTER TABLE on unknown table ${info.table} in ${file}`);
        push('tables', s);
        break;
      case 'fk':
        push('fks', s);
        break;
      case 'view':
      case 'alter_view':
        push('views', s);
        break;
      case 'index':
        push('indexes', s, text.replace(/\bON\s+ONLY\s+/i, 'ON '));
        break;
      case 'trigger':
        push('triggers', s);
        break;
      case 'policy':
        push('policies', s);
        break;
      case 'event_trigger':
        push('final', s, wrapEventTrigger(text));
        break;
      case 'default_privileges':
        push(file === 'public/adp_wipes.sql' ? 'schemas' : 'final', s, text.replace(/\bFOR\s+(?:ROLE|USER)\s+"postgres"\s+/i, ''));
        break;
      case 'comment': {
        if (info.target === SIGNUP_FUNCTION && info.on === 'FUNCTION') {
          text = `COMMENT ON FUNCTION "public"."handle_auth_user_created"() IS 'Provision the public user row for a new auth user. The Discord signup notification moved to the Better Auth databaseHooks.user.create.after hook.';`;
        }
        const phase = {
          SCHEMA: 'schemas', TYPE: 'types', FUNCTION: fnPhase(info.target), PROCEDURE: fnPhase(info.target), INDEX: 'indexes',
          POLICY: 'policies', TRIGGER: 'triggers', TABLE: relPhase(info.target), VIEW: 'views', 'MATERIALIZED VIEW': 'views',
          COLUMN: relPhase(info.target), CONSTRAINT: 'fks', SEQUENCE: 'tables',
        }[info.on];
        if (!phase) throw new Error(`Unhandled COMMENT ON ${info.on} in ${file}`);
        push(phase, s, text);
        break;
      }
      case 'acl': {
        const stripped = stripGrantees(text);
        if (stripped === null) { removed[/^GRANT/i.test(text) ? 'grants' : 'revokes']++; continue; }
        if (stripped !== text) { removed.granteesStripped++; removed.strippedExamples = [...(removed.strippedExamples ?? []), `${file}: ${text.slice(0, 160)}`]; }
        const phase = { SCHEMA: 'schemas', TYPE: 'types', FUNCTION: fnPhase(info.target), TABLE: relPhase(info.target), SEQUENCE: 'tables' }[info.on];
        if (!phase) throw new Error(`Unhandled GRANT/REVOKE target ${info.on} in ${file}: ${text.slice(0, 120)}`);
        if (info.on === 'TABLE' && !tableNames.has(info.target) && !viewNames.has(info.target)) throw new Error(`GRANT on unknown relation ${info.target} in ${file}`);
        push(phase, s, stripped);
        break;
      }
      default:
        throw new Error(`Unrecognised statement in ${file}: ${text.slice(0, 200)}`);
    }
  }
  removed.files = [...skippedFiles];

  out.views = sortViews(out.views, viewNames);

  // Guard rails: nothing Supabase-only may survive.
  const masked = maskLiterals(PHASES.map(([k]) => out[k].map((x) => x.text).join('\n')).join('\n'));
  for (const [re, what] of [
    [/\bnet\.http_/i, 'pg_net'],
    [/\bindex_advisor\b/i, 'index_advisor'],
    [/\bcron\./i, 'pg_cron'],
    [/\b(realtime|storage|graphql|graphql_public|vault|pgsodium|supabase_functions|supabase_migrations)\.[a-z_]+\s*\(/i, 'Supabase-managed schema'],
    [/"(supabase_admin|authenticator|supabase_auth_admin|supabase_storage_admin|dashboard_user|pgbouncer|postgres)"/i, 'Supabase platform role'],
  ]) {
    if (re.test(masked)) throw new Error(`Supabase-only reference (${what}) survived: ${re}`);
  }
  // Late functions must not be needed by tables or views.
  for (const phase of ['tables', 'views']) {
    for (const x of out[phase]) for (const r of qualifiedRefs(x.text)) if (lateFunctions.has(r)) throw new Error(`${x.file} uses ${r}, whose signature needs a table; reorder required`);
  }

  return { manifest, statements, out, lateFunctions, removed };
}

function sortViews(items, viewNames) {
  const groups = new Map();
  for (const x of items) {
    const info = classify(x.text);
    const name = info.kind === 'view' ? info.name : info.kind === 'alter_view' ? info.table : info.target;
    if (!groups.has(name)) groups.set(name, { name, items: [] });
    groups.get(name).items.push(x);
  }
  const done = new Set();
  const sorted = [];
  const visit = (g, stack) => {
    if (done.has(g.name)) return;
    if (stack.has(g.name)) throw new Error(`View dependency cycle at ${g.name}`);
    stack.add(g.name);
    const create = g.items.find((x) => classify(x.text).kind === 'view');
    for (const r of create ? qualifiedRefs(create.text) : []) if (r !== g.name && viewNames.has(r) && groups.has(r)) visit(groups.get(r), stack);
    stack.delete(g.name);
    done.add(g.name);
    sorted.push(...g.items);
  };
  for (const g of groups.values()) visit(g, new Set());
  return sorted;
}

export function render({ manifest, out }) {
  const lines = [
    '-- 0002_baseline.sql: Phaseo public/private/catalogue_private schema for PlanetScale Postgres 17.',
    '-- GENERATED by database/planetscale/scripts/build-baseline.mjs from supabase/schemas',
    `-- (${manifest.loadOrder.length} files in .pgdelta-export.json load order). Do not edit by hand: change`,
    '-- supabase/schemas or the generator, then regenerate. Transforms: database/planetscale/SCHEMA-PORT.md.',
    '--',
    '-- Requires 0000_platform.sql (schemas, roles, extensions, auth.uid()) and 0001_auth.sql (auth.users).',
    '-- Apply in one transaction with errors fatal, for example:',
    '--   psql "$DIRECT_URL" --single-transaction -v ON_ERROR_STOP=1 -f 0002_baseline.sql',
    '',
    '-- Function bodies reference objects created later in this file (as in pg_dump output).',
    '-- verify-baseline.mjs re-checks every body with check_function_bodies on.',
    'SET check_function_bodies = false;',
    'SET client_min_messages = warning;',
    '',
  ];
  for (const [key, title] of PHASES) {
    lines.push('-- ' + '='.repeat(76), `-- ${title}`, '-- ' + '='.repeat(76), '');
    let last = null;
    for (const x of out[key]) {
      if (x.file !== last) { lines.push(`-- source: supabase/schemas/${x.file}`); last = x.file; }
      lines.push(x.text, '');
    }
  }
  lines.push('RESET check_function_bodies;', 'RESET client_min_messages;', '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// pg_strict scan: UPDATE / DELETE without a top-level WHERE inside function bodies.

export function pgStrictScan(statements) {
  const hits = [];
  for (const s of statements) {
    if (s.info.kind !== 'function') continue;
    const body = functionBody(s.text);
    const masked = maskLiterals(body).toLowerCase();
    for (const m of masked.matchAll(/\b(update|delete\s+from)\b/g)) {
      const before = masked.slice(Math.max(0, m.index - 30), m.index);
      if (m[1] === 'update' && /\b(do|for|key|of|before|after|or|instead\s+of|on|share)\s*$/.test(before)) continue;
      if (m[1] === 'update' && /^\s*(of|on|or)\b/.test(masked.slice(m.index + 6, m.index + 12))) continue;
      let depth = 0, end = masked.length;
      for (let i = m.index; i < masked.length; i++) {
        const c = masked[i];
        if (c === '(') depth++;
        else if (c === ')') { if (depth === 0) { end = i; break; } depth--; } else if (c === ';' && depth === 0) { end = i; break; }
      }
      const stmt = masked.slice(m.index, end);
      let d = 0, hasWhere = false;
      for (let i = 0; i < stmt.length && !hasWhere; i++) {
        if (stmt[i] === '(') d++;
        else if (stmt[i] === ')') d--;
        else if (d === 0 && stmt.startsWith('where', i) && !/[a-z0-9_]/.test(stmt[i - 1] ?? ' ') && !/[a-z0-9_]/.test(stmt[i + 5] ?? ' ')) hasWhere = true;
      }
      if (!hasWhere) hits.push({ fn: s.info.name, file: s.file, kind: m[1].replace(/\s+/, ' '), snippet: body.slice(m.index, m.index + 100).replace(/\s+/g, ' ') });
    }
    // Dynamic SQL: string literals that start like an UPDATE/DELETE statement.
    const literals = [];
    maskLiterals(body, literals);
    for (const lit of literals) {
      const d = /^\s*(update|delete\s+from)\s+[\s\S]*$/i.exec(lit);
      if (d && /\bset\b|\bfrom\b|%I/i.test(lit) && !/\bwhere\b/i.test(lit)) hits.push({ fn: s.info.name, file: s.file, kind: `dynamic ${d[1].toLowerCase().replace(/\s+/, ' ')}`, snippet: lit.slice(0, 100).replace(/\s+/g, ' ') });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const result = build();
  const sql = render(result);
  if (args.has('--check')) {
    const current = fs.existsSync(baselinePath) ? fs.readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== sql) { console.error('0002_baseline.sql is stale; run node database/planetscale/scripts/build-baseline.mjs'); process.exit(1); }
    console.log('0002_baseline.sql is up to date');
  } else {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, sql);
    console.log(`wrote ${path.relative(repoRoot, baselinePath)} (${(sql.length / 1024).toFixed(0)} KiB)`);
  }
  console.log('statements per phase:', Object.fromEntries(Object.entries(result.out).map(([k, v]) => [k, v.length])));
  console.log(`late functions: ${result.lateFunctions.size}; skipped files: ${result.removed.files.join(', ')}`);
  console.log(`grants/revokes dropped (only to "postgres"): ${result.removed.grants}/${result.removed.revokes}; "postgres" stripped from ${result.removed.granteesStripped} grantee lists`);
  if (args.has('--report')) {
    const hits = pgStrictScan(result.statements);
    console.log(`pg_strict scan: ${hits.length} UPDATE/DELETE without a top-level WHERE`);
    for (const h of hits) console.log(`  ${h.fn} [${h.kind}] ${h.snippet}`);
  }
}
