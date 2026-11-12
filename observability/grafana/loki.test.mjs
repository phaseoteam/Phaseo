import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logPayload } from '../../packages/shared/observability/index.mjs';
import { dashboards, alertRules } from './definitions.mjs';
import { allPanels } from './presentation.mjs';

// Optional integration test against an isolated local Loki, never a Cloud stack.
const origin = process.env.LOKI_TEST_URL;
test('dashboard queries run against OTLP fixtures and alerts distinguish failures from quiet traffic', { skip: !origin }, async () => {
  const url = new URL(origin);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Use an isolated local Loki only');
  const now = Date.now();
  const environment = `staging-${crypto.randomUUID()}`;
  const correlation = index => ({ trace_id: (index + 1).toString(16).padStart(32, '0'), span_id: (index + 1).toString(16).padStart(16, '0') });
  const request = (index, extra = {}) => ({ event_name: 'gateway.request', request_id: `fixture-${index}`, ...correlation(index), outcome: 'success', stream: true, duration_ms: (index + 1) * 10, ttft_ms: (index + 1) * 2, provider_ttft_ms: index + 1, ...extra });
  const fixtures = [
    ['phaseo-gateway', Array.from({ length: 20 }, (_, index) => request(index, index < 2 ? { outcome: 'error', actionable: true, status_code: 200, error_code: 'upstream_error', error_kind: 'provider_failure' } : index === 2 ? { outcome: 'error', actionable: false } : index === 3 ? { outcome: 'cancelled', actionable: false } : {}))],
    ['phaseo-gateway', [{ event_name: 'provider.attempt', provider: 'fixture', model: 'model-a', outcome: 'success', duration_ms: 80 }, ...['fixture', 'other'].map(provider => ({ event_name: 'provider.attempt', provider, model: 'model-a', outcome: 'error' }))]],
    ['phaseo-web-api', [...[20, 40].map((duration_ms, index) => ({ event_name: 'web.request', ...correlation(index), status_code: 200, duration_ms })), { event_name: 'web.request', status_code: 404, route: '/missing', actionable: false }, { event_name: 'web.request', status_code: 503, route: '/broken', actionable: true }]],
    ['phaseo-jobs', [{ event_name: 'job.heartbeat' }, ...[45, 145].map((duration_ms, index) => ({ event_name: 'job.run', ...correlation(index), job: 'fixture', outcome: 'completed', duration_ms })), { event_name: 'job.run', ...correlation(2), job: 'other', outcome: 'completed', duration_ms: 75 }, { event_name: 'job.run', job: 'failed', outcome: 'error', actionable: true }]],
    ['phaseo-web', [0, 1].map(index => ({ event_name: 'web.server_error', ...correlation(index), actionable: true, error_name: 'TypeError', error_digest: 'fixture-digest', route: '/fixture' }))],
  ];
  for (const [service, events] of fixtures) {
    const response = await fetch(`${url.origin}/otlp/v1/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(logPayload({ service, environment, release: 'fixture-release' }, events, now - 30000)) });
    assert.ok(response.ok, await response.text());
  }
  const query = async (expression, logQuery = false) => {
    expression = expression.replaceAll('environment="staging"', `environment="${environment}"`);
    const response = await fetch(`${url.origin}/loki/api/v1/${logQuery ? 'query_range' : 'query'}?${new URLSearchParams({ query: expression, limit: '1000' })}`);
    const text = await response.text();
    assert.equal(response.status, 200, `${expression}\n${text}`);
    const result = JSON.parse(text);
    assert.equal(result.status, 'success');
    return result.data.result;
  };
  const percentiles = { 'Gateway p95 duration': 190.5, 'Web API p95 headers': 39, 'Streaming p95 time to first token': 38.1, 'Provider p95 first token': 19.05 };
  const counts = { 'Scheduler telemetry · last 5m': 1, 'Gateway requests': 20, 'Gateway failures': 2, 'Web API requests': 4, 'Web API 5xx': 1, 'Job failures': 1 };
  for (const dashboard of dashboards()) for (const panel of allPanels(dashboard.panels)) for (const target of panel.targets ?? []) {
    if (panel.datasource.type !== 'loki') continue;
    const expression = target.expr.replaceAll('$__auto', '5m').replaceAll('$__range', '1h').replaceAll('$environment', 'staging').replace(/\$\{(?:request|route|provider|model|job):regex\}/g, '');
    const result = await query(expression, panel.type === 'logs' || target.maxLines);
    if (panel.title in counts) {
      assert.equal(Number(result[0].value[1]), counts[panel.title], `${panel.title} must count its intended population`);
      const quiet = await query(expression.replaceAll('environment="staging"', 'environment="production"'));
      assert.equal(Number(quiet[0].value[1]), 0, `${panel.title} must handle a quiet environment`);
    }
    if (panel.title === 'Web API 5xx by route') assert.deepEqual(result.map(series => [series.metric.route, Number(series.value[1])]), [['/broken', 1]], 'client 404 responses must not count as server failures');
    if (panel.title === 'Provider attempt failures') assert.deepEqual(Object.fromEntries(result.map(series => [series.metric.provider, Number(series.value[1])])), { fixture: 1, other: 1 }, 'successful provider attempts must not count as failures');
    if (panel.title === 'Service request health') {
      const expected = { Requests: { 'phaseo-gateway': 20, 'phaseo-web-api': 4 }, Failures: { 'phaseo-gateway': 2, 'phaseo-web-api': 1 }, 'Failure %': { 'phaseo-gateway': 10, 'phaseo-web-api': 25 }, 'p95 ms': { 'phaseo-gateway': 190.5, 'phaseo-web-api': 39 } };
      assert.deepEqual(Object.fromEntries(result.map(series => [series.metric.service_name, Number(series.value[1])])), expected[target.legendFormat], 'logical HTTP 200 failures count; cancellations and missing timings do not become failures or zero latency');
      assert.equal((await query(expression.replaceAll('environment="staging"', 'environment="production"'))).length, 0, 'no traffic must remain unavailable rather than show healthy zero percent');
    }
    if (panel.title === 'Provider and model attempts') {
      const expected = { Attempts: { fixture: 2, other: 1 }, Failures: { fixture: 1, other: 1 }, 'Failure %': { fixture: 50, other: 100 }, 'p95 ms': { fixture: 80 } };
      assert.deepEqual(Object.fromEntries(result.map(series => [series.metric.provider, Number(series.value[1])])), expected[target.legendFormat], 'a provider without timing retains counts but no p95');
    }
    if (panel.title === 'Web API route health') {
      const filtered = await query(target.expr.replaceAll('$__range', '1h').replaceAll('$environment', 'staging').replaceAll('${route:regex}', 'broken'));
      assert.equal(filtered.length, target.legendFormat === 'p95 ms' ? 0 : 1, 'a failed route without timing has counts and rate but no p95');
      assert.ok(filtered.every(series => series.metric.route === '/broken'));
      if (target.legendFormat === 'Failure %') assert.equal(filtered[0].value[1], '100');
    }
    if (panel.title === 'Web API requests / second') {
      const filtered = await query(target.expr.replaceAll('$__auto', '5m').replaceAll('$environment', 'staging').replaceAll('${route:regex}', 'missing'));
      assert.ok(Math.abs(Number(filtered[0].value[1]) - 1 / 300) < 1e-9, 'route search must also narrow the existing traffic chart');
    }
    if (panel.title === 'Grouped failures' && dashboard.uid === 'phaseo-overview') {
      assert.equal(result.find(series => series.metric.error_digest === 'fixture-digest').value[1], '2', 'trace IDs must not fragment an error fingerprint');
      assert.equal(result.find(series => series.metric.error_code === 'upstream_error').value[1], '2');
    }
    if (panel.title === 'Job execution results') {
      const expected = { completed: { fixture: 2, other: 1, failed: 0 }, error: { fixture: 0, other: 0, failed: 1 }, skipped: { fixture: 0, other: 0, failed: 0 } };
      assert.deepEqual(Object.fromEntries(result.map(series => [series.metric.job, Number(series.value[1])])), expected[target.legendFormat]);
    }
    if (panel.title === 'Website errors by release') {
      assert.equal(result.length, 1);
      assert.equal(result[0].metric.service_version, 'fixture-release', 'release must come from OTLP metadata rather than a nonexistent JSON body field');
      assert.equal(result[0].value[1], '2');
    }
    if (panel.title in percentiles) {
      assert.equal(result.length, 1, `${panel.title} must combine request trace/span series`);
      assert.ok(Math.abs(Number(result[0].value[1]) - percentiles[panel.title]) < 1e-6, `${panel.title} must calculate the p95 across requests`);
    }
    if (panel.title === 'Job p95 duration') {
      assert.equal(result.length, 2, 'job percentiles must retain exactly one series per job');
      assert.deepEqual(Object.fromEntries(result.map(series => [series.metric.job, Number(series.value[1])])), { fixture: 140, other: 75 });
    }
  }
  const rules = alertRules({ lokiUid: 'local', environment: 'staging' });
  for (const rule of rules) await query(rule.data[0].model.expr);
  const result = await query(rules[0].data[0].model.expr);
  assert.equal(Number(result[0].value[1]), 0.1, '2 actionable failures / 20 requests should qualify');
  const quiet = await query(rules[0].data[0].model.expr.replaceAll('environment="staging"', 'environment="production"'));
  assert.equal(quiet.length, 0, 'quiet request traffic is not an error-rate alert');
  const heartbeat = await query(rules[1].data[0].model.expr);
  assert.equal(Number(heartbeat[0].value[1]), 0, 'fresh heartbeat is healthy');
  const missing = await query(rules[1].data[0].model.expr.replaceAll('environment="staging"', 'environment="production"'));
  assert.equal(Number(missing[0].value[1]), 1, 'missing scheduler telemetry is unhealthy');

  const rangeEnd = Math.floor(now / 600000) * 600000;
  const spikeEnvironment = `${environment}-long-range`;
  const spike = await fetch(`${url.origin}/otlp/v1/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(logPayload({ service: 'phaseo-web-api', environment: spikeEnvironment }, [{ event_name: 'web.request', status_code: 503, actionable: true }], rangeEnd - 7 * 60000)) });
  assert.ok(spike.ok, await spike.text());
  for (const panel of dashboards()[0].panels.filter(panel => /^(Traffic|Failures) ·/.test(panel.title))) {
    const target = panel.targets.find(target => target.legendFormat === (panel.title.startsWith('Traffic') ? 'Web API' : 'Web API 5xx'));
    const expression = target.expr.replaceAll('$__auto', '10m').replaceAll('$environment', spikeEnvironment);
    const response = await fetch(`${url.origin}/loki/api/v1/query_range?${new URLSearchParams({ query: expression, start: String(BigInt(rangeEnd - 20 * 60000) * 1000000n), end: String(BigInt(rangeEnd) * 1000000n), step: '600' })}`);
    const data = await response.json();
    assert.equal(response.status, 200);
    const counted = data.data.result.flatMap(series => series.values).reduce((total, [, value]) => total + Number(value), 0);
    assert.equal(counted, 1, `${panel.title} must retain a spike between points when the step exceeds five minutes`);
  }

  const rankingEnvironment = `${environment}-ranking`;
  const rankingEvents = [
    ...Array.from({ length: 60 }, (_, index) => ({ event_name: 'web.request', method: 'GET', route: `/busy-${Math.floor(index / 5)}`, status_code: 200, duration_ms: 20 })),
    { event_name: 'web.request', method: 'GET', route: '/rare-failure', status_code: 503, actionable: true },
  ];
  for (let offset = 0; offset < rankingEvents.length; offset += 32) {
    const response = await fetch(`${url.origin}/otlp/v1/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(logPayload({ service: 'phaseo-web-api', environment: rankingEnvironment }, rankingEvents.slice(offset, offset + 32), now - 30000)) });
    assert.ok(response.ok, await response.text());
  }
  const routeHealth = dashboards().find(dashboard => dashboard.uid === 'phaseo-web').panels.find(panel => panel.title === 'Web API route health');
  const ranked = await query(routeHealth.targets.find(target => target.legendFormat === 'Failure %').expr.replaceAll('$__range', '1h').replaceAll('$environment', rankingEnvironment).replaceAll('${route:regex}', ''));
  assert.equal(ranked.find(series => series.metric.route === '/rare-failure').value[1], '100', 'a rare failing route must remain visible behind busy healthy routes');
  assert.ok(new Set(ranked.map(series => series.metric.route)).size <= 20);
});
