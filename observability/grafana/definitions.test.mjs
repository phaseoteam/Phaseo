import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dashboards, alertRules } from './definitions.mjs';
import { provision } from './provision.mjs';
import { allPanels } from './presentation.mjs';

test('importable dashboard and alert JSON matches canonical definitions', async () => {
  const definitions = dashboards();
  assert.equal(new Set(definitions.map(item => item.uid)).size, 6);
  for (const dashboard of definitions) {
    assert.deepEqual(JSON.parse(await readFile(new URL(`./dashboards/${dashboard.uid}.json`, import.meta.url), 'utf8')), dashboard);
    for (const panel of allPanels(dashboard.panels)) for (const target of panel.targets ?? []) {
      if (dashboard.uid === 'phaseo-free-tier') {
        assert.equal(panel.datasource.type, 'prometheus');
        continue;
      }
      assert.equal(panel.datasource.type, 'loki');
      assert.ok(target.expr.includes('environment="$environment"'));
      assert.ok(!target.expr.includes('deployment_environment_name='));
    }
  }
  assert.deepEqual(JSON.parse(await readFile(new URL('./alerts.json', import.meta.url), 'utf8')), alertRules({ lokiUid: 'SET_LOKI_DATASOURCE_UID' }));
  for (const rule of alertRules({ lokiUid: 'loki', environment: 'staging' })) {
    assert.equal(rule.isPaused, true);
    assert.equal(rule.execErrState, 'Error');
    assert.equal(rule.noDataState, rule.uid.includes('jobs-failing') ? 'KeepLast' : 'OK');
    assert.ok(!rule.data[0].model.expr.includes('$'));
    assert.ok(rule.data[0].model.expr.includes('environment="staging"'));
  }
  assert.ok(alertRules({ lokiUid: 'loki' })[0].data[0].model.expr.includes('>= 20'));
  assert.ok(alertRules({ lokiUid: 'loki' })[1].data[0].model.expr.includes('absent_over_time'));
});
test('live validation checks every series and skips instruction panels', async () => {
  const queries = [];
  const fetcher = async (url, init) => {
    assert.equal(init.method, 'GET');
    if (url.includes('/datasources/uid/grafanacloud-usage')) return Response.json({ type: 'prometheus', uid: 'grafanacloud-usage' });
    if (url.includes('/datasources/uid/')) return Response.json({ type: 'loki' });
    const query = new URL(url).searchParams.get('query');
    assert.ok(query);
    assert.ok(!query.includes('$'), 'Grafana variables must be expanded for direct Loki requests');
    queries.push(query);
    return Response.json({ status: 'success', data: { result: [] } });
  };
  await provision({ args: ['--check'], env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'private', GRAFANA_LOKI_UID: 'logs' }, fetcher, log: () => {} });
  const dashboardQueries = dashboards().flatMap(dashboard => allPanels(dashboard.panels).flatMap(panel => panel.targets ?? []));
  assert.equal(queries.length, dashboardQueries.length + alertRules({ lokiUid: 'logs' }).length);
  assert.ok(queries.some(query => query.includes('web.server_error') && query.includes('[5m]')));
});
test('dashboards keep summary cards and investigations visible without overlapping panels', () => {
  const overview = dashboards()[0];
  assert.equal(overview.time.from, 'now-1h');
  for (const panel of overview.panels.filter(panel => /^(Traffic|Failures) ·/.test(panel.title))) assert.equal(panel.interval, '5m', 'counts use at least a five-minute interval');
  for (const dashboard of dashboards()) for (const [index, panel] of dashboard.panels.entries()) {
    const a = panel.gridPos;
    assert.ok(a.x >= 0 && a.y >= 0 && a.w > 0 && a.h > 0 && a.x + a.w <= 24);
    for (const other of dashboard.panels.slice(index + 1)) {
      const b = other.gridPos;
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${panel.title} overlaps ${other.title}`);
    }
  }
  for (const panel of overview.panels.filter(panel => panel.type === 'stat')) {
    assert.ok(panel.fieldConfig.defaults.links[0].url.includes('var-environment=$environment&from=$__from&to=$__to'), 'investigations preserve environment and incident time');
  }
});

test('record investigation links preserve filters and incident time without showing raw log panels', () => {
  const definitions = dashboards();
  assert.ok(!definitions.some(dashboard => allPanels(dashboard.panels).some(panel => panel.type === 'logs')));
  const gateway = definitions.find(dashboard => dashboard.uid === 'phaseo-gateway');
  const panel = allPanels(gateway.panels).find(panel => panel.title === 'Provider attempt lookup');
  const fill = value => value.replaceAll('${loki}', 'logs').replaceAll('${tempo}', 'traces').replaceAll('$environment', 'production')
    .replaceAll('${request:regex}', 'request-123').replaceAll('${provider:regex}', 'provider-a').replaceAll('${model:regex}', 'model-a')
    .replaceAll('${__from}', '1000').replaceAll('${__to}', '2000').replaceAll('${__value.raw}', '0123456789abcdef0123456789abcdef');
  const pane = url => Object.values(JSON.parse(new URL(fill(url), 'https://phaseo.grafana.net').searchParams.get('panes')))[0];
  const logs = pane(panel.links[0].url);
  assert.deepEqual(logs.range, { from: '1000', to: '2000' });
  assert.equal(logs.datasource, 'logs');
  assert.equal(logs.queries[0].expr, fill(panel.targets[0].expr));
  assert.ok(logs.queries[0].expr.includes('request-123'));
  assert.ok(logs.queries[0].expr.includes('provider-a'));
  assert.equal(logs.queries[0].maxLines, 100);
  const traceOverride = panel.fieldConfig.overrides.find(override => override.matcher.options === 'trace_id' && override.properties.some(property => property.id === 'links'));
  const trace = pane(traceOverride.properties.find(property => property.id === 'links').value[0].url);
  assert.equal(trace.datasource, 'traces');
  assert.equal(trace.queries[0].query, '0123456789abcdef0123456789abcdef');
  assert.deepEqual(trace.range, logs.range);
});
test('provisioning defaults to no network and rejects credential-unsafe stack URLs', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('unexpected network'); };
  await provision({ args: [], env: {}, fetcher, log: () => {} });
  assert.equal(calls, 0);
  await assert.rejects(provision({ args: ['--apply'], env: { GRAFANA_URL: 'https://attacker.example' }, fetcher }), /HTTPS stack origin/);
  await assert.rejects(provision({ args: ['--enable-alerts'], env: {}, fetcher }), /Use no flags/);
  assert.equal(calls, 0);
});
test('provisioning checks all ownership before writes, refusing a UID collision', async () => {
  const writes = [];
  const fetcher = async (url, init) => {
    if (init.method !== 'GET') writes.push(url);
    if (url.includes('/datasources/uid/grafanacloud-usage')) return Response.json({ type: 'prometheus', uid: 'grafanacloud-usage', name: 'grafanacloud-usage' });
    if (url.includes('/datasources/')) return Response.json({ type: 'loki', uid: 'logs', name: 'Logs' });
    if (url.includes('/api/folders')) return Response.json([]);
    return Response.json({ dashboard: { tags: ['other'] }, meta: {} });
  };
  await assert.rejects(provision({ args: ['--apply'], env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'private', GRAFANA_LOKI_UID: 'logs' }, fetcher, log: () => {} }), /collision/);
  assert.deepEqual(writes, []);
});
test('provisioning creates only the owned folder, dashboards and paused rules', async () => {
  const token = 'grafana-token-fixture-do-not-persist';
  const writes = [];
  const fetcher = async (url, init) => {
    if (init.method !== 'GET') { writes.push({ url, method: init.method, body: JSON.parse(init.body) }); return Response.json({}); }
    if (url.includes('/datasources/uid/grafanacloud-usage')) return Response.json({ type: 'prometheus', uid: 'grafanacloud-usage', name: 'grafanacloud-usage' });
    if (url.includes('/datasources/')) return Response.json({ type: 'loki', uid: 'logs', name: 'Logs' });
    if (url.includes('/api/folders')) return Response.json([]);
    return new Response('{}', { status: 404 });
  };
  await provision({ args: ['--apply'], env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: token, GRAFANA_LOKI_UID: 'logs' }, fetcher, log: () => {} });
  assert.equal(writes.length, 8);
  assert.equal(writes.at(-1).body.rules.filter(item => item.grafana_alert.is_paused).length, 5);
  assert.ok(writes.every(item => !/contact-points|policies|datasources/.test(item.url)));
  assert.ok(!JSON.stringify(writes).includes(token));
});
