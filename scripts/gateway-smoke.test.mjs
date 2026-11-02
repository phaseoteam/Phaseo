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

// The shape of GET /v1/pricing/models: one entry per provider, model, endpoint and service tier.
const meter = (name, price, extra = {}) => ({ meter: name, unit: 'token', unit_size: 1, price_per_unit: price, currency: 'USD', conditions: [], ...extra });
// $1 / $2 per million tokens: one request costs at most 256 * 1000 + 16 * 2000 = 288,000 nanos.
const PRICED = [meter('input_text_tokens', '0.000001'), meter('output_text_tokens', '0.000002')];
const pricingModels = (meters) => [
  { provider: 'cheap', model: MODEL, endpoint: 'text.generate', meters },
  // Another provider's dearer chat row, and price rows that a chat request cannot use.
  { provider: 'dear', model: MODEL, endpoint: 'text.generate', meters: [meter('input_text_tokens', '0.0000005'), meter('output_text_tokens', '0.0000015')] },
  { provider: 'cheap', model: MODEL, endpoint: 'image.generate', meters: [meter('output_image', '5', { unit: 'image' })] },
  { provider: 'cheap', model: 'other/model', endpoint: 'text.generate', meters: [meter('requests', '9', { unit: 'request' })] },
];

/** A gateway that bills each generation `cost` nanos once its row is recorded. */
function gateway({ cost = 3000, chargeDelta = null, rowUsage = null, streamError = false, rowsVisibleAfter = 1, meters = PRICED, chargeInvalid = 0 } = {}) {
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
    if (pathname === '/v1/pricing/models') return json(200, { ok: true, models: pricingModels(meters) });
    if (pathname === '/v1/credits') return json(200, { ok: true, credits: { balance_nanos: balance } });
    if (pathname === '/v1/chat/completions') {
      if (!Array.isArray(body.messages)) {
        balance -= chargeInvalid;
        return json(400, { error: { code: 'invalid_request', message: 'messages must be a list' } });
      }
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
  assert.deepEqual(results.find((r) => r.check === 'usage_recorded'), { check: 'usage_recorded', outcome: 'pass', requests: 2, spent_nanos: 6000, cost_bound_nanos: 288_000 });
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

const paidSends = (calls) => calls.filter((c) => c.path === '/v1/chat/completions' && c.auth === KEY && Array.isArray(c.body.messages)).length;

test('sends no paid request when the published prices could exceed the budget', async () => {
  const { fetcher, calls } = gateway();
  // Two requests may cost up to 576,000 nanos.
  const results = await runSmoke(config({ maxSpendNanos: 500_000 }), { fetcher, wait: async () => {} });
  assert.equal(results.find((r) => r.check === 'buffered_request').cost_bound_nanos, 288_000);
  assert.deepEqual(results.filter((r) => r.outcome === 'fail').map((r) => `${r.check}:${r.reason}`), [
    'buffered_request:budget_below_cost_bound', 'streamed_request:budget_below_cost_bound',
    'usage_recorded:budget_below_cost_bound', 'billing_settled:budget_below_cost_bound',
  ]);
  assert.equal(paidSends(calls), 0);
});

test('bounds a request by every chat meter, including per-request fees and the dearest conditional rule', async () => {
  const { fetcher } = gateway({ meters: [...PRICED, meter('requests', '0.001', { unit: 'request' }),
    meter('input_text_tokens', '0.000003', { conditions: [{ path: 'usage.input_text_tokens', op: 'gt', value: 200000 }] })] });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  // 256 * 3000 + 16 * 2000 + 1,000,000 nanos.
  assert.equal(results.find((r) => r.check === 'usage_recorded').cost_bound_nanos, 1_800_000);
});

test('sends no paid request when a price cannot be bounded', async () => {
  for (const meters of [[...PRICED, meter('deepinfra_cost_usd', '1', { unit: 'USD' })], [meter('input_text_tokens', '0.000001', { currency: 'EUR' })], []]) {
    const { fetcher, calls } = gateway({ meters });
    const results = await runSmoke(config(), { fetcher, wait: async () => {} });
    assert.equal(results.find((r) => r.check === 'buffered_request').reason, 'cost_bound_unknown', JSON.stringify(meters));
    assert.equal(paidSends(calls), 0);
  }
});

test('fails when a request costs more than its published-price bound', async () => {
  const { fetcher } = gateway({ cost: 300_000 });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.equal(results.find((r) => r.check === 'usage_recorded').reason, 'cost_above_bound');
});

test('fails when a rejected request moved the wallet', async () => {
  const { fetcher } = gateway({ chargeInvalid: 1000 });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.equal(results.find((r) => r.check === 'invalid_request').outcome, 'pass');
  assert.deepEqual(results.find((r) => r.check === 'billing_settled'), {
    check: 'billing_settled', outcome: 'fail', charged_nanos: 7000, spent_nanos: 6000, reason: 'balance_change_differs_from_recorded_cost',
  });
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
