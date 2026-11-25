// Scans public pages of the live site with axe-core for WCAG 2.2 AA, in light and dark themes.
// Writes results.json and summary.md to --out, and exits 1 when a serious or critical violation
// is not covered by an exception, 2 when a page could not be scanned, or 3 when the scanner fails.
//
//   node scripts/a11y/scan-live.mjs [--base-url https://phaseo.app] [--out dir] [--pages /,/models]
//
// Playwright and @axe-core/playwright are not workspace dependencies. Install them anywhere and
// point A11Y_DEPS_DIR at that folder (the nightly workflow installs pinned versions in $RUNNER_TEMP).
// Public pages only: nothing here signs in.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG = path.join(here, 'live-scan.config.json');
const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'];

// An exception matches on rule id plus a substring of the node's selector (`target`) and/or its HTML
// (`html`, for elements whose ids are generated). `path` (exact), `pathPrefix` and `theme` narrow it;
// every entry needs a `reason`.
export function matchException(exceptions, { rule, path: pagePath, theme, target, html }) {
  return exceptions.find(
    (e) =>
      e.rule === rule &&
      (e.target !== undefined || e.html !== undefined) &&
      (e.path === undefined || e.path === pagePath) &&
      (e.pathPrefix === undefined || pagePath.startsWith(e.pathPrefix)) &&
      (e.theme === undefined || e.theme === theme) &&
      (e.target === undefined || target.includes(e.target)) &&
      (e.html === undefined || html.includes(e.html)),
  );
}

// Flattens axe results into one row per failing node, so exceptions and the summary work per node.
export function classify(pages, { exceptions = [], failOn = ['critical', 'serious'] } = {}) {
  const failing = [];
  const reported = [];
  const exempt = [];
  const used = new Set();
  for (const page of pages) {
    for (const [theme, result] of Object.entries(page.themes)) {
      for (const v of result.violations ?? []) {
        for (const node of v.nodes) {
          const row = {
            path: page.path,
            theme,
            rule: v.id,
            impact: v.impact ?? 'minor',
            help: v.help,
            helpUrl: v.helpUrl,
            target: node.target,
            html: node.html,
            summary: node.summary,
          };
          const hit = matchException(exceptions, row);
          if (hit) {
            used.add(hit);
            exempt.push({ ...row, reason: hit.reason });
          } else if (failOn.includes(row.impact)) {
            failing.push(row);
          } else {
            reported.push(row);
          }
        }
      }
    }
  }
  const byImpact = (a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact);
  failing.sort(byImpact);
  reported.sort(byImpact);
  return { failing, reported, exempt, unusedExceptions: exceptions.filter((e) => !used.has(e)) };
}

// Plain table text. Cuts to `max` before escaping, so a cut can't split an escape. Backslashes are
// escaped first, so a `\` already in the text can't turn the pipe escape into a cell break.
const cell = (s, max = Infinity) =>
  String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
// Selectors and HTML. A Markdown code span would keep the backslash escapes literally and break
// selectors such as `.md\:hidden`, so this uses an HTML <code> element with entity-encoded text:
// GitHub shows it exactly as axe reported it, and `|` as &#124; can't split the table cell.
const code = (s, max = Infinity) =>
  '<code>' +
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/\\/g, '&#92;') +
  '</code>';

function nodeTable(rows) {
  const lines = ['| Page | Theme | Rule | Impact | Element | Problem |', '| --- | --- | --- | --- | --- | --- |'];
  for (const r of rows) {
    lines.push(
      `| ${code(r.path)} | ${r.theme} | [${r.rule}](${r.helpUrl}) | ${r.impact} | ${code(r.target, 120)} ${code(r.html, 140)} | ${cell(r.summary, 220)} |`,
    );
  }
  return lines.join('\n');
}

export function renderSummary(report, outcome) {
  const { failing, reported, exempt, unusedExceptions } = outcome;
  const errored = report.pages.filter((p) => p.error);
  const status = errored.length
    ? 'Some pages could not be scanned'
    : failing.length
      ? `${failing.length} serious or critical ${failing.length === 1 ? 'problem' : 'problems'} found`
      : 'No serious or critical problems found';
  const out = [
    '# Accessibility scan of the live site',
    '',
    `**${status}.** ${report.pages.length} public pages on ${report.baseUrl}, in ${report.themes.join(' and ')} themes, checked with axe-core ${report.axeVersion} against ${report.tags.join(', ')}. Scanned ${report.finishedAt}.`,
    '',
    `Serious and critical problems fail the run. Moderate and minor ones are listed but do not. Exceptions: ${exempt.length} ${exempt.length === 1 ? 'element' : 'elements'} skipped.`,
    '',
  ];
  if (errored.length) {
    out.push('## Pages that could not be scanned', '', '| Page | Error |', '| --- | --- |');
    for (const p of errored) out.push(`| ${code(p.path)} | ${cell(p.error, 300)} |`);
    out.push('');
  }
  if (failing.length) out.push('## Serious and critical', '', nodeTable(failing), '');
  if (reported.length) {
    out.push(
      '<details>',
      `<summary>Moderate and minor (${reported.length}, not failing)</summary>`,
      '',
      nodeTable(reported),
      '',
      '</details>',
      '',
    );
  }
  if (exempt.length) {
    out.push('## Skipped by exception', '', '| Page | Theme | Rule | Element | Reason |', '| --- | --- | --- | --- | --- |');
    for (const r of exempt) out.push(`| ${code(r.path)} | ${r.theme} | ${r.rule} | ${code(r.target)} ${code(r.html, 140)} | ${cell(r.reason)} |`);
    out.push('');
  }
  if (unusedExceptions.length) {
    out.push('## Exceptions that matched nothing', '', 'Remove these from `scripts/a11y/live-scan.config.json` if the problem is gone.', '');
    for (const e of unusedExceptions) out.push(`- ${e.rule} on ${code(e.path ?? (e.pathPrefix ? `${e.pathPrefix}*` : 'any page'))}: ${code(e.target ?? e.html)}`);
    out.push('');
  }
  out.push('## Pages', '', '| Page | Light | Dark |', '| --- | --- | --- |');
  for (const p of report.pages) {
    const count = (t) => (p.themes[t] ? String(p.themes[t].violations.reduce((n, v) => n + v.nodes.length, 0)) : p.error ? 'error' : '');
    out.push(`| ${code(p.path)} | ${count('light')} | ${count('dark')} |`);
  }
  out.push('', 'Counts are elements with any violation, including moderate and minor. Pages behind sign-in are not scanned.', '');
  return out.join('\n');
}

// One retry: a single slow response from the live site should not fail the night. `scanOnce` fills
// rec.themes as each theme finishes, and themes that finished on either attempt are kept, so their
// findings still reach the report even when another theme fails both times.
export async function scanWithRetry(entry, scanOnce) {
  const rec = { path: entry.path, name: entry.name, themes: {} };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await scanOnce(rec);
      delete rec.error;
      break;
    } catch (error) {
      rec.error = String(error?.message ?? error).split('\n')[0];
    }
  }
  return rec;
}

// Fills rec.themes as each theme finishes, so a failure in a later theme keeps earlier results.
async function scanPage(context, AxeBuilder, baseUrl, entry, config, rec) {
  const page = await context.newPage();
  try {
    for (const theme of config.themes) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const response = await page.goto(new URL(entry.path, baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const status = response?.status() ?? 0;
      if (status >= 400) throw new Error(`HTTP ${status}`);
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      // Some entries (the sign-in and sign-up dialogs) render client-side on top of another page.
      // Without this wait, a dialog that never opens would pass as a clean scan of the page underneath.
      if (entry.waitFor) await page.locator(entry.waitFor).first().waitFor({ state: 'visible', timeout: 20000 });
      // Let client data and theme classes settle; reduced motion keeps transitions from skewing contrast.
      await page.waitForTimeout(2500);
      const result = await new AxeBuilder({ page }).withTags(config.tags).analyze();
      rec.axeVersion = result.testEngine?.version;
      rec.themes[theme] = {
        status,
        finalUrl: page.url(),
        htmlClass: await page.evaluate(() => document.documentElement.className),
        violations: result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags.filter((t) => t.startsWith('wcag')),
          nodes: v.nodes.map((n) => ({
            target: n.target.flat().join(' '),
            html: n.html.slice(0, 300),
            summary: (n.failureSummary ?? '').slice(0, 500),
          })),
        })),
        incomplete: result.incomplete.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length })),
      };
    }
  } finally {
    await page.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', default: DEFAULT_CONFIG },
      'base-url': { type: 'string' },
      out: { type: 'string', default: path.join(os.tmpdir(), 'phaseo-a11y-live') },
      pages: { type: 'string' },
      concurrency: { type: 'string', default: '3' },
    },
  });
  const config = JSON.parse(await readFile(values.config, 'utf8'));
  const baseUrl = (values['base-url'] || process.env.A11Y_BASE_URL || config.baseUrl).replace(/\/+$/, '');
  if (!/^https?:\/\//.test(baseUrl)) throw new Error(`Base URL must be http(s): ${baseUrl}`);
  const only = values.pages?.split(',').map((s) => s.trim()).filter(Boolean);
  const entries = only ? only.map((p) => config.pages.find((e) => e.path === p) ?? { path: p, name: p }) : config.pages;
  const bad = entries.find((e) => !e.path.startsWith('/'));
  if (bad) throw new Error(`Page paths must start with "/": ${bad.path}`);
  for (const e of config.exceptions ?? []) {
    if (!e.rule || !e.reason || (e.target === undefined && e.html === undefined)) {
      throw new Error(`Each exception needs rule, reason and target or html: ${JSON.stringify(e)}`);
    }
  }

  const require = createRequire(process.env.A11Y_DEPS_DIR ? path.resolve(process.env.A11Y_DEPS_DIR, 'package.json') : import.meta.url);
  const { chromium } = require('playwright');
  const { AxeBuilder } = require('@axe-core/playwright');

  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'en-GB', viewport: { width: 1280, height: 900 } });
  const pages = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      const entry = entries[i];
      const rec = await scanWithRetry(entry, (r) => scanPage(context, AxeBuilder, baseUrl, entry, config, r));
      pages[i] = rec;
      const counts = config.themes.map((t) => rec.themes[t]?.violations.reduce((n, v) => n + v.nodes.length, 0) ?? '-').join('/');
      console.log(`${rec.error ? 'ERROR' : 'ok   '} ${entry.path} ${rec.error ?? counts}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency) || 1) }, worker));
  await browser.close();

  const report = {
    baseUrl,
    finishedAt: new Date().toISOString(),
    axeVersion: pages.find((p) => p.axeVersion)?.axeVersion ?? 'unknown',
    tags: config.tags,
    themes: config.themes,
    failOn: config.failOn,
    pages,
  };
  const outcome = classify(pages, { exceptions: config.exceptions ?? [], failOn: config.failOn });
  await mkdir(values.out, { recursive: true });
  await writeFile(path.join(values.out, 'results.json'), JSON.stringify({ ...report, outcome }, null, 2));
  const summary = renderSummary(report, outcome);
  await writeFile(path.join(values.out, 'summary.md'), summary);
  console.log(`\n${outcome.failing.length} failing, ${outcome.reported.length} moderate or minor, ${outcome.exempt.length} exempt. Results in ${values.out}`);
  process.exitCode = pages.some((p) => p.error) ? 2 : outcome.failing.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Exit 3 when the scanner itself fails, so it is not mistaken for findings (1) or unreachable pages (2).
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 3;
  });
}
