import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeProviders } from "./routing";

const readHealthManyMock = vi.fn();
const readStickyRoutingMock = vi.fn();
const resolveStickyRoutingContextMock = vi.fn();

vi.mock("./health", () => ({
	readHealthMany: (...args: any[]) => readHealthManyMock(...args),
}));

vi.mock("./sticky-routing", () => ({
	readStickyRouting: (...args: any[]) => readStickyRoutingMock(...args),
	resolveStickyRoutingContext: (...args: any[]) => resolveStickyRoutingContextMock(...args),
	stickyRoutingCacheBoostMultiplier: (cachedReadTokens: number) => {
		if (!Number.isFinite(cachedReadTokens) || cachedReadTokens <= 0) return 1;
		return 1 + Math.min(12, Math.log10(cachedReadTokens + 1) * 4);
	},
}));

function health(
	provider: string,
	overrides?: Partial<{
		lat_ewma_10s: number;
		lat_ewma_60s: number;
		lat_ewma_300s: number;
		tp_ewma_60s: number;
	}>
) {
	return {
		endpoint: "responses",
		provider,
		model: "openai/gpt-4o-mini",
		lat_ewma_10s: 800,
		lat_ewma_60s: 800,
		lat_ewma_300s: 800,
		err_ewma_10s: 0,
		err_ewma_60s: 0,
		err_ewma_300s: 0,
		rate_10s: 0,
		rate_60s: 0,
		tp_ewma_60s: 1,
		rec_ok_ew_60s: 0,
		rec_tot_ew_60s: 0,
		inflight: 0,
		current_load: 0,
		breaker: "closed",
		breaker_until_ms: 0,
		breaker_attempts: 0,
		last_ts_10s: 0,
		last_ts_60s: 0,
		last_ts_300s: 0,
		last_updated: Date.now(),
		...overrides,
	} as const;
}

function candidate(args: {
	providerId: string;
	providerStatus?: "active" | "beta" | "alpha" | "not_ready";
	providerRoutingStatus?: "active" | "deranked" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
	modelRoutingStatus?: "active" | "deranked" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
	capabilityStatus?: "active" | "deranked" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled" | "internal_testing";
	pricingCard?: any;
}) {
	return {
		providerId: args.providerId,
		providerStatus: args.providerStatus ?? "active",
		providerRoutingStatus: args.providerRoutingStatus ?? "active",
		modelRoutingStatus: args.modelRoutingStatus ?? "active",
		capabilityStatus: args.capabilityStatus ?? "active",
		adapter: { name: args.providerId } as any,
		baseWeight: 1,
		byokMeta: [],
		pricingCard: args.pricingCard ?? null,
		providerModelSlug: null,
	} as any;
}


function textPricingCard(inputTextPerToken: number, cachedReadPerToken: number) {
	return {
		provider: "test",
		model: "openai/gpt-4o-mini",
		endpoint: "responses",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: "1",
		rules: [
			{
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1,
				price_per_unit: String(inputTextPerToken),
				currency: "USD",
				match: [],
				priority: 1,
			},
			{
				pricing_plan: "standard",
				meter: "cached_read_text_tokens",
				unit: "token",
				unit_size: 1,
				price_per_unit: String(cachedReadPerToken),
				currency: "USD",
				match: [],
				priority: 1,
			},
		],
	};
}

describe("routeProviders testing mode", () => {
	beforeEach(() => {
		readHealthManyMock.mockReset();
		readStickyRoutingMock.mockReset();
		resolveStickyRoutingContextMock.mockReset();
		readHealthManyMock.mockImplementation(async (_endpoint: string, _model: string, providerIds: string[]) =>
			Object.fromEntries(providerIds.map((providerId) => [providerId, health(providerId)]))
		);
		resolveStickyRoutingContextMock.mockResolvedValue(null);
		readStickyRoutingMock.mockResolvedValue(null);
	});

	it("keeps beta providers gated on public traffic", async () => {
		const result = await routeProviders(
			[
				candidate({ providerId: "openai", providerStatus: "active" }),
				candidate({ providerId: "google-ai-studio", providerStatus: "beta" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				teamId: "team_123",
				betaChannelEnabled: false,
				providerCapabilitiesBeta: false,
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["openai"]);
		expect(result.diagnostics.testingMode).toBe(false);
		const statusStage = result.diagnostics.filterStages.find((stage) => stage.stage === "status_gate");
		expect(statusStage?.afterCount).toBe(1);
	});

	it("bypasses rollout gating when testing mode is enabled", async () => {
		const result = await routeProviders(
			[
				candidate({ providerId: "openai", providerStatus: "active" }),
				candidate({ providerId: "google-ai-studio", providerStatus: "beta" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				teamId: "team_123",
				betaChannelEnabled: false,
				providerCapabilitiesBeta: false,
				testingMode: true,
			}
		);

		expect(result.ranked).toHaveLength(2);
		expect(result.diagnostics.testingMode).toBe(true);
		const statusStage = result.diagnostics.filterStages.find((stage) => stage.stage === "status_gate");
		expect(statusStage?.afterCount).toBe(2);
	});

	it("filters disabled provider/model routing statuses", async () => {
		const result = await routeProviders(
			[
				candidate({ providerId: "openai" }),
				candidate({ providerId: "mistral", providerRoutingStatus: "disabled" }),
				candidate({ providerId: "anthropic", modelRoutingStatus: "disabled" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				teamId: "team_123",
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["openai"]);
		const providerGate = result.diagnostics.filterStages.find((stage) => stage.stage === "provider_routing_status_gate");
		const modelGate = result.diagnostics.filterStages.find((stage) => stage.stage === "model_routing_status_gate");
		expect(providerGate?.afterCount).toBe(2);
		expect(modelGate?.afterCount).toBe(1);
	});

	it("applies strong derank multipliers (legacy deranked maps to lvl1)", async () => {
		const result = await routeProviders(
			[
				candidate({ providerId: "openai", capabilityStatus: "active" }),
				candidate({ providerId: "google-ai-studio", capabilityStatus: "deranked" }),
				candidate({ providerId: "anthropic", capabilityStatus: "deranked_lvl2" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini:fast",
				teamId: "team_123",
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual([
			"openai",
			"google-ai-studio",
			"anthropic",
		]);
	});

	it("keeps lvl3 candidates reachable when explicitly requested", async () => {
		const result = await routeProviders(
			[
				candidate({ providerId: "openai", providerRoutingStatus: "active" }),
				candidate({ providerId: "google-ai-studio", providerRoutingStatus: "deranked_lvl3" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				teamId: "team_123",
				body: { provider: { only: ["google-ai-studio"] } },
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["google-ai-studio"]);
	});

	it("prioritizes hinted provider when sticky cache metadata exists", async () => {
		resolveStickyRoutingContextMock.mockResolvedValue({
			key: "context:abc",
			source: "context_hash",
		});
		readStickyRoutingMock.mockResolvedValue({
			providerId: "anthropic",
			cachedReadTokens: 2000,
			contextKey: "context:abc",
			source: "context_hash",
			createdAt: new Date().toISOString(),
		});

		const result = await routeProviders(
			[
				candidate({ providerId: "openai" }),
				candidate({ providerId: "anthropic" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini:fast",
				teamId: "team_123",
				body: { input: "hello world" },
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)[0]).toBe("anthropic");
		expect(result.diagnostics.stickyRouting.hintedProvider).toBe("anthropic");
		expect(result.diagnostics.stickyRouting.applied).toBe(true);
	});

	it("skips sticky cache boost when cached reads are not cheaper than input pricing", async () => {
		resolveStickyRoutingContextMock.mockResolvedValue({
			key: "context:priced",
			source: "context_hash",
		});
		readStickyRoutingMock.mockResolvedValue({
			providerId: "anthropic",
			cachedReadTokens: 2000,
			contextKey: "context:priced",
			source: "context_hash",
			createdAt: new Date().toISOString(),
		});
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", { lat_ewma_10s: 400, lat_ewma_60s: 400, lat_ewma_300s: 400 }),
			anthropic: health("anthropic", { lat_ewma_10s: 1200, lat_ewma_60s: 1200, lat_ewma_300s: 1200 }),
		}));

		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					pricingCard: textPricingCard(0.00001, 0.000005),
				}),
				candidate({
					providerId: "anthropic",
					pricingCard: textPricingCard(0.00001, 0.00002),
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini:fast",
				teamId: "team_123",
				body: { input: "hello world" },
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)[0]).toBe("openai");
		expect(result.diagnostics.stickyRouting.hintedProvider).toBe("anthropic");
		expect(result.diagnostics.stickyRouting.applied).toBe(false);
	});

	it("allows disabling cache-aware routing", async () => {
		resolveStickyRoutingContextMock.mockResolvedValue({
			key: "context:abc",
			source: "context_hash",
		});
		readStickyRoutingMock.mockResolvedValue({
			providerId: "anthropic",
			cachedReadTokens: 2000,
			contextKey: "context:abc",
			source: "context_hash",
			createdAt: new Date().toISOString(),
		});

		const result = await routeProviders(
			[
				candidate({ providerId: "openai" }),
				candidate({ providerId: "anthropic" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini:fast",
				teamId: "team_123",
				cacheAwareRouting: false,
				testingMode: false,
			}
		);

		expect(resolveStickyRoutingContextMock).not.toHaveBeenCalled();
		expect(readStickyRoutingMock).not.toHaveBeenCalled();
		expect(result.diagnostics.stickyRouting.enabled).toBe(false);
		expect(result.diagnostics.stickyRouting.applied).toBe(false);
	});
});


