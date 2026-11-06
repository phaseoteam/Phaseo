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
  const request = (index, extra = {}) => ({ event_name: 'gateway.request', request_id: `fixture-${index}`, outcome: 'success', stream: true, duration_ms: 100, ttft_ms: 25, provider_ttft_ms: 15, ...extra });
  const fixtures = [
    ['phaseo-gateway', Array.from({ length: 20 }, (_, index) => request(index, index < 2 ? { outcome: 'error', actionable: true } : {}))],
    ['phaseo-gateway', [{ event_name: 'provider.attempt', provider: 'fixture', outcome: 'success', duration_ms: 80 }]],
    ['phaseo-web-api', [{ event_name: 'web.request', status_code: 200, duration_ms: 30 }]],
    ['phaseo-jobs', [{ event_name: 'job.heartbeat' }, { event_name: 'job.run', job: 'fixture', outcome: 'completed', duration_ms: 45 }]],
  ];
  for (const [service, events] of fixtures) {
    const response = await fetch(`${url.origin}/otlp/v1/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(logPayload({ service, environment: 'staging' }, events, now - 30000)) });
    assert.ok(response.ok, await response.text());
  }
  const query = async (expression, logQuery = false) => {
    const response = await fetch(`${url.origin}/loki/api/v1/${logQuery ? 'query_range' : 'query'}?${new URLSearchParams({ query: expression, limit: '1' })}`);
    const text = await response.text();
    assert.equal(response.status, 200, `${expression}\n${text}`);
    const result = JSON.parse(text);
    assert.equal(result.status, 'success');
    return result.data.result;
  };
  for (const dashboard of dashboards()) for (const panel of dashboard.panels) {
    await query(panel.targets[0].expr.replaceAll('$__auto', '5m').replaceAll('$environment', 'staging').replaceAll('${request:regex}', ''), panel.type === 'logs');
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
