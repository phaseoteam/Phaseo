import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import { doRequestWithIR } from "./index";

const guardCandidatesMock = vi.fn();
const guardPricingFoundMock = vi.fn();
const guardAllFailedMock = vi.fn();
const rankProvidersMock = vi.fn();
const admitThroughBreakerMock = vi.fn();
const onCallEndMock = vi.fn();
const maybeOpenOnRecentErrorsMock = vi.fn();
const reportProbeResultMock = vi.fn();
const resolveProviderExecutorMock = vi.fn();
const loadPriceCardMock = vi.fn();
const releaseBackgroundRuntimeMock = vi.fn();
const ensureRuntimeForBackgroundMock = vi.fn(() => releaseBackgroundRuntimeMock);

vi.mock("@/runtime/env", () => ({
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
	classifyProviderHealthImpact: ({ upstreamStatus }: { upstreamStatus?: number | null } = {}) => {
		const status = Number(upstreamStatus ?? 0);
		return status >= 200 && status < 300 ? "success" : "failure";
	},
	onCallEnd: (...args: any[]) => onCallEndMock(...args),
	maybeOpenOnRecentErrors: (...args: any[]) => maybeOpenOnRecentErrorsMock(...args),
	reportProbeResult: (...args: any[]) => reportProbeResultMock(...args),
}));

vi.mock("../../executors", () => ({
	resolveProviderExecutor: (...args: any[]) => resolveProviderExecutorMock(...args),
	normalizeCapability: (capability: string) => capability,
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

		guardAllFailedMock.mockResolvedValue({
			ok: false,
			response: new Response(JSON.stringify({ error: "all_failed" }), { status: 502 }),
		});
		admitThroughBreakerMock.mockResolvedValue("closed");
		onCallEndMock.mockResolvedValue(undefined);
		maybeOpenOnRecentErrorsMock.mockResolvedValue(undefined);
		reportProbeResultMock.mockResolvedValue(undefined);
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
		expect(guardAllFailedMock).toHaveBeenCalled();
	});

    it.each([
        { requested: false, parity: false, expected: false },
        { requested: false, parity: true, expected: true },
        { requested: true, parity: false, expected: true },
    ])("selects text transport from trusted candidate parity: %j", async ({ requested, parity, expected }) => {
        const declaration = { supported: true, bufferedParity: true, preferStreamingForBufferedRequests: true };
        const candidate = { providerId: "poolside", pricingCard: { rules: [], currency: "USD" }, byokMeta: [],
            providerModelSlug: "laguna-xs-2.1", capabilityParams: parity ? { stream: declaration } : {} };
        guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
        rankProvidersMock.mockResolvedValue([{ candidate, health: {} }]);
        const executor = vi.fn().mockResolvedValue({ kind: "completed", ir: {}, upstream: new Response("{}"),
            bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" });
        resolveProviderExecutorMock.mockReturnValue(executor);
        const request = { model: "poolside/laguna-xs-2.1:free", stream: requested,
            messages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
            // A client cannot self-certify parity through the payload.
            rawRequest: { stream: requested, bufferedParity: true, capabilityParams: { stream: declaration } } };
        await doRequestWithIR(createCtx({ capability: "text.generate", endpoint: "chat.completions", testingMode: true }),
            request as any, createTiming());
        expect(executor).toHaveBeenCalledOnce();
        expect(executor.mock.calls[0][0].ir.stream).toBe(expected);
        expect(request.stream).toBe(requested);
    });

    it("reevaluates buffered parity on fallback instead of inheriting the failed attempt's mode", async () => {
        const candidates = [true, false].map(parity => ({ providerId: parity ? "poolside" : "openai",
            pricingCard: { rules: [], currency: "USD" }, byokMeta: [], providerModelSlug: "fixture-model",
            capabilityParams: { stream: { supported: true, bufferedParity: parity, preferStreamingForBufferedRequests: true } } }));
        guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
        rankProvidersMock.mockResolvedValue(candidates.map(candidate => ({ candidate, health: {} })));
        const executor = vi.fn(async (args: any) => ({ kind: "completed", ir: {},
            upstream: new Response("{}", { status: args.providerId === "poolside" ? 503 : 200 }),
            bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" }));
        resolveProviderExecutorMock.mockReturnValue(executor);
        await doRequestWithIR(createCtx({ capability: "text.generate", endpoint: "chat.completions", testingMode: true }),
            { model: "fixture-model", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "test" }] }] } as any,
            createTiming());
        expect(executor.mock.calls.map(call => call[0].ir.stream)).toEqual([true, false]);
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

    it.each(["completed", "stream"] as const)("retains private health identity through %s execution", async kind => {
        const candidate = { providerId: "private-model", privateEndpoint: { baseUrl: "https://private.example/v1", supportsResponses: true }, pricingCard: { currency: "USD", rules: [] }, byokMeta: [{ id: "route-1", key: "test-private-key", value: "test-private-key", alwaysUse: true, routingMode: "priority" }], providerModelSlug: "private", capabilityParams: {} };
        const scopedProvider = "private-model:workspace-a:route-1";
        guardCandidatesMock.mockResolvedValue({ ok: true, value: [candidate] });
        rankProvidersMock.mockResolvedValue([{ candidate, health: { provider: scopedProvider } }]);
        resolveProviderExecutorMock.mockReturnValue(vi.fn().mockResolvedValue({ kind, ir: {}, upstream: new Response("{}", { status: 200 }), stream: kind === "stream" ? new ReadableStream({ start(controller) { controller.close(); } }) : undefined, bill: { cost_cents: 0, currency: "USD" }, keySource: "byok", byokKeyId: "route-1" }));
        const result = await doRequestWithIR(createCtx({ endpoint: "chat.completions", capability: "text.generate", workspaceId: "workspace-a", model: "acme/private", testingMode: true, stream: kind === "stream" }), { model: "acme/private", messages: [] } as any, createTiming());
        expect(result.ok).toBe(true);
        expect(admitThroughBreakerMock.mock.calls[0][1]).toBe(scopedProvider);
        if (kind === "completed") expect(onCallEndMock).toHaveBeenCalledWith("chat.completions", expect.objectContaining({ provider: scopedProvider, ok: true }));
        else expect((result as any).result.healthContext.provider).toBe(scopedProvider);
    });

	it("loads pricing lazily for testing-mode candidates and executes", async () => {
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
		const ctx = createCtx({ testingMode: true });

		const result = await doRequestWithIR(
			ctx,
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect(loadPriceCardMock).toHaveBeenCalledWith("openai", "openai/gpt-image-1-mini", "image.generate", "gpt-image-1-mini");
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
		// Only completion health reporting schedules background work.
		expect(ensureRuntimeForBackgroundMock).toHaveBeenCalledTimes(1);
		expect(releaseBackgroundRuntimeMock).toHaveBeenCalledTimes(1);
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

	it("retains executor timing for a successful decisions response", async () => {
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
			capabilityParams: {},
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
			{ model: "typesafe/jev-1.13.0", state: {}, questions: {} } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect(ctx.meta.latency_ms).toBe(41);
		expect(ctx.meta.generation_ms).toBeGreaterThanOrEqual(41);
		expect(ctx.meta.end_to_end_ms).toBeUndefined();
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
			upstream: new Response(JSON.stringify({ error: "rate_limited" }), {
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
		expect(guardAllFailedMock).not.toHaveBeenCalled();
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
