import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The response timeline's steps from the end of "before" to the first fetch, measured on a real
// doRequestWithIR attempt with a controlled clock (performance.now and Date.now move together).
import { Timer } from "../telemetry/timer";
import { doRequestWithIR } from "./index";
import { buildResponseTimeline, buildRoutingSteps } from "../after/timing";

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

describe("pre-dispatch step timing after the before phase", () => {
	let now = 0;
	const advance = (ms: number) => { now += ms; };
	beforeEach(() => {
		vi.clearAllMocks();
		resetManagedCredentialStateForTests();
		now = 1_000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		vi.spyOn(Date, "now").mockImplementation(() => now);
		guardPricingFoundMock.mockResolvedValue({ ok: true });
		policyGuardMock.mockImplementation(async () => { advance(4); return null; });
		admitThroughBreakerMock.mockImplementation(async () => { advance(2); return "closed"; });
		onCallStartMock.mockResolvedValue(undefined);
		onCallEndMock.mockResolvedValue(undefined);
		maybeOpenOnRecentErrorsMock.mockResolvedValue(undefined);
		reportProbeResultMock.mockResolvedValue(undefined);
		guardAllFailedMock.mockResolvedValue({ ok: false, response: new Response("{}", { status: 502 }) });
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
	});
	afterEach(() => { vi.restoreAllMocks(); });

	function setUp(pricingCard: Record<string, unknown>) {
		const candidates = [{ providerId: "first", pricingCard, byokMeta: [], providerModelSlug: "model", capabilityParams: {} }];
		guardCandidatesMock.mockResolvedValue({ ok: true, value: candidates });
		rankProvidersMock.mockImplementation(async () => { advance(3); return candidates.map(candidate => ({ candidate, health: {} })); });
		resolveProviderExecutorMock.mockReturnValue(async (args: any) => {
			advance(15); // the executor builds and signs its request
			const upstream = await args.upstreamTiming.fetch("https://provider.test/generate");
			return { kind: "completed", ir: {}, upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: "gateway" };
		});
		// What the before phase and the pipeline entry leave on the request's timer.
		const timing = createTiming();
		timing.timer.record("admission", 2);
		timing.timer.record("before_start", 46);
		timing.timer.record("guardContext", 46);
		timing.timer.mark("before_end");
		advance(1); // protocol detection, decode, response cache
		timing.timer.mark("execute_start");
		timing.timer.between("before_to_execute", "before_end", "execute_start");
		// Received 50 ms before execute started: 2 admission + 46 before + 1 hand-over + 1 untimed.
		const ctx = createCtx({ billingRequestId: "billing-1", meta: { startedAtMs: now - 50 } });
		return { ctx, timing };
	}

	it("times every step of a free-model request up to its first fetch, including the free quota's Durable Object", async () => {
		const { ctx, timing } = setUp({ currency: "USD", rules: [{ pricing_plan: "free", price_per_unit: "0", currency: "USD" }] });
		// A cold free-quota counter: limits read 30 ms, then the Durable Object's admit 525 ms.
		freeQuotaMock.mockImplementation(async (args: any) => {
			advance(30); args.timing.limitsMs = 30;
			advance(525); args.timing.counterMs = 525;
			return null;
		});

		const result = await doRequestWithIR(ctx, { model: "model", prompt: "test" } as any, timing);

		expect(result.ok).toBe(true);
		ctx.timing = timing.timer.snapshot();
		const steps = buildRoutingSteps(ctx);
		expect(steps).toMatchObject({
			admission: 2,
			before: 46,
			before_to_execute: 1,
			ranking: 3,
			execute_to_attempt: 3,
			attempt_rate_limit_policies: 4,
			attempt_free_quota: 555,
			attempt_free_quota_limits: 30,
			attempt_free_quota_counter: 525,
			attempt_breaker: 2,
			attempt_resolve_executor: 0,
			attempt_to_executor: 561,
			attempt_executor_to_dispatch: 15,
		});
		// Receipt at startedAtMs; first fetch 629 ms later, as in the 11-04 request.
		expect(ctx.meta.timeToUpstreamRequestMs).toBe(629);
		const timeline = buildResponseTimeline(ctx);
		expect(timeline.routing_ms).toBe(629);
		// 2 + 46 + 1 + 3 + 561 + 15 = 628 of 629 ms attributed.
		expect(timeline.unattributed_ms).toBe(1);
	});

	it("records no free-quota parts for a paid model, and only first-attempt steps", async () => {
		const { ctx, timing } = setUp({ currency: "USD", rules: [{ pricing_plan: "standard", price_per_unit: "1", currency: "USD" }] });
		freeQuotaMock.mockResolvedValue(null);
		await doRequestWithIR(ctx, { model: "model", prompt: "test" } as any, timing);
		ctx.timing = timing.timer.snapshot();
		const steps = buildRoutingSteps(ctx)!;
		expect(steps).not.toHaveProperty("attempt_free_quota_limits");
		expect(steps).not.toHaveProperty("attempt_free_quota_counter");
		expect(steps.attempt_executor_to_dispatch).toBe(15);
		expect(Object.keys(steps).some(key => key.includes("attempt_2"))).toBe(false);
	});
});
