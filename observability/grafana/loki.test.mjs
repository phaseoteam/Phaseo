import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logPayload } from '../../packages/shared/observability/index.mjs';
import { dashboards, alertRules } from './definitions.mjs';

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
    ['phaseo-gateway', Array.from({ length: 20 }, (_, index) => request(index, index < 2 ? { outcome: 'error', actionable: true } : {}))],
    ['phaseo-gateway', [{ event_name: 'provider.attempt', provider: 'fixture', outcome: 'success', duration_ms: 80 }]],
    ['phaseo-web-api', [20, 40].map((duration_ms, index) => ({ event_name: 'web.request', ...correlation(index), status_code: 200, duration_ms }))],
    ['phaseo-jobs', [{ event_name: 'job.heartbeat' }, ...[45, 145].map((duration_ms, index) => ({ event_name: 'job.run', ...correlation(index), job: 'fixture', outcome: 'completed', duration_ms })), { event_name: 'job.run', ...correlation(2), job: 'other', outcome: 'completed', duration_ms: 75 }]],
  ];
  for (const [service, events] of fixtures) {
    const response = await fetch(`${url.origin}/otlp/v1/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(logPayload({ service, environment }, events, now - 30000)) });
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
  for (const dashboard of dashboards()) for (const panel of dashboard.panels) {
    const result = await query(panel.targets[0].expr.replaceAll('$__auto', '5m').replaceAll('$environment', 'staging').replaceAll('${request:regex}', ''), panel.type === 'logs');
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
});
