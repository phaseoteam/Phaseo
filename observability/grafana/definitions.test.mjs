import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dashboards, alertRules } from './definitions.mjs';
import { provision } from './provision.mjs';

test('importable dashboard and alert JSON matches canonical definitions', async () => {
  const definitions = dashboards();
  assert.equal(new Set(definitions.map(item => item.uid)).size, 5);
  for (const dashboard of definitions) {
    assert.deepEqual(JSON.parse(await readFile(new URL(`./dashboards/${dashboard.uid}.json`, import.meta.url), 'utf8')), dashboard);
    for (const panel of dashboard.panels) {
      assert.equal(panel.datasource.type, 'loki');
      assert.ok(panel.targets[0].expr.includes('environment="$environment"'));
      assert.ok(!panel.targets[0].expr.includes('deployment_environment_name='));
    }
  }
  assert.deepEqual(JSON.parse(await readFile(new URL('./alerts.json', import.meta.url), 'utf8')), alertRules({ lokiUid: 'SET_LOKI_DATASOURCE_UID' }));
  for (const rule of alertRules({ lokiUid: 'loki', environment: 'staging' })) {
    assert.equal(rule.isPaused, true);
    assert.equal(rule.execErrState, 'Error');
    assert.equal(rule.noDataState, 'OK');
    assert.ok(!rule.data[0].model.expr.includes('$'));
    assert.ok(rule.data[0].model.expr.includes('environment="staging"'));
  }
  assert.ok(alertRules({ lokiUid: 'loki' })[0].data[0].model.expr.includes('>= 20'));
  assert.ok(alertRules({ lokiUid: 'loki' })[1].data[0].model.expr.includes('absent_over_time'));
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
    if (url.includes('/datasources/')) return Response.json({ type: 'loki', uid: 'logs', name: 'Logs' });
    if (url.includes('/api/folders')) return Response.json([]);
    return Response.json({ dashboard: { tags: ['other'] }, meta: {} });
  };
  await assert.rejects(provision({ args: ['--apply'], env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'private', GRAFANA_LOKI_UID: 'logs' }, fetcher, log: () => {} }), /collision/);
  assert.deepEqual(writes, []);
});
test('provisioning creates only the owned folder, dashboards and paused rules', async () => {
  const writes = [];
  const fetcher = async (url, init) => {
    if (init.method !== 'GET') { writes.push({ url, method: init.method, body: JSON.parse(init.body) }); return Response.json({}); }
    if (url.includes('/datasources/')) return Response.json({ type: 'loki', uid: 'logs', name: 'Logs' });
    if (url.includes('/api/folders')) return Response.json([]);
    return new Response('{}', { status: 404 });
  };
  await provision({ args: ['--apply'], env: { GRAFANA_URL: 'https://phaseo.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'private', GRAFANA_LOKI_UID: 'logs' }, fetcher, log: () => {} });
  assert.equal(writes.length, 7);
  assert.equal(writes.at(-1).body.rules.filter(item => item.grafana_alert.is_paused).length, 5);
  assert.ok(writes.every(item => !/contact-points|policies|datasources/.test(item.url)));
  assert.ok(!JSON.stringify(writes).includes('private'));
});
