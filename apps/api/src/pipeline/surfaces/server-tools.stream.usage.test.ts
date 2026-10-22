// Purpose: Cache and reasoning usage through the buffered (materialised stream) path.
// Why: The gateway always streams upstream; buffered clients get the stream re-encoded from IR,
//      so the IR must keep each surface's cache semantics or the body and the bill drift.
// How: Feed each client protocol's final usage frame through consumeTextProtocolStreamToIR,
//      re-encode it, merge it the way pipeline/after/index.ts does, and check the shaped meters.

import { describe, expect, it } from "vitest";
import { consumeTextProtocolStreamToIR } from "./server-tools.stream";
import { encodeProtocol } from "@protocols/index";
import { shapeUsageForClient } from "@pipeline/usage";
import { normalizeAnthropicUsage, presentUsageForClient } from "@pipeline/after/payload";
import type { Protocol } from "@protocols/detect";

// 100,003 uncached + 20,011 read + 3,019 written (1,013 for 5 minutes, 2,006 for 1 hour).
const UNCACHED = 100_003;
const READ = 20_011;
const WRITE_5M = 1_013;
const WRITE_1H = 2_006;
const WRITE = WRITE_5M + WRITE_1H;
const OUTPUT = 5_003;
const REASONING = 1_109;
const OPENAI_INPUT = UNCACHED + READ + WRITE;

function sse(frames: Array<{ event?: string; data: unknown }>): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) {
				const prefix = frame.event ? `event: ${frame.event}\n` : "";
				controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(frame.data)}\n\n`));
			}
			controller.close();
		},
	});
}

// The usage each surface's stream carries to the materialiser, as the gateway's own encoders write it.
const STREAMS: Record<string, { protocol: Protocol; frames: Array<{ event?: string; data: unknown }> }> = {
	chat: {
		protocol: "openai.chat.completions",
		frames: [
			{ data: { object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: "stop" }] } },
			{
				data: {
					object: "chat.completion.chunk",
					choices: [],
					usage: {
						input_tokens: OPENAI_INPUT,
						output_tokens: OUTPUT,
						total_tokens: OPENAI_INPUT + OUTPUT,
						prompt_tokens: OPENAI_INPUT,
						completion_tokens: OUTPUT,
						reasoning_tokens: REASONING,
						input_details: { cached_tokens: READ, cache_write_tokens: WRITE },
						cached_read_tokens_are_subset_of_input: true,
						cached_write_text_tokens: WRITE,
						cached_write_tokens_are_subset_of_input: true,
						cached_write_text_tokens_5m: WRITE_5M,
						cached_write_text_tokens_1h: WRITE_1H,
						output_tokens_details: { reasoning_tokens: REASONING },
					},
				},
			},
		],
	},
	responses: {
		protocol: "openai.responses",
		frames: [
			{ event: "response.output_text.delta", data: { type: "response.output_text.delta", output_index: 0, delta: "Hi" } },
			{
				event: "response.completed",
				data: {
					type: "response.completed",
					response: {
						id: "resp_1",
						object: "response",
						status: "completed",
						output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Hi" }] }],
						usage: {
							input_tokens: OPENAI_INPUT,
							output_tokens: OUTPUT,
							total_tokens: OPENAI_INPUT + OUTPUT,
							input_tokens_details: { cached_tokens: READ, cache_write_tokens: WRITE },
							output_tokens_details: { reasoning_tokens: REASONING },
							cached_write_text_tokens_5m: WRITE_5M,
							cached_write_text_tokens_1h: WRITE_1H,
						},
					},
				},
			},
		],
	},
	messages: {
		protocol: "anthropic.messages",
		frames: [
			{
				event: "message_start",
				data: {
					type: "message_start",
					message: { id: "msg_1", type: "message", role: "assistant", content: [], model: "m", usage: { input_tokens: 0, output_tokens: 0 } },
				},
			},
			{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
			{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } } },
			{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
			{
				event: "message_delta",
				data: {
					type: "message_delta",
					delta: { stop_reason: "end_turn", stop_sequence: null },
					usage: {
						input_tokens: UNCACHED,
						output_tokens: OUTPUT,
						cache_read_input_tokens: READ,
						cache_creation_input_tokens: WRITE,
						cache_creation: { ephemeral_5m_input_tokens: WRITE_5M, ephemeral_1h_input_tokens: WRITE_1H },
					},
				},
			},
			{ event: "message_stop", data: { type: "message_stop" } },
		],
	},
};

const ENDPOINT = { chat: "chat.completions", responses: "responses", messages: "messages" } as const;

async function materialise(surface: keyof typeof STREAMS) {
	const { protocol, frames } = STREAMS[surface];
	const consumed = await consumeTextProtocolStreamToIR({
		protocol,
		stream: sse(frames),
		requestId: "req_usage",
		model: "m",
		provider: "p",
	});
	const encoded = encodeProtocol(protocol, consumed.ir, "req_usage");
	// pipeline/after/index.ts: the bill's usage under the encoded body's usage.
	const merged = { ...(consumed.usageRaw ?? {}), ...(encoded?.usage ?? {}) };
	const shaped = shapeUsageForClient(merged, { endpoint: ENDPOINT[surface], includeInternalHints: true });
	return { consumed, encoded, shaped };
}

describe("buffered usage through the materialised stream", () => {
	it.each(["chat", "responses", "messages"] as const)("keeps cache reads and TTL writes for %s", async (surface) => {
		const { consumed, shaped } = await materialise(surface);

		expect(consumed.ir.usage?.cachedInputTokens).toBe(READ);
		expect(consumed.ir.usage?._ext?.cachedWriteTokens).toBe(WRITE);
		expect(consumed.ir.usage?._ext?.cachedWriteTokens5m).toBe(WRITE_5M);
		expect(consumed.ir.usage?._ext?.cachedWriteTokens1h).toBe(WRITE_1H);
		// Billing meters: OpenAI semantics, each token counted once.
		expect(shaped.input_tokens).toBe(OPENAI_INPUT);
		expect(shaped.input_tokens_details).toMatchObject({ cached_tokens: READ, cache_write_tokens: WRITE });
		expect(shaped.cached_write_text_tokens_5m).toBe(WRITE_5M);
		expect(shaped.cached_write_text_tokens_1h).toBe(WRITE_1H);
	});

	it("reports OpenAI semantics and reasoning details to buffered Chat clients", async () => {
		const { encoded, shaped } = await materialise("chat");
		expect(encoded.usage.input_tokens).toBe(OPENAI_INPUT);
		const client = presentUsageForClient(shaped, { endpoint: "chat.completions" });
		expect(client).toMatchObject({
			prompt_tokens: OPENAI_INPUT,
			completion_tokens: OUTPUT,
			prompt_tokens_details: { cached_tokens: READ, cache_write_tokens: WRITE },
			completion_tokens_details: { reasoning_tokens: REASONING },
		});
	});

	it("reports OpenAI semantics to buffered Responses clients", async () => {
		const { encoded } = await materialise("responses");
		expect(encoded.usage).toMatchObject({
			input_tokens: OPENAI_INPUT,
			input_tokens_details: { cached_tokens: READ, cache_write_tokens: WRITE },
		});
	});

	it("reports Anthropic semantics to buffered Messages clients", async () => {
		const { consumed, encoded } = await materialise("messages");
		const expected = {
			input_tokens: UNCACHED,
			output_tokens: OUTPUT,
			cache_read_input_tokens: READ,
			cache_creation_input_tokens: WRITE,
			cache_creation: { ephemeral_5m_input_tokens: WRITE_5M, ephemeral_1h_input_tokens: WRITE_1H },
		};
		expect(encoded.usage).toMatchObject(expected);
		// formatClientPayload: client usage shaping, then back to Anthropic fields.
		const client = normalizeAnthropicUsage(
			presentUsageForClient(encoded.usage, { endpoint: "messages" }),
			consumed.ir.usage,
		);
		expect(client).toMatchObject(expected);
		expect(client).not.toHaveProperty("input_tokens_details");
	});
});

// A native Messages stream (Claude Opus 5.5 on Bedrock and Vertex is passed through to Messages
// clients unchanged) reports input and cache counts on message_start and only the cumulative
// output on message_delta. Some upstreams repeat input_tokens on message_delta as 0.
function nativeMessagesStream(deltaUsage: Record<string, unknown>) {
	return sse([
		{
			event: "message_start",
			data: {
				type: "message_start",
				message: {
					id: "msg_native",
					type: "message",
					role: "assistant",
					content: [],
					model: "claude-opus-5-5",
					usage: {
						input_tokens: UNCACHED,
						cache_read_input_tokens: READ,
						cache_creation_input_tokens: WRITE,
						cache_creation: { ephemeral_5m_input_tokens: WRITE_5M, ephemeral_1h_input_tokens: WRITE_1H },
						output_tokens: 1,
					},
				},
			},
		},
		{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } } },
		{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
		{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: deltaUsage } },
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

describe("native Messages streams through the materialised stream", () => {
	it.each([
		["omits input_tokens", { output_tokens: OUTPUT }],
		["repeats input and cache counts as 0", {
			input_tokens: 0,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 0,
			cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
			output_tokens: OUTPUT,
		}],
		["repeats the cumulative counts", {
			input_tokens: UNCACHED,
			cache_read_input_tokens: READ,
			cache_creation_input_tokens: WRITE,
			output_tokens: OUTPUT,
		}],
	])("keeps message_start input and cache counts when message_delta %s", async (_name, deltaUsage) => {
		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "anthropic.messages",
			stream: nativeMessagesStream(deltaUsage),
			requestId: "req_usage",
			model: "m",
			provider: "amazon-bedrock",
		});
		expect(consumed.usageRaw).toMatchObject({
			input_tokens: UNCACHED,
			cache_read_input_tokens: READ,
			cache_creation_input_tokens: WRITE,
			cache_creation: { ephemeral_5m_input_tokens: WRITE_5M, ephemeral_1h_input_tokens: WRITE_1H },
			output_tokens: OUTPUT,
		});
		// The IR keeps Messages semantics: input_tokens excludes the cache.
		expect(consumed.ir.usage).toMatchObject({
			inputTokens: UNCACHED,
			outputTokens: OUTPUT,
			cachedInputTokens: READ,
			_ext: { cachedWriteTokens: WRITE, cachedWriteTokens5m: WRITE_5M, cachedWriteTokens1h: WRITE_1H },
		});

		const encoded = encodeProtocol("anthropic.messages", consumed.ir, "req_usage");
		const shaped = shapeUsageForClient(
			{ ...(consumed.usageRaw ?? {}), ...(encoded?.usage ?? {}) },
			{ endpoint: "messages", includeInternalHints: true },
		);
		// Billing meters: OpenAI semantics, each token counted once.
		expect(shaped.input_tokens).toBe(OPENAI_INPUT);
		expect(shaped.output_tokens).toBe(OUTPUT);
		expect(shaped.input_tokens_details).toMatchObject({ cached_tokens: READ, cache_write_tokens: WRITE });
		expect(shaped.cached_write_text_tokens_5m).toBe(WRITE_5M);
		expect(shaped.cached_write_text_tokens_1h).toBe(WRITE_1H);
	});
});

describe("OpenAI 30-minute and 12-hour cache writes through the materialised stream", () => {
	it("keeps the lifetime split from a Responses usage frame", async () => {
		const usage = {
			input_tokens: 53_100,
			output_tokens: 850,
			total_tokens: 53_950,
			input_tokens_details: {
				cached_tokens: 48_000,
				cache_write_tokens: 3_000,
				cache_write_tokens_details: { ttl_30m_tokens: 1_000, ttl_12h_tokens: 2_000 },
			},
		};
		const response = { id: "resp_1", object: "response", status: "completed", model: "m", output: [], usage };
		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream: sse([{ event: "response.completed", data: { type: "response.completed", response } }]),
			requestId: "req_usage",
			model: "m",
			provider: "p",
		});
		expect(consumed.ir.usage?._ext).toMatchObject({ cachedWriteTokens: 3_000, cachedWriteTokens30m: 1_000, cachedWriteTokens12h: 2_000 });
		const encoded = encodeProtocol("openai.responses", consumed.ir, "req_usage");
		const shaped = shapeUsageForClient({ ...(consumed.usageRaw ?? {}), ...(encoded?.usage ?? {}) }, { endpoint: "responses", includeInternalHints: true });
		expect(shaped).toMatchObject({
			input_tokens: 53_100,
			cached_write_text_tokens_30m: 1_000,
			cached_write_text_tokens_12h: 2_000,
			input_tokens_details: { cache_write_tokens: 3_000, cache_write_tokens_details: { ttl_30m_tokens: 1_000, ttl_12h_tokens: 2_000 } },
		});
	});
});
