import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  batchSettlementProblem, chargedRowProblem, configFromEnv, configProblems, failedRowProblem, psqlDatabase, readOnlyScript, runSmoke, summarise,
} from './gateway-smoke.mjs';

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
function gateway({ cost = 3000, chargeDelta = null, rowUsage = null, streamError = false, rowsVisibleAfter = 1, meters = PRICED, chargeInvalid = 0, lowCreditFunded = false } = {}) {
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
      if (auth === LOW && !lowCreditFunded) return json(402, { error: { code: 'insufficient_quota', message: 'add credits' } });
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
// Valid generations sent with either key: each could be charged.
const paidSends = (calls) => calls.filter((c) => c.path === '/v1/chat/completions' && Array.isArray(c.body.messages)).length;

test('a free run checks auth, discovery and rejections and sends no generation', async () => {
  const { fetcher, calls } = gateway({ lowCreditFunded: true });
  const results = await runSmoke(config({ paid: false }), { fetcher });
  assert.deepEqual(outcomes(results), {
    auth_rejects_invalid_key: 'pass', auth_accepts_key: 'pass', discovery: 'pass', invalid_request: 'pass',
    insufficient_credit: 'skip', buffered_request: 'skip', streamed_request: 'skip', usage_recorded: 'skip',
    abandoned_stream: 'skip', upstream_failure_not_charged: 'skip', batch_hold_counts_choices: 'skip', batch_settlement: 'skip',
    charges_consistent: 'skip', billing_settled: 'skip',
  });
  assert.equal(paidSends(calls), 0);
});

test('a paid run asserts responses, recorded usage and the exact wallet charge', async () => {
  const { fetcher } = gateway({ rowsVisibleAfter: 3 });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  // Without production read access the charging-path cases are skipped and never sent.
  assert.ok(results.every((r) => r.outcome === 'pass' || (r.outcome === 'skip' && r.reason === 'PHASEO_SMOKE_DATABASE_URL not set')), JSON.stringify(results));
  assert.equal(results.find((r) => r.check === 'insufficient_credit').error_code, 'insufficient_quota');
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

test('sends no generation when the published prices could exceed the budget', async () => {
  const { fetcher, calls } = gateway({ lowCreditFunded: true });
  // Three requests, counting the zero-balance probe, may cost up to 864,000 nanos.
  const results = await runSmoke(config({ maxSpendNanos: 700_000 }), { fetcher, wait: async () => {} });
  assert.equal(results.find((r) => r.check === 'buffered_request').cost_bound_nanos, 288_000);
  assert.deepEqual(results.filter((r) => r.outcome === 'fail').map((r) => `${r.check}:${r.reason}`), [
    'insufficient_credit:budget_below_cost_bound', 'buffered_request:budget_below_cost_bound', 'streamed_request:budget_below_cost_bound',
    'usage_recorded:budget_below_cost_bound', 'abandoned_stream:budget_below_cost_bound', 'upstream_failure_not_charged:budget_below_cost_bound',
    'batch_hold_counts_choices:budget_below_cost_bound', 'batch_settlement:budget_below_cost_bound', 'charges_consistent:budget_below_cost_bound',
    'billing_settled:budget_below_cost_bound',
  ]);
  assert.equal(paidSends(calls), 0);

  // Without the zero-balance key, the same budget covers the two requests.
  const unprobed = gateway();
  const passed = await runSmoke(config({ maxSpendNanos: 700_000, lowCreditApiKey: '' }), { fetcher: unprobed.fetcher, wait: async () => {} });
  assert.equal(outcomes(passed).buffered_request, 'pass');
  assert.equal(paidSends(unprobed.calls), 2);
});

test('fails, within the budget, when the zero-balance key is unexpectedly funded', async () => {
  const { fetcher, calls } = gateway({ lowCreditFunded: true });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.deepEqual(results.find((r) => r.check === 'insufficient_credit'), {
    check: 'insufficient_credit', outcome: 'fail', status: 200, duration_ms: results.find((r) => r.check === 'insufficient_credit').duration_ms,
    error_code: null, reason: 'expected_402',
  });
  assert.equal(paidSends(calls), 3);
});

test('bounds a time-of-day price by its dearest window', async () => {
  // $0.001 a request, $0.10 a request in a peak window: 288,000 + 100,000,000 nanos, over the $0.01 budget.
  const { fetcher, calls } = gateway({ meters: [...PRICED, meter('requests', '0.001', { unit: 'request',
    time_windows: [{ label: 'peak', timezone: 'UTC', start_time: '01:00', end_time: '04:00', price_per_unit: 0.1 }, { label: 'unpriced', timezone: 'UTC', start_time: '05:00', end_time: '06:00' }] })] });
  const results = await runSmoke(config(), { fetcher, wait: async () => {} });
  assert.deepEqual(
    { reason: results.find((r) => r.check === 'buffered_request').reason, bound: results.find((r) => r.check === 'buffered_request').cost_bound_nanos },
    { reason: 'budget_below_cost_bound', bound: 100_288_000 },
  );
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
  for (const meters of [[...PRICED, meter('deepinfra_cost_usd', '1', { unit: 'USD' })], [meter('input_text_tokens', '0.000001', { currency: 'EUR' })], [],
    [meter('input_text_tokens', '0.000001', { time_windows: [{ label: 'peak', timezone: 'UTC', start_time: '01:00', end_time: '04:00', price_per_unit: 'n/a' }] })]]) {
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

// --- Charging paths (#3547 with #3633, #3536), asserted on production rows ---

const WORKSPACE = '00000000-0000-4000-8000-000000000001';
const BATCH = 'batch_01SMOKETEST';

/**
 * A gateway plus the production rows it writes. Every knob breaks one billing rule, so each test
 * proves the check that should catch it does.
 */
function production({
  failureCharged = false, failureOrigin = 'upstream', failureSucceeds = false, abandonedStepped = true, abandonedStepsShort = false,
  batchOutputBound = 32, batchOverdraft = 0, batchFinishesAfter = 1, batchLedger = true, factCostOff = false,
} = {}) {
  let balance = 5_000_000_000;
  const rows = new Map(); // request_id -> production row (requests query shape)
  const generationRows = new Map(); // request_id -> /v1/generations row
  let next = 0;
  let batchReads = 0;
  let batch = null;
  const calls = [];
  const charge = (id, { stream, cost, adjustments = [] }) => {
    rows.set(id, {
      request_id: id, success: true, stream, byok: false, error_code: null, cost_nanos: cost, expected_cost_nanos: null,
      charge_nanos: cost, charge_status: 'applied', charge_final: true, fact_found: true, fact_success: true,
      fact_cost_nanos: factCostOff ? cost + 1 : cost, adjustments,
    });
    balance -= cost;
  };
  const sse = (chunks, { done = true } = {}) => new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : ''),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
  const fetcher = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const auth = init.headers.Authorization?.replace('Bearer ', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: pathname, auth, body });
    if (![KEY, MANAGEMENT, LOW].includes(auth)) return json(401, { error: { code: 'unauthorised' } });
    if (pathname === '/v1/generations') {
      const row = generationRows.get(searchParams.get('id'));
      return row ? json(200, row) : json(404, { ok: false, error: 'not_found' });
    }
    if (pathname === '/v1/models') return json(200, { data: [{ id: MODEL }] });
    if (pathname === '/v1/pricing/models') return json(200, { ok: true, models: pricingModels(PRICED) });
    if (pathname === '/v1/credits') return json(200, { ok: true, credits: { balance_nanos: balance } });
    if (pathname === '/v1/batches' && init.method === 'POST') {
      batch = {
        status: 'validating', billed: false, cost_nanos: null, request_count: body.requests.length, output_token_bound: batchOutputBound,
        reservation_status: 'held', hold_nanos: 400_000, settled_amount_nanos: null, captured_nanos: null, released_nanos: null,
        overdraft_nanos: null, ledger_amount_nanos: null, ledger_before_balance_nanos: null, ledger_before_reserved_nanos: null,
      };
      return json(200, { id: BATCH, status: 'validating' });
    }
    if (pathname === `/v1/batches/${BATCH}`) {
      if (++batchReads >= batchFinishesAfter && !batch.billed) {
        // The gateway finalizes the batch while serving the read: gateway_wallet_settle_once.
        const settled = 9000;
        Object.assign(batch, {
          status: 'completed', billed: true, cost_nanos: settled, reservation_status: 'captured', settled_amount_nanos: settled,
          captured_nanos: settled, released_nanos: batch.hold_nanos - settled, overdraft_nanos: batchOverdraft,
          ledger_amount_nanos: batchLedger ? -settled : null, ledger_before_balance_nanos: balance, ledger_before_reserved_nanos: batch.hold_nanos,
        });
        balance -= settled;
      }
      return json(200, { id: BATCH, status: batch.status, billing: { billed: batch.billed } });
    }
    if (pathname === '/v1/chat/completions') {
      if (!Array.isArray(body.messages)) return json(400, { error: { code: 'invalid_request' } });
      if (auth === LOW) return json(402, { error: { code: 'insufficient_quota' } });
      const id = `G-${++next}`;
      const usage = { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 };
      if (Array.isArray(body.messages[0].content)) {
        // The failure probe: the provider cannot fetch the image.
        if (failureSucceeds) {
          charge(id, { stream: false, cost: 3000 });
          return json(200, { id, choices: [{ message: { content: 'OK' } }], usage });
        }
        rows.set(id, {
          request_id: id, success: false, stream: false, byok: false, error_code: failureOrigin === 'upstream' ? 'upstream:upstream_error' : 'user:invalid_request',
          cost_nanos: failureCharged ? 1000 : null, expected_cost_nanos: null, charge_nanos: failureCharged ? 1000 : null,
          charge_status: failureCharged ? 'applied' : null, charge_final: failureCharged || null, fact_found: true, fact_success: false,
          fact_cost_nanos: null, adjustments: [],
        });
        if (failureCharged) balance -= 1000;
        return json(400, { generation_id: id, error: 'upstream_error', error_origin: failureOrigin, description: 'Failed to download file' },
          { 'x-gateway-error-origin': failureOrigin });
      }
      if (body.max_tokens === 64) {
        // The abandoned stream: charged at a drain checkpoint, then settled by the final bill.
        const adjustments = abandonedStepped ? [{ amount_nanos: -5000, final: false }, { amount_nanos: abandonedStepsShort ? -1000 : -2000, final: true }] : [];
        charge(id, { stream: true, cost: 7000, adjustments });
        return sse([{ id, choices: [{ delta: { content: '1 2 3' } }] }], { done: false });
      }
      charge(id, { stream: Boolean(body.stream), cost: 3000 });
      generationRows.set(id, { request_id: id, success: true, byok: false, cost_nanos: 3000, usage_input_tokens: 12, usage_output_tokens: 2 });
      if (!body.stream) return json(200, { id, choices: [{ message: { role: 'assistant', content: 'OK' } }], usage });
      return sse([{ id, choices: [{ delta: { content: 'OK' } }] }, { id, choices: [], usage }]);
    }
    return json(404, {});
  };
  const db = async (name, variables) => {
    assert.equal(variables.workspace_id, WORKSPACE);
    if (name === 'requests') return variables.request_ids.split(',').map((id) => rows.get(id)).filter(Boolean);
    if (name === 'batch') return variables.batch_id === BATCH && batch ? [{ ...batch }] : [];
    throw new Error(`unknown query ${name}`);
  };
  return { fetcher, db, calls };
}

const productionConfig = (overrides = {}) => config({
  databaseUrl: 'postgres://smoke_reader:pw@db.test:5432/postgres', workspaceId: WORKSPACE, batchPollMs: 0, ...overrides,
});
const run = (world, overrides) => runSmoke(productionConfig(overrides), { fetcher: world.fetcher, db: world.db, wait: async () => {} });
const result = (results, id) => results.find((r) => r.check === id);

test('a paid run with production read access covers every charging path in one request each', async () => {
  const world = production();
  const results = await run(world);
  assert.ok(results.every((r) => r.outcome === 'pass'), JSON.stringify(results.filter((r) => r.outcome !== 'pass')));
  // the zero-balance probe, buffered, streamed, abandoned and the failure probe; plus one batch row.
  assert.equal(paidSends(world.calls), 5);
  assert.equal(world.calls.filter((c) => c.path === '/v1/batches').length, 1);
  assert.equal(world.calls.find((c) => c.path === '/v1/batches').body.requests[0].body.n, 2);
  assert.deepEqual(result(results, 'abandoned_stream'), { check: 'abandoned_stream', outcome: 'pass', request_id: 'G-3', cost_nanos: 7000, stepped: true });
  // 2 generations at 3000, the abandoned stream at 7000 and the batch at 9000; the failure moved nothing.
  assert.equal(result(results, 'billing_settled').charged_nanos, 22_000);
});

test('fails when a failed upstream call is charged', async () => {
  const results = await run(production({ failureCharged: true }));
  assert.equal(result(results, 'upstream_failure_not_charged').reason, 'failed_request_costed');
  assert.equal(result(results, 'billing_settled').reason, 'balance_change_differs_from_recorded_cost');
});

test('fails when the failure probe never reached the provider, or succeeded and was billed', async () => {
  assert.equal(result(await run(production({ failureOrigin: 'gateway' })), 'upstream_failure_not_charged').reason, 'failure_not_upstream');
  const succeeded = await run(production({ failureSucceeds: true }));
  assert.equal(result(succeeded, 'upstream_failure_not_charged').reason, 'failure_probe_succeeded');
  // Its charge is still accounted for, so the wallet check does not blame another request.
  assert.equal(result(succeeded, 'billing_settled').outcome, 'pass');
});

test('fails when an abandoned stream\'s stepped charges do not add up to its final charge', async () => {
  const results = await run(production({ abandonedStepsShort: true }));
  assert.equal(result(results, 'abandoned_stream').reason, 'adjustments_differ_from_charge');
  assert.equal(result(await run(production({ abandonedStepped: false })), 'abandoned_stream').outcome, 'pass');
});

test('fails when a batch hold ignores n, or its settlement and ledger disagree', async () => {
  assert.equal(result(await run(production({ batchOutputBound: 16 })), 'batch_hold_counts_choices').reason, 'hold_ignores_choice_count');
  assert.equal(result(await run(production({ batchOverdraft: 5 })), 'batch_settlement').reason, 'overdraft_wrong');
  assert.equal(result(await run(production({ batchLedger: false })), 'batch_settlement').reason, 'ledger_differs_from_settlement');
});

test('fails when the analytics fact disagrees with the charge', async () => {
  assert.equal(result(await run(production({ factCostOff: true })), 'charges_consistent').reason, 'fact_cost_differs');
});

test('reports an unfinished batch as pending, and verifies it later without spending', async () => {
  const world = production({ batchFinishesAfter: 99 });
  const results = await run(world, { batchWaitMs: 0 });
  assert.deepEqual(result(results, 'batch_settlement'), { check: 'batch_settlement', outcome: 'pending', batch_id: BATCH, reason: 'batch_not_finished' });
  // The unsettled batch moved no balance, so the wallet still reconciles.
  assert.equal(result(results, 'billing_settled').outcome, 'pass');
  assert.match(summarise(results), /Run the workflow again with `batch_id`/);

  const sends = world.calls.length;
  const later = await runSmoke({ ...productionConfig(), paid: false, batchId: BATCH }, { fetcher: world.fetcher, db: world.db, wait: async () => {} });
  assert.deepEqual(later.map((r) => r.check), ['batch_settlement']);
  assert.equal(world.calls.slice(sends).filter((c) => c.body).length, 0, 'verify-only sends no request body');
});

test('budgets the charging-path requests before sending anything', async () => {
  const world = production();
  // The zero-balance probe and 2 chats (288,000 each), the abandoned stream (256 * 1000 + 64 * 2000 = 384,000),
  // the failure probe (288,000) and the 2-choice batch (256 * 1000 + 32 * 2000 = 320,000): 1,856,000.
  const results = await run(world, { maxSpendNanos: 1_800_000 });
  assert.equal(result(results, 'abandoned_stream').planned_bound_nanos, 1_856_000);
  assert.equal(paidSends(world.calls), 0);
  assert.equal(world.calls.filter((c) => c.path === '/v1/batches').length, 0);
});

test('row rules: pure checks on production row shapes', () => {
  const good = {
    request_id: 'G-1', success: true, stream: true, byok: false, cost_nanos: 100, expected_cost_nanos: null, charge_nanos: 100,
    charge_status: 'applied', charge_final: true, fact_found: true, fact_success: true, fact_cost_nanos: 100, adjustments: [],
  };
  assert.equal(chargedRowProblem(good, { boundNanos: 100, stream: true }), null);
  assert.equal(chargedRowProblem({ ...good, charge_final: false }), 'charge_not_settled');
  assert.equal(chargedRowProblem({ ...good, adjustments: [{ amount_nanos: -100, final: false }] }), 'stepped_charge_not_final');
  assert.equal(chargedRowProblem({ ...good, expected_cost_nanos: 120 }), 'expected_cost_differs');
  const failed = { ...good, success: false, error_code: 'upstream:upstream_error', cost_nanos: null, charge_nanos: null, fact_success: false, fact_cost_nanos: null };
  assert.equal(failedRowProblem(failed), null);
  assert.equal(failedRowProblem({ ...failed, adjustments: [{ amount_nanos: -1, final: true }] }), 'failed_request_in_ledger');
  // A real settlement, from a production batch on 10 Nov: hold 5,808,000, settled 82,000.
  const settled = {
    request_count: 1, output_token_bound: 1024, reservation_status: 'captured', hold_nanos: 5_808_000, settled_amount_nanos: 82_000, cost_nanos: 82_000,
    captured_nanos: 82_000, released_nanos: 5_726_000, overdraft_nanos: 0, ledger_amount_nanos: -82_000,
    ledger_before_balance_nanos: 111_964_263_667_006, ledger_before_reserved_nanos: 315_808_000,
  };
  assert.equal(batchSettlementProblem(settled), null);
  // An overage: actual 7,000,000 against the 5,808,000 hold with 1,000,000 free, so 192,000 overdraft.
  const over = { ...settled, settled_amount_nanos: 7_000_000, cost_nanos: 7_000_000, captured_nanos: 5_808_000, released_nanos: 0,
    ledger_amount_nanos: -7_000_000, ledger_before_balance_nanos: 6_808_000, ledger_before_reserved_nanos: 5_808_000 };
  assert.equal(batchSettlementProblem({ ...over, overdraft_nanos: 192_000 }), 'actual_above_hold');
  assert.equal(batchSettlementProblem({ ...over, overdraft_nanos: 0 }), 'overdraft_wrong');
});

test('production reads run read-only through psql, with the password kept out of the arguments', async () => {
  assert.match(readOnlyScript('select 1'), /^begin read only;\nset local statement_timeout = '10s';/);
  const spawned = [];
  const spawnProcess = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    let script = '';
    child.stdin.on('data', (chunk) => { script += chunk; });
    child.stdin.on('end', () => {
      spawned.push({ command, args, env: options.env, script });
      child.stdout.end('[{"request_id":"G-1"}]\n');
      setImmediate(() => child.emit('close', 0));
    });
    return child;
  };
  const db = psqlDatabase('postgres://smoke_reader:s%40cret@db.example.com:6543/postgres?sslmode=verify-full', { spawnProcess });
  assert.deepEqual(await db('requests', { workspace_id: WORKSPACE, request_ids: 'G-1,G-2' }), [{ request_id: 'G-1' }]);
  const [{ command, args, env, script }] = spawned;
  assert.equal(command, 'psql');
  assert.ok(!args.join(' ').includes('s@cret') && !args.join(' ').includes('smoke_reader'));
  assert.deepEqual([env.PGHOST, env.PGPORT, env.PGUSER, env.PGPASSWORD, env.PGSSLMODE], ['db.example.com', '6543', 'smoke_reader', 's@cret', 'verify-full']);
  assert.ok(args.includes('request_ids=G-1,G-2'));
  assert.match(script, /begin read only;[\s\S]*:'request_ids'[\s\S]*commit;/);
  // A value psql could misread is refused before anything runs.
  await assert.rejects(db('requests', { workspace_id: WORKSPACE, request_ids: "G-1'; drop table x; --" }), /unsafe_query_variable_request_ids/);
});

test('refuses a database without the smoke workspace, and a malformed or paid batch verification', () => {
  const base = { PHASEO_SMOKE_API_KEY: KEY, PHASEO_SMOKE_MODEL: MODEL };
  assert.deepEqual(configProblems(configFromEnv({ ...base, PHASEO_SMOKE_DATABASE_URL: 'postgres://x' }, [])),
    ['PHASEO_SMOKE_DATABASE_URL needs PHASEO_SMOKE_WORKSPACE_ID (the smoke workspace UUID)']);
  assert.deepEqual(configProblems(configFromEnv({ PHASEO_SMOKE_API_KEY: KEY }, ['--batch-id=nope'])),
    ['--batch-id must be a Phaseo batch ID (batch_…)', '--batch-id needs PHASEO_SMOKE_DATABASE_URL']);
  assert.deepEqual(configProblems(configFromEnv({ ...base, PHASEO_SMOKE_MAX_SPEND_USD: '0.01', PHASEO_SMOKE_DATABASE_URL: 'postgres://x', PHASEO_SMOKE_WORKSPACE_ID: WORKSPACE }, ['--paid', `--batch-id=${BATCH}`])),
    ['--batch-id only verifies an earlier batch; do not combine it with --paid']);
});
