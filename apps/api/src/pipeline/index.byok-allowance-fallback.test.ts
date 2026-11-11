import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "./pricing/types";

// One HTTP request through the real entry point: the real model-fallback loop runs the real
// text-generate pipeline, finalization, pricing and BYOK fee for each model. Faked: the before
// stage (it hands each attempt its context, with its own billing id, as beforeRequest does),
// provider calls, the wallet charge, audit writes and the database's BYOK monthly counter.
const state = vi.hoisted(() => ({
	counter: 0,
	countedKeys: [] as string[],
	charges: [] as Array<{ billingRequestId: string; costNanos: number }>,
	background: [] as Promise<unknown>[],
}));
const mocks = vi.hoisted(() => ({ beforeRequest: vi.fn(), doRequestWithIR: vi.fn() }));

vi.mock("./before", () => ({ beforeRequest: (...args: any[]) => mocks.beforeRequest(...args) }));
vi.mock("./execute", () => ({ doRequestWithIR: (...args: any[]) => mocks.doRequestWithIR(...args) }));
vi.mock("./after/charge", () => ({ recordUsageAndChargeOnce: async ({ ctx, costNanos }: any) => {
	state.charges.push({ billingRequestId: ctx.billingRequestId, costNanos });
	(ctx.meta as Record<string, unknown>).__usageChargeRecorded = true;
} }));
vi.mock("./audit", () => ({ auditSuccess: async () => undefined, auditFailure: async () => undefined }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: async () => undefined }));
vi.mock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: async () => undefined }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: async () => undefined }));
vi.mock("./execute/health", () => ({
	classifyProviderHealthImpact: () => "success",
	onCallEnd: async () => undefined,
	reportProbeResult: async () => undefined,
	maybeOpenOnRecentErrors: async () => undefined,
}));
vi.mock("./execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: async () => undefined,
	resolveCacheAwareRoutingPreference: () => false,
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getResponseCache: () => null,
	getBindings: () => ({}),
	getBindingsIfConfigured: () => ({}),
	// increment_workspace_byok_monthly_request_count_once: counts each idempotency key once.
	getSupabaseAdmin: () => ({
		rpc: async (_name: string, args: Record<string, any>) => {
			if (!state.countedKeys.includes(args.p_idempotency_key)) {
				state.countedKeys.push(args.p_idempotency_key);
				state.counter += args.p_request_count ?? 1;
			}
			return { data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: state.counter }], error: null };
		},
	}),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { state.background.push(Promise.resolve(promise).catch(() => undefined)); },
}));

import { makeEndpointHandler } from "./index";
import { __resetByokAllowanceCacheForTests, BYOK_MONTHLY_FREE_REQUESTS } from "./pricing/byok-fee";

const card = (provider: string, model: string): PriceCard => ({
	provider, model, endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: null,
	rules: ["input_text_tokens", "output_text_tokens"].map((meter) => ({
		pricing_plan: "standard", meter, unit: "token", unit_size: 1_000_000, price_per_unit: "4", currency: "USD", match: [], priority: 100,
	})),
});

function attemptContext(model: string, billingRequestId: string, modelFallbacks: string[] = []) {
	const body = { model, messages: [{ role: "user", content: "What time is it?" }], tools: [{ type: "gateway:datetime", parameters: { timezones: ["UTC"] } }] };
	return {
		endpoint: "chat.completions", capability: "text.generate", protocol: "openai.chat.completions",
		requestId: `req_${billingRequestId}`, billingRequestId, workspaceId: "ws_byok", keyId: "key_1",
		meta: { apiKeyId: "key_1", authMethod: "api_key" },
		rawBody: structuredClone(body), body: structuredClone(body), model, requestedModel: model, stream: false, providers: [],
		pricing: { [`openai:${model}`]: card("openai", model) },
		gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
		teamSettings: { billingMode: "wallet" },
		routingDiagnostics: { dynamicRoute: { action: { modelFallbacks } } },
	};
}

function completed(model: string, toolCall: boolean) {
	return {
		result: {
			kind: "completed", provider: "openai", apiModelId: model, keySource: "byok",
			upstream: new Response(null, { status: 200 }), generationTimeMs: 1,
			bill: { cost_cents: 0, currency: "USD", usage: { prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100 } },
			ir: {
				id: `resp_${model}`, model, provider: "openai",
				choices: [{
					index: 0,
					message: toolCall
						? { role: "assistant", content: [], toolCalls: [{ id: "call_1", name: "gateway_datetime", arguments: "{\"timezones\":[\"UTC\"]}" }] }
						: { role: "assistant", content: [{ type: "text", text: "It is noon." }] },
					finishReason: toolCall ? "tool_calls" : "stop",
				}],
				usage: { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100 },
			},
		},
	};
}

describe("one HTTP request is one request against the monthly BYOK allowance", () => {
	beforeEach(() => {
		__resetByokAllowanceCacheForTests();
		state.counter = BYOK_MONTHLY_FREE_REQUESTS - 1;
		state.countedKeys = [];
		state.charges = [];
		state.background = [];
		mocks.beforeRequest.mockReset()
			.mockResolvedValueOnce({ ok: true, ctx: attemptContext("openai/model-a", "bill_a", ["openai/model-b"]) })
			.mockResolvedValueOnce({ ok: true, ctx: attemptContext("openai/model-b", "bill_b") });
		// Model A completes a BYOK round, then its follow-up fails on every provider; model B answers.
		mocks.doRequestWithIR.mockReset()
			.mockResolvedValueOnce(completed("openai/model-a", true))
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: "upstream_error" }), { status: 503 }))
			.mockResolvedValueOnce(completed("openai/model-b", false));
	});

	it("keeps the request's last free BYOK request free on the fallback model, and counts it once", async () => {
		const response = await makeEndpointHandler({ endpoint: "chat.completions", schema: null })(new Request("https://api.phaseo.app/v1/chat/completions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "openai/model-a", messages: [{ role: "user", content: "What time is it?" }] }),
		}));
		expect(response.status).toBe(200);
		await response.text();
		await Promise.all(state.background.splice(0));

		expect(mocks.doRequestWithIR).toHaveBeenCalledTimes(3);
		// Model A's completed round is the workspace's 250,000th BYOK request: the last free one.
		// Model B serves the same HTTP request, so it is free too, and the counter moves once.
		expect(state.charges).toEqual([
			{ billingRequestId: "bill_a", costNanos: 0 },
			{ billingRequestId: "bill_b", costNanos: 0 },
		]);
		expect(state.countedKeys).toEqual(["bill_a"]);
		expect(state.counter).toBe(BYOK_MONTHLY_FREE_REQUESTS);
	});
});
