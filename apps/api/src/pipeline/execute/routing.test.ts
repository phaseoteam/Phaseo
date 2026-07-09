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
	providerFamilyId?: string | null;
	offerScope?: "global" | "regional" | "specialized" | null;
	offerLabel?: string | null;
	apiModelId?: string | null;
	providerModelSlug?: string | null;
	providerStatus?: "active" | "beta" | "alpha" | "not_ready";
	providerRoutingStatus?: "active" | "deranked" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
	modelRoutingStatus?: "active" | "deranked" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled";
	capabilityStatus?: "active" | "deranked" | "deranked_lvl1" | "deranked_lvl2" | "deranked_lvl3" | "disabled" | "internal_testing";
	residencyMode?: "unknown" | "provider_managed" | "customer_selectable" | "account_selected" | null;
	executionRegions?: string[] | null;
	dataRegions?: string[] | null;
	zeroDataRetention?: "unknown" | "unsupported" | "optional" | "default" | null;
	pricingCard?: any;
}) {
	return {
		providerId: args.providerId,
		providerFamilyId: args.providerFamilyId ?? null,
		offerScope: args.offerScope ?? null,
		offerLabel: args.offerLabel ?? null,
		providerStatus: args.providerStatus ?? "active",
		providerRoutingStatus: args.providerRoutingStatus ?? "active",
		modelRoutingStatus: args.modelRoutingStatus ?? "active",
		capabilityStatus: args.capabilityStatus ?? "active",
		residencyMode: args.residencyMode ?? "unknown",
		executionRegions: args.executionRegions ?? null,
		dataRegions: args.dataRegions ?? null,
		zeroDataRetention: args.zeroDataRetention ?? "unknown",
		apiModelId: args.apiModelId ?? null,
		adapter: { name: args.providerId } as any,
		baseWeight: 1,
		byokMeta: [],
		pricingCard: args.pricingCard ?? null,
		providerModelSlug: args.providerModelSlug ?? null,
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
				workspaceId: "team_123",
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
				workspaceId: "team_123",
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

	it("keeps alpha providers gated unless alpha channel is enabled", async () => {
		const result = await routeProviders(
			[
				candidate({ providerId: "openai", providerStatus: "active" }),
				candidate({ providerId: "atlascloud", providerStatus: "alpha" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				betaChannelEnabled: true,
				alphaChannelEnabled: false,
				providerCapabilitiesBeta: false,
				testingMode: false,
				body: { provider: { include_alpha: true } },
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["openai"]);
		expect(result.diagnostics.includeAlpha).toBe(false);
		expect(result.diagnostics.includeAlphaHint).toBe(true);
		const statusStage = result.diagnostics.filterStages.find((stage) => stage.stage === "status_gate");
		expect(statusStage?.afterCount).toBe(1);
	});

	it("allows alpha providers when beta and alpha channels are enabled", async () => {
		const result = await routeProviders(
			[
				candidate({ providerId: "openai", providerStatus: "active" }),
				candidate({ providerId: "atlascloud", providerStatus: "alpha" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				betaChannelEnabled: true,
				alphaChannelEnabled: true,
				providerCapabilitiesBeta: false,
				testingMode: false,
			}
		);

		expect(result.ranked).toHaveLength(2);
		expect(result.diagnostics.includeAlpha).toBe(true);
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
				workspaceId: "team_123",
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["openai"]);
		const providerGate = result.diagnostics.filterStages.find((stage) => stage.stage === "provider_routing_status_gate");
		const modelGate = result.diagnostics.filterStages.find((stage) => stage.stage === "model_routing_status_gate");
		expect(providerGate?.afterCount).toBe(2);
		expect(modelGate?.afterCount).toBe(1);
	});

	it("filters providers by residency requirements", async () => {
		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					executionRegions: ["us", "eu"],
					dataRegions: ["us", "eu"],
					zeroDataRetention: "optional",
				}),
				candidate({
					providerId: "anthropic",
					executionRegions: null,
					dataRegions: null,
					zeroDataRetention: "optional",
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				body: {
					provider: {
						required_execution_region: "eu",
						required_data_region: "eu",
						require_zero_data_retention: true,
					},
				},
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual([
			"openai",
		]);
		const residencyGate = result.diagnostics.filterStages.find(
			(stage) => stage.stage === "residency_gate",
		);
		expect(residencyGate?.afterCount).toBe(1);
	});

	it("keeps regional offers out of the default routing pool when a global sibling exists", async () => {
		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					providerFamilyId: "openai",
					offerScope: "global",
				}),
				candidate({
					providerId: "openai-eu",
					providerFamilyId: "openai",
					offerScope: "regional",
					offerLabel: "EU",
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-5.5",
				workspaceId: "team_123",
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["openai"]);
		const offerStage = result.diagnostics.filterStages.find(
			(stage) => stage.stage === "offer_scope_gate",
		);
		expect(offerStage?.afterCount).toBe(1);
		expect(offerStage?.droppedProviders[0]?.reason).toBe(
			"regional_offer_requires_explicit_opt_in",
		);
	});

	it("allows explicit opt-in to a regional offer through provider.only", async () => {
		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					providerFamilyId: "openai",
					offerScope: "global",
				}),
				candidate({
					providerId: "openai-eu",
					providerFamilyId: "openai",
					offerScope: "regional",
					offerLabel: "EU",
					executionRegions: ["eu"],
					dataRegions: ["eu"],
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-5.5",
				workspaceId: "team_123",
				body: {
					provider: {
						only: ["openai-eu"],
						required_execution_region: "eu",
					},
				},
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual([
			"openai-eu",
		]);
	});

	it("normalizes provider.only aliases before routing", async () => {
		const result = await routeProviders(
			[
				candidate({
					providerId: "novita",
				}),
				candidate({
					providerId: "openai",
				}),
			],
			{
				endpoint: "responses",
				model: "deepseek/deepseek-r1-turbo",
				workspaceId: "team_123",
				body: {
					provider: {
						only: ["novitaai"],
					},
				},
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["novita"]);
		const onlyStage = result.diagnostics.filterStages.find((stage) => stage.stage === "hints.only");
		expect(onlyStage?.afterCount).toBe(1);
	});

	it("routes priority-tier requests to specialized provider offers", async () => {
		const result = await routeProviders(
			[
				candidate({
					providerId: "minimax",
					providerFamilyId: "minimax",
					offerScope: "global",
				}),
				candidate({
					providerId: "minimax-lightning",
					providerFamilyId: "minimax",
					offerScope: "specialized",
					offerLabel: "priority",
				}),
			],
			{
				endpoint: "responses",
				model: "minimax/minimax-m2.1",
				workspaceId: "team_123",
				body: {
					service_tier: "priority",
				},
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual([
			"minimax-lightning",
		]);
	});

	it("expands provider.only for priority-tier specialized siblings", async () => {
		const result = await routeProviders(
			[
				candidate({
					providerId: "moonshotai",
					providerFamilyId: "moonshotai",
					offerScope: "global",
				}),
				candidate({
					providerId: "moonshotai-turbo",
					providerFamilyId: "moonshotai",
					offerScope: "specialized",
					offerLabel: "priority",
				}),
			],
			{
				endpoint: "responses",
				model: "moonshotai/kimi-k2",
				workspaceId: "team_123",
				body: {
					service_tier: "priority",
					provider: {
						only: ["moonshotai"],
					},
				},
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual([
			"moonshotai-turbo",
		]);
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
				workspaceId: "team_123",
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
				workspaceId: "team_123",
				body: { provider: { only: ["google-ai-studio"] } },
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["google-ai-studio"]);
	});

	it("honors provider.sort=price from the request body", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				lat_ewma_60s: 250,
				lat_ewma_300s: 250,
				tp_ewma_60s: 14,
			}),
			anthropic: health("anthropic", {
				lat_ewma_60s: 1200,
				lat_ewma_300s: 1200,
				tp_ewma_60s: 4,
			}),
		}));

		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					pricingCard: textPricingCard(0.00004, 0.00002),
				}),
				candidate({
					providerId: "anthropic",
					pricingCard: textPricingCard(0.00001, 0.000005),
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				body: { provider: { sort: "price" } },
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)[0]).toBe("anthropic");
		expect(result.diagnostics.routingMode).toBe("price");
	});

	it("uses cheapest stable providers first for default balanced routing", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				lat_ewma_60s: 250,
				lat_ewma_300s: 250,
				tp_ewma_60s: 20,
			}),
			anthropic: health("anthropic", {
				lat_ewma_60s: 900,
				lat_ewma_300s: 900,
				tp_ewma_60s: 3,
			}),
		}));

		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					pricingCard: textPricingCard(0.00004, 0.00002),
				}),
				candidate({
					providerId: "anthropic",
					pricingCard: textPricingCard(0.00001, 0.000005),
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				body: { routing: { mode: "balanced" } },
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)[0]).toBe("anthropic");
		expect(result.diagnostics.routingMode).toBe("balanced");
		expect(result.diagnostics.rankedProviders[0]?.scoreFactors.priceScore).toBe(1);
	});

	it("honors provider.sort=latency from the request body", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				lat_ewma_60s: 220,
				lat_ewma_300s: 220,
				tp_ewma_60s: 6,
			}),
			anthropic: health("anthropic", {
				lat_ewma_60s: 950,
				lat_ewma_300s: 950,
				tp_ewma_60s: 12,
			}),
		}));

		const result = await routeProviders(
			[
				candidate({ providerId: "openai" }),
				candidate({ providerId: "anthropic" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				body: { provider: { sort: "latency" } },
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)[0]).toBe("openai");
		expect(result.diagnostics.routingMode).toBe("latency");
	});

	it("honors provider.sort=throughput from the request body", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				lat_ewma_60s: 600,
				lat_ewma_300s: 600,
				tp_ewma_60s: 4,
			}),
			anthropic: health("anthropic", {
				lat_ewma_60s: 600,
				lat_ewma_300s: 600,
				tp_ewma_60s: 18,
			}),
		}));

		const result = await routeProviders(
			[
				candidate({ providerId: "openai" }),
				candidate({ providerId: "anthropic" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				body: { provider: { sort: "throughput" } },
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)[0]).toBe("anthropic");
		expect(result.diagnostics.routingMode).toBe("throughput");
	});

	it("honors the first-class routing.mode object", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				lat_ewma_60s: 180,
				lat_ewma_300s: 180,
			}),
			anthropic: health("anthropic", {
				lat_ewma_60s: 900,
				lat_ewma_300s: 900,
			}),
		}));

		const result = await routeProviders(
			[
				candidate({ providerId: "openai" }),
				candidate({ providerId: "anthropic" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				body: { routing: { mode: "latency" } },
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)[0]).toBe("openai");
		expect(result.diagnostics.requestedRouting.requestedMode).toBe("latency");
	});

	it("treats :cheap as the single price-first alias", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				lat_ewma_60s: 120,
				lat_ewma_300s: 120,
				tp_ewma_60s: 10,
			}),
			anthropic: health("anthropic", {
				lat_ewma_60s: 900,
				lat_ewma_300s: 900,
				tp_ewma_60s: 2,
			}),
		}));

		const cheapResult = await routeProviders(
			[
				candidate({
					providerId: "openai",
					pricingCard: textPricingCard(0.00004, 0.00002),
				}),
				candidate({
					providerId: "anthropic",
					pricingCard: textPricingCard(0.00001, 0.000005),
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini:cheap",
				workspaceId: "team_123",
				testingMode: false,
			},
		);

		expect(cheapResult.ranked[0]?.candidate.providerId).toBe("anthropic");
		expect(cheapResult.diagnostics.routingMode).toBe("price");
	});

	it("filters providers by first-class routing max_price ceilings", async () => {
		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					pricingCard: textPricingCard(0.00004, 0.00002),
				}),
				candidate({
					providerId: "anthropic",
					pricingCard: textPricingCard(0.00001, 0.000005),
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				body: {
					routing: {
						max_price: {
							prompt: 20,
						},
					},
				},
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["anthropic"]);
		expect(
			result.diagnostics.filterStages.find((stage) => stage.stage === "pricing_cap_gate")?.afterCount,
		).toBe(1);
	});

	it("maps routing.zdr to zero-data-retention enforcement", async () => {
		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					zeroDataRetention: "optional",
				}),
				candidate({
					providerId: "anthropic",
					zeroDataRetention: "unsupported",
				}),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini",
				workspaceId: "team_123",
				body: {
					routing: {
						zdr: true,
					},
				},
				testingMode: false,
			},
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["openai"]);
		expect(result.diagnostics.requestedRouting.requireZeroDataRetention).toBe(true);
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
				workspaceId: "team_123",
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
				workspaceId: "team_123",
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
				workspaceId: "team_123",
				cacheAwareRouting: false,
				testingMode: false,
			}
		);

		expect(resolveStickyRoutingContextMock).not.toHaveBeenCalled();
		expect(readStickyRoutingMock).not.toHaveBeenCalled();
		expect(result.diagnostics.stickyRouting.enabled).toBe(false);
		expect(result.diagnostics.stickyRouting.applied).toBe(false);
	});

	it("captures considered providers and ranked score diagnostics", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				lat_ewma_60s: 300,
				lat_ewma_300s: 350,
				tp_ewma_60s: 12,
			}),
			anthropic: health("anthropic", {
				lat_ewma_60s: 800,
				lat_ewma_300s: 900,
				tp_ewma_60s: 6,
			}),
		}));

		const result = await routeProviders(
			[
				candidate({ providerId: "openai" }),
				candidate({ providerId: "anthropic" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini:fast",
				workspaceId: "team_123",
				testingMode: false,
			},
		);

		expect(result.diagnostics.consideredProviders).toEqual([
			expect.objectContaining({
				providerId: "openai",
				providerStatus: "active",
			}),
			expect.objectContaining({
				providerId: "anthropic",
				providerStatus: "active",
			}),
		]);
		expect(result.diagnostics.rankedProviders[0]).toEqual(
			expect.objectContaining({
				providerId: expect.any(String),
				score: expect.any(Number),
				scoreFactors: expect.objectContaining({
					successRate: expect.any(Number),
					latencyScore: expect.any(Number),
					throughputScore: expect.any(Number),
					priceScore: expect.any(Number),
					tokenAffinity: expect.any(Number),
					cacheBoostMultiplier: expect.any(Number),
				}),
			}),
		);
	});

	it("keeps multiple free-model variants from the same provider routable", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				lat_ewma_60s: 320,
				lat_ewma_300s: 350,
				tp_ewma_60s: 10,
			}),
			"google-ai-studio": health("google-ai-studio", {
				lat_ewma_60s: 500,
				lat_ewma_300s: 550,
				tp_ewma_60s: 8,
			}),
		}));

		const result = await routeProviders(
			[
				candidate({
					providerId: "openai",
					apiModelId: "openai/gpt-free-a",
					providerModelSlug: "gpt-free-a",
				}),
				candidate({
					providerId: "openai",
					apiModelId: "openai/gpt-free-b",
					providerModelSlug: "gpt-free-b",
				}),
				candidate({
					providerId: "google-ai-studio",
					apiModelId: "google/gemini-free",
					providerModelSlug: "gemini-free",
				}),
			],
			{
				endpoint: "responses",
				model: "phaseo/free",
				workspaceId: "team_123",
				testingMode: false,
			},
		);

		expect(result.ranked).toHaveLength(3);
		expect(
			result.diagnostics.consideredProviders.filter(
				(provider) => provider.providerId === "openai",
			),
		).toHaveLength(2);
		expect(result.diagnostics.rankedProviders).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					providerId: "openai",
					apiModelId: "openai/gpt-free-a",
					providerModelSlug: "gpt-free-a",
				}),
				expect.objectContaining({
					providerId: "openai",
					apiModelId: "openai/gpt-free-b",
					providerModelSlug: "gpt-free-b",
				}),
				expect.objectContaining({
					providerId: "google-ai-studio",
					apiModelId: "google/gemini-free",
					providerModelSlug: "gemini-free",
				}),
			]),
		);
	});

	it("keeps open-breaker providers reachable as tail fallbacks", async () => {
		readHealthManyMock.mockImplementation(async () => ({
			openai: health("openai", {
				breaker: "open",
				breaker_until_ms: Date.now() + 60_000,
			}),
			anthropic: health("anthropic", {
				breaker: "closed",
				breaker_until_ms: 0,
			}),
		}));

		const result = await routeProviders(
			[
				candidate({ providerId: "openai" }),
				candidate({ providerId: "anthropic" }),
			],
			{
				endpoint: "responses",
				model: "openai/gpt-4o-mini:fast",
				workspaceId: "team_123",
				testingMode: false,
			}
		);

		expect(result.ranked.map((entry) => entry.candidate.providerId)).toEqual(["anthropic", "openai"]);
		const breakerStage = result.diagnostics.filterStages.find((stage) => stage.stage === "health_breaker");
		expect(breakerStage?.beforeCount).toBe(2);
		expect(breakerStage?.afterCount).toBe(2);
		expect(breakerStage?.droppedProviders).toEqual([
			{
				providerId: "openai",
				apiModelId: null,
				providerModelSlug: null,
				reason: "breaker_open_deranked",
			},
		]);
	});
});


