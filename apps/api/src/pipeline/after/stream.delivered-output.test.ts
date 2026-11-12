// A stream is billed for the output its client received. A provider stream in another protocol is
// re-encoded for the client, and an encoder can drop a part: the zero-output check reads the frames
// written to the client, not the provider's events.
import { beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ charge: vi.fn() }));

vi.mock("../audit", () => ({ auditSuccess: vi.fn(), auditFailure: vi.fn() }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn() }));
vi.mock("./charge", () => ({ recordUsageAndChargeOnce: (...args: any[]) => mocks.charge(...args) }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: vi.fn() }));
vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: vi.fn(),
	resolveCacheAwareRoutingPreference: () => false,
}));
vi.mock("../pricing/byok-fee", () => ({
	applyByokServiceFee: async ({ baseCostNanos, pricedUsage, currencyHint }: any) => ({
		totalCents: Math.round(baseCostNanos / 1e7), totalNanos: baseCostNanos, currency: currencyHint, pricedUsage,
	}),
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { void promise.catch(() => {}); },
}));

import { handleStreamResponse } from "./stream";
import { extractUnifiedStreamEvents } from "./stream-events";
import { setupTestRuntime } from "../../../tests/helpers/runtime";

// $0.001 per request, whatever the tokens: a response with no output tokens and no billable input
// is charged only if it delivered other output.
const card: any = {
	provider: "openai", model: "openai/router", endpoint: "text.generate", currency: "USD",
	rules: [{ pricing_plan: "standard", meter: "requests", unit: "request", unit_size: 1, price_per_unit: "0.001", currency: "USD", match: [], priority: 100 }],
};

beforeAll(() => setupTestRuntime());

const OUTPUTS = {
	reasoning: { delta: { reasoning_content: "Checking the date." }, finish: "stop" },
	"tool call": { delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: "{}" } }] }, finish: "tool_calls" },
	media: { delta: { images: [{ type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } }] }, finish: "stop" },
} as const;
const PROTOCOLS = {
	"openai.chat.completions": { endpoint: "chat.completions" },
	"anthropic.messages": { endpoint: "messages" },
	"openai.responses": { endpoint: "responses" },
} as const;

async function streamTo(protocol: keyof typeof PROTOCOLS, output: keyof typeof OUTPUTS) {
	const { delta, finish } = OUTPUTS[output];
	const frames = [
		{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", ...delta }, finish_reason: null }] },
		{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: finish }] },
		{ id: "c1", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 } },
	];
	const upstream = new Response(
		frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n",
		{ status: 200, headers: { "Content-Type": "text/event-stream" } },
	);
	const ctx: any = {
		requestId: `req_${protocol}_${output}`, workspaceId: "ws", endpoint: PROTOCOLS[protocol].endpoint, protocol,
		capability: "text.generate", model: "openai/router", requestedModel: "openai/router", stream: true,
		body: { model: "openai/router", stream: true }, rawBody: {},
		meta: { requestId: "req", apiKeyId: "key", authMethod: "api_key" }, providers: [], pricing: {}, gating: {},
	};
	mocks.charge.mockReset().mockResolvedValue(undefined);
	const response = await handleStreamResponse(ctx, {
		kind: "stream", stream: upstream.body, upstream, provider: "openai",
		usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
	} as any, card);
	const text = await response.text();
	await new Promise((resolve) => setTimeout(resolve, 20));
	// What the client received, read in its own protocol.
	const received = text.split("\n\n").filter(Boolean).flatMap((block) => {
		const eventName = block.match(/^event: (.+)$/m)?.[1];
		const data = block.match(/^data: (.+)$/m)?.[1];
		if (!data || data === "[DONE]") return [];
		return extractUnifiedStreamEvents({ protocol, eventName, frame: JSON.parse(data) });
	});
	const charged = mocks.charge.mock.calls.reduce((sum, [args]) => sum + Number(args.costNanos), 0);
	return { received, charged };
}

const delivered = (received: any[], output: keyof typeof OUTPUTS) => received.some((event) =>
	output === "reasoning" ? event.type === "delta_text" && event.channel === "reasoning_text" && event.text.trim()
		: output === "tool call" ? event.type === "delta_tool"
			: event.type === "delta_content_part");

describe("a stream is charged for the output its client received", () => {
	for (const protocol of Object.keys(PROTOCOLS) as Array<keyof typeof PROTOCOLS>) {
		for (const output of Object.keys(OUTPUTS) as Array<keyof typeof OUTPUTS>) {
			it(`Chat-shaped provider stream to ${protocol}: ${output}`, async () => {
				const { received, charged } = await streamTo(protocol, output);
				// Every encoder carries these, except Messages, which has no block for a media part.
				expect(delivered(received, output)).toBe(!(protocol === "anthropic.messages" && output === "media"));
				// Charged exactly when the client received the output, and only then.
				expect(charged).toBe(delivered(received, output) ? 1_000_000 : 0);
			});
		}
	}

	it("does not charge a Messages client for a media part its encoder dropped", async () => {
		const { received, charged } = await streamTo("anthropic.messages", "media");
		// Before: the provider's media event was recorded as delivered, so the client paid 1,000,000
		// for a stream with no content blocks.
		expect(delivered(received, "media")).toBe(false);
		expect(charged).toBe(0);
	});
});

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const charged = () => mocks.charge.mock.calls.reduce((sum, [args]) => sum + Number(args.costNanos), 0);
const chatCtx = (requestId: string): any => ({
	requestId, workspaceId: "ws", endpoint: "chat.completions", protocol: "openai.chat.completions", capability: "text.generate",
	model: "openai/router", stream: true, body: { stream: true }, rawBody: {}, meta: {}, providers: [], pricing: {}, gating: {},
});

/**
 * The client disconnects. `deliveredFirst`: the output reached it before it left; otherwise the
 * provider sends it after. The final usage has zero tokens unless `outputTokens` is given.
 */
async function disconnected(output: keyof typeof OUTPUTS, deliveredFirst: boolean, outputTokens = 0) {
	let source!: ReadableStreamDefaultController<Uint8Array>;
	const encoder = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
	const send = (frame: Record<string, unknown>) =>
		source.enqueue(encoder.encode(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", ...frame })}\n\n`));
	const upstream = new Response(body, { status: 200 });
	mocks.charge.mockReset().mockResolvedValue(undefined);
	const response = await handleStreamResponse(chatCtx("req_disconnect"), {
		kind: "stream", stream: upstream.body, upstream, provider: "openai", usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
	} as any, card);
	const reader = response.body!.getReader();
	if (deliveredFirst) {
		send({ choices: [{ index: 0, delta: OUTPUTS[output].delta, finish_reason: null }] });
		expect(new TextDecoder().decode((await reader.read()).value)).toContain("data:");
		await turn();
	}
	await reader.cancel("disconnected");
	await turn();
	if (!deliveredFirst) send({ choices: [{ index: 0, delta: OUTPUTS[output].delta, finish_reason: null }] });
	send({ choices: [{ index: 0, delta: {}, finish_reason: OUTPUTS[output].finish }] });
	send({ choices: [], usage: { prompt_tokens: 0, completion_tokens: outputTokens, total_tokens: outputTokens, cost: 0 } });
	source.enqueue(encoder.encode("data: [DONE]\n\n"));
	source.close();
	for (let i = 0; i < 100 && !mocks.charge.mock.calls.length; i++) await turn();
	return charged();
}

describe("a client that disconnected is charged for what it received, and for the provider's tokens", () => {
	for (const output of Object.keys(OUTPUTS) as Array<keyof typeof OUTPUTS>) {
		it(`waives ${output} the provider sent after the client left`, async () => {
			// Before (tool call): the gateway's count of the provider's tool call (output_tool_call_count)
			// defeated the waiver although nothing was delivered: 1,000,000.
			expect(await disconnected(output, false)).toBe(0);
		});
		it(`charges ${output} the client received before it left`, async () => {
			expect(await disconnected(output, true)).toBe(1_000_000);
		});
	}

	it("charges output tokens the provider reports after the client left", async () => {
		expect(await disconnected("reasoning", false, 10)).toBe(1_000_000);
	});
});

describe("a usage frame that also carries the stream's first output", () => {
	it.each(["reasoning", "media"] as const)("prices its own %s output, as settlement charges it", async (output) => {
		const frame = {
			id: "same", object: "chat.completion.chunk",
			choices: [{ index: 0, delta: OUTPUTS[output].delta, finish_reason: "stop" }],
			usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 },
		};
		const upstream = new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`, { status: 200 });
		mocks.charge.mockReset().mockResolvedValue(undefined);
		const response = await handleStreamResponse(chatCtx("req_same_frame"), {
			kind: "stream", stream: upstream.body, upstream, provider: "openai", usageFinalizer: async () => null,
			bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
		} as any, card);
		const wire = await response.text();
		for (let i = 0; i < 100 && !mocks.charge.mock.calls.length; i++) await turn();
		const usage = wire.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)))
			.filter((chunk) => chunk.usage).at(-1)?.usage;
		expect(charged()).toBe(1_000_000);
		// Before: the frame was priced before its output was recorded as delivered: total_nanos 0.
		expect(usage.pricing.total_nanos).toBe(1_000_000);
	});
});
