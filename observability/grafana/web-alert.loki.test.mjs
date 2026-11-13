import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertRules } from './definitions.mjs';

const origin = process.env.LOKI_TEST_URL;
test('web alerts reject isolated errors and require sustained API or website failures', { skip: !origin }, async () => {
  const url = new URL(origin);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Use an isolated local Loki only');
  const rule = alertRules({ lokiUid: 'local', environment: 'staging' }).find(rule => rule.uid.includes('web-errors'));
  assert.equal(rule.for, '5m');
  const prefix = `staging-${crypto.randomUUID()}`;
  const base = Date.now() - 30 * 60_000;
  const minute = 60_000;
  const push = async (scenario, { errors = 0, successes = 0, website = 0, at = base } = {}) => {
    const environment = `${prefix}-${scenario}`;
    const streams = [
      { stream: { service_name: 'phaseo-web-api', environment }, values: Array.from({ length: errors + successes }, (_, i) => [String(BigInt(at) * 1_000_000n + BigInt(i)), JSON.stringify({ environment, event_name: 'web.request', status_code: i < errors ? 503 : 200 })]) },
      { stream: { service_name: 'phaseo-web', environment }, values: Array.from({ length: website }, (_, i) => [String(BigInt(at) * 1_000_000n + BigInt(i)), JSON.stringify({ environment, event_name: 'web.server_error' })]) },
    ].filter(stream => stream.values.length);
    const response = await fetch(`${url.origin}/loki/api/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ streams }) });
    assert.equal(response.status, 204, await response.text());
  };
  const query = async (scenario, at = base + minute) => {
    const response = await fetch(`${url.origin}/loki/api/v1/query?${new URLSearchParams({ query: rule.data[0].model.expr.replaceAll('environment="staging"', `environment="${prefix}-${scenario}"`), time: String(BigInt(at) * 1_000_000n) })}`);
    const body = await response.text();
    assert.equal(response.status, 200, body);
    return Number(JSON.parse(body).data.result[0].value[1]);
  };
  assert.equal(await query('quiet'), 0);
  await push('isolated', { errors: 2 });
  assert.equal(await query('isolated'), 0, 'even a 100% failure rate needs repeated failures');
  await push('low-rate', { errors: 5, successes: 996 });
  assert.equal(await query('low-rate'), 0, 'five failures below 1% should not notify');
  await push('burst', { errors: 20 });
  assert.equal(await query('burst'), 20);
  assert.ok(await query('burst', base + 5 * minute) > 0);
  assert.equal(await query('burst', base + 6 * minute), 0, 'an isolated burst expires before completing five minutes pending');
  for (let i = 0; i <= 6; i++) {
    await push('sustained', { errors: 5, successes: 495, at: base + i * minute });
    await push('website', { website: 5, successes: 1000, at: base + i * minute });
  }
  for (let i = 1; i <= 6; i++) {
    assert.ok(await query('sustained', base + i * minute) >= 5, 'API failures at 1% remain qualifying throughout the pending period');
    assert.ok(await query('website', base + i * minute) >= 5, 'website exceptions have an independent threshold, not an API denominator');
  }
  assert.equal(await query('sustained', base + 12 * minute), 0, 'recovery clears the signal');
  assert.equal(await query('website', base + 12 * minute), 0);
});
