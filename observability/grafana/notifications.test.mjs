import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incidentCredentials, notificationRoute, provisionNotifications } from './notifications.mjs';

const env = { GRAFANA_URL: 'https://example.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'private-grafana', INCIDENT_GRAFANA_WEBHOOK_URL: 'https://api.incident.io/v2/alert_events/grafana/fixture-source', INCIDENT_GRAFANA_BEARER_TOKEN: 'private-incident' };
const policy = () => ({ metadata: { name: 'user-defined', resourceVersion: 'original-version' }, spec: { defaults: { receiver: 'existing-default' }, routes: [{ receiver: 'other-team', continue: false, matchers: [{ label: 'team', type: '=', value: 'other' }] }] } });

test('notification routing preserves unrelated/default routes and only captures Phaseo production', () => {
  const original = policy();
  const updated = notificationRoute(original);
  assert.deepEqual(updated.spec.defaults, original.spec.defaults);
  assert.deepEqual(updated.spec.routes[1], original.spec.routes[0]);
  assert.deepEqual(updated.spec.routes[0].matchers, [{ label: 'application', type: '=', value: 'phaseo' }, { label: 'environment', type: '=', value: 'production' }]);
  assert.equal(updated.spec.routes[0].continue, false);
  assert.equal(updated.spec.routes[0].repeat_interval, '4h');
  assert.deepEqual(notificationRoute(updated), updated);
  assert.equal(original.spec.routes.length, 1);
  updated.spec.routes[0].matchers.pop();
  assert.throws(() => notificationRoute(updated), /different ownership/);
});

test('source secrets cannot be sent to other hosts or untrusted endpoints', () => {
  for (const url of ['https://attacker.example/source', 'https://api.incident.io/v2/incidents', 'https://user:pass@api.incident.io/v2/alert_events/grafana/source', 'https://api.incident.io/v2/alert_events/grafana/source?token=secret']) assert.throws(() => incidentCredentials({ ...env, INCIDENT_GRAFANA_WEBHOOK_URL: url }), /Grafana alert-source URL/);
  assert.throws(() => incidentCredentials({ ...env, INCIDENT_GRAFANA_BEARER_TOKEN: '' }), /bearer token/);
});

function fixture({ secure = true, conflict = false, existing = false, onRouteRead } = {}) {
  const writes = [];
  let receiver = existing ? { metadata: { name: 'generated-contact-name', resourceVersion: 'receiver-version' }, spec: { title: 'Phaseo incident.io', integrations: [{ uid: 'phaseo-incidentio-webhook', type: 'webhook' }] } } : undefined;
  let tree = policy();
  const group = { name: 'phaseo-production', interval: '1m', rules: [{ labels: { application: 'phaseo', environment: 'production' }, annotations: { summary: 'Existing alert' }, grafana_alert: { uid: 'phaseo-web-errors-production', title: 'Web failures', is_paused: true, data: [{ refId: 'A', model: { expr: 'existing-query' } }] } }] };
  const fetcher = async (url, init) => {
    if (init.method !== 'GET') {
      const body = JSON.parse(init.body);
      writes.push({ url, body });
      if (url.endsWith('/receivers')) {
        assert.equal(body.metadata.name, undefined, 'Grafana rejects a client-supplied name on create');
        receiver = { ...body, metadata: { ...body.metadata, name: 'generated-contact-name' } };
        return Response.json(receiver);
      }
      if (url.endsWith('/receivers/generated-contact-name')) receiver = body;
      if (url.endsWith('/routingtrees/user-defined')) { if (conflict) return new Response('{}', { status: 409 }); tree = body; }
      return Response.json({});
    }
    if (url.endsWith('/api/frontend/settings')) return Response.json({ namespace: 'stacks-123' });
    if (url.endsWith('/receivers')) return Response.json({ items: receiver ? [receiver] : [] });
    if (url.endsWith('/routingtrees')) return Response.json({ items: [tree] });
    if (url.endsWith('/routingtrees/user-defined')) { onRouteRead?.(group); return Response.json(tree); }
    if (url.includes('/receivers/')) return Response.json({ ...receiver, spec: { ...receiver.spec, integrations: [{ secureFields: { authorization_credentials: secure } }] } });
    if (url.includes('/api/ruler/')) return Response.json({ folder: [group] });
    throw Error('Unexpected request ' + url);
  };
  return { writes, fetcher, group };
}

test('check is read-only and works before source credentials are supplied', async () => {
  const { writes, fetcher } = fixture();
  const logs = [];
  await provisionNotifications({ args: ['--check'], env: { GRAFANA_URL: env.GRAFANA_URL, GRAFANA_SERVICE_ACCOUNT_TOKEN: env.GRAFANA_SERVICE_ACCOUNT_TOKEN }, fetcher, log: value => logs.push(value) });
  assert.deepEqual(JSON.parse(logs[0]).rules[0].routing, { mode: 'policy' });
  assert.equal(writes.length, 0);
});

test('rules enable only after secure credential and route readback; queries and other groups are retained', async () => {
  const { writes, fetcher, group } = fixture();
  const logs = [];
  await provisionNotifications({ args: ['--apply', '--enable-alerts'], env, fetcher, log: value => logs.push(value) });
  assert.equal(writes.length, 3);
  const integration = writes[0].body.spec.integrations[0];
  assert.equal(integration.disableResolveMessage, false);
  assert.equal(integration.settings.authorization_credentials, env.INCIDENT_GRAFANA_BEARER_TOKEN);
  assert.equal(writes[1].body.metadata.resourceVersion, 'original-version');
  const rule = writes[2].body.rules[0];
  assert.equal(rule.grafana_alert.is_paused, false);
  assert.deepEqual(rule.grafana_alert.data, group.rules[0].grafana_alert.data);
  assert.match(rule.annotations.dashboard_url, /phaseo-web\?/);
  assert.match(rule.annotations.runbook_url, /incident-response/);
  assert.ok(!logs.join('').includes('private-'));
});

test('failed credential storage leaves routing untouched and concurrent routing edits never enable rules', async () => {
  for (const options of [{ secure: false }, { conflict: true }]) {
    const { writes, fetcher } = fixture(options);
    await assert.rejects(provisionNotifications({ args: ['--apply', '--enable-alerts'], env, fetcher, log: () => {} }), /secure storage|HTTP 409/);
    assert.equal(writes.some(write => write.url.includes('/api/ruler/')), false);
    if (options.secure === false) assert.equal(writes.some(write => write.url.includes('/routingtrees/')), false);
  }
});

test('updating an owned contact point uses its server name and preserves paused alerts by default', async () => {
  const { writes, fetcher } = fixture({ existing: true });
  await provisionNotifications({ args: ['--apply'], env, fetcher, log: () => {} });
  assert.ok(writes[0].url.endsWith('/receivers/generated-contact-name'));
  assert.equal(writes[0].body.metadata.resourceVersion, 'receiver-version');
  assert.equal(writes.at(-1).body.rules[0].grafana_alert.is_paused, true);
});

test('check reports direct contact points and apply refuses to change routing for those rules', async () => {
  const { writes, fetcher, group } = fixture();
  group.rules[0].grafana_alert.notification_settings = { receiver: 'existing-direct-contact' };
  const logs = [];
  await provisionNotifications({ args: ['--check'], env, fetcher, log: value => logs.push(value) });
  assert.deepEqual(JSON.parse(logs[0]).rules[0].routing, { mode: 'direct', receiver: 'existing-direct-contact' });
  for (const args of [['--apply'], ['--apply', '--enable-alerts']]) {
    await assert.rejects(provisionNotifications({ args, env, fetcher, log: () => {} }), /direct contact-point routing/);
  }
  assert.deepEqual(writes, []);
});

test('named notification policies are reported and refused instead of bypassing the default route', async () => {
  const { writes, fetcher, group } = fixture();
  group.rules[0].grafana_alert.notification_settings = { policy: 'other-policy' };
  const logs = [];
  await provisionNotifications({ args: ['--check'], env, fetcher, log: value => logs.push(value) });
  assert.deepEqual(JSON.parse(logs[0]).rules[0].routing, { mode: 'named-policy', policy: 'other-policy' });
  await assert.rejects(provisionNotifications({ args: ['--apply'], env, fetcher, log: () => {} }), /named policy/);
  assert.deepEqual(writes, []);
});

test('rule updates preserve pause, query, version and membership changes made during routing setup', async () => {
  const { writes, fetcher, group } = fixture({ onRouteRead: current => {
    current.rules[0].grafana_alert.is_paused = true;
    current.rules[0].grafana_alert.version = 8;
    current.rules[0].grafana_alert.data[0].model.expr = 'maintainer-edited-query';
    current.rules.push({ ...structuredClone(current.rules[0]), grafana_alert: { ...structuredClone(current.rules[0].grafana_alert), uid: 'phaseo-jobs-failing-production' } });
  } });
  group.rules[0].grafana_alert.is_paused = false;
  group.rules[0].grafana_alert.version = 7;
  await provisionNotifications({ args: ['--apply'], env, fetcher, log: () => {} });
  const saved = writes.at(-1).body;
  assert.equal(saved.rules.length, 2);
  assert.equal(saved.rules[0].grafana_alert.is_paused, true);
  assert.equal(saved.rules[0].grafana_alert.version, 8);
  assert.equal(saved.rules[0].grafana_alert.data[0].model.expr, 'maintainer-edited-query');
  assert.match(saved.rules[1].annotations.dashboard_url, /phaseo-jobs\?/);
});

test('ownership or direct routing changes during setup prevent rule writes and enabling alerts', async () => {
  for (const change of [
    group => { group.rules[0].labels.application = 'other-team'; },
    group => { group.rules[0].grafana_alert.notification_settings = { receiver: 'new-direct-contact' }; },
    group => { group.rules = []; },
  ]) {
    const { writes, fetcher } = fixture({ onRouteRead: change });
    await assert.rejects(provisionNotifications({ args: ['--apply', '--enable-alerts'], env, fetcher, log: () => {} }), /ownership mismatch|direct contact-point routing/);
    assert.equal(writes.some(write => write.url.includes('/api/ruler/')), false);
  }
});
