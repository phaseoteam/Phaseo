import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import { doRequestWithIR } from "./index";

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
	classifyProviderHealthImpact: (args: any) => {
		const status = Number(args?.upstreamStatus ?? 0);
		if (Number.isFinite(status) && status >= 200 && status < 400) return "success";
		if (status === 429) return "neutral";
		return "failure";
	},
	onCallStart: (...args: any[]) => onCallStartMock(...args),
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
		onCallStartMock.mockResolvedValue(undefined);
		onCallEndMock.mockResolvedValue(undefined);
		maybeOpenOnRecentErrorsMock.mockResolvedValue(undefined);
		reportProbeResultMock.mockResolvedValue(undefined);
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
		expect(loadPriceCardMock).toHaveBeenCalledWith("openai", "openai/gpt-image-1-mini", "image.generate");
		expect(executor).toHaveBeenCalledTimes(1);
		expect(guardPricingFoundMock).not.toHaveBeenCalled();
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
			upstream: new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
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

	it("fails over to the next provider when a provider returns a 400 compatibility error", async () => {
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
			upstream: new Response(
				JSON.stringify({
					error: {
						code: "service_tier_not_supported",
						message: "service_tier is not supported by this provider",
						param: "service_tier",
					},
				}),
				{ status: 400 },
			),
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
				outcome: "upstream_non_2xx",
				type: "upstream_non_2xx",
				status: 400,
				upstream_error_code: "service_tier_not_supported",
				upstream_error_param: "service_tier",
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

	it("falls back from Novita to Moonshot for a non-stream K2.7 priority compatibility failure", async () => {
		const pricingCard = {
			provider: "moonshotai",
			model: "moonshotai/kimi-k2.7-code",
			endpoint: "text.generate",
			currency: "USD",
			rules: [],
		};
		const novitaCandidate = {
			providerId: "novita",
			apiModelId: "moonshotai/kimi-k2.7-code",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "moonshotai/kimi-k2.7-code",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		const moonshotCandidate = {
			providerId: "moonshotai",
			apiModelId: "moonshotai/kimi-k2.7-code",
			pricingCard,
			byokMeta: [],
			providerModelSlug: "kimi-k2.7-code-highspeed",
			capabilityParams: {},
			maxInputTokens: null,
			maxOutputTokens: null,
		};
		guardCandidatesMock.mockResolvedValue({
			ok: true,
			value: [novitaCandidate, moonshotCandidate],
		});
		rankProvidersMock.mockResolvedValue([
			{ candidate: novitaCandidate, health: {} },
			{ candidate: moonshotCandidate, health: {} },
		]);

		const novitaExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: {},
			upstream: new Response(
				JSON.stringify({
					error: {
						code: "service_tier_not_supported",
						message: "service_tier is not supported by this provider",
						param: "service_tier",
					},
				}),
				{ status: 400 },
			),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		const moonshotExecutor = vi.fn().mockResolvedValue({
			kind: "completed",
			ir: {
				id: "resp_moonshot_priority",
				output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }],
			},
			upstream: new Response(JSON.stringify({ id: "resp_moonshot_priority" }), { status: 200 }),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: "gateway",
			byokKeyId: null,
		});
		resolveProviderExecutorMock.mockImplementation((providerId: string) => {
			if (providerId === "novita") return novitaExecutor;
			if (providerId === "moonshotai") return moonshotExecutor;
			return null;
		});
		const ctx = createCtx({
			endpoint: "responses",
			capability: "text.generate",
			model: "moonshotai/kimi-k2.7-code",
			body: {
				model: "moonshotai/kimi-k2.7-code",
				service_tier: "priority",
				input: "Reply with OK",
				stream: false,
			},
			meta: {
				stream: false,
				debug: undefined,
				returnMeta: false,
			},
		});

		const result = await doRequestWithIR(
			ctx,
			{
				model: "moonshotai/kimi-k2.7-code",
				serviceTier: "priority",
				messages: [{ role: "user", content: [{ type: "text", text: "Reply with OK" }] }],
				stream: false,
			} as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect((result as any).result.provider).toBe("moonshotai");
		expect((result as any).result.providerModelSlug).toBe("kimi-k2.7-code-highspeed");
		expect(novitaExecutor).toHaveBeenCalledTimes(1);
		expect(moonshotExecutor).toHaveBeenCalledTimes(1);
		expect(ctx.providerAttempts).toEqual([
			expect.objectContaining({
				attempt_number: 1,
				provider: "novita",
				outcome: "upstream_non_2xx",
				type: "upstream_non_2xx",
				status: 400,
				upstream_error_code: "service_tier_not_supported",
				upstream_error_param: "service_tier",
			}),
			expect.objectContaining({
				attempt_number: 2,
				provider: "moonshotai",
				provider_model_slug: "kimi-k2.7-code-highspeed",
				outcome: "success",
				type: "success",
				status: 200,
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

	it("fails over to next provider when an executor throws a non-retryable error", async () => {
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
			.mockRejectedValue(new Error("provider request failed before response"));
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
				outcome: "error",
				type: "error",
				upstream_error_message: "provider request failed before response",
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

	it("fails immediately for single-provider upstream failures", async () => {
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
		});
		resolveProviderExecutorMock.mockImplementation((providerId: string) =>
			providerId === "only" ? onlyExecutor : null,
		);
		const ctx = createCtx({ testingMode: false });

		const result = await doRequestWithIR(
			ctx,
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
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

	it("tries at most the top five providers when multiple candidates are available", async () => {
		const pricingCard = {
			provider: "openai",
			model: "openai/gpt-image-1-mini",
			endpoint: "image.generate",
			currency: "USD",
			rules: [],
		};
		const providers = ["first", "second", "third", "fourth", "fifth", "sixth"];
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
		expect(executors.fifth).toHaveBeenCalledTimes(1);
		expect(executors.sixth).not.toHaveBeenCalled();
		expect(guardAllFailedMock).toHaveBeenCalledTimes(1);
	});
});
