// Authenticated gateway smoke check for after deployments and provider changes.
// See gateway-smoke.md. Logs check outcomes, statuses, request IDs and error codes only:
// never credentials, prompts or response bodies.
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const USER_AGENT = 'Phaseo-Gateway-Smoke/1.0';
// Guards against a mistyped budget; the smoke key's own spend limit is the real backstop.
const MAX_SPEND_CEILING_USD = 1;
const PROMPT = 'Reply with the single word OK.';

export function configFromEnv(env = process.env, argv = process.argv.slice(2)) {
  const maxSpendUsd = Number(env.PHASEO_SMOKE_MAX_SPEND_USD ?? 0);
  return {
    baseUrl: (env.PHASEO_SMOKE_BASE_URL || 'https://api.phaseo.app/v1').replace(/\/+$/, ''),
    apiKey: env.PHASEO_SMOKE_API_KEY ?? '',
    managementKey: env.PHASEO_SMOKE_MANAGEMENT_KEY ?? '',
    lowCreditApiKey: env.PHASEO_SMOKE_LOW_CREDIT_API_KEY ?? '',
    model: env.PHASEO_SMOKE_MODEL ?? '',
    paid: argv.includes('--paid'),
    maxSpendNanos: Number.isFinite(maxSpendUsd) ? Math.round(maxSpendUsd * 1e9) : NaN,
    recordAttempts: 10,
    recordDelayMs: 1500,
  };
}

export function configProblems(config) {
  const problems = [];
  if (!config.apiKey) problems.push('PHASEO_SMOKE_API_KEY is required');
  if (!config.model) problems.push('PHASEO_SMOKE_MODEL is required');
  if (config.paid) {
    if (!(config.maxSpendNanos > 0)) problems.push('--paid needs PHASEO_SMOKE_MAX_SPEND_USD above 0');
    if (config.maxSpendNanos > MAX_SPEND_CEILING_USD * 1e9) problems.push(`PHASEO_SMOKE_MAX_SPEND_USD is capped at ${MAX_SPEND_CEILING_USD}`);
  }
  return problems;
}

function errorCode(body) {
  const error = body && typeof body === 'object' ? body.error : null;
  const code = error && typeof error === 'object' ? (error.code ?? error.type) : (typeof error === 'string' ? error : null);
  return typeof code === 'string' ? code.slice(0, 80) : null;
}

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

export async function runSmoke(config, { fetcher = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const results = [];
  const record = (check, outcome, extra = {}) => {
    const result = { check, outcome, ...extra };
    results.push(result);
    return result;
  };
  const call = async (path, { key = config.apiKey, method = 'GET', body } = {}) => {
    const started = Date.now();
    const response = await fetcher(`${config.baseUrl}${path}`, {
      method,
      signal: AbortSignal.timeout(60_000),
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
      return record(id, 'fail', { reason: error?.name === 'TimeoutError' ? 'timeout' : 'network_or_invalid_body' });
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
  const chat = (extra) => ({ model: config.model, messages: [{ role: 'user', content: PROMPT }], max_tokens: 16, temperature: 0, ...extra });
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

  await expectStatus('invalid_request', 400, () => call('/chat/completions', { method: 'POST', body: { model: config.model, messages: 'not-a-list' } }));

  if (config.lowCreditApiKey) {
    await expectStatus('insufficient_credit', 402, () => call('/chat/completions', { method: 'POST', key: config.lowCreditApiKey, body: chat() }));
  } else {
    record('insufficient_credit', 'skip', { reason: 'PHASEO_SMOKE_LOW_CREDIT_API_KEY not set' });
  }

  if (!config.paid) {
    for (const id of ['buffered_request', 'streamed_request', 'usage_recorded', 'billing_settled']) record(id, 'skip', { reason: 'paid checks not requested' });
    return results;
  }

  const balance = async () => {
    const { response } = await call('/credits', { key: config.managementKey });
    const body = await readJson(response);
    const nanos = Number(body?.credits?.balance_nanos);
    if (!response.ok || !Number.isFinite(nanos)) throw new Error(`credits_${response.status}`);
    return nanos;
  };
  let balanceBefore = null;
  if (config.managementKey) {
    try { balanceBefore = await balance(); } catch { record('billing_settled', 'fail', { reason: 'credits_unreadable_before' }); }
  }

  const generations = [];
  await check('buffered_request', async () => {
    const { response, durationMs } = await call('/chat/completions', { method: 'POST', body: chat() });
    const body = await readJson(response);
    const text = body?.choices?.[0]?.message?.content;
    const usage = body?.usage;
    const ok = response.ok && typeof body?.id === 'string' && typeof text === 'string' && text.length > 0 &&
      usage?.prompt_tokens > 0 && usage?.completion_tokens > 0;
    if (ok) generations.push({ check: 'buffered_request', id: body.id, usage });
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
    if (ok) generations.push({ check: 'streamed_request', id, usage });
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
      if (Number(row.usage_input_tokens) !== generation.usage.prompt_tokens ||
          Number(row.usage_output_tokens) !== generation.usage.completion_tokens) return fail('usage_differs_from_response');
      spentNanos += cost;
    }
    if (spentNanos > config.maxSpendNanos) return record('usage_recorded', 'fail', { spent_nanos: spentNanos, reason: 'budget_exceeded' });
    return record('usage_recorded', 'pass', { requests: generations.length, spent_nanos: spentNanos });
  });

  if (!config.managementKey) {
    record('billing_settled', 'skip', { reason: 'PHASEO_SMOKE_MANAGEMENT_KEY not set' });
  } else if (balanceBefore !== null) {
    await check('billing_settled', async () => {
      // The smoke workspace has no other traffic, so its balance moves only by these charges;
      // the rejected requests above must not have moved it.
      let delta = null;
      for (let attempt = 0; attempt < config.recordAttempts; attempt++) {
        if (attempt) await wait(config.recordDelayMs);
        delta = balanceBefore - await balance();
        if (delta === spentNanos) break;
      }
      return record('billing_settled', delta === spentNanos ? 'pass' : 'fail', {
        charged_nanos: delta, spent_nanos: spentNanos, ...(delta === spentNanos ? {} : { reason: 'balance_change_differs_from_recorded_cost' }),
      });
    });
  }
  return results;
}

export function summarise(results) {
  const rows = results.map((r) => `| ${r.check} | ${r.outcome} | ${r.status ?? ''} | ${r.request_id ?? ''} | ${r.error_code ?? ''} | ${r.reason ?? ''} |`);
  return ['| Check | Outcome | Status | Request ID | Error code | Reason |', '| --- | --- | --- | --- | --- | --- |', ...rows].join('\n');
}

async function main() {
  const config = configFromEnv();
  const problems = configProblems(config);
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exit(2);
  }
  const results = await runSmoke(config);
  for (const result of results) console.log(JSON.stringify({ event_type: 'phaseo.gateway_smoke', ...result }));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Gateway smoke\n\n${summarise(results)}\n`);
  process.exit(results.some((r) => r.outcome === 'fail') ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
