import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provision } from './provision.mjs';
import { freeTierDashboard, freeAllowances } from './free-tier.mjs';

test('Free budgets stay fixed during a trial and missing measurements remain unknown', () => {
  const dashboard = freeTierDashboard();
  assert.deepEqual(freeAllowances, { series: 10000, logsGB: 50, tracesGB: 50, sessions: 50000, apiChecks: 100000, browserChecks: 10000 });
  assert.ok(!dashboard.templating.list.some(variable => variable.name === 'environment'));
  for (const panel of dashboard.panels.filter(panel => panel.targets)) {
    assert.equal(panel.fieldConfig.defaults.noValue, 'Unavailable');
    assert.ok(!panel.targets.some(target => /or vector\(0\)|included_usage|increase\(/.test(target.expr)));
  }
  const budgets = dashboard.panels.filter(panel => panel.type === 'stat').slice(0, 6);
  for (const [index, maximum] of Object.values(freeAllowances).entries()) {
    assert.equal(budgets[index].fieldConfig.defaults.thresholds.steps[1].value, maximum * 0.8);
    assert.equal(budgets[index].fieldConfig.defaults.thresholds.steps[2].value, maximum);
  }
  for (const panel of dashboard.panels.filter(panel => panel.title.includes('pace estimate'))) {
    assert.ok(panel.targets[0].expr.includes('[24h]'));
    assert.ok(panel.targets[0].expr.endsWith(`* ${31 * 86400} / 1e9`));
    assert.ok(panel.description.includes('not a forecast or month-to-date'));
  }
});

test('dashboard-only apply succeeds without alert access and never changes alert state', async () => {
  const writes = [];
  const reads = [];
  const fetcher = async (url, init) => {
    if (/alert-rules|ruler|policies|contact-points/.test(url)) throw Error('Alert access forbidden');
    if (init.method !== 'GET') { writes.push({ url, body: JSON.parse(init.body) }); return Response.json({}); }
    reads.push(url);
    if (url.endsWith('/datasources/uid/private-usage')) return Response.json({ type: 'prometheus', uid: 'private-usage', name: 'usage.test' });
    if (url.endsWith('/datasources/uid/logs')) return Response.json({ type: 'loki', uid: 'logs', name: 'Logs' });
    if (url.includes('/api/folders')) return Response.json([{ uid: 'phaseo-observability', title: 'Phaseo observability' }]);
    return new Response('{}', { status: 404 });
  };
  await provision({ args: ['--apply', '--dashboards-only'], env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'fixture', GRAFANA_LOKI_UID: 'logs', GRAFANA_USAGE_UID: 'private-usage' }, fetcher, log: () => {} });
  assert.equal(writes.length, 6);
  assert.ok(writes.every(write => write.url.endsWith('/api/dashboards/db')));
  const budget = writes.find(write => write.body.dashboard.uid === 'phaseo-free-tier').body.dashboard;
  assert.deepEqual(budget.templating.list[0].current, { text: 'usage.test', value: 'private-usage' });
  assert.equal(budget.templating.list[0].regex, '/^usage\\.test$/');
  assert.ok(reads.some(url => url === 'https://phaseo.grafana.net/api/datasources/uid/private-usage'));
});

test('live validation sends usage PromQL to Prometheus and log queries to Loki', async () => {
  const checks = [];
  const fetcher = async (url, init) => {
    assert.equal(init.method, 'GET');
    if (url.endsWith('/datasources/uid/usage')) return Response.json({ type: 'prometheus', uid: 'usage' });
    if (url.endsWith('/datasources/uid/logs')) return Response.json({ type: 'loki', uid: 'logs' });
    const parsed = new URL(url);
    const expr = parsed.searchParams.get('query');
    assert.ok(expr);
    assert.equal(parsed.pathname.includes('/usage/api/v1/query'), expr.includes('grafanacloud_'));
    assert.ok(!expr.includes('$'));
    checks.push(expr);
    return Response.json({ status: 'success', data: { result: [] } });
  };
  await provision({ args: ['--check'], env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'fixture', GRAFANA_LOKI_UID: 'logs', GRAFANA_USAGE_UID: 'usage' }, fetcher, log: () => {} });
  assert.equal(checks.filter(expr => expr.includes('grafanacloud_')).length, 14);
});
