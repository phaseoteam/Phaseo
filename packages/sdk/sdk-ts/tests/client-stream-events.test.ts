import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";
import { Phaseo, SDK_VERSION, type ResponseStreamChunk } from "../src/index.js";

const ANSWER = "Paris is the capital of France.";

const sse = (event: string, data: Record<string, unknown>) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// Shape of a gateway /responses stream: named events, deltas, then done events that repeat the text.
const RESPONSES_STREAM = [
  sse("response.created", { type: "response.created", sequence_number: 0, response: { id: "resp_1", status: "in_progress", output: [] } }),
  sse("response.output_item.added", { type: "response.output_item.added", sequence_number: 1, output_index: 0, item: { id: "msg_1", type: "message", role: "assistant", content: [] } }),
  sse("response.content_part.added", { type: "response.content_part.added", sequence_number: 2, item_id: "msg_1", output_index: 0, content_index: 0, part: { type: "output_text", text: "" } }),
  sse("response.output_text.delta", { type: "response.output_text.delta", sequence_number: 3, item_id: "msg_1", output_index: 0, content_index: 0, delta: "Paris is" }),
  sse("response.output_text.delta", { type: "response.output_text.delta", sequence_number: 4, item_id: "msg_1", output_index: 0, content_index: 0, delta: " the capital of France." }),
  sse("response.output_text.done", { type: "response.output_text.done", sequence_number: 5, item_id: "msg_1", output_index: 0, content_index: 0, text: ANSWER }),
  sse("response.content_part.done", { type: "response.content_part.done", sequence_number: 6, item_id: "msg_1", output_index: 0, content_index: 0, part: { type: "output_text", text: ANSWER } }),
  sse("response.output_item.done", { type: "response.output_item.done", sequence_number: 7, output_index: 0, item: { id: "msg_1", type: "message", role: "assistant", content: [{ type: "output_text", text: ANSWER }] } }),
  sse("response.completed", { type: "response.completed", sequence_number: 8, response: { id: "resp_1", status: "completed", output_text: ANSWER, usage: { input_tokens: 12, output_tokens: 8, output_tokens_details: { reasoning_tokens: 0 } } } }),
  "data: [DONE]\n\n",
].join("");

function sseClient(path: string, body: string, chunkSize = 17): Phaseo {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== "POST" || String(input) !== `https://example.test/v1${path}`) {
      // Model lifecycle lookups are not part of these tests.
      return new Response("{}", { status: 404 });
    }
    const bytes = new TextEncoder().encode(body);
    return new Response(
      new ReadableStream({
        start(controller) {
          // Split mid-line so the reader has to reassemble SSE lines across network chunks.
          for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
          controller.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
  }) as typeof fetch;
  return new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://example.test/v1", fetchImpl });
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

describe("Responses stream events", () => {
  test("concatenated chunk text is the answer exactly once", async () => {
    const chunks = await collect(sseClient("/responses", RESPONSES_STREAM).streamResponses({ model: "openai/gpt-5-nano", input: "Capital of France?" }));

    expect(chunks.map((chunk) => chunk.text).join("")).toBe(ANSWER);
    // `event:` lines name the next payload; they are never yielded as chunks of their own.
    expect(chunks.some((chunk) => "raw" in chunk)).toBe(false);
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "response.created",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ]);
  });

  test("done events keep their full text on fullText, not text", async () => {
    const chunks = await collect(sseClient("/responses", RESPONSES_STREAM).streamResponses({ model: "openai/gpt-5-nano", input: "Capital of France?" }));
    const done = chunks.find((chunk) => chunk.type === "response.output_text.done") as ResponseStreamChunk;
    const completed = chunks.at(-1) as ResponseStreamChunk & { response: { output_text: string } };

    expect(done.text).toBe("");
    expect(done.fullText).toBe(ANSWER);
    expect(completed.text).toBe("");
    expect(completed.response.output_text).toBe(ANSWER);
    expect(completed.usage).toMatchObject({ output_tokens: 8 });
  });

  test("responses.create({ stream: true }) gives the same single copy of the answer", async () => {
    const stream = await sseClient("/responses", RESPONSES_STREAM).responses.create({ model: "openai/gpt-5-nano", input: "Capital of France?", stream: true } as never);
    let printed = "";
    for await (const chunk of stream as AsyncGenerator<ResponseStreamChunk>) {
      if (chunk.text) printed += chunk.text;
    }
    expect(printed).toBe(ANSWER);
  });

  test("an event line names untyped data and a named done event adds no text", async () => {
    const body = 'event: response.output_text.delta\ndata: {"delta":"Hi"}\n\nevent: response.output_text.done\ndata: {"text":"Hi"}\n\n';
    const chunks = await collect(sseClient("/responses", body).streamResponses({ model: "openai/gpt-5-nano", input: "hi" }));

    expect(chunks.map((chunk) => [chunk.type, chunk.text])).toEqual([
      ["response.output_text.delta", "Hi"],
      ["response.output_text.done", ""],
    ]);
    expect(chunks[1]?.fullText).toBe("Hi");
  });

  test("message streams skip event lines", async () => {
    const body = [
      sse("message_start", { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 3 } } }),
      sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } }),
      sse("message_stop", { type: "message_stop" }),
    ].join("");
    const chunks = await collect(sseClient("/messages", body).streamMessages({ model: "anthropic/claude-sonnet-4.5", max_tokens: 8, messages: [] } as never));

    expect(chunks.map((chunk) => chunk.type)).toEqual(["message_start", "content_block_delta", "message_stop"]);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe("Hi");
  });
});

describe("client version header", () => {
  test("X-Phaseo-Client-Version is the package version", async () => {
    const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    let sent: string | null = null;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = new Headers(init?.headers).get("X-Phaseo-Client-Version");
      return new Response(JSON.stringify({ id: "resp_1", output_text: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const client = new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://example.test/v1", fetchImpl, modelLifecycleChecks: false });
    await collect(client.streamResponse({ model: "openai/gpt-5-nano", input: "hi" }));

    expect(SDK_VERSION).toBe(version);
    expect(sent).toBe(version);
  });
});
