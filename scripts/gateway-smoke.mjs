// Authenticated gateway smoke check for after deployments and provider changes.
// See gateway-smoke.md. Logs check outcomes, statuses, request IDs and error codes only:
// never credentials, prompts or response bodies.
import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const USER_AGENT = 'Phaseo-Gateway-Smoke/1.0';
// Guards against a mistyped budget; the smoke key's own spend limit is the real backstop.
const MAX_SPEND_CEILING_USD = 1;
const PROMPT = 'Reply with the single word OK.';
const MAX_OUTPUT_TOKENS = 16;
// The abandoned stream asks for more output, so it is still generating when the client leaves.
const ABANDON_PROMPT = 'Count from 1 to 60, separated by spaces.';
const ABANDON_OUTPUT_TOKENS = 64;
// The batch row asks for two choices: its hold must count both (#3633).
const BATCH_OUTPUT_COUNT = 2;
// A host under .invalid never resolves (RFC 6761), so the provider fails to fetch the image.
const FAILURE_IMAGE_URL = 'https://gateway-smoke.invalid/missing.png';
// Generous for the prompt plus chat formatting; usage_recorded fails if a request costs more than the bound.
const PROMPT_TOKEN_BOUND = 256;
const PROMPT_TEXT_BOUND = 1024;
const TERMINAL_BATCH_STATUSES = new Set(['completed', 'failed', 'expired', 'cancelled', 'canceled', 'ended']);

// Units of each meter one smoke request can use: a short text chat with no tools or media.
function meterUnits(meter, outputUnits) {
  if (meter === 'requests') return 1;
  if (/^output_(text_|reasoning_)?tokens$/.test(meter)) return outputUnits;
  if (meter === 'total_tokens') return PROMPT_TOKEN_BOUND + outputUnits;
  if (/^(input_(text_)?tokens|implicit_cached_input_text_tokens|cached_(read|write)_text_tokens(_\w+)?)$/.test(meter)) return PROMPT_TOKEN_BOUND;
  if (meter === 'input_characters' || meter === 'input_text_bytes') return PROMPT_TEXT_BOUND;
  if (/^((input|output|cached_read|cached_write)_(image|audio|video)|native_web_)/.test(meter)) return 0;
  return null;
}

/**
 * Most one smoke request can cost, from `GET /v1/pricing/models`: every billable meter of every
 * active Chat price row for the model, across providers, service tiers, conditional rules and
 * time-of-day prices. `outputTokens` is the request's cap and `outputCount` its choices (`n`).
 * Null when there are no rows or a price cannot be bounded.
 */
export function requestCostBoundNanos(pricingModels, modelId, { outputTokens = MAX_OUTPUT_TOKENS, outputCount = 1 } = {}) {
  const offers = (Array.isArray(pricingModels) ? pricingModels : [])
    .filter((entry) => entry?.model === modelId && entry.endpoint === 'text.generate');
  if (!offers.length) return null;
  let bound = 0;
  for (const offer of offers) {
    const meters = Array.isArray(offer.meters) ? offer.meters : [];
    if (!meters.length) return null;
    // Conditional rules repeat a meter; the dearest one bounds it.
    const rates = new Map();
    for (const price of meters) {
      const units = meterUnits(price?.meter, outputTokens * outputCount);
      if (units === null || price.currency !== 'USD') return null;
      // A matching time window replaces the base price (pipeline/pricing/engine.ts), and a window
      // without a price keeps it. The bound takes the dearest, whatever time the request runs.
      const windows = Array.isArray(price.time_windows) ? price.time_windows : [];
      const prices = [price.price_per_unit, ...windows.map((window) => window?.price_per_unit).filter((p) => p != null)];
      for (const perUnit of prices.map((p) => Number(p) / Number(price.unit_size))) {
        if (!Number.isFinite(perUnit) || perUnit < 0) return null;
        rates.set(price.meter, Math.max(rates.get(price.meter) ?? 0, units * perUnit));
      }
    }
    bound = Math.max(bound, [...rates.values()].reduce((sum, cost) => sum + cost, 0));
  }
  return Math.ceil(bound * 1e9);
}

export function configFromEnv(env = process.env, argv = process.argv.slice(2)) {
  const maxSpendUsd = Number(env.PHASEO_SMOKE_MAX_SPEND_USD ?? 0);
  const batchWaitMinutes = Number(env.PHASEO_SMOKE_BATCH_WAIT_MINUTES || 20);
  const model = env.PHASEO_SMOKE_MODEL ?? '';
  const batchIdArg = argv.find((arg) => arg.startsWith('--batch-id='));
  return {
    baseUrl: (env.PHASEO_SMOKE_BASE_URL || 'https://api.phaseo.app/v1').replace(/\/+$/, ''),
    apiKey: env.PHASEO_SMOKE_API_KEY ?? '',
    managementKey: env.PHASEO_SMOKE_MANAGEMENT_KEY ?? '',
    lowCreditApiKey: env.PHASEO_SMOKE_LOW_CREDIT_API_KEY ?? '',
    databaseUrl: env.PHASEO_SMOKE_DATABASE_URL ?? '',
    workspaceId: env.PHASEO_SMOKE_WORKSPACE_ID ?? '',
    model,
    failureModel: env.PHASEO_SMOKE_FAILURE_MODEL || model,
    batchModel: env.PHASEO_SMOKE_BATCH_MODEL || model,
    batchProvider: env.PHASEO_SMOKE_BATCH_PROVIDER ?? '',
    batchId: batchIdArg ? batchIdArg.slice('--batch-id='.length).trim() : '',
    paid: argv.includes('--paid'),
    maxSpendNanos: Number.isFinite(maxSpendUsd) ? Math.round(maxSpendUsd * 1e9) : NaN,
    recordAttempts: 10,
    recordDelayMs: 1500,
    // An abandoned stream's row lands when the gateway's drain ends, up to ~30 s after the client leaves.
    drainAttempts: 20,
    drainDelayMs: 3000,
    batchWaitMs: (Number.isFinite(batchWaitMinutes) && batchWaitMinutes >= 0 ? batchWaitMinutes : 20) * 60_000,
    batchPollMs: 30_000,
  };
}

const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_ID = /^batch_[A-Za-z0-9]{1,64}$/;

export function configProblems(config) {
  const problems = [];
  if (!config.apiKey) problems.push('PHASEO_SMOKE_API_KEY is required');
  if (!config.model && !config.batchId) problems.push('PHASEO_SMOKE_MODEL is required');
  if (config.paid) {
    if (!(config.maxSpendNanos > 0)) problems.push('--paid needs PHASEO_SMOKE_MAX_SPEND_USD above 0');
    if (config.maxSpendNanos > MAX_SPEND_CEILING_USD * 1e9) problems.push(`PHASEO_SMOKE_MAX_SPEND_USD is capped at ${MAX_SPEND_CEILING_USD}`);
  }
  if (config.databaseUrl && !WORKSPACE_ID.test(config.workspaceId)) problems.push('PHASEO_SMOKE_DATABASE_URL needs PHASEO_SMOKE_WORKSPACE_ID (the smoke workspace UUID)');
  if (config.batchId) {
    if (!BATCH_ID.test(config.batchId)) problems.push('--batch-id must be a Phaseo batch ID (batch_…)');
    if (!config.databaseUrl) problems.push('--batch-id needs PHASEO_SMOKE_DATABASE_URL');
    if (config.paid) problems.push('--batch-id only verifies an earlier batch; do not combine it with --paid');
  }
  return problems;
}

// Production rows are read in a read-only transaction scoped to the smoke workspace. Values are
// passed as psql variables (quoted by psql with :'name'), never interpolated into the SQL here.
export const QUERIES = {
  requests: `
    select r.request_id, r.success, r.stream, r.byok, r.error_code, r.cost_nanos, r.expected_cost_nanos,
      r.usage_input_tokens, r.usage_output_tokens,
      c.cost_nanos as charge_nanos, c.status as charge_status, c.is_final as charge_final,
      f.request_id is not null as fact_found, f.success as fact_success, f.cost_nanos as fact_cost_nanos,
      coalesce((
        select json_agg(json_build_object('amount_nanos', l.amount_nanos, 'final', l.ref_id like '%:final') order by l.created_at)
        from public.credit_ledger l
        where l.source_ref_type = 'gateway_request' and l.source_ref_id = r.billing_request_id
          and l.workspace_id = r.workspace_id and l.ref_type = 'gateway_request_charge'
      ), '[]'::json) as adjustments
    from public.gateway_requests r
    left join public.gateway_request_charges c on c.workspace_id = r.workspace_id and c.request_id = r.billing_request_id
    left join public.v2_request_facts f on f.workspace_id = r.workspace_id and f.request_id = r.request_id
    where r.workspace_id = :'workspace_id'::uuid
      and r.request_id = any(string_to_array(:'request_ids', ','))
      and r.created_at > now() - interval '6 hours'`,
  batch: `
    select o.status, o.billed_at is not null as billed,
      round((o.meta->>'costNanos')::numeric)::bigint as cost_nanos,
      (o.meta->'reservationEstimate'->>'requestCount')::int as request_count,
      (o.meta->'reservationEstimate'->>'outputTokenUpperBound')::bigint as output_token_bound,
      w.status as reservation_status, w.amount_nanos as hold_nanos, w.settled_amount_nanos,
      w.captured_nanos, w.released_nanos, w.overdraft_nanos,
      l.amount_nanos as ledger_amount_nanos, l.before_balance_nanos as ledger_before_balance_nanos,
      l.before_reserved_nanos as ledger_before_reserved_nanos
    from public.gateway_async_operations o
    left join public.gateway_wallet_reservations w on w.workspace_id = o.workspace_id and w.reservation_id = o.meta->>'reservationId'
    left join public.credit_ledger l on l.ref_type = 'async_job_charge' and l.ref_id = o.workspace_id::text || ':' || (o.meta->>'reservationId')
    where o.workspace_id = :'workspace_id'::uuid and o.kind = 'batch' and o.internal_id = :'batch_id'`,
};

const SAFE_VARIABLE = /^[A-Za-z0-9_.:,-]{1,4000}$/;

/** Wraps a query so the server refuses any write and bounds its time. */
export function readOnlyScript(sql) {
  return `begin read only;\nset local statement_timeout = '10s';\nselect coalesce(json_agg(t), '[]'::json) from (${sql}) t;\ncommit;\n`;
}

/** Runs a named query with psql (preinstalled on GitHub's Ubuntu runners); resolves to its rows. */
export function psqlDatabase(databaseUrl, { spawnProcess = spawn } = {}) {
  const url = new URL(databaseUrl);
  // Connection details go in the environment, so the password is never a process argument.
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'phaseo-gateway-smoke',
  };
  return (name, variables) => new Promise((resolve, reject) => {
    const sql = QUERIES[name];
    if (!sql) return reject(new Error(`unknown_query_${name}`));
    const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
    for (const [key, value] of Object.entries(variables)) {
      if (!SAFE_VARIABLE.test(String(value))) return reject(new Error(`unsafe_query_variable_${key}`));
      args.push('-v', `${key}=${value}`);
    }
    args.push('-f', '-');
    const child = spawnProcess('psql', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    // psql errors can echo query text but never row data; they are not logged, only counted.
    child.stderr.resume();
    child.on('error', () => reject(new Error('psql_unavailable')));
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error('database_query_failed'));
      try { resolve(JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '[]')); } catch { reject(new Error('database_output_unreadable')); }
    });
    child.stdin.end(readOnlyScript(sql));
  });
}

function errorCode(body) {
  const error = body && typeof body === 'object' ? body.error : null;
  const code = error && typeof error === 'object' ? (error.code ?? error.type) : (typeof error === 'string' ? error : null);
  return typeof code === 'string' ? code.slice(0, 80) : null;
}

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

const num = (value) => (value === null || value === undefined ? null : Number(value));
const zeroOrNull = (value) => value === null || value === undefined || Number(value) === 0;

/**
 * Checks one charged request's production rows: the request row, its charge row, its
 * analytics fact and any stepped-charge ledger adjustments agree on one cost. Null when they do.
 */
export function chargedRowProblem(row, { boundNanos, stream } = {}) {
  if (!row) return 'request_row_missing';
  if (row.byok !== false) return 'row_not_paid_request';
  if (stream !== undefined && row.stream !== stream) return 'row_stream_flag_wrong';
  const cost = num(row.cost_nanos);
  if (!(cost > 0)) return 'cost_missing';
  if (boundNanos && cost > boundNanos) return 'cost_above_bound';
  if (row.charge_status !== 'applied' || row.charge_final !== true) return 'charge_not_settled';
  if (num(row.charge_nanos) !== cost) return 'charge_differs_from_row_cost';
  if (row.expected_cost_nanos != null && num(row.expected_cost_nanos) !== cost) return 'expected_cost_differs';
  if (!row.fact_found) return 'request_fact_missing';
  if (num(row.fact_cost_nanos) !== cost) return 'fact_cost_differs';
  const adjustments = Array.isArray(row.adjustments) ? row.adjustments : [];
  // A stream charged in steps (#3633): its ledger adjustments sum to the charge, ending in a final one.
  if (adjustments.length) {
    const total = adjustments.reduce((sum, a) => sum - Number(a.amount_nanos), 0);
    if (total !== cost) return 'adjustments_differ_from_charge';
    if (!adjustments.some((a) => a.final)) return 'stepped_charge_not_final';
  }
  return null;
}

/** A failed upstream call must leave no charge anywhere (#3633: "A failed or reset upstream is not billed"). */
export function failedRowProblem(row) {
  if (!row) return 'request_row_missing';
  if (row.success !== false) return 'row_not_failed';
  if (!String(row.error_code ?? '').startsWith('upstream:')) return 'failure_not_upstream';
  if (!zeroOrNull(row.cost_nanos) || !zeroOrNull(row.expected_cost_nanos)) return 'failed_request_costed';
  if (!zeroOrNull(row.charge_nanos)) return 'failed_request_charged';
  if (Array.isArray(row.adjustments) && row.adjustments.length) return 'failed_request_in_ledger';
  if (!row.fact_found) return 'request_fact_missing';
  if (row.fact_success !== false || !zeroOrNull(row.fact_cost_nanos)) return 'fact_shows_charge';
  return null;
}

/**
 * Checks a settled batch (#3633, #3547): the hold counted every choice, the actual cost was
 * captured in full with one ledger charge, and any overage beyond the hold and the free balance
 * is the overdraft recorded on the reservation. Null when it does.
 */
export function batchSettlementProblem(row, { boundNanos, outputTokens = MAX_OUTPUT_TOKENS, outputCount = BATCH_OUTPUT_COUNT } = {}) {
  if (!row) return 'batch_row_missing';
  if (num(row.request_count) !== 1) return 'hold_request_count_wrong';
  if (!(num(row.output_token_bound) >= outputTokens * outputCount)) return 'hold_ignores_choice_count';
  if (!(num(row.hold_nanos) > 0)) return 'hold_missing';
  if (row.reservation_status !== 'captured') return 'reservation_not_captured';
  const settled = num(row.settled_amount_nanos);
  const hold = num(row.hold_nanos);
  if (!(settled > 0)) return 'settlement_missing';
  if (num(row.cost_nanos) !== settled) return 'settlement_differs_from_batch_cost';
  if (boundNanos && settled > boundNanos) return 'cost_above_bound';
  if (num(row.ledger_amount_nanos) !== -settled) return 'ledger_differs_from_settlement';
  if (num(row.captured_nanos) !== Math.min(settled, hold) || num(row.released_nanos) !== Math.max(0, hold - settled)) return 'hold_split_wrong';
  // gateway_wallet_settle_once: the hold plus the unreserved balance cover what they can; the rest is overdraft.
  const covered = Math.max(num(row.ledger_before_balance_nanos) - num(row.ledger_before_reserved_nanos) + hold, hold);
  if (num(row.overdraft_nanos) !== Math.max(0, settled - covered)) return 'overdraft_wrong';
  // A hold sized for both choices covers this tiny batch; an actual cost above it means the hold under-counted.
  if (settled > hold) return 'actual_above_hold';
  return null;
}

export async function runSmoke(config, { fetcher = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)), db = null } = {}) {
  const results = [];
  const record = (check, outcome, extra = {}) => {
    const result = { check, outcome, ...extra };
    results.push(result);
    return result;
  };
  const call = async (path, { key = config.apiKey, method = 'GET', body, signal } = {}) => {
    const started = Date.now();
    const response = await fetcher(`${config.baseUrl}${path}`, {
      method,
      signal: signal ?? AbortSignal.timeout(60_000),
      headers: {
        'User-Agent': USER_AGENT,
        'X-Title': 'Phaseo gateway smoke',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, durationMs: Date.now() - started };
  };
  const check = async (id, fn) => {
    try {
      return await fn();
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? 'timeout'
        : /^(psql_unavailable|database_|unsafe_query_)/.test(error?.message ?? '') ? error.message : 'network_or_invalid_body';
      return record(id, 'fail', { reason });
    }
  };
  const expectStatus = async (id, expected, request) => check(id, async () => {
    const { response, durationMs } = await request();
    const body = await readJson(response);
    const ok = response.status === expected;
    return record(id, ok ? 'pass' : 'fail', {
      status: response.status, duration_ms: durationMs, error_code: errorCode(body),
      ...(ok ? {} : { reason: `expected_${expected}` }),
    });
  });
  const chat = (extra) => ({ model: config.model, messages: [{ role: 'user', content: PROMPT }], max_tokens: MAX_OUTPUT_TOKENS, temperature: 0, ...extra });
  const readRows = (name, variables) => db(name, { workspace_id: config.workspaceId, ...variables });
  const pollRows = async (ids, { attempts, delayMs, ready }) => {
    let rows = [];
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt) await wait(delayMs);
      rows = await readRows('requests', { request_ids: ids.join(',') });
      if (ids.every((id) => { const row = rows.find((r) => r.request_id === id); return row && ready(row); })) break;
    }
    return new Map(rows.map((row) => [row.request_id, row]));
  };
  const readBatch = async (batchId) => (await readRows('batch', { batch_id: batchId }))[0] ?? null;

  // Verify-only: settle a batch an earlier paid run left unfinished. Sends nothing billable.
  if (config.batchId) {
    await check('batch_settlement', async () => {
      // Reading the batch lets the gateway finalize it if the provider has finished.
      const { response } = await call(`/batches/${encodeURIComponent(config.batchId)}`);
      const body = await readJson(response);
      const status = String(body?.status ?? '').toLowerCase();
      if (!response.ok) return record('batch_settlement', 'fail', { status: response.status, batch_id: config.batchId, reason: 'batch_unreadable' });
      if (!TERMINAL_BATCH_STATUSES.has(status) || body?.billing?.billed !== true) {
        return record('batch_settlement', 'pending', { batch_id: config.batchId, reason: 'batch_not_finished' });
      }
      const problem = batchSettlementProblem(await readBatch(config.batchId));
      return record('batch_settlement', problem ? 'fail' : 'pass', { batch_id: config.batchId, ...(problem ? { reason: problem } : {}) });
    });
    return results;
  }

  const missingId = `smoke-missing-${Date.now()}`;

  await expectStatus('auth_rejects_invalid_key', 401, () => call(`/generations?id=${missingId}`, { key: 'phaseo-smoke-invalid-key' }));
  // A lookup of an unknown ID is free: 404 proves the key authenticated.
  await expectStatus('auth_accepts_key', 404, () => call(`/generations?id=${missingId}`));

  await check('discovery', async () => {
    const { response, durationMs } = await call(`/models?format=openai&search=${encodeURIComponent(config.model)}&limit=50`);
    const body = await readJson(response);
    const models = Array.isArray(body?.data) ? body.data : [];
    const listed = models.some((model) => (model.id ?? model.model_id) === config.model);
    return record('discovery', response.ok && listed ? 'pass' : 'fail', {
      status: response.status, duration_ms: durationMs, ...(response.ok && !listed ? { reason: 'model_not_listed' } : {}),
    });
  });

  const balance = async () => {
    const { response } = await call('/credits', { key: config.managementKey });
    const body = await readJson(response);
    const nanos = Number(body?.credits?.balance_nanos);
    if (!response.ok || !Number.isFinite(nanos)) throw new Error(`credits_${response.status}`);
    return nanos;
  };
  // Read before the rejected requests, so a charge for one of them shows in billing_settled.
  let balanceBefore = null;
  let balanceProblem = null;
  if (config.paid && config.managementKey) {
    try { balanceBefore = await balance(); } catch { balanceProblem = 'credits_unreadable_before'; }
  }

  await expectStatus('invalid_request', 400, () => call('/chat/completions', { method: 'POST', body: { model: config.model, messages: 'not-a-list' } }));

  // The zero-balance probe is a valid generation: if its workspace were funded, or credit gating
  // regressed, it would be charged. So it runs only on paid runs and counts against the budget.
  const chargingChecks = ['abandoned_stream', 'upstream_failure_not_charged', 'batch_hold_counts_choices', 'batch_settlement', 'charges_consistent'];
  const paidChecks = ['insufficient_credit', 'buffered_request', 'streamed_request', 'usage_recorded', ...chargingChecks, 'billing_settled'];
  if (!config.paid) {
    for (const id of paidChecks) record(id, 'skip', { reason: 'paid checks not requested' });
    return results;
  }
  // The charging-path cases are asserted on production rows; without read access they are not sent.
  const chargingPaths = Boolean(db);

  // Nothing is sent unless the published prices bound every billable request within the budget.
  let pricing = null;
  try {
    const { response } = await call('/pricing/models');
    const body = await readJson(response);
    if (response.ok) pricing = body?.models;
  } catch { /* unreadable prices leave every bound unknown */ }
  const bounds = {
    chat: requestCostBoundNanos(pricing, config.model),
    abandoned: requestCostBoundNanos(pricing, config.model, { outputTokens: ABANDON_OUTPUT_TOKENS }),
    failure: requestCostBoundNanos(pricing, config.failureModel),
    batch: requestCostBoundNanos(pricing, config.batchModel, { outputCount: BATCH_OUTPUT_COUNT }),
  };
  const planned = [bounds.chat, bounds.chat, ...(config.lowCreditApiKey ? [bounds.chat] : []),
    ...(chargingPaths ? [bounds.abandoned, bounds.failure, bounds.batch] : [])];
  const costBoundNanos = bounds.chat;
  const plannedNanos = planned.every((b) => b > 0) ? planned.reduce((sum, b) => sum + b, 0) : null;
  const refusal = plannedNanos === null ? 'cost_bound_unknown'
    : plannedNanos > config.maxSpendNanos ? 'budget_below_cost_bound' : null;
  if (refusal) {
    for (const id of paidChecks) record(id, 'fail', { reason: refusal, cost_bound_nanos: costBoundNanos, planned_bound_nanos: plannedNanos });
    return results;
  }
  if (balanceProblem) record('billing_settled', 'fail', { reason: balanceProblem });

  if (config.lowCreditApiKey) {
    await expectStatus('insufficient_credit', 402, () => call('/chat/completions', { method: 'POST', key: config.lowCreditApiKey, body: chat() }));
  } else {
    record('insufficient_credit', 'skip', { reason: 'PHASEO_SMOKE_LOW_CREDIT_API_KEY not set' });
  }

  const generations = [];
  await check('buffered_request', async () => {
    const { response, durationMs } = await call('/chat/completions', { method: 'POST', body: chat() });
    const body = await readJson(response);
    const text = body?.choices?.[0]?.message?.content;
    const usage = body?.usage;
    const ok = response.ok && typeof body?.id === 'string' && typeof text === 'string' && text.length > 0 &&
      usage?.prompt_tokens > 0 && usage?.completion_tokens > 0;
    if (ok) generations.push({ check: 'buffered_request', id: body.id, usage, stream: false });
    return record('buffered_request', ok ? 'pass' : 'fail', {
      status: response.status, duration_ms: durationMs, request_id: body?.id ?? null, error_code: errorCode(body),
      ...(ok ? {} : { reason: response.ok ? 'missing_content_or_usage' : 'http_error' }),
    });
  });

  await check('streamed_request', async () => {
    const started = Date.now();
    const { response, durationMs } = await call('/chat/completions', { method: 'POST', body: chat({ stream: true, stream_options: { include_usage: true } }) });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const body = await readJson(response);
      return record('streamed_request', 'fail', { status: response.status, duration_ms: durationMs, error_code: errorCode(body), reason: 'not_an_event_stream' });
    }
    let id = null; let usage = null; let content = 0; let done = false; let failed = null;
    for (const line of (await response.text()).split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') { done = true; continue; }
      let chunk;
      try { chunk = JSON.parse(data); } catch { failed = 'invalid_chunk'; continue; }
      if (chunk.error) failed = errorCode(chunk) ?? 'stream_error';
      id ??= typeof chunk.id === 'string' ? chunk.id : null;
      if (chunk.choices?.[0]?.delta?.content) content++;
      if (chunk.usage) usage = chunk.usage;
    }
    const ok = !failed && done && id && content > 0 && usage?.prompt_tokens > 0 && usage?.completion_tokens > 0;
    if (ok) generations.push({ check: 'streamed_request', id, usage, stream: true });
    return record('streamed_request', ok ? 'pass' : 'fail', {
      status: response.status, duration_ms: Date.now() - started, request_id: id,
      ...(ok ? {} : { reason: failed ?? (!done ? 'missing_done' : !content ? 'missing_content' : 'missing_usage') }),
    });
  });

  // Request rows and charges are written after the response, so poll briefly for them.
  let spentNanos = 0;
  await check('usage_recorded', async () => {
    if (!generations.length) return record('usage_recorded', 'fail', { reason: 'no_successful_requests' });
    for (const generation of generations) {
      let row = null;
      for (let attempt = 0; attempt < config.recordAttempts && !row; attempt++) {
        if (attempt) await wait(config.recordDelayMs);
        const { response } = await call(`/generations?id=${encodeURIComponent(generation.id)}`);
        if (response.ok) row = await readJson(response);
        else await response.body?.cancel();
      }
      const fail = (reason) => record('usage_recorded', 'fail', { request_id: generation.id, reason });
      if (!row) return fail('request_row_missing');
      if (row.success !== true || row.byok !== false) return fail('row_not_successful_paid_request');
      const cost = Number(row.cost_nanos);
      if (!(cost > 0)) return fail('cost_missing');
      if (cost > costBoundNanos) return fail('cost_above_bound');
      if (Number(row.usage_input_tokens) !== generation.usage.prompt_tokens ||
          Number(row.usage_output_tokens) !== generation.usage.completion_tokens) return fail('usage_differs_from_response');
      spentNanos += cost;
    }
    return record('usage_recorded', 'pass', { requests: generations.length, spent_nanos: spentNanos, cost_bound_nanos: costBoundNanos });
  });

  // The charging paths shipped in #3547 (with #3633) and #3536. One request each, asserted on
  // production rows read-only.
  let batchId = null;
  let batchSettledNanos = 0;
  const charged = generations.map((g) => ({ ...g }));
  if (!chargingPaths) {
    for (const id of chargingChecks) record(id, 'skip', { reason: 'PHASEO_SMOKE_DATABASE_URL not set' });
  } else {
    // A client that leaves mid-stream: the gateway keeps draining and must charge the request once,
    // in steps if the drain outlives a checkpoint, with the steps summing to the final charge.
    await check('abandoned_stream', async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      let id = null;
      try {
        const { response } = await call('/chat/completions', {
          method: 'POST', signal: controller.signal,
          body: { model: config.model, messages: [{ role: 'user', content: ABANDON_PROMPT }], max_tokens: ABANDON_OUTPUT_TOKENS, temperature: 0, stream: true, stream_options: { include_usage: true } },
        });
        if (!response.ok || !response.body) {
          const body = await readJson(response);
          return record('abandoned_stream', 'fail', { status: response.status, error_code: errorCode(body), reason: 'not_an_event_stream' });
        }
        // Read up to the first content chunk, then disconnect.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let content = false;
        while (!content) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
            try {
              const chunk = JSON.parse(line.slice(5).trim());
              id ??= typeof chunk.id === 'string' ? chunk.id : null;
              if (chunk.choices?.[0]?.delta?.content) content = true;
            } catch { /* a partial or non-JSON line */ }
          }
        }
        controller.abort();
        if (!id || !content) return record('abandoned_stream', 'fail', { request_id: id, reason: 'no_content_before_disconnect' });
      } catch (error) {
        if (!id) throw error;
      } finally {
        clearTimeout(timer);
      }
      const rows = await pollRows([id], { attempts: config.drainAttempts, delayMs: config.drainDelayMs, ready: (row) => row.charge_final === true });
      const row = rows.get(id);
      const problem = chargedRowProblem(row, { boundNanos: bounds.abandoned, stream: true });
      if (row && num(row.cost_nanos) > 0) charged.push({ check: 'abandoned_stream', id, costNanos: num(row.cost_nanos) });
      return record('abandoned_stream', problem ? 'fail' : 'pass', {
        request_id: id, cost_nanos: num(row?.cost_nanos), stepped: (row?.adjustments?.length ?? 0) > 0, ...(problem ? { reason: problem } : {}),
      });
    });

    // An upstream failure: the provider cannot fetch the image, so the call fails upstream and
    // nothing may be charged.
    await check('upstream_failure_not_charged', async () => {
      const { response } = await call('/chat/completions', {
        method: 'POST',
        body: {
          model: config.failureModel, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0,
          messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: FAILURE_IMAGE_URL } }] }],
        },
      });
      const body = await readJson(response);
      const id = body?.generation_id ?? body?.request_id ?? body?.error?.request_id ?? body?.id ?? null;
      if (response.ok) {
        // The provider ignored the image: this request was billed, so billing_settled must count it.
        if (typeof id === 'string') charged.push({ check: 'upstream_failure_not_charged', id, costNanos: null });
        return record('upstream_failure_not_charged', 'fail', { status: response.status, request_id: id, reason: 'failure_probe_succeeded' });
      }
      const origin = response.headers.get('x-gateway-error-origin') ?? body?.error_origin ?? body?.error?.error_origin ?? null;
      if (origin !== 'upstream') {
        return record('upstream_failure_not_charged', 'fail', { status: response.status, request_id: id, error_code: errorCode(body), reason: 'failure_not_upstream' });
      }
      if (typeof id !== 'string') return record('upstream_failure_not_charged', 'fail', { status: response.status, reason: 'request_id_missing' });
      const rows = await pollRows([id], { attempts: config.recordAttempts, delayMs: config.recordDelayMs, ready: (row) => row.fact_found });
      const problem = failedRowProblem(rows.get(id));
      return record('upstream_failure_not_charged', problem ? 'fail' : 'pass', { status: response.status, request_id: id, ...(problem ? { reason: problem } : {}) });
    });

    // A one-row batch asking for two choices: the hold must count both, and settlement must
    // capture the actual cost in full, with any overage over the hold recorded as overdraft.
    await check('batch_hold_counts_choices', async () => {
      const { response } = await call('/batches', {
        method: 'POST',
        body: {
          endpoint: '/v1/chat/completions', model: config.batchModel,
          ...(config.batchProvider ? { provider: config.batchProvider } : {}),
          metadata: { purpose: 'gateway-smoke' },
          requests: [{ custom_id: 'smoke-1', body: { model: config.batchModel, messages: [{ role: 'user', content: PROMPT }], max_tokens: MAX_OUTPUT_TOKENS, n: BATCH_OUTPUT_COUNT } }],
        },
      });
      const body = await readJson(response);
      if (!response.ok || typeof body?.id !== 'string') {
        return record('batch_hold_counts_choices', 'fail', { status: response.status, error_code: errorCode(body), reason: 'batch_not_created' });
      }
      batchId = body.id;
      const row = await readBatch(batchId);
      const problem = !row ? 'batch_row_missing'
        : num(row.request_count) !== 1 ? 'hold_request_count_wrong'
          : !(num(row.output_token_bound) >= MAX_OUTPUT_TOKENS * BATCH_OUTPUT_COUNT) ? 'hold_ignores_choice_count'
            : !(num(row.hold_nanos) > 0) ? 'hold_missing' : null;
      return record('batch_hold_counts_choices', problem ? 'fail' : 'pass', {
        status: response.status, batch_id: batchId, hold_nanos: num(row?.hold_nanos), ...(problem ? { reason: problem } : {}),
      });
    });

    await check('batch_settlement', async () => {
      if (!batchId) return record('batch_settlement', 'fail', { reason: 'batch_not_created' });
      const deadline = Date.now() + config.batchWaitMs;
      for (let first = true; ; first = false) {
        if (!first) await wait(config.batchPollMs);
        // Reading the batch lets the gateway finalize it as soon as the provider has finished.
        const { response } = await call(`/batches/${encodeURIComponent(batchId)}`);
        const body = await readJson(response);
        const status = String(body?.status ?? '').toLowerCase();
        if (response.ok && TERMINAL_BATCH_STATUSES.has(status) && body?.billing?.billed === true) break;
        if (Date.now() >= deadline) {
          // Not a failure: providers may take hours. Re-run with this batch ID to verify it later.
          return record('batch_settlement', 'pending', { batch_id: batchId, reason: 'batch_not_finished' });
        }
      }
      const row = await readBatch(batchId);
      const problem = batchSettlementProblem(row, { boundNanos: bounds.batch });
      if (row?.reservation_status === 'captured') batchSettledNanos = num(row.settled_amount_nanos) ?? 0;
      return record('batch_settlement', problem ? 'fail' : 'pass', {
        batch_id: batchId, settled_nanos: num(row?.settled_amount_nanos), hold_nanos: num(row?.hold_nanos),
        overdraft_nanos: num(row?.overdraft_nanos), ...(problem ? { reason: problem } : {}),
      });
    });

    // The buffered and streamed requests' rows agree across request, charge, fact and ledger.
    await check('charges_consistent', async () => {
      if (!generations.length) return record('charges_consistent', 'fail', { reason: 'no_successful_requests' });
      const rows = await pollRows(generations.map((g) => g.id), { attempts: config.recordAttempts, delayMs: config.recordDelayMs, ready: (row) => row.charge_final === true && row.fact_found });
      for (const generation of generations) {
        const problem = chargedRowProblem(rows.get(generation.id), { boundNanos: costBoundNanos, stream: generation.stream });
        if (problem) return record('charges_consistent', 'fail', { request_id: generation.id, reason: problem });
      }
      return record('charges_consistent', 'pass', { requests: generations.length });
    });
  }

  if (!config.managementKey) {
    record('billing_settled', 'skip', { reason: 'PHASEO_SMOKE_MANAGEMENT_KEY not set' });
  } else if (balanceBefore !== null) {
    await check('billing_settled', async () => {
      // The smoke workspace has no other traffic, so its balance moves only by these charges: the
      // generations, the abandoned stream and a batch settled during the run. The rejected
      // requests and the upstream failure must not have moved it. Holds do not change the balance.
      const extraIds = charged.filter((c) => c.check !== 'buffered_request' && c.check !== 'streamed_request');
      let expected = null;
      let delta = null;
      for (let attempt = 0; attempt < config.recordAttempts; attempt++) {
        if (attempt) await wait(config.recordDelayMs);
        let extra = 0;
        if (db && extraIds.length) {
          const rows = await readRows('requests', { request_ids: extraIds.map((c) => c.id).join(',') });
          extra = rows.reduce((sum, row) => sum + (num(row.charge_nanos) ?? 0), 0);
        }
        // A batch may settle while this runs; count it once its capture is visible.
        let batch = batchSettledNanos;
        if (db && batchId && !batch) {
          const row = await readBatch(batchId);
          if (row?.reservation_status === 'captured') batch = num(row.settled_amount_nanos) ?? 0;
        }
        expected = spentNanos + extra + batch;
        delta = balanceBefore - await balance();
        if (delta === expected) break;
      }
      return record('billing_settled', delta === expected ? 'pass' : 'fail', {
        charged_nanos: delta, spent_nanos: expected, ...(delta === expected ? {} : { reason: 'balance_change_differs_from_recorded_cost' }),
      });
    });
  }
  return results;
}

export function summarise(results) {
  const rows = results.map((r) => `| ${r.check} | ${r.outcome} | ${r.status ?? ''} | ${r.request_id ?? r.batch_id ?? ''} | ${r.error_code ?? ''} | ${r.reason ?? ''} |`);
  const pending = results.find((r) => r.outcome === 'pending' && r.batch_id);
  const note = pending ? `\n\nBatch \`${pending.batch_id}\` has not finished. Run the workflow again with \`batch_id\` set to it to verify its settlement; that run sends nothing billable.` : '';
  return ['| Check | Outcome | Status | Request or batch ID | Error code | Reason |', '| --- | --- | --- | --- | --- | --- |', ...rows].join('\n') + note;
}

async function main() {
  const config = configFromEnv();
  const problems = configProblems(config);
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exit(2);
  }
  const db = config.databaseUrl ? psqlDatabase(config.databaseUrl) : null;
  const results = await runSmoke(config, { db });
  for (const result of results) console.log(JSON.stringify({ event_type: 'phaseo.gateway_smoke', ...result }));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Gateway smoke\n\n${summarise(results)}\n`);
  process.exit(results.some((r) => r.outcome === 'fail') ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
