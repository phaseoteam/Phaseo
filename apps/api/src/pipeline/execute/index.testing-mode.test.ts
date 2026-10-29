import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import { doRequestWithIR } from "./index";
import { executor as extractionExecutor } from "@executors/cloudflare/extraction";
import { decodeExtractionRequest, encodeExtractionResponse } from "@protocols/extraction";
import { ExtractionsSchema } from "@core/extraction";
import { formatClientPayload } from "../after/payload";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { resetManagedCredentialStateForTests } from "./managedCredentials";

const guardCandidatesMock = vi.fn();
const guardPricingFoundMock = vi.fn();
const guardAllFailedMock = vi.fn();
const rankProvidersMock = vi.fn();
const admitThroughBreakerMock = vi.fn();
const onCallStartMock = vi.fn();
const onCallEndMock = vi.fn();
const maybeOpenOnRecentErrorsMock = vi.fn();
const reportProbeResultMock = vi.fn();
const resolveProviderExecutorMock = vi.fn();
const loadPriceCardMock = vi.fn();
const freeQuotaMock = vi.fn();
const policyGuardMock = vi.fn();
const policyTokenChargeMock = vi.fn();
const releaseBackgroundRuntimeMock = vi.fn();
const ensureRuntimeForBackgroundMock = vi.fn(() => releaseBackgroundRuntimeMock);
const runtimeBindings = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
const classifyHealthCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
// Providers whose (mocked) text executor reads its managed key like the OpenAI-compatible wire.
const openAICompatTextProviders = vi.hoisted(() => new Set<string>());

vi.mock("@/runtime/env", () => ({
	getBindings: () => runtimeBindings.value ?? {},
	getCache: () => ({ get: async () => null, put: async () => undefined }),
	getBindingsIfConfigured: () => runtimeBindings.value,
	dispatchBackground: (promise: Promise<unknown>) => void promise,
	ensureRuntimeForBackground: () => ensureRuntimeForBackgroundMock(),
    getSupabaseAdmin: () => ({ from: (table: string) => {
        if (table === "byok_keys") return { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) };
        if (table === "provider_rate_limits") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        throw new Error(`Unexpected database table: ${table}`);
    } }),
}));

vi.mock("./guards", () => ({
	guardCandidates: (...args: any[]) => guardCandidatesMock(...args),
	guardPricingFound: (...args: any[]) => guardPricingFoundMock(...args),
	guardAllFailed: (...args: any[]) => guardAllFailedMock(...args),
}));

vi.mock("./providers", () => ({
	rankProviders: (...args: any[]) => rankProvidersMock(...args),
}));

vi.mock("./health", () => ({
	admitThroughBreaker: (...args: any[]) => admitThroughBreakerMock(...args),
	classifyProviderHealthImpact: (args: { upstreamStatus?: number | null } = {}) => {
		classifyHealthCalls.push(args);
		const status = Number(args.upstreamStatus ?? 0);
		return status >= 200 && status < 300 ? "success" : "failure";
	},
	onCallStart: (...args: any[]) => onCallStartMock(...args),
	onCallEnd: (...args: any[]) => onCallEndMock(...args),
	maybeOpenOnRecentErrors: (...args: any[]) => maybeOpenOnRecentErrorsMock(...args),
	reportProbeResult: (...args: any[]) => reportProbeResultMock(...args),
}));

vi.mock("../../executors", () => ({
	resolveProviderExecutor: (...args: any[]) => resolveProviderExecutorMock(...args),
	normalizeCapability: (capability: string) => capability,
	textExecutorUsesOpenAICompatKey: (providerId: string) => openAICompatTextProviders.has(providerId),
}));

vi.mock("@core/customer-rate-limits", () => ({
	guardFreeRouteQuota: (...args: any[]) => freeQuotaMock(...args),
}));

vi.mock("@core/rate-limit-policies", () => ({
	guardRateLimitPolicies: (...args: any[]) => policyGuardMock(...args),
	chargeRateLimitPolicyTokens: (...args: any[]) => policyTokenChargeMock(...args),
}));

vi.mock("../pricing", () => ({
	loadPriceCard: (...args: any[]) => loadPriceCardMock(...args),
}));

function createCtx(overrides?: Partial<any>): any {
	return {
		endpoint: "images.generations",
		capability: "image.generate",
		requestId: "req_test_1",
		workspaceId: "team_test_1",
		keyId: "key_test_1",
		model: "openai/gpt-image-1-mini",
		body: {},
		meta: {
			stream: false,
			debug: undefined,
			returnMeta: false,
		},
		teamSettings: {
			routingMode: "balanced",
			byokFallbackEnabled: true,
			betaChannelEnabled: false,
			billingMode: "wallet",
		},
		testingMode: false,
		...overrides,
	};
}

function createTiming() {
	return {
		timer: new Timer(),
		internal: {
			adapterMarked: false,
		},
	};
}

describe("doRequestWithIR pricing behavior in testing mode", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		guardPricingFoundMock.mockResolvedValue({ ok: true });
		freeQuotaMock.mockResolvedValue(null);
		policyGuardMock.mockResolvedValue(null);

		guardAllFailedMock.mockResolvedValue({
			ok: false,
			response: new Response(JSON.stringify({ error: "all_failed" }), { status: 502 }),
		});
		admitThroughBreakerMock.mockResolvedValue("closed");
		onCallStartMock.mockResolvedValue(undefined);
		onCallEndMock.mockResolvedValue(undefined);
		maybeOpenOnRecentErrorsMock.mockResolvedValue(undefined);
		reportProbeResultMock.mockResolvedValue(undefined);
	});

	it("executes extraction through provider routing and presents typed answers with aggregate usage", async () => {
		runtimeBindings.value = { CLOUDFLARE_ACCOUNT_ID: "test-account", CLOUDFLARE_API_TOKEN: "test-token" };
		const body = ExtractionsSchema.parse({ model: "cloudflare/clairic", input: "Total: $1080", fields: { total: { type: "number" } } });
		const candidate = { providerId: "cloudflare", providerModelSlug: "@cf/cloudflare/clairic", pricingCard: { currency: "USD", rules: [] }, byokMeta: [], capabilityParams: {}, inputModalities: ["text"] };
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
		rankProvidersMock.mockResolvedValue([{ candidate, health: {} }]);
		resolveProviderExecutorMock.mockReturnValue(extractionExecutor);
		const mock = installFetchMock([{ match: url => url.endsWith("/ai/run/@cf/cloudflare/clairic"), response: jsonResponse({ success: true, result: {
			model: "clairic", truncated: false, answers: { total: { type: "number", value: 1080, confidence: 0.99, p_null: 0.001 } },
			usage: { input_tokens: 655, output_tokens: 0, passes: 3 },
		} }) }]);
		try {
			const ctx = createCtx({ endpoint: "extractions", capability: "extraction.extract", model: body.model, body, rawBody: body, testingMode: true });
			const result = await doRequestWithIR(ctx, decodeExtractionRequest(body), createTiming());
			if (result instanceof Response) throw new Error(await result.text());
			const payload = encodeExtractionResponse(result.result.ir as import("@core/ir").IRExtractionResponse);
			const presented = formatClientPayload({ ctx, result: result.result, payload, includeMeta: false });
			expect(presented).toMatchObject({ model: body.model, truncated: false, answers: { total: { type: "number", value: 1080, p_null: 0.001 } }, usage: { input_tokens: 655, output_tokens: 0, total_tokens: 655 } });
			expect(mock.calls).toHaveLength(1);
			expect(result.result.bill.usage?.input_tokens).toBe(655);
		} finally { mock.restore(); runtimeBindings.value = null; }
	});

	it("rejects extraction images before dispatch when the route lacks image capability", async () => {
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [{ providerId: "cloudflare", inputModalities: ["text"], capabilityParams: {} }] });
		const result = await doRequestWithIR(createCtx({ endpoint: "extractions", capability: "extraction.extract" }), {
			model: "cloudflare/clairic", sourceText: "", fields: { x: { type: "text" } }, images: [{ contentType: "image/png", base64: "AQID" }],
		}, createTiming());
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(rankProvidersMock).not.toHaveBeenCalled();
		expect(resolveProviderExecutorMock).not.toHaveBeenCalled();
	});

	it("returns a customer free quota denial before dispatch or provider fallback", async () => {
		const pricingCard = { currency: "USD", rules: [{ pricing_plan: "free", price_per_unit: "0", currency: "USD" }] };
		const candidates = ["first", "second"].map(providerId => ({ providerId, pricingCard, byokMeta: [], providerModelSlug: "model", capabilityParams: {} }));
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockResolvedValue(candidates.map(candidate => ({ candidate, health: {} })));
		const executor = vi.fn();
		resolveProviderExecutorMock.mockReturnValue(executor);
		const denial = new Response("{}", { status: 429, headers: { "Retry-After": "60" } });
		freeQuotaMock.mockResolvedValue(denial);
		const ctx = createCtx({ quotaUserId: "authenticated-owner", billingRequestId: "server-billing-id" });
		const result = await doRequestWithIR(ctx, { model: "model", prompt: "test" } as any, createTiming());
		expect(result).toBe(denial);
		expect(admitThroughBreakerMock).not.toHaveBeenCalled();
		expect(onCallStartMock).not.toHaveBeenCalled();
		expect(reportProbeResultMock).not.toHaveBeenCalled();
		expect(executor).not.toHaveBeenCalled();
		expect(freeQuotaMock).toHaveBeenCalledTimes(1);
		expect(freeQuotaMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "authenticated-owner", admissionId: "server-billing-id", pricingCard }));
	});

	it("returns a rate limit policy denial before the free quota, dispatch or provider fallback", async () => {
		const pricingCard = { currency: "USD", rules: [{ pricing_plan: "free", price_per_unit: "0", currency: "USD" }] };
		const candidates = ["first", "second"].map(providerId => ({ providerId, pricingCard, byokMeta: [], providerModelSlug: "model", capabilityParams: {} }));
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockResolvedValue(candidates.map(candidate => ({ candidate, health: {} })));
		const executor = vi.fn();
		resolveProviderExecutorMock.mockReturnValue(executor);
		const denial = new Response("{}", { status: 429, headers: { "Retry-After": "12" } });
		policyGuardMock.mockResolvedValue(denial);
		const ctx = createCtx({ billingRequestId: "server-billing-id" });
		const result = await doRequestWithIR(ctx, { model: "model", prompt: "test" } as any, createTiming());
		expect(result).toBe(denial);
		expect(policyGuardMock).toHaveBeenCalledTimes(1);
		expect(policyGuardMock).toHaveBeenCalledWith(ctx);
		expect(freeQuotaMock).not.toHaveBeenCalled();
		expect(admitThroughBreakerMock).not.toHaveBeenCalled();
		expect(executor).not.toHaveBeenCalled();
		expect(ctx.lifecycle?.events).toContainEqual(expect.objectContaining({ type: "provider.rejected", outcome: "quota_rejected", status: 429 }));
	});

	it("checks rate limit policies on every provider attempt of the same request", async () => {
		const pricingCard = { currency: "USD", rules: [] };
		const candidates = ["first", "second"].map(providerId => ({ providerId, pricingCard, byokMeta: [], providerModelSlug: "model", capabilityParams: {} }));
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockResolvedValue(candidates.map(candidate => ({ candidate, health: {} })));
		resolveProviderExecutorMock.mockReturnValue(vi.fn(async () => ({
			kind: "completed", ir: {}, upstream: new Response("{}", { status: 503 }),
			bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway",
		})));
		const ctx = createCtx({ testingMode: true });
		await doRequestWithIR(ctx, { model: "model", prompt: "test" } as any, createTiming());
		// The guard memoizes per request, so later attempts are never counted again.
		expect(policyGuardMock.mock.calls.map(([arg]) => arg)).toEqual([ctx, ctx]);
	});

	it.each([
		{ currency: "EUR", rules: [] },
		{ currency: "USD", rules: [{ currency: "EUR" }] },
	])("rejects unconverted cached pricing before provider execution: %j", async (pricingCard) => {
		const candidate = { providerId: "scaleway", pricingCard, byokMeta: [],
			providerModelSlug: "model", capabilityParams: {} };
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
		rankProvidersMock.mockResolvedValue([{ candidate, health: {} }]);
		const executor = vi.fn();
		resolveProviderExecutorMock.mockReturnValue(executor);
		await doRequestWithIR(createCtx(), { model: "model", prompt: "test" } as any, createTiming());
		expect(executor).not.toHaveBeenCalled();
		expect(onCallStartMock).not.toHaveBeenCalled();
		expect(guardAllFailedMock).toHaveBeenCalled();
	});

	it.each([429, 402, 401])("returns local video admission denial %s without fallback or provider failure", async (status) => {
		const candidates = ["google", "minimax"].map((providerId) => ({
			providerId, pricingCard: { rules: [], currency: "USD" }, byokMeta: [],
			providerModelSlug: "video-model", capabilityParams: {},
		}));
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockResolvedValue(candidates.map((candidate) => ({ candidate, health: {} })));
		const executor = vi.fn(async (args: any) => {
			args.onReservationDenied({ status, code: "key_limit_exceeded", reason: "daily_cost_limit_reached" });
			return { kind: "completed", upstream: new Response("{}", { status: 503 }),
				bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
		});
		resolveProviderExecutorMock.mockReturnValue(executor);
		const result = await doRequestWithIR(createCtx({ capability: "video.generate", endpoint: "video.generation" }),
			{ model: "video-model", prompt: "test" } as any, createTiming());
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(status);
		expect(await (result as Response).json()).toMatchObject({ error: "key_limit_exceeded", reason: "daily_cost_limit_reached", error_type: "user", error_origin: "user" });
		expect(executor).toHaveBeenCalledTimes(1);
		expect(onCallEndMock).toHaveBeenCalledWith("video.generation", expect.objectContaining({ healthImpact: "neutral" }));
		expect(maybeOpenOnRecentErrorsMock).not.toHaveBeenCalled();
		expect(reportProbeResultMock).not.toHaveBeenCalled();
		expect(guardAllFailedMock).not.toHaveBeenCalled();
	});

	it.each([400, 502, 408, "transport"])("does not repeat a dispatched video submission (%s)", async (failure) => {
		const candidates = ["openai", "atlascloud"].map((providerId) => ({
			providerId, pricingCard: { rules: [], currency: "USD" }, byokMeta: [],
			providerModelSlug: "video-model", capabilityParams: {},
		}));
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockResolvedValue(candidates.map((candidate) => ({ candidate, health: {} })));
		const executor = vi.fn(async (args: any) => {
			if (failure === 400) {
				const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
				await args.upstreamTiming.fetch("https://provider.test/videos", { method: "POST" });
				fetchSpy.mockRestore();
			}
			if (failure === "transport") throw Object.assign(new Error("lost response"), { retryable: true });
			return {
				kind: "completed", upstream: new Response("{}", { status: failure }),
				bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway",
			};
		});
		resolveProviderExecutorMock.mockReturnValue(executor);
		await doRequestWithIR(createCtx({ capability: "video.generate", endpoint: "video.generation" }),
			{ model: "video-model", prompt: "test" } as any, createTiming());
		expect(executor).toHaveBeenCalledTimes(1);
		expect(executor.mock.calls[0][0]).toMatchObject({ apiKeyId: "key_test_1" });
	});

	const syncMediaCases = [
		["image.generate", "images.generations"],
		["image.edit", "images.edits"],
		["audio.speech", "audio.speech"],
		["audio.transcription", "audio.transcription"],
		["audio.translations", "audio.translations"],
		["music.generate", "music.generate"],
		["ocr", "ocr"],
	] as const;

	function mediaCandidates() {
		const candidates = ["first", "second"].map((providerId) => ({
			providerId, pricingCard: { rules: [], currency: "USD" }, byokMeta: [],
			providerModelSlug: "media-model", capabilityParams: {},
		}));
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockResolvedValue(candidates.map((candidate) => ({ candidate, health: {} })));
	}

	const succeeded = () => ({
		kind: "completed", ir: { ok: true }, upstream: new Response("{}", { status: 200 }),
		bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway",
	});

	it.each(syncMediaCases)("does not send a %s request to a second provider once the first has answered 2xx", async (capability, endpoint) => {
		mediaCandidates();
		const first = vi.fn(async (args: any) => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
			await args.upstreamTiming.fetch("https://provider.test/media", { method: "POST" });
			fetchSpy.mockRestore();
			// The provider has charged; mapping or pricing its answer then fails.
			throw new Error("pricing_rule_missing:output_image");
		});
		const second = vi.fn(async () => succeeded());
		resolveProviderExecutorMock.mockImplementation((providerId: string) => providerId === "first" ? first : second);
		const result = await doRequestWithIR(createCtx({ capability, endpoint }), { model: "media-model", prompt: "x" } as any, createTiming());
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
		expect((result as Response).status).toBe(502);
	});

	it("does not send a media request elsewhere when a later call fails after an earlier provider call succeeded", async () => {
		mediaCandidates();
		const first = vi.fn(async (args: any) => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
			await args.upstreamTiming.fetch("https://provider.test/music", { method: "POST" });
			fetchSpy.mockRestore();
			return { kind: "completed", upstream: new Response("{}", { status: 500 }), bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
		});
		const second = vi.fn(async () => succeeded());
		resolveProviderExecutorMock.mockImplementation((providerId: string) => providerId === "first" ? first : second);
		await doRequestWithIR(createCtx({ capability: "music.generate", endpoint: "music.generate" }), { model: "media-model", prompt: "x" } as any, createTiming());
		expect(second).not.toHaveBeenCalled();
	});

	it.each([
		["a non-2xx answer", 503],
		["a transport error", "transport"],
	] as const)("still fails a media request over to the next provider after %s", async (_label, failure) => {
		mediaCandidates();
		const first = vi.fn(async (args: any) => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: failure === "transport" ? 200 : failure }));
			if (failure === "transport") fetchSpy.mockRejectedValue(new Error("Network connection lost."));
			const response = await args.upstreamTiming.fetch("https://provider.test/media", { method: "POST" }).finally(() => fetchSpy.mockRestore());
			return { kind: "completed", upstream: response, bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
		});
		const second = vi.fn(async () => succeeded());
		resolveProviderExecutorMock.mockImplementation((providerId: string) => providerId === "first" ? first : second);
		const result = await doRequestWithIR(createCtx({ capability: "image.generate", endpoint: "images.generations" }), { model: "media-model", prompt: "x" } as any, createTiming());
		expect(second).toHaveBeenCalledTimes(1);
		expect((result as any).ok).toBe(true);
	});

    it.each(["completed", "stream"] as const)("retains private health identity through %s execution", async kind => {
        const candidate = { providerId: "private-model", privateEndpoint: { baseUrl: "https://private.example/v1", supportsResponses: true }, pricingCard: { currency: "USD", rules: [] }, byokMeta: [{ id: "route-1", key: "test-private-key", value: "test-private-key", alwaysUse: true, routingMode: "priority" }], providerModelSlug: "private", capabilityParams: {} };
        const scopedProvider = "private-model:workspace-a:route-1";
        guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
        rankProvidersMock.mockResolvedValue([{ candidate, health: { provider: scopedProvider } }]);
        resolveProviderExecutorMock.mockReturnValue(vi.fn().mockResolvedValue({ kind, ir: {}, upstream: new Response("{}", { status: 200 }), stream: kind === "stream" ? new ReadableStream({ start(controller) { controller.close(); } }) : undefined, bill: { cost_cents: 0, currency: "USD" }, keySource: "byok", byokKeyId: "route-1" }));
        const result = await doRequestWithIR(createCtx({ endpoint: "chat.completions", capability: "text.generate", workspaceId: "workspace-a", model: "acme/private", testingMode: true, stream: kind === "stream" }), { model: "acme/private", messages: [] } as any, createTiming());
        expect(result.ok).toBe(true);
        expect(admitThroughBreakerMock.mock.calls[0][1]).toBe(scopedProvider);
        expect(onCallStartMock).toHaveBeenCalledWith("chat.completions", scopedProvider, "acme/private");
        if (kind === "completed") expect(onCallEndMock).toHaveBeenCalledWith("chat.completions", expect.objectContaining({ provider: scopedProvider, ok: true }));
        else expect((result as any).result.healthContext.provider).toBe(scopedProvider);
    });

	it.each([200, 503])("records buffered text generation from the selected dispatch only on success (%s)", async (status) => {
		const candidate = { providerId: "openai", pricingCard: { currency: "USD", rules: [] }, byokMeta: [], providerModelSlug: "gpt-test", capabilityParams: {} };
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
		rankProvidersMock.mockResolvedValue([{ candidate, health: {} }]);
		resolveProviderExecutorMock.mockReturnValue(vi.fn(async (args: any) => {
			const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status }));
			const response = await args.upstreamTiming.fetch("https://provider.test/chat", { method: "POST" }).finally(() => fetchSpy.mockRestore());
			return { kind: "completed", ir: {}, upstream: response, bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
		}));
		const ctx = createCtx({ endpoint: "chat.completions", capability: "text.generate", model: "openai/gpt-test", testingMode: true });
		await doRequestWithIR(ctx, { model: "openai/gpt-test", messages: [] } as any, createTiming());
		if (status === 200) {
			expect(ctx.meta.generation_ms).toEqual(expect.any(Number));
			expect(ctx.meta.generation_ms).toBe(ctx.meta.provider_duration_ms);
			// Routing throughput keeps using streamed generation only.
			expect(onCallEndMock).toHaveBeenCalledWith("chat.completions", expect.objectContaining({ ok: true, generation_ms: 0 }));
		} else {
			expect(ctx.meta.generation_ms).toBeUndefined();
		}
	});

	it.each([false, true])("loads lazy pricing using the selected route scope (%s)", async (pricingInternalOnly) => {
		const candidate = {
			accessScope: pricingInternalOnly ? "internal" : "public",
			providerId: "openai",
			pricingCard: null,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
		rankProvidersMock.mockResolvedValue([{ candidate, health: {} }]);
		loadPriceCardMock.mockResolvedValue({
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		});

		const executor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: {},
			upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		resolveProviderExecutorMock.mockReturnValue(executor);
		const ctx = createCtx({ testingMode: true, billableInternalTesting: true, pricingInternalOnly: !pricingInternalOnly });

		const result = await doRequestWithIR(
			ctx,
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect(loadPriceCardMock).toHaveBeenCalledWith("openai", "openai/gpt-image-1-mini", "image.generate", "gpt-image-1-mini", pricingInternalOnly);
		expect(executor).toHaveBeenCalledTimes(1);
		expect(guardPricingFoundMock).not.toHaveBeenCalled();
		expect(onCallEndMock).toHaveBeenCalledWith(
			"images.generations",
			expect.objectContaining({
				provider: "openai",
				ok: true,
				latency_ms: expect.any(Number),
				generation_ms: expect.any(Number),
			}),
		);
		expect(ensureRuntimeForBackgroundMock).toHaveBeenCalledTimes(2);
		expect(releaseBackgroundRuntimeMock).toHaveBeenCalledTimes(2);
		expect(ctx.meta.latency_ms).toBeUndefined();
		expect(ctx.meta.generation_ms).toEqual(expect.any(Number));
		expect(ctx.providerAttempts).toEqual([
			expect.objectContaining({
				attempt_number: 1,
				provider: "openai",
				outcome: "success",
				type: "success",
				status: 200,
				response_kind: "completed",
			}),
		]);
	});

	it("tells executors whether alternate candidates remain after the current attempt", async () => {
		const candidates = ["first", "second", "third"].map((providerId) => ({
			providerId, pricingCard: { currency: "USD", rules: [] }, byokMeta: [],
			providerModelSlug: "model", capabilityParams: {},
		}));
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockResolvedValue(candidates.map((candidate) => ({ candidate, health: {} })));
		const executor = vi.fn(async () => ({
			kind: "completed", ir: {}, upstream: new Response("{}", { status: 503 }),
			bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway",
		}));
		resolveProviderExecutorMock.mockReturnValue(executor);
		await doRequestWithIR(createCtx({ testingMode: true }), { model: "model", prompt: "test" } as any, createTiming());
		expect(executor.mock.calls.map(([args]: any[]) => [args.providerId, args.hasAlternateCandidates])).toEqual([
			["first", true],
			["second", true],
			["third", false],
		]);
	});

	it("fails over to the next provider when the first stalls before response headers", async () => {
		runtimeBindings.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "25" };
		classifyHealthCalls.length = 0;
		try {
			const candidates = ["stalled", "healthy"].map((providerId) => ({
				providerId, pricingCard: { currency: "USD", rules: [] }, byokMeta: [],
				providerModelSlug: "model", capabilityParams: {},
			}));
			guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
			rankProvidersMock.mockResolvedValue(candidates.map((candidate) => ({ candidate, health: {} })));
			vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
				if (String(input).includes("stalled")) {
					return new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
					});
				}
				return Promise.resolve(new Response("{}", { status: 200 }));
			});
			const executor = vi.fn(async (args: any) => {
				const upstream = await args.upstreamTiming.fetch(`https://${args.providerId}.test/generate`, { method: "POST", body: JSON.stringify({ stream: true }) });
				return { kind: "completed", ir: {}, upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
			});
			resolveProviderExecutorMock.mockReturnValue(executor);
			const ctx = createCtx({ testingMode: true, stream: true });

			const result = await doRequestWithIR(ctx, { model: "model", prompt: "test" } as any, createTiming());

			expect((result as any).ok).toBe(true);
			expect(executor.mock.calls.map(([args]) => args.providerId)).toEqual(["stalled", "healthy"]);
			expect(ctx.attemptErrors).toEqual([expect.objectContaining({
				provider: "stalled",
				upstream_error_code: "upstream_headers_timeout",
			})]);
			// Counted against the provider, unlike a caller cancellation.
			expect(classifyHealthCalls).toContainEqual(expect.objectContaining({
				failureOrigin: "provider",
				errorCode: "upstream_headers_timeout",
			}));
		} finally {
			runtimeBindings.value = null;
			vi.restoreAllMocks();
		}
	});

	it("lets a slow non-streaming provider finish instead of failing over", async () => {
		runtimeBindings.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "25" };
		try {
			const candidates = ["slow", "other"].map((providerId) => ({
				providerId, pricingCard: { currency: "USD", rules: [] }, byokMeta: [],
				providerModelSlug: "model", capabilityParams: {},
			}));
			guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
			rankProvidersMock.mockResolvedValue(candidates.map((candidate) => ({ candidate, health: {} })));
			// Non-streaming providers send headers only once the whole generation is done.
			vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 80));
				return new Response("{}", { status: 200 });
			});
			const executor = vi.fn(async (args: any) => {
				const upstream = await args.upstreamTiming.fetch(`https://${args.providerId}.test/generate`, { method: "POST" });
				return { kind: "completed", ir: {}, upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
			});
			resolveProviderExecutorMock.mockReturnValue(executor);
			const ctx = createCtx({ testingMode: true, stream: false });

			const result = await doRequestWithIR(ctx, { model: "model", prompt: "test" } as any, createTiming());

			expect((result as any).ok).toBe(true);
			expect(executor.mock.calls.map(([args]) => args.providerId)).toEqual(["slow"]);
		} finally {
			runtimeBindings.value = null;
			vi.restoreAllMocks();
		}
	});

	it.each([
		["gemini-4-argon", ["google-vertex"]],
		["gemini-3.6-flash", ["google-vertex", "google-ai-studio"]],
	])("gives streaming %s the long-thinking headers deadline only where documented", async (model, expectedProviders) => {
		runtimeBindings.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "25" };
		try {
			const candidates = ["google-vertex", "google-ai-studio"].map((providerId) => ({
				providerId, pricingCard: { currency: "USD", rules: [] }, byokMeta: [],
				providerModelSlug: model, capabilityParams: {},
			}));
			guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
			rankProvidersMock.mockResolvedValue(candidates.map((candidate) => ({ candidate, health: {} })));
			// The first chunk, and so the headers, arrives after the model has thought.
			vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => new Promise<Response>((resolve, reject) => {
				const timer = setTimeout(() => resolve(new Response("{}", { status: 200 })), String(input).includes("google-vertex") ? 80 : 0);
				init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal!.reason); });
			}));
			const executor = vi.fn(async (args: any) => {
				const upstream = await args.upstreamTiming.fetch(`https://${args.providerId}.test/models/${model}:streamGenerateContent?alt=sse`, { method: "POST" });
				return { kind: "completed", ir: {}, upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
			});
			resolveProviderExecutorMock.mockReturnValue(executor);
			const ctx = createCtx({ testingMode: true, stream: true });

			const result = await doRequestWithIR(ctx, { model: `google/${model}`, prompt: "test" } as any, createTiming());

			expect((result as any).ok).toBe(true);
			expect(executor.mock.calls.map(([args]) => args.providerId)).toEqual(expectedProviders);
		} finally {
			runtimeBindings.value = null;
			vi.restoreAllMocks();
		}
	});

	it.each([false, true])("retains first dispatch through a transport failure (fallback succeeds: %s)", async (recover) => {
		const candidates = (recover ? ["openai", "other"] : ["openai"]).map((providerId) => ({
			providerId, pricingCard: { currency: "USD", rules: [] }, byokMeta: [],
			providerModelSlug: "model", capabilityParams: {},
		}));
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockResolvedValue(candidates.map((candidate) => ({ candidate, health: {} })));
		let now = 1000;
		const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
			now += 2000;
			if (fetchSpy.mock.calls.length === 1) throw new Error("connection lost");
			return new Response("{}", { status: 200 });
		});
		resolveProviderExecutorMock.mockReturnValue(async (args: any) => {
			now += 15;
			const upstream = await args.upstreamTiming.fetch("https://provider.test/generate");
			return { kind: "completed", ir: {}, upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
		});
		const ctx = createCtx({ testingMode: true, meta: { startedAtMs: 1000 } });
		try {
			const result = await doRequestWithIR(ctx, { model: "model", prompt: "test" } as any, createTiming());
			expect(ctx.meta.timeToUpstreamRequestMs).toBe(15);
			expect(ctx.meta.upstreamFetchStartMs).toBe(1015);
			expect(fetchSpy).toHaveBeenCalledTimes(recover ? 2 : 1);
			if (recover) {
				expect(result.ok).toBe(true);
				expect(ctx.meta.timeToLatestUpstreamRequestMs).toBe(2030);
			}
		} finally {
			dateSpy.mockRestore();
			fetchSpy.mockRestore();
		}
	});

	it("retains executor timing for a successful moderation response", async () => {
		const candidate = {
			providerId: "openai",
			pricingCard: {
				provider: "openai",
				model: "openai/omni-moderation-latest",
				endpoint: "moderations",
				currency: "USD",
				rules: [],
			},
			byokMeta: [],
			providerModelSlug: "omni-moderation-latest",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
		rankProvidersMock.mockResolvedValue([{ candidate, health: {} }]);
		const executor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: { results: [] },
			upstream: new Response(JSON.stringify({ results: [] }), { status: 200 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
			timing: { latencyMs: 41, generationMs: 17 },
		});
		resolveProviderExecutorMock.mockReturnValue(executor);
		const ctx = createCtx({
			endpoint: "moderations",
			capability: "moderations",
			model: "openai/omni-moderation-latest",
		});

		const result = await doRequestWithIR(
			ctx,
			{ model: "openai/omni-moderation-latest", input: "test input" } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect(ctx.meta.latency_ms).toBe(41);
		expect(ctx.meta.generation_ms).toBe(17);
	});

	it.each([false, true])("retains executor timing for successful decisions (images: %s)", async withImages => {
		const candidate = {
			providerId: "typesafe",
			pricingCard: {
				provider: "typesafe",
				model: "typesafe/jev-1.13.0",
				endpoint: "decisions",
				currency: "USD",
				rules: [],
			},
			byokMeta: [],
			providerModelSlug: "jev-1.13.0",
			capabilityParams: withImages ? { images: true } : {},
			inputModalities: withImages ? ["text", "image"] : ["text"],
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
		rankProvidersMock.mockResolvedValue([{ candidate, health: {} }]);
		resolveProviderExecutorMock.mockReturnValue(vi.fn().mockResolvedValue({
			kind: "completed",
			ir: { model: "typesafe/jev-1.13.0", answers: {} },
			upstream: new Response(JSON.stringify({ answers: {} }), { status: 200 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
			timing: { latencyMs: 41, generationMs: 41 },
		}));
		const ctx = createCtx({
			endpoint: "decisions",
			capability: "decisions.make",
			model: "typesafe/jev-1.13.0",
		});

		const result = await doRequestWithIR(
			ctx,
			{ model: "typesafe/jev-1.13.0", state: {}, questions: {}, ...(withImages ? { images: ["data:image/png;base64,AQID"] } : {}) } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect(ctx.meta.latency_ms).toBe(41);
		expect(ctx.meta.generation_ms).toBeGreaterThanOrEqual(41);
		expect(ctx.meta.end_to_end_ms).toBeUndefined();
	});

	it("rejects decision images before ranking or execution when no route supports them", async () => {
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [{ providerId: "typesafe", inputModalities: ["text"], capabilityParams: {} }] });
		const result = await doRequestWithIR(createCtx({ endpoint: "decisions", capability: "decisions.make" }), {
			model: "typesafe/jev-1.13.0", state: "Photo", questions: {}, images: ["data:image/png;base64,AQID"],
		} as any, createTiming());
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(rankProvidersMock).not.toHaveBeenCalled();
		expect(resolveProviderExecutorMock).not.toHaveBeenCalled();
	});
	it.each([
		{ questions: { mug: { type: "box", instructions: "The mug" } } },
		{ providerOptions: { typesafe: { long_context: true } } },
	])("rejects unsupported decision features before provider execution: %j", async feature => {
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [{ providerId: "typesafe", inputModalities: ["text", "image"], capabilityParams: { images: true } }] });
		const result = await doRequestWithIR(createCtx({ endpoint: "decisions", capability: "decisions.make" }), {
			model: "typesafe/jev-1.13.0", state: "Photo", questions: {}, images: ["data:image/png;base64,AQID"], ...feature,
		} as any, createTiming());
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(await (result as Response).json()).toMatchObject({ error: "unsupported_parameter" });
		expect(rankProvidersMock).not.toHaveBeenCalled();
		expect(resolveProviderExecutorMock).not.toHaveBeenCalled();
	});
	it.each([
		{ audio: [{ type: "audio", source: "data", data: "AQID", format: "wav" }] },
		{ videos: ["data:video/mp4;base64,AQID"] },
	])("rejects unsupported decision media before provider selection: %j", async media => {
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [{ providerId: "openai", inputModalities: ["text", "image"], capabilityParams: { images: true } }] });
		const result = await doRequestWithIR(createCtx({ endpoint: "decisions", capability: "decisions.make" }), {
			model: "openai/gpt-6-luna", state: "Recording", questions: {}, ...media,
		} as any, createTiming());
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(400);
		expect(rankProvidersMock).not.toHaveBeenCalled();
		expect(resolveProviderExecutorMock).not.toHaveBeenCalled();
	});

	it("still returns pricing guard failure on non-testing traffic when no pricing is preloaded", async () => {
		const candidate = {
			providerId: "openai",
			pricingCard: null,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
		guardPricingFoundMock.mockResolvedValue({
			ok: false,
			response: new Response(JSON.stringify({ error: "pricing_not_configured" }), { status: 402 }),
		});

		const result = await doRequestWithIR(
			createCtx({ testingMode: false }),
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(402);
		expect(guardPricingFoundMock).toHaveBeenCalledTimes(1);
		expect(loadPriceCardMock).not.toHaveBeenCalled();
		expect(resolveProviderExecutorMock).not.toHaveBeenCalled();
	});

	it("fails over to the next provider when an attempt returns non-2xx upstream", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		};
		const firstCandidate = {
			providerId: "first",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		const secondCandidate = {
			providerId: "second",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({ ok: true, value: [firstCandidate, secondCandidate] });
		rankProvidersMock.mockResolvedValue([
			{ candidate: firstCandidate, health: {} },
			{ candidate: secondCandidate, health: {} },
		]);

		const firstExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: {},
			upstream: new Response(JSON.stringify({ error: "rate_limited", usage: { input_tokens: 12, output_tokens: 0 } }), {
				status: 429,
				headers: {
					"retry-after": "10",
					"x-ratelimit-remaining-tokens": "0",
					"set-cookie": "provider_session=secret",
				},
			}),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		const secondExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: { ok: true },
			upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		resolveProviderExecutorMock.mockImplementation((providerId: string) => {
			if (providerId === "first") return firstExecutor;
			if (providerId === "second") return secondExecutor;
			return null;
		});
		const ctx = createCtx({ testingMode: false });

		const result = await doRequestWithIR(
			ctx,
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect((result as any).result.provider).toBe("second");
		expect(firstExecutor).toHaveBeenCalledTimes(1);
		expect(secondExecutor).toHaveBeenCalledTimes(1);
		expect(ctx.lifecycle?.events.map((event) => event.type)).toEqual(["routing.completed", "provider.admission", "provider.started", "provider.completed", "provider.admission", "provider.started", "provider.completed"]);
		expect(ctx.lifecycle?.events.filter((event) => event.type === "provider.started").map((event) => event.call_kind)).toEqual(["initial", "retry"]);
		expect(guardAllFailedMock).not.toHaveBeenCalled();
		// The failed attempt is charged to token policies under its own attempt key.
		expect(policyTokenChargeMock).toHaveBeenCalledWith(ctx, [undefined, { input_tokens: 12, output_tokens: 0 }, expect.objectContaining({ error: "rate_limited" })], "attempt:1:first");
		expect(ctx.attemptErrors?.[0]?.upstream_rate_limit_headers).toEqual({
			"Retry-After": "10",
		});
		expect(onCallEndMock).toHaveBeenNthCalledWith(
			1,
			"images.generations",
			expect.objectContaining({
				provider: "first",
				ok: false,
			}),
		);
		expect(ctx.providerAttempts).toEqual([
			expect.objectContaining({
				attempt_number: 1,
				provider: "first",
				outcome: "upstream_non_2xx",
				type: "upstream_non_2xx",
				status: 429,
				response_kind: "completed",
			}),
			expect.objectContaining({
				attempt_number: 2,
				provider: "second",
				outcome: "success",
				type: "success",
				status: 200,
				response_kind: "completed",
			}),
		]);
	});

	it("fails over to next provider when a retryable transport error occurs", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		};
		const firstCandidate = {
			providerId: "first",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		const secondCandidate = {
			providerId: "second",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: [firstCandidate, secondCandidate],
		});
		rankProvidersMock.mockResolvedValue([
			{ candidate: firstCandidate, health: {} },
			{ candidate: secondCandidate, health: {} },
		]);

		const firstExecutor = vi
			.fn()
			.mockRejectedValueOnce(Object.assign(new Error("Network connection lost."), { retryable: true }))
			.mockResolvedValueOnce({
				kind: "completed",
				ir: { ok: true },
				upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
				bill: { cost_cents: 0, currency: "USD" },
				keySource: "gateway",
				byokKeyId: null,
			});
		const secondExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: { ok: true },
			upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		resolveProviderExecutorMock.mockImplementation((providerId: string) => {
			if (providerId === "first") return firstExecutor;
			if (providerId === "second") return secondExecutor;
			return null;
		});
		const ctx = createCtx({ testingMode: false });

		const result = await doRequestWithIR(
			ctx,
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect((result as any).result.provider).toBe("second");
		expect(firstExecutor).toHaveBeenCalledTimes(1);
		expect(secondExecutor).toHaveBeenCalledTimes(1);
		expect(ctx.providerAttempts).toEqual([
			expect.objectContaining({
				attempt_number: 1,
				provider: "first",
				outcome: "retryable_error",
				type: "retryable_error",
			}),
			expect.objectContaining({
				attempt_number: 2,
				provider: "second",
				outcome: "success",
				type: "success",
				status: 200,
			}),
		]);
	});

	it("skips breaker-blocked providers and falls back to the next candidate", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		};
		const firstCandidate = {
			providerId: "first",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		const secondCandidate = {
			providerId: "second",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: [firstCandidate, secondCandidate],
		});
		rankProvidersMock.mockResolvedValue([
			{ candidate: firstCandidate, health: {} },
			{ candidate: secondCandidate, health: {} },
		]);
		admitThroughBreakerMock
			.mockResolvedValueOnce("blocked")
			.mockResolvedValueOnce("closed");

		const firstExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: { ok: true },
			upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		const secondExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: { ok: true },
			upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		resolveProviderExecutorMock.mockImplementation((providerId: string) => {
			if (providerId === "first") return firstExecutor;
			if (providerId === "second") return secondExecutor;
			return null;
		});
		const ctx = createCtx({ testingMode: false });

		const result = await doRequestWithIR(
			ctx,
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect((result as any).result.provider).toBe("second");
		expect(firstExecutor).not.toHaveBeenCalled();
		expect(secondExecutor).toHaveBeenCalledTimes(1);
		expect(ctx.lifecycle?.events.filter((event) => event.type === "provider.started").map((event) => event.provider)).toEqual(["second"]);
		expect(ctx.lifecycle?.events).toContainEqual(expect.objectContaining({ type: "provider.rejected", provider: "first", outcome: "blocked" }));
		expect(ctx.providerAttempts).toEqual([
			expect.objectContaining({
				attempt_number: 1,
				provider: "first",
				outcome: "blocked",
				type: "blocked",
			}),
			expect.objectContaining({
				attempt_number: 2,
				provider: "second",
				outcome: "success",
				type: "success",
				status: 200,
			}),
		]);
	});

	it("does not retry transient single-provider upstream failures", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		};
		const onlyCandidate = {
			providerId: "only",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: [onlyCandidate],
		});
		rankProvidersMock.mockResolvedValue([
			{ candidate: onlyCandidate, health: {} },
		]);

		const onlyExecutor = vi
			.fn()
			.mockResolvedValue({
				kind: "completed",
				ir: {},
				upstream: new Response(JSON.stringify({ error: "temporary outage" }), { status: 503 }),
				bill: { cost_cents: 0, currency: "USD" },
				keySource: "gateway",
				byokKeyId: null,
			});
		resolveProviderExecutorMock.mockImplementation((providerId: string) =>
			providerId === "only" ? onlyExecutor : null,
		);

		const result = await doRequestWithIR(
			createCtx({ testingMode: false }),
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(502);
		expect(onlyExecutor).toHaveBeenCalledTimes(1);
		expect(guardAllFailedMock).toHaveBeenCalledTimes(1);
	});

	it("does not expose timing for a failed moderation attempt", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		};
		const onlyCandidate = {
			providerId: "only",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: [onlyCandidate],
		});
		rankProvidersMock.mockResolvedValue([
			{ candidate: onlyCandidate, health: {} },
		]);

		const onlyExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: {},
			upstream: new Response(JSON.stringify({ error: "temporary outage" }), { status: 503 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
			timing: { latencyMs: 41, generationMs: 17 },
		});
		resolveProviderExecutorMock.mockImplementation((providerId: string) =>
			providerId === "only" ? onlyExecutor : null,
		);
		const ctx = createCtx({
			testingMode: false,
			endpoint: "moderations",
			capability: "moderations",
			model: "openai/omni-moderation-latest",
		});

		const result = await doRequestWithIR(
			ctx,
			{ model: "openai/omni-moderation-latest", input: "test input" } as any,
			createTiming(),
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(502);
		expect(onlyExecutor).toHaveBeenCalledTimes(1);
		expect(guardAllFailedMock).toHaveBeenCalledTimes(1);
		expect(ctx.providerAttempts).toEqual([
			expect.objectContaining({
				attempt_number: 1,
				provider: "only",
				outcome: "upstream_non_2xx",
				type: "upstream_non_2xx",
				status: 503,
				response_kind: "completed",
			}),
		]);
		expect(ctx.meta.latency_ms).toBeUndefined();
		expect(ctx.meta.generation_ms).toBeUndefined();
	});

	it("captures AWS-style upstream exception codes from response headers", async () => {
		const pricingCard = {
			provider: "amazon-bedrock",
			model: "anthropic.claude-3-5-sonnet-v1:0",
			endpoint: "chat.completions",
			currency: "USD",
			rules: [],
		};
		const onlyCandidate = {
			providerId: "amazon-bedrock",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "anthropic.claude-3-5-sonnet-v1:0",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: [onlyCandidate],
		});
		rankProvidersMock.mockResolvedValue([
			{ candidate: onlyCandidate, health: {} },
		]);

		const onlyExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: {},
			upstream: new Response(
				JSON.stringify({ message: "You don't have access to invoke this model." }),
				{
					status: 403,
					headers: {
						"x-amzn-errortype": "AccessDeniedException:",
					},
				},
			),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		resolveProviderExecutorMock.mockImplementation((providerId: string) =>
			providerId === "amazon-bedrock" ? onlyExecutor : null,
		);

		const result = await doRequestWithIR(
			createCtx({
				testingMode: false,
				endpoint: "chat.completions",
				capability: "text.generate",
				model: "anthropic.claude-3-5-sonnet-v1:0",
			}),
			{
				model: "anthropic.claude-3-5-sonnet-v1:0",
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			} as any,
			createTiming(),
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(502);
		expect(guardAllFailedMock).toHaveBeenCalledTimes(1);

		const forwardedCtx = guardAllFailedMock.mock.calls[0]?.[0];
		expect(forwardedCtx?.attemptErrors?.[0]).toMatchObject({
			provider: "amazon-bedrock",
			status: 403,
			upstream_error_code: "AccessDeniedException",
			upstream_error_message: "You don't have access to invoke this model.",
		});
	});

	it("captures Google-style nested error status codes from response bodies", async () => {
		const pricingCard = {
			provider: "google-ai-studio",
			model: "google/gemini-2.5-pro",
			endpoint: "responses",
			currency: "USD",
			rules: [],
		};
		const onlyCandidate = {
			providerId: "google-ai-studio",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "google/gemini-2.5-pro",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: [onlyCandidate],
		});
		rankProvidersMock.mockResolvedValue([
			{ candidate: onlyCandidate, health: {} },
		]);

		const onlyExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: {},
			upstream: new Response(
				JSON.stringify({
					error: {
						code: 403,
						message: "The caller does not have permission.",
						status: "PERMISSION_DENIED",
					},
				}),
				{ status: 403 },
			),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		resolveProviderExecutorMock.mockImplementation((providerId: string) =>
			providerId === "google-ai-studio" ? onlyExecutor : null,
		);

		const result = await doRequestWithIR(
			createCtx({
				testingMode: false,
				endpoint: "responses",
				capability: "text.generate",
				model: "google/gemini-2.5-pro",
			}),
			{
				model: "google/gemini-2.5-pro",
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			} as any,
			createTiming(),
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(502);
		expect(guardAllFailedMock).toHaveBeenCalledTimes(1);

		const forwardedCtx = guardAllFailedMock.mock.calls[0]?.[0];
		expect(forwardedCtx?.attemptErrors?.[0]).toMatchObject({
			provider: "google-ai-studio",
			status: 403,
			upstream_error_code: "PERMISSION_DENIED",
			upstream_error_message: "The caller does not have permission.",
		});
	});

	it("tries all ranked providers when fewer than five candidates are available", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		};
		const providers = ["first", "second", "third", "fourth"];
		const candidates = providers.map((providerId) => ({
			providerId,
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		}));
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: candidates,
		});
		rankProvidersMock.mockResolvedValue(
			candidates.map((candidate) => ({ candidate, health: {} })),
		);

		const executors = Object.fromEntries(
			providers.map((providerId) => [
				providerId,
				vi.fn().mockResolvedValue({
					kind: "completed",
					ir: {},
					upstream: new Response(JSON.stringify({ error: `${providerId}_fail` }), { status: 503 }),
					bill: { cost_cents: 0, currency: "USD" },
					keySource: "gateway",
					byokKeyId: null,
				}),
			]),
		) as Record<string, ReturnType<typeof vi.fn>>;
		resolveProviderExecutorMock.mockImplementation((providerId: string) => executors[providerId] ?? null);

		const result = await doRequestWithIR(
			createCtx({ testingMode: false }),
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(502);
		expect(executors.first).toHaveBeenCalledTimes(1);
		expect(executors.second).toHaveBeenCalledTimes(1);
		expect(executors.third).toHaveBeenCalledTimes(1);
		expect(executors.fourth).toHaveBeenCalledTimes(1);
		expect(guardAllFailedMock).toHaveBeenCalledTimes(1);
	});

	it("tries only the first provider when fallbacks are disabled", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		};
		const providers = ["first", "second", "third"];
		const candidates = providers.map((providerId) => ({
			providerId,
			pricingCard,
			byokMeta: [],
			providerModelSlug: "gpt-image-1-mini",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		}));
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: candidates,
		});
		rankProvidersMock.mockResolvedValue(
			candidates.map((candidate) => ({ candidate, health: {} })),
		);

		const executors = Object.fromEntries(
			providers.map((providerId) => [
				providerId,
				vi.fn().mockResolvedValue({
					kind: "completed",
					ir: {},
					upstream: new Response(JSON.stringify({ error: `${providerId}_fail` }), { status: 503 }),
					bill: { cost_cents: 0, currency: "USD" },
					keySource: "gateway",
					byokKeyId: null,
				}),
			]),
		) as Record<string, ReturnType<typeof vi.fn>>;
		resolveProviderExecutorMock.mockImplementation((providerId: string) => executors[providerId] ?? null);

		const result = await doRequestWithIR(
			createCtx({
				testingMode: false,
				body: {
					provider: {
						allow_fallbacks: false,
					},
				},
			}),
			{
				model: "openai/gpt-image-1-mini",
				prompt: "tiny blue square",
				provider: {
					allow_fallbacks: false,
				},
			} as any,
			createTiming(),
		);

		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(502);
		expect(executors.first).toHaveBeenCalledTimes(1);
		expect(executors.second).not.toHaveBeenCalled();
		expect(executors.third).not.toHaveBeenCalled();
	});
});

describe("doRequestWithIR managed credentials", () => {
	const pricingCard = { provider: "test", model: "deepseek/deepseek-v4-flash", endpoint: "chat.completions", currency: "USD", rules: [] };
	const route = (providerId: string, extra: Record<string, unknown> = {}) => ({
		providerId,
		pricingCard,
		byokMeta: [],
		providerModelSlug: "deepseek-v4-flash",
		capabilityParams: {},
		maxInputTokens: null,
		maxOutputTokens: null,
		...extra,
	});
	const failing = (status: number, keySource: "gateway" | "byok" = "gateway") => vi.fn().mockResolvedValue({
		kind: "completed",
		ir: {},
		upstream: new Response(JSON.stringify({ error: { message: "upstream said no" } }), { status }),
		bill: { cost_cents: 0, currency: "USD" },
		keySource,
		byokKeyId: keySource === "byok" ? "byok_1" : null,
	});
	const run = (candidates: any[]) => {
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		return doRequestWithIR(
			createCtx({ endpoint: "chat.completions", capability: "text.generate", model: "deepseek/deepseek-v4-flash" }),
			{ model: "deepseek/deepseek-v4-flash", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any,
			createTiming(),
		);
	};

	beforeEach(() => {
		vi.clearAllMocks();
		resetManagedCredentialStateForTests();
		openAICompatTextProviders.clear();
		for (const id of ["canopy-wave", "baseten", "atlascloud"]) openAICompatTextProviders.add(id);
		runtimeBindings.value = { BASETEN_API_KEY: "bt-key", ATLAS_CLOUD_API_KEY: "atlas-key" };
		guardPricingFoundMock.mockResolvedValue({ ok: true });
		freeQuotaMock.mockResolvedValue(null);
		policyGuardMock.mockResolvedValue(null);
		guardAllFailedMock.mockResolvedValue({ ok: false, response: new Response(JSON.stringify({ error: "all_failed" }), { status: 502 }) });
		admitThroughBreakerMock.mockResolvedValue("closed");
		onCallStartMock.mockResolvedValue(undefined);
		onCallEndMock.mockResolvedValue(undefined);
		maybeOpenOnRecentErrorsMock.mockResolvedValue(undefined);
		reportProbeResultMock.mockResolvedValue(undefined);
		rankProvidersMock.mockImplementation(async (candidates: any[]) => candidates.map((candidate) => ({ candidate, health: {} })));
	});

	it("never tries a provider whose managed key is missing", async () => {
		const executors: Record<string, ReturnType<typeof failing>> = { "canopy-wave": failing(500), baseten: failing(500) };
		resolveProviderExecutorMock.mockImplementation((providerId: string) => executors[providerId] ?? null);

		await run([route("canopy-wave"), route("baseten")]);

		expect(executors["canopy-wave"]).not.toHaveBeenCalled();
		expect(executors.baseten).toHaveBeenCalledTimes(1);
		expect(rankProvidersMock.mock.calls[0][0].map((candidate: any) => candidate.providerId)).toEqual(["baseten"]);
	});

	it("still sends a BYOK request to a provider without a managed key", async () => {
		const executors: Record<string, ReturnType<typeof failing>> = { "canopy-wave": failing(500, "byok") };
		resolveProviderExecutorMock.mockImplementation((providerId: string) => executors[providerId] ?? null);
		const byok = { id: "byok_1", providerId: "canopy-wave", fingerprintSha256: "f", keyVersion: "1", routingMode: "fallback", key: "sk-own" };

		await run([route("canopy-wave", { byokMeta: [byok] })]);

		expect(executors["canopy-wave"]).toHaveBeenCalledTimes(1);
		expect(executors["canopy-wave"].mock.calls[0][0]).toMatchObject({ byokMeta: [expect.objectContaining({ id: "byok_1" })] });
	});

	it("returns a credentials error without any attempt when no candidate can authenticate", async () => {
		const executors: Record<string, ReturnType<typeof failing>> = { "canopy-wave": failing(500) };
		resolveProviderExecutorMock.mockImplementation((providerId: string) => executors[providerId] ?? null);

		const response = await run([route("canopy-wave")]) as Response;

		expect(executors["canopy-wave"]).not.toHaveBeenCalled();
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "upstream_error",
			reason: "canopy-wave_key_missing",
			provider_failure_diagnostics: { category: "credentials_not_configured" },
		});
	});

	it("skips a provider for managed traffic after its managed key returns 402", async () => {
		const executors: Record<string, ReturnType<typeof failing>> = { atlascloud: failing(402), baseten: failing(500) };
		resolveProviderExecutorMock.mockImplementation((providerId: string) => executors[providerId] ?? null);

		await run([route("atlascloud"), route("baseten")]);
		expect(executors.atlascloud).toHaveBeenCalledTimes(1);

		await run([route("atlascloud"), route("baseten")]);
		expect(executors.atlascloud).toHaveBeenCalledTimes(1);
		expect(executors.baseten).toHaveBeenCalledTimes(2);
	});

	it("does not let a customer's BYOK 402 affect anyone else", async () => {
		const byok = { id: "byok_1", providerId: "atlascloud", fingerprintSha256: "f", keyVersion: "1", routingMode: "priority", key: "sk-own" };
		// The customer's key is out of credit; the gateway's own key is fine.
		const atlascloud = vi.fn(async (args: any) => {
			const ownKey = (args.byokMeta ?? []).length > 0;
			return (await failing(ownKey ? 402 : 500, ownKey ? "byok" : "gateway")());
		});
		const executors: Record<string, any> = { atlascloud, baseten: failing(500) };
		resolveProviderExecutorMock.mockImplementation((providerId: string) => executors[providerId] ?? null);

		await run([route("atlascloud", { byokMeta: [byok] }), route("baseten")]);
		const firstRequestCalls = atlascloud.mock.calls.length;
		expect(atlascloud.mock.calls[0][0].byokMeta).toHaveLength(1);

		await run([route("atlascloud"), route("baseten")]);
		expect(atlascloud).toHaveBeenCalledTimes(firstRequestCalls + 1);
		expect(atlascloud.mock.calls.at(-1)![0].byokMeta ?? []).toHaveLength(0);
	});
});
