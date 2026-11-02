import assert from 'node:assert/strict';
import test from 'node:test';
import { configFromEnv, configProblems, runSmoke, summarise } from './gateway-smoke.mjs';

const KEY = 'phaseo-test-secret-key';
const MANAGEMENT = 'phaseo-test-management-key';
const LOW = 'phaseo-test-low-credit-key';
const MODEL = 'openai/gpt-test-nano';

function config(overrides = {}) {
  return {
    ...configFromEnv({
      PHASEO_SMOKE_API_KEY: KEY, PHASEO_SMOKE_MANAGEMENT_KEY: MANAGEMENT, PHASEO_SMOKE_LOW_CREDIT_API_KEY: LOW,
      PHASEO_SMOKE_MODEL: MODEL, PHASEO_SMOKE_MAX_SPEND_USD: '0.01', PHASEO_SMOKE_BASE_URL: 'https://gateway.test/v1/',
    }, ['--paid']),
    recordDelayMs: 0,
    ...overrides,
  };
}

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A gateway that bills each generation `cost` nanos once its row is recorded. */
function gateway({ cost = 3000, chargeDelta = null, rowUsage = null, streamError = false, rowsVisibleAfter = 1 } = {}) {
  let balance = 5_000_000_000;
  const rows = new Map();
  const lookups = new Map();
  let next = 0;
  const calls = [];
  const fetcher = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const auth = init.headers.Authorization?.replace('Bearer ', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: pathname, auth, body });
    if (![KEY, MANAGEMENT, LOW].includes(auth)) return json(401, { error: { code: 'unauthorised' } });
    if (pathname === '/v1/generations') {
      const id = searchParams.get('id');
      lookups.set(id, (lookups.get(id) ?? 0) + 1);
      const row = rows.get(id);
      return row && lookups.get(id) > rowsVisibleAfter - 1 ? json(200, row) : json(404, { ok: false, error: 'not_found' });
    }
    if (pathname === '/v1/models') return json(200, { data: [{ id: MODEL }, { id: 'other/model' }] });
    if (pathname === '/v1/credits') return json(200, { ok: true, credits: { balance_nanos: balance } });
    if (pathname === '/v1/chat/completions') {
      if (!Array.isArray(body.messages)) return json(400, { error: { code: 'invalid_request', message: 'messages must be a list' } });
      if (auth === LOW) return json(402, { error: { code: 'insufficient_quota', message: 'add credits' } });
      const id = `gen-${++next}`;
      const usage = { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 };
      rows.set(id, {
        request_id: id, success: true, byok: false, cost_nanos: cost,
        usage_input_tokens: rowUsage?.input ?? 12, usage_output_tokens: rowUsage?.output ?? 2,
      });
      balance -= chargeDelta ?? cost;
      if (!body.stream) return json(200, { id, choices: [{ message: { role: 'assistant', content: 'OK' } }], usage });
      const chunks = streamError
        ? [{ id, error: { code: 'upstream_error', message: 'provider said something private' } }]
        : [{ id, choices: [{ delta: { content: 'OK' } }] }, { id, choices: [], usage }];
      const text = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
      return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return json(404, {});
  };
  return { fetcher, calls };
}

const outcomes = (results) => Object.fromEntries(results.map((r) => [r.check, r.outcome]));

test('a free run checks auth, discovery and rejections and spends nothing', async () => {
  const { fetcher, calls } = gateway();
  const results = await runSmoke(config({ paid: false }), { fetcher });
  assert.deepEqual(outcomes(results), {
    auth_rejects_invalid_key: 'pass', auth_accepts_key: 'pass', discovery: 'pass', invalid_request: 'pass',
    insufficient_credit: 'pass', buffered_request: 'skip', streamed_request: 'skip', usage_recorded: 'skip', billing_settled: 'skip',
  });
  assert.equal(calls.filter((c) => c.path === '/v1/chat/completions' && c.auth === KEY && Array.isArray(c.body.messages)).length, 0);
  assert.equal(results.find((r) => r.check === 'insufficient_credit').error_code, 'insufficient_quota');
});

test('a paid run asserts responses, recorded usage and the exact wallet charge', async () => {
  const { fetcher } = gateway({ rowsVisibleAfter: 3 });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.ok(results.every((r) => r.outcome === 'pass'), JSON.stringify(results));
  assert.deepEqual(results.find((r) => r.check === 'usage_recorded'), { check: 'usage_recorded', outcome: 'pass', requests: 2, spent_nanos: 6000 });
  assert.equal(results.find((r) => r.check === 'billing_settled').charged_nanos, 6000);
  assert.equal(results.find((r) => r.check === 'streamed_request').request_id, 'gen-2');
});

test('fails when the wallet moves by more than the recorded cost', async () => {
  const { fetcher } = gateway({ chargeDelta: 4000 });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.deepEqual(results.find((r) => r.check === 'billing_settled'), {
    check: 'billing_settled', outcome: 'fail', charged_nanos: 8000, spent_nanos: 6000, reason: 'balance_change_differs_from_recorded_cost',
  });
});

test('fails when recorded usage differs from what the response reported', async () => {
  const { fetcher } = gateway({ rowUsage: { input: 12, output: 3 } });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.equal(results.find((r) => r.check === 'usage_recorded').reason, 'usage_differs_from_response');
});

test('fails when the run costs more than its budget', async () => {
  const { fetcher } = gateway({ cost: 6_000_000 });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.equal(results.find((r) => r.check === 'usage_recorded').reason, 'budget_exceeded');
});

test('fails when a request row never appears', async () => {
  const { fetcher } = gateway({ rowsVisibleAfter: 99 });
  const results = await runSmoke(config({ recordAttempts: 3 }), { fetcher, wait: async () => {} });
  assert.equal(results.find((r) => r.check === 'usage_recorded').reason, 'request_row_missing');
});

test('reports a stream error by code without its message, and never logs secrets or content', async () => {
  const { fetcher } = gateway({ streamError: true });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.deepEqual(
    { outcome: results.find((r) => r.check === 'streamed_request').outcome, reason: results.find((r) => r.check === 'streamed_request').reason },
    { outcome: 'fail', reason: 'upstream_error' },
  );
  const output = JSON.stringify(results) + summarise(results);
  for (const secret of [KEY, MANAGEMENT, LOW, 'provider said something private', 'Reply with', 'add credits', 'messages must be a list']) {
    assert.ok(!output.includes(secret), `output contains ${secret}`);
  }
});

test('refuses paid runs without a budget, above the ceiling, or without credentials', () => {
  assert.deepEqual(configProblems(configFromEnv({}, [])), ['PHASEO_SMOKE_API_KEY is required', 'PHASEO_SMOKE_MODEL is required']);
  assert.deepEqual(configProblems(configFromEnv({ PHASEO_SMOKE_API_KEY: KEY, PHASEO_SMOKE_MODEL: MODEL }, ['--paid'])),
    ['--paid needs PHASEO_SMOKE_MAX_SPEND_USD above 0']);
  assert.deepEqual(configProblems(configFromEnv({ PHASEO_SMOKE_API_KEY: KEY, PHASEO_SMOKE_MODEL: MODEL, PHASEO_SMOKE_MAX_SPEND_USD: '5' }, ['--paid'])),
    ['PHASEO_SMOKE_MAX_SPEND_USD is capped at 1']);
  assert.deepEqual(configProblems(configFromEnv({ PHASEO_SMOKE_API_KEY: KEY, PHASEO_SMOKE_MODEL: MODEL }, [])), []);
});
