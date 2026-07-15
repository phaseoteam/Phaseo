import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProviderContractRegistry } from "./registry.js";
import { getCanonicalBundleHash } from "./contract-hash.js";
import { ProviderMockServer } from "./server.js";
import { registerOpenAIProvider } from "./providers/openai.js";
import type { OpenApiDocument } from "./types.js";

const contractDir = path.resolve(import.meta.dirname, "..", "contracts", "openai");
const manifest = JSON.parse(await readFile(path.join(contractDir, "manifest.json"), "utf8"));
const document = JSON.parse(await readFile(path.join(contractDir, "openapi.json"), "utf8")) as OpenApiDocument;
const provenance = JSON.parse(await readFile(path.join(contractDir, "provenance.json"), "utf8"));
const server = new ProviderMockServer();

beforeAll(async () => {
  new ProviderContractRegistry().register({ manifest, document }).assertCoverage("openai");
  registerOpenAIProvider(server, { manifest, document }, { text: "OpenAI registry works." });
  await server.start();
});

afterAll(() => server.stop());

describe("OpenAI provider contract", () => {
  it("is reproducible and covers every declared Phaseo OpenAI operation", async () => {
    const raw = await readFile(path.join(contractDir, "openapi.json"));
    expect(getCanonicalBundleHash(raw)).toBe(provenance.bundleSha256);
    expect(manifest.operations).toHaveLength(17);
    expect(Object.keys(document.paths ?? {})).toHaveLength(16);
  });

  it("serves deterministic Responses and Chat Completions streams", async () => {
    const responses = await fetch(`${server.url}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-5.4", input: "hello", stream: true }) });
    expect(responses.status).toBe(200);
    expect(await responses.text()).toContain("OpenAI registry works.");
    const chat = await fetch(`${server.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-5.4", messages: [{ role: "user", content: "hello" }], stream: true }) });
    expect(chat.status).toBe(200);
    expect(await chat.text()).toContain("chat.completion.chunk");
  });

  it("validates tool schemas and returns deterministic tool calls", async () => {
    const response = await fetch(`${server.url}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4",
        input: "[tool] weather",
        tools: [{ type: "function", name: "lookup_weather", description: "Lookup weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] }, strict: false }],
      }),
    });
    const payload = await response.json() as any;
    expect(response.status, JSON.stringify(payload, null, 2)).toBe(200);
    expect(payload.output[0]).toMatchObject({ type: "function_call", name: "lookup_weather" });
    expect(server.getLastRequest()?.validationIssues).toEqual([]);
  });

  it("covers embeddings, moderation, images, speech, and async lifecycle responses", async () => {
    const jsonPost = (url: string, body: unknown) => fetch(`${server.url}/v1${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await jsonPost("/embeddings", { model: "text-embedding-3-small", input: "hello" })).status).toBe(200);
    expect((await jsonPost("/moderations", { model: "omni-moderation-latest", input: "[flagged]" })).status).toBe(200);
    expect((await jsonPost("/images/generations", { model: "gpt-image-1", prompt: "hello" })).status).toBe(200);
    expect((await jsonPost("/audio/speech", { model: "gpt-4o-mini-tts", input: "hello", voice: "alloy" })).headers.get("content-type")).toBe("audio/mpeg");
    expect((await jsonPost("/videos", { model: "sora-2", prompt: "hello" })).status).toBe(200);
    expect((await jsonPost("/batches", { input_file_id: "file_mock", endpoint: "/v1/responses", completion_window: "24h" })).status).toBe(200);
  });

  it("models create, poll, terminal status, content, and cancellation without recreating jobs", async () => {
    const createVideo = await fetch(`${server.url}/v1/videos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "sora-2", prompt: "mock video" }) });
    const video = await createVideo.json() as any;
    expect(video.status).toBe("queued");
    const videoPoll1 = await fetch(`${server.url}/v1/videos/${video.id}`).then((response) => response.json()) as any;
    const videoPoll2 = await fetch(`${server.url}/v1/videos/${video.id}`).then((response) => response.json()) as any;
    expect([videoPoll1.status, videoPoll2.status]).toEqual(["in_progress", "completed"]);
    expect((await fetch(`${server.url}/v1/videos/${video.id}/content`)).headers.get("content-type")).toBe("video/mp4");
    expect((await fetch(`${server.url}/v1/videos/${video.id}`, { method: "DELETE" }).then((response) => response.json()) as any).deleted).toBe(true);

    const createBatch = await fetch(`${server.url}/v1/batches`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input_file_id: "file_mock", endpoint: "/v1/responses", completion_window: "24h" }) });
    const batch = await createBatch.json() as any;
    const batchPoll1 = await fetch(`${server.url}/v1/batches/${batch.id}`).then((response) => response.json()) as any;
    const batchPoll2 = await fetch(`${server.url}/v1/batches/${batch.id}`).then((response) => response.json()) as any;
    expect([batchPoll1.status, batchPoll2.status]).toEqual(["in_progress", "completed"]);
    expect((await fetch(`${server.url}/v1/batches/${batch.id}/cancel`, { method: "POST" }).then((response) => response.json()) as any).status).toBe("cancelling");
  });
});
