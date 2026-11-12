// Every streamed event a client receives names the Phaseo model the request resolved
// to, as the buffered body does, even when the provider echoes its own model id.
// The stream writer runs for real; only accounting side effects are stubbed.

import { beforeEach, describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const recordUsageAndChargeOnceMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: vi.fn(async () => undefined),
}));

vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: vi.fn(async () => undefined),
}));

vi.mock("./charge", () => ({
	recordUsageAndChargeOnce: (...args: any[]) => recordUsageAndChargeOnceMock(...args),
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

import { handleStreamResponse } from "./stream";

type Surface = "responses" | "chat.completions" | "messages";

function sse(event: string | null, data: unknown): string {
	return `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
}

/** A provider stream in the client's own protocol, echoing the provider's model id. */
function upstreamFrames(surface: Surface, providerModel: string): string[] {
	if (surface === "responses") {
		const response = { id: "resp_upstream", object: "response", model: providerModel };
		const message = { id: "msg_1", type: "message", role: "assistant" };
		return [
			sse("response.created", { type: "response.created", response: { ...response, status: "in_progress", output: [] } }),
			sse("response.in_progress", { type: "response.in_progress", response: { ...response, status: "in_progress", output: [] } }),
			sse("response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { ...message, status: "in_progress", content: [] } }),
			sse("response.output_text.delta", { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, content_index: 0, delta: "hello" }),
			sse("response.output_item.done", { type: "response.output_item.done", output_index: 0, item: { ...message, status: "completed", content: [{ type: "output_text", text: "hello", annotations: [] }] } }),
			sse("response.completed", {
				type: "response.completed",
				response: {
					...response,
					status: "completed",
					output: [{ ...message, status: "completed", content: [{ type: "output_text", text: "hello", annotations: [] }] }],
					usage: { input_tokens: 11, output_tokens: 4, total_tokens: 15 },
				},
			}),
			"data: [DONE]\n\n",
		];
	}
	if (surface === "chat.completions") {
		const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) =>
			sse(null, { id: "chatcmpl_upstream", object: "chat.completion.chunk", created: 1, model: providerModel, choices, ...extra });
		return [
			chunk([{ index: 0, delta: { role: "assistant", content: "hello" }, finish_reason: null }]),
			chunk([{ index: 0, delta: {}, finish_reason: "stop" }]),
			chunk([], { usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 } }),
			"data: [DONE]\n\n",
		];
	}
	return [
		sse("message_start", {
			type: "message_start",
			message: { id: "msg_upstream", type: "message", role: "assistant", model: providerModel, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 11, output_tokens: 0 } },
		}),
		sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
		sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } }),
		sse("content_block_stop", { type: "content_block_stop", index: 0 }),
		sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } }),
		sse("message_stop", { type: "message_stop" }),
	];
}

function ctxFor(surface: Surface, model: string, protocol?: string): any {
	return {
		requestId: "req_stream_model_id",
		workspaceId: "ws_local_test",
		endpoint: surface,
		protocol: protocol ?? (surface === "responses" ? "openai.responses" : surface === "chat.completions" ? "openai.chat.completions" : "anthropic.messages"),
		capability: "text.generate",
		model,
		requestedModel: model,
		stream: true,
		body: { model, stream: true },
		rawBody: { model, stream: true },
		meta: { requestId: "req_stream_model_id", apiKeyId: "key_local_test", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
	};
}

async function clientFrames(ctx: any, frames: string[], provider: string) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) controller.enqueue(encoder.encode(frame));
			controller.close();
		},
	});
	const response = await handleStreamResponse(ctx, {
		kind: "stream",
		stream,
		upstream: new Response(null, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
		provider,
		usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
	} as any, null);
	const text = await response.text();
	await new Promise((resolve) => setTimeout(resolve, 0));
	return text.split("\n\n").filter(Boolean).flatMap((block) => {
		const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
		if (!data || data === "[DONE]") return [];
		const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7) ?? null;
		return [{ event, data: JSON.parse(data) }];
	});
}

/** Every `model` a client can read from a frame: top level, Responses `response`, Messages `message`. */
function modelsIn(frames: Array<{ data: any }>): string[] {
	return frames.flatMap(({ data }) => [data?.model, data?.response?.model, data?.message?.model].filter((value) => typeof value === "string"));
}

describe("streamed model id", () => {
	beforeEach(() => {
		auditSuccessMock.mockReset().mockResolvedValue(undefined);
		recordUsageAndChargeOnceMock.mockReset().mockResolvedValue(undefined);
	});

	it.each([
		["responses", "deepseek/deepseek-v4.1-flash-1017", "deepseek-ai/DeepSeek-V4.1-Flash-1017", "doubleword"],
		["responses", "openai/gpt-6-luna", "gpt-6-luna", "openai"],
		["responses", "anthropic/claude-sonnet-5.5", "claude-sonnet-5-5", "amazon-bedrock"],
		["chat.completions", "openai/gpt-6-luna", "gpt-6-luna", "openai"],
		["chat.completions", "deepseek/deepseek-v4.1-flash-1017", "deepseek-v4.1-flash-1017", "doubleword"],
		["messages", "anthropic/claude-sonnet-5.5", "claude-sonnet-5-5", "amazon-bedrock"],
	] as const)("%s: every event names %s, not the provider's %s", async (surface, phaseoModel, providerModel, provider) => {
		const frames = await clientFrames(ctxFor(surface, phaseoModel), upstreamFrames(surface, providerModel), provider);
		const models = modelsIn(frames);
		expect(models.length).toBeGreaterThan(0);
		expect(new Set(models)).toEqual(new Set([phaseoModel]));
		expect(JSON.stringify(frames)).not.toContain(`"${providerModel}"`);

		if (surface === "responses") {
			for (const event of ["response.created", "response.in_progress", "response.completed"]) {
				expect(frames.find((frame) => frame.event === event)?.data.response.model).toBe(phaseoModel);
			}
		}
		if (surface === "messages") {
			expect(frames.find((frame) => frame.event === "message_start")?.data.message.model).toBe(phaseoModel);
		}
		// Every Chat chunk carries the model, including the finish and usage chunks.
		if (surface === "chat.completions") {
			expect(frames.every((frame) => frame.data.model === phaseoModel)).toBe(true);
		}
	});

	it("re-encodes a foreign provider stream with the Phaseo id (Chat upstream, Responses client)", async () => {
		const frames = await clientFrames(
			ctxFor("responses", "openai/gpt-6-luna"),
			upstreamFrames("chat.completions", "gpt-6-luna"),
			"openai",
		);
		const models = modelsIn(frames);
		expect(models.length).toBeGreaterThan(0);
		expect(new Set(models)).toEqual(new Set(["openai/gpt-6-luna"]));
	});

	it("re-encodes a foreign provider stream with the Phaseo id (Messages upstream, Chat client)", async () => {
		const frames = await clientFrames(
			ctxFor("chat.completions", "anthropic/claude-sonnet-5.5"),
			upstreamFrames("messages", "claude-sonnet-5-5"),
			"amazon-bedrock",
		);
		const models = modelsIn(frames);
		expect(models.length).toBeGreaterThan(0);
		expect(new Set(models)).toEqual(new Set(["anthropic/claude-sonnet-5.5"]));
	});

	it("keeps request logging and billing on the request's model", async () => {
		await clientFrames(ctxFor("responses", "openai/gpt-6-luna"), upstreamFrames("responses", "gpt-6-luna"), "openai");
		await vi.waitFor(() => expect(auditSuccessMock).toHaveBeenCalled());
		// gateway_requests.model_id comes from the request context, never from stream frames.
		expect(auditSuccessMock.mock.calls[0][0]).toMatchObject({ model: "openai/gpt-6-luna", stream: true });
	});
});
