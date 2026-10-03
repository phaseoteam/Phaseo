import { appendFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const checks = [
  { id: 'homepage', url: 'https://phaseo.app/', text: 'Phaseo' },
  { id: 'models', url: 'https://phaseo.app/models', text: 'Models' },
  { id: 'docs', url: 'https://phaseo.app/docs/v1', text: 'Phaseo' },
  { id: 'api-root', url: 'https://api.phaseo.app/', json: true },
];

// Keep responses and credentials out of logs and telemetry, including on errors.
export async function checkHttp(check, fetcher = fetch) {
  const started = Date.now();
  let reason = 'network_or_timeout';
  let status = null;
  let success = false;
  for (let attempt = 0; attempt < 2 && !success; attempt++) {
    try {
      const response = await fetcher(check.url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Phaseo-Health-Pilot/1.0' },
      });
      status = response.status;
      if (!response.ok) {
        reason = 'http_error';
        await response.body?.cancel();
        continue;
      }
      const body = await response.text();
      if (check.json) {
        const data = JSON.parse(body);
        success = typeof data.message === 'string' && data.message.includes('Phaseo Gateway API');
      } else {
        success = body.includes(check.text);
      }
      reason = success ? null : 'unexpected_content';
    } catch {
      reason = 'network_timeout_or_invalid_body';
    }
  }
  return event(check.id, success, started, { status_code: status, failure_reason: reason });
}

function event(id, success, started, extra = {}) {
  return {
    _time: new Date().toISOString(),
    event_type: 'phaseo.health_check',
    environment: 'production',
    check_id: id,
    success,
    duration_ms: Date.now() - started,
    ...extra,
  };
}

export async function checkBrowser(loadPlaywright) {
  const started = Date.now();
  let browser;
  try {
    const { chromium, expect } = loadPlaywright();
    browser = await chromium.launch({ timeout: 15000 });
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(20000);
    const response = await page.goto('https://phaseo.app/models', { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) return event('models-browser', false, started, { failure_reason: 'http_error' });
    await expect(page).toHaveTitle(/Models/i);
    await expect(page.getByRole('heading', { level: 1, name: 'Models', exact: true })).toBeVisible();
    // Verify a rendered model link, then navigate to its page and verify content.
    const link = page.locator('main a[href^="/models/"]').filter({ visible: true }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    if (!href?.startsWith('/models/')) throw new Error('missing_model_link');
    await link.click();
    await expect(page).toHaveURL(new RegExp('/models/.+'));
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);
    return event('models-browser', true, started);
  } catch {
    return event('models-browser', false, started, { failure_reason: 'browser_setup_or_assertion_failed' });
  } finally {
    await browser?.close();
  }
}

export async function publishAxiom(events, env, fetcher = fetch) {
  if (!env.HEALTH_AXIOM_TOKEN || !env.HEALTH_AXIOM_DATASET) {
    throw new Error('Axiom publishing requires HEALTH_AXIOM_TOKEN and HEALTH_AXIOM_DATASET');
  }
  const response = await fetcher(`https://api.axiom.co/v1/datasets/${encodeURIComponent(env.HEALTH_AXIOM_DATASET)}/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.HEALTH_AXIOM_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
    signal: AbortSignal.timeout(15000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Axiom delivery failed (HTTP ${response.status})`);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const allowed = new Set(['--http-only', '--publish-axiom']);
  if (args.some((arg) => !allowed.has(arg))) throw new Error('Unknown health-pilot option');
  const results = await Promise.all(checks.map((check) => checkHttp(check)));
  if (!args.includes('--http-only')) {
    const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
    results.push(await checkBrowser(() => require('@playwright/test')));
  }
  console.log(JSON.stringify({ pilot: true, results, coverage_gaps: ['database_uncached_read', 'authenticated_flows', 'paid_generations'] }, null, 2));
  if (env.GITHUB_STEP_SUMMARY) {
    const rows = results.map((result) => `| ${result.check_id} | ${result.success ? 'PASS' : 'FAIL'} | ${result.duration_ms} |`).join('\n');
    await appendFile(env.GITHUB_STEP_SUMMARY, `## Phaseo health pilot\n\n| Check | Result | Duration (ms) |\n| --- | --- | --- |\n${rows}\n\nNo incidents are created. Database connectivity, authenticated flows, and paid generations are not covered.\n`);
  }
  if (env.HEALTH_PILOT_REPORT) await writeFile(env.HEALTH_PILOT_REPORT, JSON.stringify(results, null, 2));
  if (args.includes('--publish-axiom')) await publishAxiom(results, env);
  if (results.some((result) => !result.success)) process.exitCode = 1;
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Only our bounded delivery/configuration errors are emitted, never response bodies.
    console.error(error.message);
    process.exitCode = 1;
  });
}
