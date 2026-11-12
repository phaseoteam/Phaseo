import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardUids, enhanceInvestigations, grafanaApi, investigationDashboard, provisionInvestigations, traceUrl } from './investigations.mjs';

const env = { GRAFANA_URL: 'https://example.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: 'private-token', GRAFANA_LOKI_UID: 'logs' };
const linksFor = (panel, field) => panel.fieldConfig.overrides.filter(override => override.matcher.options === field).flatMap(override => override.properties.filter(property => property.id === 'links').flatMap(property => property.value));
const fixture = uid => ({ dashboard: { uid, id: 10, version: 7, tags: ['phaseo'], templating: { list: [] }, annotations: { list: [{ name: 'Deployments' }] }, panels: [] }, meta: { folderUid: 'phaseo-observability' } });

test('web and nested job records link to shared records while retaining their layout, columns and styling', () => {
  const source = fixture('phaseo-web').dashboard;
  const panel = { id: 9, type: 'table', gridPos: { x: 0, y: 10, w: 24, h: 8 }, fieldConfig: { defaults: { noValue: '—' }, overrides: [{ matcher: { id: 'byName', options: 'request_id' }, properties: [{ id: 'custom.width', value: 160 }, { id: 'links', value: [{ url: '/d/phaseo-gateway' }] }] }] }, transformations: [{ id: 'extractFields', options: { source: 'Line', format: 'json' } }, { id: 'filterFieldsByName', options: { include: { names: ['timestamp', 'route'] } } }] };
  source.panels = [{ type: 'row', panels: [panel] }];
  const updated = enhanceInvestigations(source);
  const result = updated.panels[0].panels[0];
  assert.deepEqual(result.gridPos, panel.gridPos);
  assert.deepEqual(updated.annotations, source.annotations);
  assert.deepEqual(result.transformations[1].options.include.names, ['timestamp', 'route', 'request_id', 'trace_id', 'service_version']);
  assert.equal(result.fieldConfig.overrides[0].properties[0].value, 160);
  assert.match(linksFor(result, 'request_id')[0].url, /^\/d\/phaseo-investigation\?/);
  assert.match(linksFor(result, 'request_id')[0].url, /var-lookup=\$\{__value.raw:percentencode\}/);
  assert.equal(linksFor(result, 'trace_id').length, 2);
  assert.equal(linksFor(panel, 'request_id')[0].url, '/d/phaseo-gateway', 'source must not mutate');
  assert.deepEqual(enhanceInvestigations(updated), updated, 'reapplying must not add duplicate links or columns');
});

test('trace exploration retains the trace identifier and selected incident time', () => {
  const url = new URL(traceUrl(), env.GRAFANA_URL);
  const pane = JSON.parse(url.searchParams.get('panes')).trace;
  assert.deepEqual(pane.queries, [{ refId: 'A', queryType: 'traceId', query: '${__value.raw}' }]);
  assert.deepEqual(pane.range, { from: '${__from}', to: '${__to}' });
  assert.equal(pane.datasource, '${tempo}');
});

test('lookup compares encoded identifiers without exposing LogQL syntax, with bounded readable records', () => {
  const dashboard = investigationDashboard('logs', 'traces');
  const table = dashboard.panels.find(panel => panel.type === 'table');
  const query = table.targets[0];
  assert.match(query.expr, /lookup_request="\$\{lookup:percentencode\}"/);
  assert.match(query.expr, /lookup_trace="\$\{lookup:percentencode\}"/);
  assert.match(query.expr, /urlencode \| replace "\+" "%20"/);
  assert.match(query.expr, /request_id!=""/);
  assert.match(query.expr, /trace_id!=""/);
  assert.equal(query.maxLines, 100);
  assert.equal(dashboard.refresh, '', 'lookup must not add background polling');
  assert.equal(table.transformations.some(transform => transform.options?.include?.names?.includes('Line')), true);
  assert.ok(!table.transformations.findLast(transform => transform.id === 'filterFieldsByName').options.include.names.includes('Line'), 'raw JSON is removed from the displayed table');
  assert.deepEqual(dashboard.annotations.list[0].target.tags, ['phaseo-deployment', 'environment:$environment']);
});

test('credential-unsafe origins are rejected before sending an authenticated request', () => {
  for (const url of ['http://example.grafana.net', 'https://other.example', 'https://user:password@example.grafana.net', 'https://example.grafana.net:444', 'https://example.grafana.net/path']) assert.throws(() => grafanaApi({ ...env, GRAFANA_URL: url }), /HTTPS Grafana stack origin/);
});

function apiFixture(writes, collision) {
  return async (url, init) => {
    if (init.method !== 'GET') { writes.push(JSON.parse(init.body)); return Response.json({ status: 'success' }); }
    if (url.endsWith('/api/datasources')) return Response.json([{ uid: 'logs', type: 'loki' }, { uid: 'grafanacloud-traces', type: 'tempo' }]);
    const uid = url.split('/').at(-1);
    if (uid === 'phaseo-investigation') return new Response('{}', { status: 404 });
    const existing = fixture(uid);
    if (uid === collision) existing.meta.folderUid = 'someone-else';
    return Response.json(existing);
  };
}

test('read-only plan performs no writes and ownership collisions prevent all writes', async () => {
  const writes = [];
  await provisionInvestigations({ args: ['--check'], env, fetcher: apiFixture(writes), log: () => {} });
  assert.equal(writes.length, 0);
  await assert.rejects(provisionInvestigations({ args: ['--apply'], env, fetcher: apiFixture(writes, 'phaseo-jobs') }), /ownership mismatch/);
  assert.equal(writes.length, 0);
});

test('live updates preserve dashboard versions so concurrent maintainer edits are not overwritten', async () => {
  const writes = [];
  await provisionInvestigations({ args: ['--apply'], env, fetcher: apiFixture(writes), log: () => {} });
  assert.equal(writes.length, dashboardUids.length + 1);
  for (const body of writes.slice(0, -1)) { assert.equal(body.dashboard.version, 7); assert.equal(body.overwrite, undefined); assert.deepEqual(body.dashboard.annotations.list, [{ name: 'Deployments' }]); }
  assert.equal(writes.at(-1).dashboard.uid, 'phaseo-investigation');
  assert.ok(!JSON.stringify(writes).includes(env.GRAFANA_SERVICE_ACCOUNT_TOKEN));
});
