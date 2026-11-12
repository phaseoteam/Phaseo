// A passed-through OpenAI Chat stream with audio output keeps its delta.audio pieces and is
// billed from the audio token counts in the raw usage frame.
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
		totalCents: Math.round(baseCostNanos / 1e7),
		totalNanos: baseCostNanos,
		currency: currencyHint,
		pricedUsage,
	}),
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { void promise.catch(() => {}); },
}));

import { handleStreamResponse } from "./stream";
import { setupTestRuntime } from "../../../tests/helpers/runtime";

const rule = (meter: string, price: string) => ({
	pricing_plan: "standard", meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100,
});
// gpt-audio per 1M tokens: text $2.50 in / $10 out, audio $32 in / $64 out.
const card: any = {
	provider: "openai", model: "openai/gpt-audio", endpoint: "text.generate", currency: "USD",
	rules: [rule("input_text_tokens", "2.5"), rule("input_audio_tokens", "32"), rule("output_text_tokens", "10"), rule("output_audio_tokens", "64")],
};

beforeAll(() => setupTestRuntime());

describe("OpenAI Chat audio stream", () => {
	it("forwards delta.audio and charges the audio tokens at the audio rates", async () => {
		const frames = [
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: null, audio: { id: "audio_1", transcript: "Hel" } }, finish_reason: null }] },
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { audio: { data: "AAAA", transcript: "lo" } }, finish_reason: null }] },
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { audio: { expires_at: 1_760_003_600 } }, finish_reason: "stop" }] },
			{
				id: "c1", object: "chat.completion.chunk", choices: [],
				usage: {
					prompt_tokens: 100, completion_tokens: 500, total_tokens: 600,
					prompt_tokens_details: { cached_tokens: 0, audio_tokens: 40, text_tokens: 60 },
					completion_tokens_details: { reasoning_tokens: 0, audio_tokens: 450, text_tokens: 50 },
				},
			},
		];
		const upstream = new Response(
			frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n",
			{ status: 200, headers: { "Content-Type": "text/event-stream" } },
		);
		const ctx: any = {
			requestId: "req_audio_stream", workspaceId: "ws", endpoint: "chat.completions", protocol: "openai.chat.completions",
			capability: "text.generate", model: "openai/gpt-audio", requestedModel: "openai/gpt-audio", stream: true,
			body: { model: "openai/gpt-audio", stream: true }, rawBody: {},
			meta: { requestId: "req_audio_stream", apiKeyId: "key", authMethod: "api_key" }, providers: [], pricing: {}, gating: {},
		};
		mocks.charge.mockReset().mockResolvedValue(undefined);

		const response = await handleStreamResponse(ctx, {
			kind: "stream", stream: upstream.body, upstream, provider: "openai",
			usageFinalizer: async () => null,
			bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
		} as any, card);
		const text = await response.text();
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(text).toContain('"audio":{"id":"audio_1","transcript":"Hel"}');
		expect(text).toContain('"audio":{"data":"AAAA","transcript":"lo"}');
		const usageFrame = text.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6))).find((frame) => frame.usage);
		expect(usageFrame.usage.completion_tokens_details).toMatchObject({ output_audio: 450 });
		expect(usageFrame.usage.prompt_tokens_details).toMatchObject({ input_audio: 40 });
		// 60 x 2.5 + 40 x 32 + 50 x 10 + 450 x 64 micro-dollars. Before: everything at text rates, 5,250,000.
		expect(mocks.charge).toHaveBeenCalledTimes(1);
		expect(mocks.charge.mock.calls[0][0].costNanos).toBe(30_730_000);
	});
});
