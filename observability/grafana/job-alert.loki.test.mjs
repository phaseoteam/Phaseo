import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logPayload } from '../../packages/shared/observability/index.mjs';
import { alertRules } from './definitions.mjs';

const origin = process.env.LOKI_TEST_URL;
test('job failures persist between scheduled runs and recover only after matching completion', { skip: !origin }, async () => {
  const url = new URL(origin);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Use an isolated local Loki only');
  const base = Date.now() - 2 * 60 * 60 * 1000;
  const minute = 60_000;
  const expression = alertRules({ lokiUid: 'local', environment: 'staging' }).find(rule => rule.uid.includes('jobs-failing')).data[0].model.expr;
  const prefix = `staging-${crypto.randomUUID()}`;
  const push = async (scenario, at, { service = 'phaseo-jobs', job = 'spend_limit_sweep', outcome = 'error', scheduled = at, release = 'before' } = {}) => {
    const environment = `${prefix}-${scenario}`;
    const payload = logPayload({ service, environment, release }, [{ event_name: 'job.run', job, outcome, scheduled_at: scheduled }], at);
    const record = payload.resourceLogs[0].scopeLogs[0].logRecords[0];
    // Isolate historical fixtures from other test streams' out-of-order ingestion limits.
    const response = await fetch(`${url.origin}/loki/api/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streams: [{ stream: { service_name: service, environment, service_version: release }, values: [[record.timeUnixNano, record.body.stringValue]] }] }) });
    assert.ok(response.ok, await response.text());
  };
  const query = async (scenario, at, expr = expression) => {
    const response = await fetch(`${url.origin}/loki/api/v1/query?${new URLSearchParams({ query: expr.replaceAll('environment="staging"', `environment="${prefix}-${scenario}"`), time: String(BigInt(at) * 1_000_000n) })}`);
    const body = await response.text();
    assert.equal(response.status, 200, body);
    return JSON.parse(body).data.result.map(series => Number(series.value[1]));
  };

  await push('quarter-hour', base);
  assert.deepEqual(await query('quarter-hour', base + 14 * minute), [1], '14 minutes of silence cannot resolve a 15-minute job');
  await push('quarter-hour', base + 15 * minute);
  assert.deepEqual(await query('quarter-hour', base + 29 * minute), [1], 'consecutive failed runs remain firing');
  await push('quarter-hour', base + 30 * minute, { outcome: 'skipped' });
  await push('quarter-hour', base + 31 * minute, { outcome: 'completed', job: 'unrelated' });
  await push('quarter-hour', base + 32 * minute, { outcome: 'completed', service: 'phaseo-web-api' });
  // An older scheduled run finishing late must not mask the more recent scheduled failure.
  await push('quarter-hour', base + 33 * minute, { outcome: 'completed', scheduled: base - minute });
  assert.deepEqual(await query('quarter-hour', base + 34 * minute), [1]);
  await push('quarter-hour', base + 45 * minute, { outcome: 'completed', release: 'after' });
  assert.deepEqual(await query('quarter-hour', base + 46 * minute), [0], 'a later completion across releases resolves');
  await push('quarter-hour', base + 60 * minute, { release: 'after' });
  assert.deepEqual(await query('quarter-hour', base + 61 * minute), [1], 'a regression after recovery fires again');

  await push('independent', base, { job: 'first' });
  await push('independent', base, { job: 'second' });
  await push('independent', base + minute, { job: 'first', outcome: 'completed' });
  assert.deepEqual(await query('independent', base + 2 * minute), [1], 'one job cannot resolve another failure');

  await push('daily', base - 30 * 60 * minute, { job: 'daily' });
  assert.deepEqual(await query('daily', base), [1], 'daily jobs remain failed across the next scheduled invocation');
  assert.deepEqual(await query('quiet', base), [], 'no observations produce no data, not a synthetic successful run');
});
