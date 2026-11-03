#!/usr/bin/env node
// egress-gate.mjs: projects monthly PlanetScale egress from a shadow run and
// passes or fails the cutover gate (CUTOVER.md phase 3). No database access.
//
// Usage:
//   node database/planetscale/scripts/egress-gate.mjs --events shadow.ndjson [--events more.ndjson] \
//        [--insights insights.csv --insights-window-hours 24] [--window-hours 24] [--scale 20] \
//        [--volumes volumes.json] [--threshold-gb 80] [--json]
//
// INPUT 1: QueryEvent NDJSON (--events, repeatable; "-" reads stdin)
//   One JSON object per line: the @phaseo/db QueryEvent passed to `onQuery`,
//     {"app":"web","route":"/models","table":"data_models","kind":"select","rows":120,"bytes":48211,"ms":8.1,"status":200}
//   optionally with "ts" (ISO string or epoch ms) and "requestId"/"request_id".
//   Also accepted: the event nested under "event", "queryEvent" or "query",
//   JSON after a log prefix ("2026-11-03T10:00:00Z info {...}"), a JSON string in
//   "message" (log drains), and `wrangler tail --format json` lines, whose
//   console output sits in logs[].message[] (every event in a line is counted). Lines
//   without a numeric "bytes" are skipped and counted.
//   Recommended logger in the apps: onQuery: (e) => console.log(JSON.stringify({ msg: "db.query", ts: Date.now(), requestId, ...e }))
//
// INPUT 2: Query Insights CSV (--insights, repeatable). ASSUMED FORMAT: PlanetScale
//   documents no CSV export (checked 2026-11-03); its Insights data is reachable
//   in the dashboard and through the PlanetScale MCP server. Build the CSV from
//   either, one row per query pattern over a known window, with a header row.
//   Columns are matched case-insensitively; aliases in brackets:
//     bytes      [bytes_returned, "bytes returned", total_bytes_returned, bytes]  (required; plain
//                number or with a unit: "1.5 MB", "820 kB", "2.1 GiB")
//     count      [count, calls, query_count, "query count", executions]           (optional)
//     tags       [tags, "query tags", sqlcommenter]  "app='web',route='%2Fmodels',table='x'" or JSON
//     app/route/table  [app, route, table, "table name"]   (override tags)
//     query      [query, sql, "normalized sql", fingerprint, pattern]   (fallback label)
//   --insights-window-hours (default 24, the Insights table's default range) is the window it covers.
//
// PROJECTION (decimal GB = 1e9 bytes, as PlanetScale bills)
//   monthly = observed bytes x overhead x scale x (720 h / window hours)
//   window: --window-hours, else the span of event "ts" values (at least 1 h).
//   --scale: shadow traffic was 1/scale of production (e.g. a 5% mirror -> 20).
//   --volumes volumes.json: {"web /models": 120000, "gateway /v1/chat/completions": 9000000}
//     monthly requests per "app route"; for those routes the projection is
//     bytes per request x volume instead (requests = distinct requestId, else
//     events, which overcounts requests and so underestimates per-request bytes;
//     a warning says so).
//   --overhead (default 1.10): QueryEvent bytes are the JSON body handed to the
//     app; wire bytes add protocol framing and TLS. Insights "bytes returned" is
//     already server-side, so overhead is not applied to it.
//
// GATE: PASS when projected monthly egress <= --threshold-gb (default 80, i.e.
// 80% of the 100 GB a PS-20 production branch includes). Cost line uses
// --included-gb (100) and --price-per-gb (0.06, the rate api.planetscale.com/www/egress-rates returned).
// Exit code: 0 PASS, 1 FAIL, 64 usage error, 70 failure.

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { formatBytes, formatNumber, isMain, renderTable, runCli, UsageError } from './lib/common.mjs';

export const HOURS_PER_MONTH = 720;
export const GB = 1e9;

// ---------------------------------------------------------------------------
// Parsing

function findEvent(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj.bytes === 'number' || (typeof obj.bytes === 'string' && obj.bytes !== '' && Number.isFinite(Number(obj.bytes)))) return obj;
  for (const key of ['event', 'queryEvent', 'query_event', 'query', 'data', 'payload']) {
    const inner = obj[key];
    if (inner && typeof inner === 'object') {
      const found = findEvent(inner);
      if (found) return { ...found, ts: found.ts ?? obj.ts ?? obj.timestamp ?? obj.time, requestId: found.requestId ?? found.request_id ?? obj.requestId ?? obj.request_id };
    }
  }
  return null;
}

function toTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value; // seconds or ms
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function pushEvent(events, e, outer) {
  const bytes = Number(e.bytes);
  if (!Number.isFinite(bytes) || bytes < 0) return false;
  events.push({
    source: 'events',
    app: e.app ?? '(none)',
    route: e.route ?? '(none)',
    table: e.table ?? '(none)',
    kind: e.kind ?? '',
    rows: Number(e.rows ?? 0) || 0,
    bytes,
    count: 1,
    status: e.status ?? null,
    error: e.error ?? null,
    ts: toTime(e.ts ?? e.timestamp ?? e.time ?? outer?.ts ?? outer?.timestamp),
    requestId: e.requestId ?? e.request_id ?? outer?.requestId ?? outer?.request_id ?? null,
  });
  return true;
}

/** Parse NDJSON text into normalized events. Returns { events, skipped }. */
export function parseEventsNdjson(text) {
  const events = [];
  let skipped = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const start = line.indexOf('{');
    if (start < 0) {
      skipped++;
      continue;
    }
    let obj;
    try {
      obj = JSON.parse(line.slice(start));
    } catch {
      skipped++;
      continue;
    }
    // `wrangler tail --format json`: one line per invocation, console output in
    // logs[].message[] as strings. Every message that is a query event counts.
    if (Array.isArray(obj?.logs)) {
      let found = 0;
      for (const log of obj.logs) {
        for (const message of Array.isArray(log?.message) ? log.message : [log?.message]) {
          let inner = message;
          if (typeof inner === 'string') {
            const at = inner.indexOf('{');
            if (at < 0) continue;
            try {
              inner = JSON.parse(inner.slice(at));
            } catch {
              continue;
            }
          }
          const e = findEvent(inner);
          if (e && pushEvent(events, e, { ts: log?.timestamp ?? obj.eventTimestamp })) found++;
        }
      }
      if (!found) skipped++;
      continue;
    }
    // Some log pipelines put the JSON string in "message".
    if (typeof obj?.message === 'string' && obj.message.trim().startsWith('{') && !findEvent(obj)) {
      try {
        obj = { ...obj, event: JSON.parse(obj.message) };
      } catch {
        /* keep obj */
      }
    }
    const e = findEvent(obj);
    if (!e || !pushEvent(events, e, obj)) skipped++;
  }
  return { events, skipped };
}

/** RFC 4180 CSV -> array of string arrays. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const UNIT = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };

/** "1.5 MB" / "820kB" / "2,048" / "3 GiB" -> bytes. Returns null when unparseable. */
export function parseByteValue(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().replace(/,/g, '');
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(s);
  if (!m) return null;
  const unit = (m[2] || 'b').toLowerCase().replace(/^bytes?$/, 'b');
  const mult = UNIT[unit];
  if (mult === undefined) return null;
  return Number(m[1]) * mult;
}

/** "app='web',route='%2Fmodels'" or '{"app":"web"}' -> object. */
export function parseTags(value) {
  if (!value) return {};
  const s = String(value).trim().replace(/^\/\*|\*\/$/g, '');
  if (s.startsWith('{')) {
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  }
  const out = {};
  for (const m of s.matchAll(/([\w.%-]+)\s*=\s*'([^']*)'/g)) {
    const dec = (x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x;
      }
    };
    out[dec(m[1])] = dec(m[2]);
  }
  return out;
}

const ALIASES = {
  bytes: ['bytes_returned', 'bytes returned', 'total_bytes_returned', 'total bytes returned', 'bytes'],
  count: ['count', 'calls', 'query_count', 'query count', 'executions'],
  tags: ['tags', 'query tags', 'query_tags', 'sqlcommenter'],
  app: ['app'],
  route: ['route'],
  table: ['table', 'table name', 'table_name', 'tables'],
  query: ['query', 'sql', 'normalized sql', 'normalized_sql', 'fingerprint', 'pattern'],
  rows: ['rows_returned', 'rows returned', 'rows'],
};

/** Parse a Query Insights CSV (assumed format above) into aggregated "events". */
export function parseInsightsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { events: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const idx = header.findIndex((h) => names.includes(h));
    if (idx >= 0) col[key] = idx;
  }
  if (col.bytes === undefined) throw new UsageError(`insights CSV has no bytes column; expected one of: ${ALIASES.bytes.join(', ')}`);
  const events = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const bytes = parseByteValue(r[col.bytes]);
    if (bytes === null) {
      skipped++;
      continue;
    }
    const tags = col.tags !== undefined ? parseTags(r[col.tags]) : {};
    const pick = (k) => (col[k] !== undefined && r[col[k]] ? r[col[k]].trim() : null);
    const query = pick('query');
    events.push({
      source: 'insights',
      app: pick('app') ?? tags.app ?? '(untagged)',
      route: pick('route') ?? tags.route ?? (query ? `query: ${query.slice(0, 60)}` : '(untagged)'),
      table: pick('table') ?? tags.table ?? '(unknown)',
      kind: '',
      rows: Number(pick('rows') ?? 0) || 0,
      bytes,
      count: Number(String(pick('count') ?? '1').replace(/,/g, '')) || 1,
      status: null,
      error: null,
      ts: null,
      requestId: null,
    });
  }
  return { events, skipped };
}

// ---------------------------------------------------------------------------
// Aggregation and projection

function group(events, keyFn) {
  const map = new Map();
  for (const e of events) {
    const key = keyFn(e);
    let g = map.get(key);
    if (!g) {
      g = { key, app: e.app, route: e.route, table: e.table, events: 0, rows: 0, bytes: 0, wireBytes: 0, monthlyBytes: 0, maxBytes: 0, requestIds: new Set(), errors: 0, sources: new Set() };
      map.set(key, g);
    }
    g.events += e.count;
    g.rows += e.rows;
    g.bytes += e.bytes;
    g.wireBytes += e.wireBytes ?? e.bytes;
    g.monthlyBytes += (e.wireBytes ?? e.bytes) * (e.monthlyFactor ?? 1);
    // For Insights rows, bytes are already a sum: the per-call max is unknown, use the mean.
    g.maxBytes = Math.max(g.maxBytes, e.count > 1 ? e.bytes / e.count : e.bytes);
    if (e.requestId) g.requestIds.add(e.requestId);
    if (e.error) g.errors++;
    g.sources.add(e.source);
  }
  return [...map.values()];
}

/**
 * Compute the full report. `eventSets` is [{ events, windowHours|null, overhead }].
 * Each set is projected over its own window, then summed.
 */
export function analyze(eventSets, options = {}) {
  const thresholdGb = options.thresholdGb ?? 80;
  const includedGb = options.includedGb ?? 100;
  const pricePerGb = options.pricePerGb ?? 0.06;
  const scale = options.scale ?? 1;
  const volumes = options.volumes ?? null;
  const largeEventBytes = options.largeEventBytes ?? 1_000_000;
  const warnings = [];

  const weighted = [];
  const windows = [];
  for (const set of eventSets) {
    if (!set.events.length) continue;
    let windowHours = set.windowHours ?? null;
    if (!windowHours) {
      const ts = set.events.map((e) => e.ts).filter((t) => t !== null);
      if (ts.length >= 2) windowHours = Math.max(1, (Math.max(...ts) - Math.min(...ts)) / 3_600_000);
    }
    if (!windowHours) {
      windowHours = 24;
      warnings.push(`${set.label}: no --window-hours and no timestamps; assuming a 24 h window`);
    }
    windows.push({ label: set.label, hours: windowHours, events: set.events.length });
    const factor = (HOURS_PER_MONTH / windowHours) * scale;
    for (const e of set.events) {
      weighted.push({ ...e, wireBytes: e.bytes * set.overhead, monthlyFactor: factor });
    }
  }
  if (!weighted.length) throw new UsageError('no usable events in the inputs');

  // Per route (app + route).
  const routeKey = (e) => `${e.app} ${e.route}`;
  const byRoute = group(weighted, routeKey).map((g) => {
    const { wireBytes, monthlyBytes } = g;
    let projected = monthlyBytes;
    let basis = 'window';
    if (volumes && Object.prototype.hasOwnProperty.call(volumes, g.key)) {
      const requests = g.requestIds.size || g.events;
      if (!g.requestIds.size) warnings.push(`${g.key}: no requestId on events; treating each query as one request (per-request bytes are underestimated if a request makes several queries)`);
      projected = (wireBytes / requests) * Number(volumes[g.key]);
      basis = `volume ${formatNumber(volumes[g.key])}/mo`;
    }
    return {
      app: g.app,
      route: g.route,
      events: g.events,
      requests: g.requestIds.size || null,
      rows: g.rows,
      bytes: g.bytes,
      wireBytes,
      bytesPerEvent: g.events ? wireBytes / g.events : 0,
      maxEventBytes: g.maxBytes,
      projectedMonthlyBytes: projected,
      basis,
      errors: g.errors,
    };
  });
  if (volumes) {
    for (const key of Object.keys(volumes)) if (!byRoute.some((r) => `${r.app} ${r.route}` === key)) warnings.push(`--volumes has "${key}" but no events matched it (key format: "<app> <route>")`);
  }
  const totalMonthly = byRoute.reduce((a, r) => a + r.projectedMonthlyBytes, 0);
  for (const r of byRoute) r.share = totalMonthly ? r.projectedMonthlyBytes / totalMonthly : 0;
  byRoute.sort((a, b) => b.projectedMonthlyBytes - a.projectedMonthlyBytes);

  // Per table (window-based; volumes apply to routes only).
  const tableKey = (e) => e.table;
  const byTable = group(weighted, tableKey)
    .map((g) => {
      const { wireBytes, monthlyBytes } = g;
      return { table: g.key, events: g.events, rows: g.rows, wireBytes, maxEventBytes: g.maxBytes, projectedMonthlyBytes: monthlyBytes };
    })
    .sort((a, b) => b.projectedMonthlyBytes - a.projectedMonthlyBytes);

  // Single large results (the August catalogue query returned ~3.55 MB per call).
  const large = weighted
    .filter((e) => (e.count > 1 ? e.bytes / e.count : e.bytes) >= largeEventBytes)
    .map((e) => ({ app: e.app, route: e.route, table: e.table, kind: e.kind, bytes: e.count > 1 ? e.bytes / e.count : e.bytes, rows: e.rows }))
    .sort((a, b) => b.bytes - a.bytes);
  const largeByKey = group(
    large.map((l) => ({ ...l, count: 1, requestId: null, error: null, source: 'events' })),
    (l) => `${l.app} ${l.route} ${l.table}`,
  ).map((g) => ({ app: g.app, route: g.route, table: g.table, occurrences: g.events, maxBytes: g.maxBytes }));

  const projectedGb = totalMonthly / GB;
  const overageGb = Math.max(0, projectedGb - includedGb);
  return {
    windows,
    scale,
    thresholdGb,
    includedGb,
    pricePerGb,
    totals: {
      events: weighted.reduce((a, e) => a + e.count, 0),
      observedBytes: weighted.reduce((a, e) => a + e.bytes, 0),
      observedWireBytes: weighted.reduce((a, e) => a + e.wireBytes, 0),
      projectedMonthlyBytes: totalMonthly,
      projectedMonthlyGb: projectedGb,
      overageGb,
      overageCostUsd: overageGb * pricePerGb,
    },
    byRoute,
    byTable,
    large: largeByKey.sort((a, b) => b.maxBytes - a.maxBytes),
    pass: projectedGb <= thresholdGb,
    warnings,
  };
}

export function renderGate(report, { top = 20 } = {}) {
  const out = [];
  const p = (s = '') => out.push(s);
  const t = report.totals;
  p('# Egress gate');
  for (const w of report.windows) p(`input ${w.label}: ${formatNumber(w.events)} rows over ${w.hours.toFixed(1)} h`);
  p(`scale x${report.scale}; projection to ${HOURS_PER_MONTH} h/month; decimal GB`);
  p();
  p(`observed: ${formatNumber(t.events)} queries, ${formatBytes(t.observedBytes)} payload, ${formatBytes(t.observedWireBytes)} with overhead`);
  p(`projected monthly egress: ${t.projectedMonthlyGb.toFixed(2)} GB (threshold ${report.thresholdGb} GB, included ${report.includedGb} GB)`);
  p(`projected overage: ${t.overageGb.toFixed(2)} GB = $${t.overageCostUsd.toFixed(2)}/month at $${report.pricePerGb}/GB`);
  p();
  p(`## By route (top ${top})`);
  p(renderTable(report.byRoute.slice(0, top).map((r) => ({ route: `${r.app} ${r.route}`, q: formatNumber(r.events), req: r.requests ? formatNumber(r.requests) : '', per: formatBytes(r.bytesPerEvent), max: formatBytes(r.maxEventBytes), month: `${(r.projectedMonthlyBytes / GB).toFixed(2)} GB`, share: `${(r.share * 100).toFixed(1)}%`, basis: r.basis })), [
    { key: 'route', label: 'app route' },
    { key: 'q', label: 'queries', align: 'right' },
    { key: 'req', label: 'requests', align: 'right' },
    { key: 'per', label: 'bytes/query', align: 'right' },
    { key: 'max', label: 'max query', align: 'right' },
    { key: 'month', label: 'per month', align: 'right' },
    { key: 'share', label: 'share', align: 'right' },
    { key: 'basis', label: 'basis' },
  ]));
  p(`## By table (top ${top})`);
  p(renderTable(report.byTable.slice(0, top).map((r) => ({ table: r.table, q: formatNumber(r.events), rows: formatNumber(r.rows), max: formatBytes(r.maxEventBytes), month: `${(r.projectedMonthlyBytes / GB).toFixed(2)} GB` })), [
    { key: 'table', label: 'table' },
    { key: 'q', label: 'queries', align: 'right' },
    { key: 'rows', label: 'rows', align: 'right' },
    { key: 'max', label: 'max query', align: 'right' },
    { key: 'month', label: 'per month', align: 'right' },
  ]));
  if (report.large.length) {
    p('## Large single results (fix these first: paginate, select fewer columns, or serve from a cache)');
    p(renderTable(report.large.slice(0, top).map((l) => ({ where: `${l.app} ${l.route}`, table: l.table, n: formatNumber(l.occurrences), max: formatBytes(l.maxBytes) })), [
      { key: 'where', label: 'app route' },
      { key: 'table', label: 'table' },
      { key: 'n', label: 'times', align: 'right' },
      { key: 'max', label: 'max bytes', align: 'right' },
    ]));
  }
  for (const w of report.warnings) p(`warning: ${w}`);
  p();
  p(report.pass ? `GATE: PASS (${t.projectedMonthlyGb.toFixed(2)} GB <= ${report.thresholdGb} GB)` : `GATE: FAIL (${t.projectedMonthlyGb.toFixed(2)} GB > ${report.thresholdGb} GB)`);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = `usage: node egress-gate.mjs --events <file.ndjson|-> [--events ...] [--insights <file.csv> --insights-window-hours 24]
                       [--window-hours h] [--scale n] [--volumes volumes.json] [--overhead 1.10]
                       [--threshold-gb 80] [--included-gb 100] [--price-per-gb 0.06] [--large-event-bytes 1000000] [--top 20] [--json]`;

function readInput(file) {
  return file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
}

export async function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        events: { type: 'string', multiple: true },
        insights: { type: 'string', multiple: true },
        'window-hours': { type: 'string' },
        'insights-window-hours': { type: 'string' },
        scale: { type: 'string' },
        volumes: { type: 'string' },
        overhead: { type: 'string' },
        'threshold-gb': { type: 'string' },
        'included-gb': { type: 'string' },
        'price-per-gb': { type: 'string' },
        'large-event-bytes': { type: 'string' },
        top: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    throw new UsageError(error.message);
  }
  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!values.events?.length && !values.insights?.length) throw new UsageError('pass at least one --events or --insights file');
  const num = (name, fallback, { positive = false } = {}) => {
    if (values[name] === undefined) return fallback;
    const v = Number(values[name]);
    if (!Number.isFinite(v) || v < 0 || (positive && v === 0)) throw new UsageError(`--${name} must be a ${positive ? 'positive' : 'non-negative'} number`);
    return v;
  };
  const overhead = num('overhead', 1.1, { positive: true });
  const sets = [];
  let skippedTotal = 0;
  for (const file of values.events ?? []) {
    const { events, skipped } = parseEventsNdjson(readInput(file));
    skippedTotal += skipped;
    sets.push({ label: file, events, windowHours: num('window-hours', null, { positive: true }), overhead });
  }
  for (const file of values.insights ?? []) {
    const { events, skipped } = parseInsightsCsv(readInput(file));
    skippedTotal += skipped;
    sets.push({ label: file, events, windowHours: num('insights-window-hours', 24, { positive: true }), overhead: 1 });
  }
  let volumes = null;
  if (values.volumes) {
    try {
      volumes = JSON.parse(fs.readFileSync(values.volumes, 'utf8'));
    } catch (error) {
      throw new UsageError(`--volumes: ${error.message}`);
    }
  }
  const report = analyze(sets, {
    scale: num('scale', 1, { positive: true }),
    volumes,
    thresholdGb: num('threshold-gb', 80),
    includedGb: num('included-gb', 100),
    pricePerGb: num('price-per-gb', 0.06),
    largeEventBytes: num('large-event-bytes', 1_000_000),
  });
  if (skippedTotal) report.warnings.push(`${skippedTotal} input line(s) were not query events and were skipped`);
  process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : renderGate(report, { top: num('top', 20) }));
  return report.pass ? 0 : 1;
}

if (isMain(import.meta.url)) runCli(main, USAGE);
