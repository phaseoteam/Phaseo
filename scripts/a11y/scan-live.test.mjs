import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DEFAULT_CONFIG, classify, matchException, renderSummary } from './scan-live.mjs';

const node = (target, html = '<button>') => ({ target, html, summary: 'Fix any of the following: something' });
const page = (path, violations) => ({ path, themes: { light: { violations }, dark: { violations: [] } } });

test('serious and critical fail, moderate and minor are only reported', () => {
  const pages = [
    page('/', [
      { id: 'color-contrast', impact: 'serious', help: 'h', helpUrl: 'u', nodes: [node('.a')] },
      { id: 'aria-allowed-role', impact: 'critical', help: 'h', helpUrl: 'u', nodes: [node('.b')] },
      { id: 'region', impact: 'moderate', help: 'h', helpUrl: 'u', nodes: [node('.c')] },
      { id: 'meta-viewport', impact: null, help: 'h', helpUrl: 'u', nodes: [node('.d')] },
    ]),
  ];
  const out = classify(pages);
  assert.deepEqual(out.failing.map((r) => r.rule), ['aria-allowed-role', 'color-contrast']);
  assert.deepEqual(out.reported.map((r) => r.impact), ['moderate', 'minor']);
});

test('exceptions match rule plus selector or HTML, narrowed by path and theme', () => {
  const exceptions = [
    { rule: 'color-contrast', path: '/models', target: '#loading', reason: 'r1' },
    { rule: 'label-content-name-mismatch', html: 'class="card', reason: 'r2' },
    { rule: 'color-contrast', target: '.x', theme: 'dark', reason: 'r3' },
  ];
  const base = { theme: 'light', target: '#loading > span', html: '<span>' };
  assert.equal(matchException(exceptions, { ...base, rule: 'color-contrast', path: '/models' })?.reason, 'r1');
  assert.equal(matchException(exceptions, { ...base, rule: 'color-contrast', path: '/' }), undefined);
  assert.equal(matchException(exceptions, { ...base, rule: 'label-content-name-mismatch', path: '/docs', html: '<div class="card block">' })?.reason, 'r2');
  assert.equal(matchException(exceptions, { ...base, rule: 'color-contrast', path: '/', target: '.x' }), undefined);
  assert.equal(matchException(exceptions, { ...base, rule: 'color-contrast', path: '/', target: '.x', theme: 'dark' })?.reason, 'r3');
  // An entry with neither target nor html would match everything for the rule, so it never matches.
  assert.equal(matchException([{ rule: 'color-contrast', reason: 'too broad' }], { ...base, rule: 'color-contrast', path: '/' }), undefined);
});

test('pathPrefix keeps an exception to one section of the site', () => {
  const exceptions = [{ rule: 'label-content-name-mismatch', pathPrefix: '/docs/', html: 'class="card', reason: 'Mintlify' }];
  const row = { rule: 'label-content-name-mismatch', theme: 'light', target: '.card', html: '<div class="card block">' };
  assert.equal(matchException(exceptions, { ...row, path: '/docs/v1/quickstart' })?.reason, 'Mintlify');
  assert.equal(matchException(exceptions, { ...row, path: '/models' }), undefined);
});

test('a page that errored in one theme still reports the theme that finished', () => {
  const pages = [
    {
      path: '/models',
      error: 'Timeout',
      themes: { light: { violations: [{ id: 'color-contrast', impact: 'serious', help: 'h', helpUrl: 'u', nodes: [node('.a')] }] } },
    },
  ];
  const out = classify(pages);
  assert.equal(out.failing.length, 1);
  const md = renderSummary({ baseUrl: 'https://phaseo.app', finishedAt: 'now', axeVersion: '4.14.0', tags: ['wcag2aa'], themes: ['light', 'dark'], pages }, out);
  assert.match(md, /\| `\/models` \| 1 \| error \|/);
});

test('exempt nodes do not fail and unused exceptions are listed', () => {
  const exceptions = [
    { rule: 'color-contrast', target: '#loading', reason: 'disabled while loading' },
    { rule: 'link-name', target: '.gone', reason: 'stale' },
  ];
  const pages = [page('/models', [{ id: 'color-contrast', impact: 'serious', help: 'h', helpUrl: 'u', nodes: [node('#loading')] }])];
  const out = classify(pages, { exceptions });
  assert.equal(out.failing.length, 0);
  assert.equal(out.exempt[0].reason, 'disabled while loading');
  assert.deepEqual(out.unusedExceptions.map((e) => e.target), ['.gone']);
});

test('summary names page, theme, rule and element, and escapes table pipes', () => {
  const pages = [page('/a|b', [{ id: 'color-contrast', impact: 'serious', help: 'h', helpUrl: 'https://x', nodes: [node('#n', '<p>a|b</p>')] }])];
  const report = { baseUrl: 'https://phaseo.app', finishedAt: 'now', axeVersion: '4.14.0', tags: ['wcag2aa'], themes: ['light', 'dark'], pages };
  const md = renderSummary(report, classify(pages));
  assert.match(md, /1 serious or critical problem found/);
  assert.match(md, /\| `\/a\\\|b` \| light \| \[color-contrast\]\(https:\/\/x\) \| serious \| `#n` `<p>a\\\|b<\/p>` \|/);
  // A backslash before a pipe must not cancel the pipe's escape and split the cell.
  const slashed = [page('/', [{ id: 'color-contrast', impact: 'serious', help: 'h', helpUrl: 'https://x', nodes: [node('#n', '<p>a\\|b</p>')] }])];
  assert.match(renderSummary({ ...report, pages: slashed }, classify(slashed)), /`<p>a\\\\\\\|b<\/p>`/);
  const errored = renderSummary({ ...report, pages: [{ path: '/x', themes: {}, error: 'HTTP 500' }] }, classify([]));
  assert.match(errored, /Some pages could not be scanned/);
});

test('committed config is well formed', async () => {
  const config = JSON.parse(await readFile(DEFAULT_CONFIG, 'utf8'));
  assert.match(config.baseUrl, /^https:\/\//);
  assert.ok(config.pages.length > 0);
  const paths = config.pages.map((p) => p.path);
  assert.equal(new Set(paths).size, paths.length, 'duplicate page');
  for (const p of paths) assert.ok(p.startsWith('/'), p);
  for (const e of config.exceptions) {
    assert.ok(e.rule && e.reason && (e.target || e.html), JSON.stringify(e));
  }
  // Pages that render a dialog client-side must wait for it, or a missing dialog scans as clean.
  for (const p of config.pages.filter((p) => p.path.includes('auth='))) assert.ok(p.waitFor, p.path);
});
