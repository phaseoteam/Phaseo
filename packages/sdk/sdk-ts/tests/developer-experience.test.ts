import { afterEach, expect, test, vi } from "vitest";
import { Phaseo, responseMetadata, RequestTimeoutError, parseOutput, collectStream, checkCapabilities, batchResults, matchBatchResult } from "../src/index.js";
import { createMockTransport } from "../src/testing.js";
import { PhaseoHttpError } from "../src/runtime/client.js";
import { JobHandle } from "../src/jobHandle.js";

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
