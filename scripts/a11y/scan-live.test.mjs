import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DEFAULT_CONFIG, classify, matchException, renderSummary, scanWithRetry } from './scan-live.mjs';

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
  assert.ok(md.includes('| <code>&#47;models</code> | 1 | error |'), md);
});

test('the retry keeps the light scan from the first attempt when the second fails earlier', async () => {
  let calls = 0;
  const lightFindings = { violations: [{ id: 'color-contrast', impact: 'serious', help: 'h', helpUrl: 'u', nodes: [node('.a')] }] };
  const rec = await scanWithRetry({ path: '/models', name: 'Models' }, async (r) => {
    calls += 1;
    // Only the first attempt gets as far as finishing light; the second fails before any theme.
    if (calls === 1) {
      r.themes.light = lightFindings;
      throw new Error('dark: Timeout 45000ms exceeded\nstack');
    }
    throw new Error('HTTP 502');
  });
  assert.equal(calls, 2);
  assert.equal(rec.themes.light, lightFindings);
  assert.equal(rec.themes.dark, undefined);
  assert.equal(rec.error, 'HTTP 502');
  assert.equal(classify([rec]).failing.length, 1);
});

test('the retry clears the error when the second attempt succeeds', async () => {
  let calls = 0;
  const rec = await scanWithRetry({ path: '/', name: 'Home' }, async (r) => {
    calls += 1;
    if (calls === 1) throw new Error('HTTP 502');
    r.themes.light = { violations: [] };
    r.themes.dark = { violations: [] };
  });
  assert.equal(rec.error, undefined);
  assert.deepEqual(Object.keys(rec.themes), ['light', 'dark']);
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
  const codesIn = (text) => [...text.matchAll(/<code>(.*?)<\/code>/g)].map((m) => m[1]);
  const decode = (t) => t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  assert.match(md, /\| <code>[^|]*<\/code> \| light \| \[color-contrast\]\(https:\/\/x\) \| serious \| <code>[^|]*<\/code> <code>[^|]*<\/code> \|/);
  assert.deepEqual(codesIn(md).slice(0, 3).map(decode), ['/a|b', '#n', '<p>a|b</p>']);
  // Selectors keep their CSS escapes exactly: GitHub decodes the entities inside <code> and shows the
  // original text. No raw punctuation is left, so nothing inside can be read as Markdown (emphasis,
  // links), HTML, or a table delimiter.
  const tricky = ['.md\\:hidden', '<p>a\\|b</p>', 'div[data-x="*a*"] > a', '<em>_b_ `c` [d](e)</em>'];
  const escaped = [page('/', [{ id: 'color-contrast', impact: 'serious', help: 'h', helpUrl: 'https://x', nodes: [node(tricky[0], tricky[1]), node(tricky[2], tricky[3])] }])];
  const escapedMd = renderSummary({ ...report, pages: escaped }, classify(escaped));
  const codes = codesIn(escapedMd);
  for (const t of tricky) assert.ok(codes.map(decode).includes(t), t);
  assert.ok(codes.every((t) => !/[!-/:-@[-`{-~]/.test(t.replace(/&#\d+;/g, ''))), escapedMd);
  // Plain text cells still escape a backslash before a pipe, so the pipe can't end the cell.
  const errorMd = renderSummary({ ...report, pages: [{ path: '/x', themes: {}, error: 'bad a\\|b' }] }, classify([]));
  assert.ok(errorMd.includes('| bad a\\\\\\|b |'), errorMd);
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

test('the models list waits for model links, which its loading skeleton never renders', async () => {
  const config = JSON.parse(await readFile(DEFAULT_CONFIG, 'utf8'));
  const models = config.pages.find((p) => p.path === '/models');
  assert.match(models?.waitFor ?? '', /a\[href\^="\/models\/"\]/);
  // If the skeleton ever gains a link, the wait could pass before the list has loaded.
  const skeleton = await readFile(new URL('../../apps/web/src/components/(data)/models/Models/ModelsPageSkeleton.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(skeleton, /<a\b|<Link\b|href=/);
});
