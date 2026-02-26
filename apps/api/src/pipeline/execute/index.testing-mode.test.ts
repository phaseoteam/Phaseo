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
		teamId: "team_test_1",
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

		const result = await doRequestWithIR(
			createCtx({ testingMode: true }),
			{ model: "openai/gpt-image-1-mini", prompt: "tiny blue square" } as any,
			createTiming(),
		);

		expect((result as any).ok).toBe(true);
		expect(loadPriceCardMock).toHaveBeenCalledWith(
			"openai",
			"openai/gpt-image-1-mini",
			"image.generate",
		);
		expect(executor).toHaveBeenCalledTimes(1);
		expect(guardPricingFoundMock).not.toHaveBeenCalled();
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
});
