import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitLogs, logPayload, safeError, sampled, sendOtlp, telemetryConfig, telemetryEndpoint, traceContext } from './index.mjs';

const config = { enabled: true, environment: 'staging', service: 'phaseo-gateway', endpoint: 'https://otlp-gateway-prod-eu-west-0.grafana.net/otlp', authorization: 'Basic dGVzdA==' };

test('collection is opt-in, environment gated and restricted to credential-safe Grafana endpoints', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return new Response('{}'); };
  for (const change of [{ enabled: false }, { environment: 'preview' }, { authorization: '' }, { endpoint: 'https://example.com/otlp' }, { endpoint: 'https://otlp-gateway-prod-eu-west-0.grafana.net/otlp?secret=1' }]) {
    assert.equal((await emitLogs({ ...config, ...change }, [{ event_name: 'gateway.request' }], fetcher)).state, 'disabled');
  }
  assert.equal(calls, 0);
  assert.equal(telemetryConfig({ ENV: 'prod' }, 'gateway').environment, 'production');
  assert.equal(telemetryEndpoint(config, 'traces'), `${config.endpoint}/v1/traces`);
});

test('log records contain only bounded allowlisted fields and valid trace context', () => {
  const payload = logPayload(config, [{ event_name: 'gateway.request', request_id: 'request', prompt: 'private', authorization: 'secret', reason: 'Bearer private', duration_ms: NaN, trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) }], 1000);
  const record = payload.resourceLogs[0].scopeLogs[0].logRecords[0];
  const body = JSON.parse(record.body.stringValue);
  assert.equal(body.prompt, undefined);
  assert.equal(body.authorization, undefined);
  assert.equal(body.duration_ms, undefined);
  assert.equal(body.reason, '[redacted]');
  assert.equal(record.traceId, 'a'.repeat(32));
  assert.equal(record.timeUnixNano, '1000000000');
});

test('delivery reports partial rejection, caps remote responses and fails open without retries', async () => {
  assert.deepEqual(await sendOtlp(config, 'logs', {}, async () => new Response('{"partialSuccess":{"rejectedLogRecords":"1"}}')), { state: 'failed', reason: 'partial_rejection' });
  assert.equal((await sendOtlp(config, 'logs', {}, async () => new Response('x'.repeat(5000)))).reason, 'response_limit');
  let calls = 0;
  const result = await sendOtlp(config, 'logs', {}, async () => { calls++; throw new Error('secret'); });
  assert.equal(calls, 1);
  assert.equal(result.state, 'failed');
  assert.equal((await sendOtlp(config, 'logs', {}, async () => new Response('{}'))).state, 'delivered');
});

test('trace parsing and sampling are stable and do not accept malformed identities', () => {
  assert.equal(traceContext(`00-${'0'.repeat(32)}-${'b'.repeat(16)}-01`), null);
  assert.equal(traceContext(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`).traceFlags, 1);
  assert.equal(sampled('request', 0), false);
  assert.equal(sampled('request', 1), true);
  assert.equal(sampled('request', .05), sampled('request', .05));
});

test('server diagnostics omit error messages and URL query strings', () => {
  const error = new Error('private customer prompt');
  error.stack = 'Error: private customer prompt\n at fn (https://example.com/private?token=secret:1:1)';
  const diagnostic = JSON.stringify(safeError(error));
  assert.ok(!diagnostic.includes('private customer prompt'));
  assert.ok(!diagnostic.includes('token='));
});
