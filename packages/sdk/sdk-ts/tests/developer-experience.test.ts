import { afterEach, expect, test, vi } from "vitest";
import { Phaseo, responseMetadata, RequestTimeoutError, parseOutput, collectStream, checkCapabilities, checkParameterSupport, batchResults, matchBatchResult } from "../src/index.js";
import { createMockTransport } from "../src/testing.js";
import { PhaseoHttpError } from "../src/runtime/client.js";
import { JobHandle } from "../src/jobHandle.js";
import { DevToolsWriter } from "../src/devtools/core.js";

afterEach(() => vi.useRealTimers());
const setup = (fixtures: Parameters<typeof createMockTransport>[0], options = {}) => {
  const mock = createMockTransport(fixtures);
  return { mock, client: new Phaseo({ apiKey: "test", baseUrl: "https://example.test/v1", fetchImpl: mock.fetchImpl, ...options }) };
};

test("safe read retries honor Retry-After; scoped options do not change the original", async () => {
  const { client, mock } = setup([
    { method: "GET", path: "/v1/health", status: 429, headers: { "retry-after": "0" } },
    { method: "GET", path: "/v1/health", json: { ok: true }, headers: { "x-request-id": "req/1" } },
    { method: "GET", path: "/v1/health", status: 503, json: { error: { code: "unavailable" } } },
  ]);
  const result = await client.withOptions({ maxRetries: 1 }).getHealth();
  expect(responseMetadata(result)).toMatchObject({ requestId: "req/1", traceUrl: "https://phaseo.app/settings/usage/logs/requests/req%2F1" });
  await expect(client.getHealth()).rejects.toMatchObject({ status: 503, code: "unavailable" });
  mock.assertDone();
});

test("paid POST is never retried and preserves error context", async () => {
  const { client, mock } = setup([{ method: "POST", path: "/v1/music/generate", status: 503,
    headers: { "x-request-id": "req_1", "retry-after": "2" }, json: { error: { code: "provider_unavailable" } } }], { maxRetries: 5 });
  await expect(client.request("POST", "/music/generate", { body: { model: "test" } })).rejects.toMatchObject({
    code: "provider_unavailable", requestId: "req_1", retryAfterMs: 2000,
  });
  mock.assertDone();
  expect(mock.requests).toHaveLength(1);
});

test("raw responses, idempotency headers, and transport hooks share one request pipeline", async () => {
  const events: string[] = [];
  const { client, mock } = setup([
    { method: "GET", path: "/v1/health", status: 503, headers: { "retry-after": "0" } },
    { method: "GET", path: "/v1/health", json: { ok: true }, headers: { "x-request-id": "req_raw" } },
    { method: "POST", path: "/v1/responses", json: { id: "resp_1" } },
  ]);
  const raw = await client.requestWithResponse("GET", "/health", {
    maxRetries: 1,
    onRequest: event => events.push(`request:${event.attempt}`),
    onRetry: event => events.push(`retry:${event.attempt}`),
    onResponse: event => events.push(`response:${event.status}`),
  });
  expect(raw).toMatchObject({ data: { ok: true }, status: 200, requestId: "req_raw" });
  expect(events).toEqual(["request:0", "retry:1", "request:1", "response:200"]);
  await client.request("POST", "/responses", { body: { model: "test" }, idempotencyKey: "idem-1" });
  expect(new Headers(mock.requests[2]?.headers).get("idempotency-key")).toBe("idem-1");
  mock.assertDone();
});

test("cancellation interrupts a pending response body and releases it", async () => {
  const abort = new AbortController();
  const cancel = vi.fn();
  const client = new Phaseo({ apiKey: "test", signal: abort.signal, fetchImpl: async () => new Response(new ReadableStream({ cancel })) });
  const pending = client.getHealth();
  const rejected = expect(pending).rejects.toThrow("stop");
  await new Promise(resolve => setTimeout(resolve, 5));
  abort.abort(new Error("stop"));
  await rejected;
  expect(cancel).toHaveBeenCalled();
});

test("timeout also covers reading the body", async () => {
  const client = new Phaseo({ apiKey: "test", timeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream()) });
  await expect(client.getHealth()).rejects.toBeInstanceOf(RequestTimeoutError);
});

test("wait cancellation reaches the in-flight polling request", async () => {
  const abort = new AbortController();
  let signal: AbortSignal | null | undefined;
  const client = new Phaseo({ apiKey: "test", fetchImpl: async (_url, init) => {
    signal = init?.signal;
    return new Response(new ReadableStream());
  } });
  const promise = client.videos.wait("video_1", { signal: abort.signal });
  const rejected = expect(promise).rejects.toMatchObject({ name: "JobCancelledError", jobId: "video_1" });
  await new Promise(resolve => setTimeout(resolve, 5));
  abort.abort();
  await rejected;
  expect(signal?.aborted).toBe(true);
});

test("resumed handle preserves terminal errors and serializable identity", async () => {
  const { client, mock } = setup([{ method: "GET", path: "/v1/videos/v1", json: { id: "v1", status: "failed", error: { code: "blocked" } } }]);
  const handle = client.videos.resume("v1");
  expect(JSON.parse(JSON.stringify(handle))).toEqual({ kind: "video", id: "v1" });
  await expect(handle.result()).rejects.toMatchObject({ jobId: "v1", response: { error: { code: "blocked" } } });
  mock.assertDone();
});

test("inline completion still bounds asynchronous progress callbacks", async () => {
  const initial = { id: "music_1", status: "completed" };
  const retrieve = vi.fn();
  const wait = vi.fn();
  const handle = new JobHandle("music", initial.id, retrieve, wait, initial);
  await expect(handle.result({ timeoutMs: 10, onPoll: () => new Promise(() => {}) }))
    .rejects.toMatchObject({ name: "JobTimeoutError", jobId: "music_1" });
  expect(retrieve).not.toHaveBeenCalled();
  expect(wait).not.toHaveBeenCalled();
});

test("handle polling publishes the submission before its first delayed GET", async () => {
  vi.useFakeTimers();
  const initial = { id: "music_1", status: "queued" };
  const retrieve = vi.fn(async () => ({ ...initial, status: "completed" }));
  const onPoll = vi.fn();
  const handle = new JobHandle("music", initial.id, retrieve, vi.fn(), initial);
  const pending = handle.result({ intervalMs: 250, onPoll });
  expect(onPoll).toHaveBeenCalledWith(initial);
  expect(retrieve).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(249);
  expect(retrieve).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toMatchObject({ status: "completed" });
  expect(onPoll.mock.calls.map(([job]) => job.status)).toEqual(["queued", "completed"]);
});

test("scoped polling shares one devtools session without accumulating listeners", async () => {
  vi.useFakeTimers();
  const events = ["exit", "SIGINT", "SIGTERM"] as const;
  const previous = events.map(event => new Set(process.listeners(event)));
  vi.spyOn(DevToolsWriter.prototype, "ensureDirectory").mockImplementation(() => {});
  const sessions = vi.spyOn(DevToolsWriter.prototype, "writeSessionMetadata").mockImplementation(() => {});
  vi.spyOn(DevToolsWriter.prototype, "writeEntries").mockImplementation(() => {});
  try {
    const { client, mock } = setup(["running", "running", "completed"].map(status => ({
      method: "GET", path: "/v1/videos/v1", json: { id: "v1", status },
    })), { devtools: { enabled: true } });
    const counts = events.map(event => process.listenerCount(event));
    const pending = client.withOptions({ timeoutMs: 2000 }).videos.wait("v1", { intervalMs: 250 });
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(sessions).toHaveBeenCalledTimes(1);
    expect(events.map(event => process.listenerCount(event))).toEqual(counts);
    mock.assertDone();
  } finally {
    events.forEach((event, index) => {
      for (const listener of process.listeners(event)) if (!previous[index].has(listener)) process.removeListener(event, listener);
    });
    vi.clearAllTimers();
    vi.restoreAllMocks();
  }
});

test("validated output and streamed usage preserve failures", async () => {
  const schema = { parse(value: unknown): { answer: number } {
    if (typeof (value as any)?.answer !== "number") throw new Error("answer must be numeric");
    return value as { answer: number };
  } };
  expect(parseOutput({ output_text: '{"answer":42}' }, schema).answer).toBe(42);
  expect(() => parseOutput({ output_text: '{"answer":"no"}' }, schema)).toThrow("output schema");
  async function* events() { yield { text: "a" }; yield { text: "b", usage: { output_tokens: 2 } }; }
  expect(await collectStream(events())).toMatchObject({ text: "ab", usage: { output_tokens: 2 } });
});

test("capability checks use the same active offer, and fail closed for unknown facts", () => {
  const model = { modalities: { input: ["text"], output: ["audio"] }, capabilities: { parameters: ["duration", "lyrics"] }, offers: [
    { status: "active", capabilities: { parameters: ["duration"] } },
    { status: "active", capabilities: { parameters: ["lyrics"] } },
  ] };
  expect(checkCapabilities(model, { parameters: ["duration", "lyrics"] }).ok).toBe(false);
  expect(checkCapabilities({}, { outputTypes: ["video"] }).issues[0]).toContain("unknown");
});

test("incremental batch parsing joins unicode chunks and retains per-row errors", async () => {
  const bytes = new TextEncoder().encode('{"custom_id":"a","response":"🎵"}\n{"custom_id":"b","error":{"code":"bad_input"}}');
  const stream = new ReadableStream<Uint8Array>({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } });
  const rows = [];
  for await (const row of batchResults(stream)) rows.push(row);
  expect(rows[0].response).toBe("🎵");
  expect(matchBatchResult(rows[1], new Map([["b", { custom_id: "b", prompt: "test" }]]))).toMatchObject({ input: { prompt: "test" }, result: { error: { code: "bad_input" } } });
});

test("HTTP errors remain backwards compatible", () => {
  expect(new PhaseoHttpError({ status: 400, statusText: "Bad request", body: "bad" }).status).toBe(400);
});

test("HTTP errors expose the structured Gateway recovery contract", () => {
  const error = new PhaseoHttpError({
    status: 429,
    statusText: "Too Many Requests",
    body: {
      error: "provider_capacity_exhausted",
      request_id: "G-TS-1",
      generation_id: "G-TS-1",
      error_type: "system",
      error_origin: "upstream",
      retryable: true,
      action: "Wait, then retry with bounded exponential backoff.",
      docs_url: "https://phaseo.app/docs/v1/api-reference/errors",
      support_url: "https://phaseo.tawk.help/",
      retry_after_seconds: 15,
      details: [{ message: "All eligible providers are temporarily at capacity." }],
    },
    headers: { "X-Request-Id": "G-TS-HEADER" },
  });

  expect(error.code).toBe("provider_capacity_exhausted");
  expect(error.requestId).toBe("G-TS-1");
  expect(error.generationId).toBe("G-TS-1");
  expect(error.errorType).toBe("system");
  expect(error.errorOrigin).toBe("upstream");
  expect(error.retryable).toBe(true);
  expect(error.retryAfterSeconds).toBe(15);
  expect(error.details).toEqual([{ message: "All eligible providers are temporarily at capacity." }]);
});

test("request preserves null for successful empty responses", async () => {
  const { client, mock } = setup([
    { method: "DELETE", path: "/v1/files/file_1", status: 204 },
    { method: "GET", path: "/v1/empty", status: 200 },
  ]);
  await expect(client.request("DELETE", "/files/file_1")).resolves.toBeNull();
  await expect(client.request("GET", "/empty")).resolves.toBeNull();
  mock.assertDone();
});

test("batch line limits count UTF-8 bytes across split code points and reset per row", async () => {
  const row = JSON.stringify({ response: "🎵".repeat(100) });
  const bytes = new TextEncoder().encode(row);
  const source = () => new ReadableStream<Uint8Array>({ start(c) {
    for (const byte of new TextEncoder().encode(row + "\n" + row)) c.enqueue(Uint8Array.of(byte));
    c.close();
  } });
  const read = async (limit: number) => { const rows = []; for await (const value of batchResults(source(), limit)) rows.push(value); return rows; };
  expect(await read(bytes.length)).toHaveLength(2);
  await expect(read(bytes.length - 1)).rejects.toThrow("Batch result line exceeds size limit");
});

test("collecting Responses events does not duplicate completed text", async () => {
  async function* events() {
    yield { type: "response.output_text.delta", text: "Hello" };
    yield { type: "response.output_text.done", text: "Hello" };
    yield { type: "response.completed", text: "Hello", response: { output_text: "Hello" }, usage: { output_tokens: 1 } };
  }
  expect(await collectStream(events())).toMatchObject({ text: "Hello", finalResponse: { output_text: "Hello" }, usage: { output_tokens: 1 } });
});

test("advertised parameter values and ranges are checked on provider offers", () => {
  const model = { capabilities: { parameters: ["duration"] }, offers: [{ status: "active", routable: true, capabilities: {
    parameters: ["duration"], parameter_details: { duration: { minimum: 5, maximum: 10, step: 5 } },
  } }] };
  expect(checkCapabilities(model, { parameterValues: { duration: 10 } }).ok).toBe(true);
  expect(checkCapabilities(model, { parameterValues: { duration: 7 } }).issues.join(" ")).toContain("steps of 5");
});

test("live model parameter checks identify partial support and invalid values", async () => {
  const capabilities = {
    ok: true,
    id: "openai/gpt-5",
    endpoints: [
      {
        id: "openai:responses",
        endpoint: "responses",
        public_path: "/v1/responses",
        provider: { id: "openai" },
        routable: true,
        status: "active",
        capabilities: {
          parameters: ["temperature", "top_p"],
          parameter_details: {
            temperature: { minimum: 0, maximum: 2 },
            top_p: { minimum: 0, maximum: 1 },
          },
        },
      },
      {
        id: "azure:responses",
        endpoint: "responses",
        public_path: "/v1/responses",
        provider: { id: "azure" },
        routable: true,
        status: "active",
        capabilities: {
          parameters: ["temperature"],
          parameter_details: { temperature: { minimum: 0, maximum: 1 } },
        },
      },
    ],
  };
  const { client, mock } = setup([
    { method: "GET", path: "/v1/models/openai/gpt-5/endpoints", json: capabilities },
    { method: "GET", path: "/v1/models/openai/gpt-5/endpoints", json: capabilities },
    { method: "GET", path: "/v1/models/openai/gpt-5/endpoints", json: capabilities },
    { method: "GET", path: "/v1/models", json: { models: [{ model_id: "openai/gpt-5", status: "active" }] } },
    { method: "GET", path: "/v1/models/openai/gpt-5/endpoints", json: capabilities },
  ]);

  const supported = await client.models.checkParameters(
    "openai/gpt-5",
    { temperature: 0.7, top_p: 0.9 },
    { endpoint: "responses" },
  );
  expect(supported.ok).toBe(true);
  expect(supported.parameters.find(parameter => parameter.name === "top_p")?.status).toBe("partial");
  expect(supported.matchingRoutes.map(route => route.provider)).toEqual(["openai"]);

  const invalid = await client.models.checkParameters("openai/gpt-5", { temperature: 3 });
  expect(invalid.ok).toBe(false);
  expect(invalid.issues.join(" ")).toContain("temperature must be at most 2");

  const unsupported = await client.models.checkParameters("openai/gpt-5", { seed: 42 });
  expect(unsupported.parameters[0]).toMatchObject({ name: "seed", status: "unsupported" });
  expect(unsupported.issues.join(" ")).toContain("seed is not supported");

  const preflight = await client.models.preflight({ model: "openai/gpt-5", input: "hello", temperature: 0.7 }, { endpoint: "responses" });
  expect(preflight.ok).toBe(true);
  expect(preflight.checkedParameters).toEqual({ temperature: 0.7 });
  mock.assertDone();
});

test("parameter reports validate types, preserve partial issues, and omit unknown routes", () => {
  const model = {
    id: "test/model",
    endpoints: [
      {
        id: "wide",
        provider: { id: "wide" },
        endpoint: "responses",
        routable: true,
        status: "active",
        capabilities: {
          parameters: ["temperature", "count"],
          parameter_details: {
            temperature: { type: "number", maximum: 2 },
            count: { type: "integer" },
          },
        },
      },
      {
        id: "narrow",
        provider: { id: "narrow" },
        endpoint: "responses",
        routable: true,
        status: "active",
        capabilities: {
          parameters: ["temperature", "count"],
          parameter_details: {
            temperature: { type: "number", maximum: 1 },
            count: { type: "integer" },
          },
        },
      },
      {
        id: "unknown",
        provider: { id: "unknown" },
        endpoint: "responses",
        routable: true,
        status: "active",
        capabilities: {},
      },
    ],
  };

  const partial = checkParameterSupport(model, { temperature: 1.5 });
  expect(partial.parameters[0]).toMatchObject({ status: "partial" });
  expect(partial.parameters[0].issues.join(" ")).toContain("at most 1");
  expect(partial.parameters[0].unsupportedBy).toEqual([]);

  const invalidType = checkParameterSupport(model, { count: 1.5 });
  expect(invalidType.parameters[0]).toMatchObject({ status: "unsupported" });
  expect(invalidType.parameters[0].issues.join(" ")).toContain("must be an integer");
});

test("model capability lookup rejects ambiguous model IDs before requesting", async () => {
  const { client, mock } = setup([]);
  await expect(client.models.capabilities("author/slug/extra")).rejects.toThrow("author/slug format");
  await expect(client.models.capabilities("author//slug")).rejects.toThrow("author/slug format");
  mock.assertDone();
});
