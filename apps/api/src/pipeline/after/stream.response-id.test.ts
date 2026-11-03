// A streamed response names itself the way the buffered body does: `id` is the Phaseo
// request ID and `nativeResponseId` is the provider's. Output item IDs stay the
// provider's. The stream writer runs for real; only accounting is stubbed.

import { describe, expect, it, vi } from "vitest";

vi.mock("../audit", () => ({
	auditSuccess: vi.fn(async () => undefined),
	auditFailure: vi.fn(async () => undefined),
}));

vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: vi.fn(async () => undefined),
}));

vi.mock("./charge", () => ({
	recordUsageAndChargeOnce: vi.fn(async () => undefined),
}));

vi.mock("@core/provider-rate-limits", () => ({
	recordManagedProviderTokensOnce: vi.fn(async () => undefined),
}));

vi.mock("../execute/health", () => ({
	classifyProviderHealthImpact: () => "success",
	onCallEnd: vi.fn(async () => undefined),
	reportProbeResult: vi.fn(async () => undefined),
	maybeOpenOnRecentErrors: vi.fn(async () => undefined),
}));

vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: vi.fn(async () => undefined),
	resolveCacheAwareRoutingPreference: () => false,
}));

vi.mock("./pricing", () => ({
	calculatePricing: (usage: any) => ({ pricedUsage: usage, totalCents: 0, totalNanos: 0, currency: "USD" }),
}));

vi.mock("@/runtime/env", () => ({
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => {
		void promise.catch(() => {});
	},
}));

import type { IRChatResponse } from "@core/ir";
import { createSyntheticResponsesStreamFromIR } from "@executors/_shared/text-generate/synthetic-responses-stream";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { handleStreamResponse } from "./stream";

const REQUEST_ID = "G-req-stream-id";
const MODEL = "openai/gpt-6-luna";

function sse(event: string | null, data: unknown): string {
	return `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
}

function responsesUpstream(): string[] {
	const response = { id: "resp_upstream", object: "response", model: "gpt-6-luna" };
	const message = { id: "msg_upstream", type: "message", role: "assistant" };
	const done = { ...message, status: "completed", content: [{ type: "output_text", text: "hello", annotations: [] }] };
	return [
		sse("response.created", { type: "response.created", response: { ...response, status: "in_progress", output: [] } }),
		sse("response.in_progress", { type: "response.in_progress", response: { ...response, status: "in_progress", output: [] } }),
		sse("response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { ...message, status: "in_progress", content: [] } }),
		sse("response.output_text.delta", { type: "response.output_text.delta", item_id: "msg_upstream", output_index: 0, content_index: 0, delta: "hello" }),
		sse("response.output_item.done", { type: "response.output_item.done", output_index: 0, item: done }),
		sse("response.completed", {
			type: "response.completed",
			response: { ...response, status: "completed", output: [done], usage: { input_tokens: 11, output_tokens: 4, total_tokens: 15 } },
		}),
	];
}

function chatUpstream(): string[] {
	const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) =>
		sse(null, { id: "chatcmpl_upstream", object: "chat.completion.chunk", created: 1, model: "gpt-6-luna", choices, ...extra });
	return [
		chunk([{ index: 0, delta: { role: "assistant", content: "hello" }, finish_reason: null }]),
		chunk([{ index: 0, delta: {}, finish_reason: "stop" }]),
		chunk([], { usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 } }),
		"data: [DONE]\n\n",
	];
}

function messagesUpstream(): string[] {
	return [
		sse("message_start", {
			type: "message_start",
			message: { id: "msg_anthropic_upstream", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 11, output_tokens: 0 } },
		}),
		sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
		sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } }),
		sse("content_block_stop", { type: "content_block_stop", index: 0 }),
		sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } }),
		sse("message_stop", { type: "message_stop" }),
	];
}

const IR: IRChatResponse = {
	id: REQUEST_ID,
	nativeId: "resp_buffered_upstream",
	created: 1,
	model: MODEL,
	provider: "openai",
	choices: [{ index: 0, message: { role: "assistant", content: [{ type: "text", text: "hello" }] }, finishReason: "stop" }],
	usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 },
};

const PROTOCOLS = { responses: "openai.responses", "chat.completions": "openai.chat.completions", messages: "anthropic.messages" } as const;

function ctxFor(endpoint: keyof typeof PROTOCOLS): any {
	return {
		requestId: REQUEST_ID,
		workspaceId: "ws_local_test",
		endpoint,
		protocol: PROTOCOLS[endpoint],
		capability: "text.generate",
		model: MODEL,
		requestedModel: MODEL,
		stream: true,
		body: { model: MODEL, stream: true },
		rawBody: { model: MODEL, stream: true },
		meta: { requestId: REQUEST_ID, apiKeyId: "key_local_test", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
	};
}

async function clientFrames(ctx: any, upstream: ReadableStream<Uint8Array> | string[]) {
	const encoder = new TextEncoder();
	const stream = Array.isArray(upstream)
		? new ReadableStream<Uint8Array>({
			start(controller) {
				for (const frame of upstream) controller.enqueue(encoder.encode(frame));
				controller.close();
			},
		})
		: upstream;
	const response = await handleStreamResponse(ctx, {
		kind: "stream",
		stream,
		upstream: new Response(null, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
		provider: "openai",
		usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
	} as any, null);
	const text = await response.text();
	return text.split("\n\n").filter(Boolean).flatMap((block) => {
		const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
		if (!data || data === "[DONE]") return [];
		const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7) ?? null;
		return [{ event, data: JSON.parse(data) }];
	});
}

function responseObjects(frames: Array<{ data: any }>) {
	return frames.map(({ data }) => data.response).filter((response) => response && typeof response === "object");
}

describe("streamed response id", () => {
	it("a Responses stream from a Responses provider names the request, with the provider's id as nativeResponseId", async () => {
		const frames = await clientFrames(ctxFor("responses"), responsesUpstream());
		const responses = responseObjects(frames);
		expect(responses.map((response) => response.id)).toEqual([REQUEST_ID, REQUEST_ID, REQUEST_ID]);
		expect(new Set(responses.map((response) => response.nativeResponseId))).toEqual(new Set(["resp_upstream"]));
		// Output items keep the provider's ids; clients pair deltas with items by them.
		expect(frames.find((frame) => frame.event === "response.output_text.delta")?.data.item_id).toBe("msg_upstream");
		expect(frames.find((frame) => frame.event === "response.completed")?.data.response.output[0].id).toBe("msg_upstream");
	});

	it("a Responses stream made from a buffered provider reply has the buffered body's ids", async () => {
		const buffered = encodeOpenAIResponsesResponse(IR, REQUEST_ID);
		const frames = await clientFrames(ctxFor("responses"), createSyntheticResponsesStreamFromIR(IR, REQUEST_ID));
		const completed = frames.find((frame) => frame.event === "response.completed")?.data.response;
		expect({ id: completed.id, nativeResponseId: completed.nativeResponseId })
			.toEqual({ id: buffered.id, nativeResponseId: buffered.nativeResponseId });
		expect(new Set(responseObjects(frames).map((response) => response.id))).toEqual(new Set([REQUEST_ID]));
	});

	it("a Chat provider stream re-encoded for a Responses client keeps the provider's id as nativeResponseId", async () => {
		const frames = await clientFrames(ctxFor("responses"), chatUpstream());
		const responses = responseObjects(frames);
		expect(responses.length).toBeGreaterThan(0);
		expect(new Set(responses.map((response) => response.id))).toEqual(new Set([REQUEST_ID]));
		expect(new Set(responses.map((response) => response.nativeResponseId))).toEqual(new Set(["chatcmpl_upstream"]));
	});

	it("a Chat stream names the request on every chunk, with the provider's id as nativeResponseId", async () => {
		const frames = await clientFrames(ctxFor("chat.completions"), chatUpstream());
		expect(frames.length).toBeGreaterThan(0);
		expect(new Set(frames.map(({ data }) => data.id))).toEqual(new Set([REQUEST_ID]));
		expect(new Set(frames.map(({ data }) => data.nativeResponseId))).toEqual(new Set(["chatcmpl_upstream"]));
	});

	it("a Messages stream names the message the way the buffered body does", async () => {
		const frames = await clientFrames(ctxFor("messages"), messagesUpstream());
		const start = frames.find((frame) => frame.event === "message_start")?.data.message;
		expect({ id: start.id, nativeResponseId: start.nativeResponseId })
			.toEqual({ id: REQUEST_ID, nativeResponseId: "msg_anthropic_upstream" });
		expect(start.usage.input_tokens).toBe(11);
	});

	it("a Messages provider stream re-encoded for a Chat client never reports the request id as the provider's", async () => {
		const frames = await clientFrames(ctxFor("chat.completions"), messagesUpstream());
		expect(frames.length).toBeGreaterThan(0);
		expect(new Set(frames.map(({ data }) => data.id))).toEqual(new Set([REQUEST_ID]));
		expect(new Set(frames.map(({ data }) => data.nativeResponseId))).toEqual(new Set(["msg_anthropic_upstream"]));
	});
});
