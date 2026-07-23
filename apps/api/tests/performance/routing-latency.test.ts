import { beforeEach, describe, expect, it, vi } from "vitest";

const readHealthManyMock = vi.fn();

vi.mock("@/pipeline/execute/health", () => ({
	readHealthManyOptimistic: (...args: unknown[]) => readHealthManyMock(...args),
}));

vi.mock("@/pipeline/execute/sticky-routing", () => ({
	readStickyRoutingOptimistic: vi.fn(() => null),
	resolveStickyRoutingContext: vi.fn(async () => null),
	stickyRoutingCacheBoostMultiplier: () => 1,
}));

const { routeProviders } = await import("@/pipeline/execute/routing");

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((left, right) => left - right);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

function pricingCard(provider: string, pricePerToken: number) {
	return {
		provider,
		model: "openai/gpt-5-nano",
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
				price_per_unit: String(pricePerToken),
				currency: "USD",
				match: [],
				priority: 1,
			},
		],
	};
}

function candidates(count: number) {
	return Array.from({ length: count }, (_, index) => {
		const providerId = `provider-${index}`;
		return {
			providerId,
			providerFamilyId: null,
			offerScope: "global",
			offerLabel: null,
			providerStatus: "active",
			providerRoutingStatus: "active",
			modelRoutingStatus: "active",
			capabilityStatus: "active",
			residencyMode: "unknown",
			executionRegions: null,
			dataRegions: null,
			zeroDataRetention: "unknown",
			apiModelId: `upstream-model-${index}`,
			providerModelSlug: null,
			adapter: { name: providerId },
			baseWeight: 1,
			byokMeta: [],
			maxOutputTokens: 16_384,
			pricingCard: pricingCard(providerId, (index + 1) * 0.0000001),
		} as any;
	});
}

function health(provider: string, index: number) {
	return {
		endpoint: "responses",
		provider,
		model: "openai/gpt-5-nano",
		lat_ewma_10s: 100 + index,
		lat_ewma_60s: 120 + index,
		lat_ewma_300s: 150 + index,
		err_ewma_10s: 0,
		err_ewma_60s: 0,
		err_ewma_300s: 0,
		rate_10s: 0,
		rate_60s: 0,
		tp_ewma_60s: 20,
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
	};
}

describe.skipIf(process.env.RUN_ROUTING_PERF !== "1")(
	"provider routing latency",
	() => {
	beforeEach(() => {
		readHealthManyMock.mockReset();
		readHealthManyMock.mockImplementation(
			(_endpoint: string, _model: string, providerIds: string[]) =>
				Object.fromEntries(
					providerIds.map((providerId, index) => [providerId, health(providerId, index)]),
				),
		);
	});

		it.each([4, 16, 50, 64, 100])(
		"scores and orders a %i-provider pool under 3ms p95 in the test runtime",
		async (providerCount) => {
			const pool = candidates(providerCount);
			const context = {
				endpoint: "responses" as const,
				model: "openai/gpt-5-nano",
				workspaceId: "team_routing_perf",
				requestId: "request_routing_perf",
				cacheAwareRouting: false,
				collectDetailedDiagnostics: false,
				body: { max_output_tokens: 256 },
			};

			for (let index = 0; index < 25; index += 1) {
				await routeProviders(pool, context);
			}

			const samples: number[] = [];
			const iterations = 500;
			for (let index = 0; index < iterations; index += 1) {
				const started = performance.now();
				const result = await routeProviders(pool, context);
				samples.push(performance.now() - started);
				expect(result.ranked).toHaveLength(providerCount);
			}

			const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
			const p50 = percentile(samples, 50);
			const p95 = percentile(samples, 95);
			const p99 = percentile(samples, 99);

			console.log(
				`[perf][routing] providers=${providerCount} iterations=${iterations} avg=${average.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
			);

			expect(p95).toBeLessThan(3);
		},
		);
	},
);
