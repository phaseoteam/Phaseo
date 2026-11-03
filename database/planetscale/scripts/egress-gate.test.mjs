// egress-gate: parsing, projection and gate decisions. No database needed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { analyze, parseByteValue, parseCsv, parseEventsNdjson, parseInsightsCsv, parseTags } from './egress-gate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'egress-gate.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-gate-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const ev = (o) => JSON.stringify({ app: 'web', route: '/models', table: 'data_models', kind: 'select', rows: 10, bytes: 1000, ms: 3, status: 200, ...o });

describe('parseEventsNdjson', () => {
  it('accepts bare, nested, prefixed and message-wrapped events and skips junk', () => {
    const text = [
      ev({ ts: '2026-11-03T00:00:00Z' }),
      JSON.stringify({ msg: 'db.query', event: JSON.parse(ev({ bytes: 2000 })), ts: 1762128000000, requestId: 'r1' }),
      `2026-11-03T00:00:01Z info ${ev({ bytes: '3000' })}`,
      JSON.stringify({ level: 'info', message: ev({ bytes: 4000 }) }),
      'not json at all',
      '{"broken": ',
      JSON.stringify({ msg: 'unrelated', bytes: 'n/a' }),
      '',
    ].join('\n');
    const { events, skipped } = parseEventsNdjson(text);
    expect(events.map((e) => e.bytes)).toEqual([1000, 2000, 3000, 4000]);
    expect(events[1].requestId).toBe('r1');
    expect(events[1].ts).toBe(1762128000000);
    expect(events[0].ts).toBe(Date.parse('2026-11-03T00:00:00Z'));
    expect(skipped).toBe(3);
  });

  it('reads every query event from a `wrangler tail --format json` line', () => {
    const tail = JSON.stringify({
      outcome: 'ok',
      eventTimestamp: 1762128000000,
      logs: [
        { level: 'log', timestamp: 1762128000100, message: [JSON.stringify({ msg: 'db.query', ...JSON.parse(ev({ bytes: 700, route: '/api/_web/models' })) })] },
        { level: 'log', timestamp: 1762128000200, message: ['plain text log line'] },
        { level: 'log', timestamp: 1762128000300, message: [JSON.parse(ev({ bytes: 300 }))] },
      ],
    });
    const quiet = JSON.stringify({ outcome: 'ok', logs: [{ message: ['nothing here'] }] });
    const { events, skipped } = parseEventsNdjson(`${tail}\n${quiet}\n`);
    expect(events.map((e) => [e.route, e.bytes, e.ts])).toEqual([
      ['/api/_web/models', 700, 1762128000100],
      ['/models', 300, 1762128000300],
    ]);
    expect(skipped).toBe(1);
  });
});

describe('CSV and value parsing', () => {
  it('parses quoted CSV fields with commas, quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
  });

  it('parses byte values with units', () => {
    expect(parseByteValue('2,048')).toBe(2048);
    expect(parseByteValue('1.5 MB')).toBe(1_500_000);
    expect(parseByteValue('820kB')).toBe(820_000);
    expect(parseByteValue('2 GiB')).toBe(2 * 1024 ** 3);
    expect(parseByteValue('12 bytes')).toBe(12);
    expect(parseByteValue('lots')).toBeNull();
  });

  it('parses sqlcommenter and JSON tags', () => {
    expect(parseTags(`/*app='web',route='%2Fmodels',table='data_models'*/`)).toEqual({ app: 'web', route: '/models', table: 'data_models' });
    expect(parseTags('{"app":"gateway"}')).toEqual({ app: 'gateway' });
  });

  it('reads an Insights CSV with aliases and tags', () => {
    const csv = ['Query,Count,Bytes returned,Tags', `"select * from data_models where ...",120,"3.6 MB","app='web',route='%2Fmonitor',table='data_models'"`, 'select 1,5,40 B,', 'garbage,1,n/a,'].join('\n');
    const { events, skipped } = parseInsightsCsv(csv);
    expect(skipped).toBe(1);
    expect(events[0]).toMatchObject({ app: 'web', route: '/monitor', table: 'data_models', count: 120, bytes: 3_600_000 });
    expect(events[1]).toMatchObject({ app: '(untagged)', route: 'query: select 1', count: 5, bytes: 40 });
  });

  it('rejects an Insights CSV without a bytes column', () => {
    expect(() => parseInsightsCsv('query,count\nselect 1,2\n')).toThrow(/no bytes column/);
  });
});

describe('analyze', () => {
  const events = (n, bytes, extra = {}) => Array.from({ length: n }, (_, i) => ({ source: 'events', app: 'web', route: '/models', table: 't', kind: 'select', rows: 1, bytes, count: 1, ts: null, requestId: null, error: null, ...extra, ...(extra.perIndex ? extra.perIndex(i) : {}) }));

  it('projects a 24 h window to 720 h with overhead and scale', () => {
    const r = analyze([{ label: 'x', events: events(1000, 1_000_000), windowHours: 24, overhead: 1.1 }], { scale: 2 });
    // 1 GB observed x 1.1 x 2 x 30 = 66 GB
    expect(r.totals.projectedMonthlyGb).toBeCloseTo(66, 6);
    expect(r.pass).toBe(true);
    expect(r.totals.overageGb).toBe(0);
  });

  it('fails above the threshold and prices the overage beyond the included 100 GB', () => {
    const r = analyze([{ label: 'x', events: events(1000, 5_000_000), windowHours: 24, overhead: 1 }], {});
    expect(r.totals.projectedMonthlyGb).toBeCloseTo(150, 6);
    expect(r.pass).toBe(false);
    expect(r.totals.overageGb).toBeCloseTo(50, 6);
    expect(r.totals.overageCostUsd).toBeCloseTo(3, 6);
  });

  it('derives the window from timestamps when none is given', () => {
    const start = Date.parse('2026-11-03T00:00:00Z');
    const evs = events(13, 1_000_000, { perIndex: (i) => ({ ts: start + i * 3_600_000 }) });
    const r = analyze([{ label: 'x', events: evs, windowHours: null, overhead: 1 }], {});
    expect(r.windows[0].hours).toBe(12);
    expect(r.totals.projectedMonthlyBytes).toBeCloseTo(13_000_000 * 60, 0);
  });

  it('uses per-request bytes x monthly volume for routes in --volumes', () => {
    const evs = [
      ...events(4, 500, { perIndex: (i) => ({ requestId: `r${i % 2}` }) }), // 2 requests, 1000 bytes each
      ...events(10, 100, { route: '/other' }),
    ];
    const r = analyze([{ label: 'x', events: evs, windowHours: 1, overhead: 1 }], { volumes: { 'web /models': 1_000_000 } });
    const models = r.byRoute.find((x) => x.route === '/models');
    expect(models.requests).toBe(2);
    expect(models.projectedMonthlyBytes).toBe(1000 * 1_000_000);
    expect(models.basis).toMatch(/volume/);
    const other = r.byRoute.find((x) => x.route === '/other');
    expect(other.projectedMonthlyBytes).toBe(1000 * 720);
  });

  it('flags single large results such as the 3.55 MB catalogue query', () => {
    const evs = [...events(3, 3_550_000, { route: '/monitor', table: 'monitor_catalogue' }), ...events(10, 1000)];
    const r = analyze([{ label: 'x', events: evs, windowHours: 24, overhead: 1 }], {});
    expect(r.large).toHaveLength(1);
    expect(r.large[0]).toMatchObject({ route: '/monitor', table: 'monitor_catalogue', occurrences: 3, maxBytes: 3_550_000 });
    expect(r.byRoute[0].route).toBe('/monitor');
    expect(r.byTable[0].table).toBe('monitor_catalogue');
  });

  it('warns when a --volumes key matches nothing', () => {
    const r = analyze([{ label: 'x', events: events(1, 1), windowHours: 1, overhead: 1 }], { volumes: { 'gateway /nope': 5 } });
    expect(r.warnings.join('\n')).toMatch(/gateway \/nope/);
  });
});

describe('CLI', () => {
  const write = (name, text) => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, text);
    return file;
  };

  it('PASS exits 0 and FAIL exits 1', () => {
    const small = write('small.ndjson', Array.from({ length: 100 }, () => ev({ bytes: 10_000 })).join('\n'));
    const pass = spawnSync(process.execPath, [script, '--events', small, '--window-hours', '24'], { encoding: 'utf8' });
    expect(pass.status).toBe(0);
    expect(pass.stdout).toMatch(/GATE: PASS/);

    const big = write('big.ndjson', Array.from({ length: 100 }, () => ev({ bytes: 50_000_000 })).join('\n'));
    const fail = spawnSync(process.execPath, [script, '--events', big, '--window-hours', '24', '--json'], { encoding: 'utf8' });
    expect(fail.status).toBe(1);
    const report = JSON.parse(fail.stdout);
    expect(report.pass).toBe(false);
    expect(report.large[0].maxBytes).toBe(50_000_000);
  });

  it('combines events with an Insights CSV and reads stdin', () => {
    const csv = write('insights.csv', 'tags,bytes_returned,count\n"app=\'gateway\',route=\'%2Fv1%2Fchat\'",1 GB,1000\n');
    const r = spawnSync(process.execPath, [script, '--events', '-', '--window-hours', '24', '--insights', csv, '--insights-window-hours', '24', '--json'], {
      encoding: 'utf8',
      input: ev({ bytes: 1_000_000 }),
    });
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout);
    // events: 1 MB x 1.1 x 30 = 33 MB; insights: 1 GB x 30 = 30 GB (no overhead)
    expect(report.totals.projectedMonthlyGb).toBeCloseTo(30.033, 3);
    expect(report.byRoute[0]).toMatchObject({ app: 'gateway', route: '/v1/chat' });
  });

  it('usage errors exit 64', () => {
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).toBe(64);
    expect(spawnSync(process.execPath, [script, '--events', write('e.ndjson', ev({})), '--scale', '0'], { encoding: 'utf8' }).status).toBe(64);
  });
});
