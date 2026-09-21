import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
	data: Record<string, unknown>[] | null;
	error: unknown;
};

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

function createQueryResult(hasRoute: boolean, onExecute: () => void): {
	from: (table: string) => any;
} {
	return {
		from(table: string) {
			const dataByTable: Record<string, Record<string, unknown>[]> = {
				v2_model_provider_routes: hasRoute ? [{
					provider_model_id: "pm_openai_gpt5_nano",
					model_slug: "openai/gpt-5-nano",
					provider_model_slug: "gpt-5-nano",
				}] : [],
				v2_pricing_skus: [{
					sku_id: "sku_standard",
					provider_model_id: "pm_openai_gpt5_nano",
					service_tier_slug: "standard",
					operation: "text.generate",
					status: "active",
					currency: "USD",
					effective_from: "2026-01-01T00:00:00.000Z",
					effective_to: null,
					metadata: {},
					updated_at: "2026-01-01T00:00:00.000Z",
				}],
				v2_pricing_sku_meters: [
					{
						sku_meter_id: "meter_input",
						sku_id: "sku_standard",
						meter_key: "input_text_tokens",
						unit: "token",
						unit_quantity: 1,
						price_nanos: 1_000,
						meter_order: 100,
						metadata: {},
						updated_at: "2026-01-01T00:00:00.000Z",
					},
					{
						sku_meter_id: "meter_output",
						sku_id: "sku_standard",
						meter_key: "output_text_tokens",
						unit: "token",
						unit_quantity: 1,
						price_nanos: 2_000,
						meter_order: 90,
						metadata: {},
						updated_at: "2026-01-01T00:00:05.000Z",
					},
				],
			};
			// The loader now fetches the joined SKU/meter graph in one query.
			if (table !== "v2_pricing_skus") throw new Error(`Unexpected table: ${table}`);
			const data = hasRoute ? dataByTable.v2_pricing_skus.map(sku => ({
				...sku, route: dataByTable.v2_model_provider_routes[0], meters: dataByTable.v2_pricing_sku_meters,
			})) : [];
			const state = {
				then(resolve: (value: QueryResult) => unknown) {
					onExecute();
					return Promise.resolve(
						resolve({
							data,
							error: null,
						}),
					);
				},
				select() {
					return state;
				},
				eq() {
					return state;
				},
				in() {
					return state;
				},
				lte() {
					return state;
				},
				or() {
					return state;
				},
				order() {
					return state;
				},
			};
			return state;
		},
	};
}

const getSupabaseAdminMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const { __resetPricingLoaderCachesForTests, loadPriceCard } = await import(
	"@/pipeline/pricing/loader"
);

describe("pricing loader performance", () => {
	beforeEach(() => {
		getSupabaseAdminMock.mockReset();
		__resetPricingLoaderCachesForTests();
	});

	afterEach(() => {
		__resetPricingLoaderCachesForTests();
	});

	it("deduplicates concurrent inflight loads to one backing query", async () => {
		let executeCount = 0;
		getSupabaseAdminMock.mockReturnValue(
			createQueryResult(true, () => {
				executeCount += 1;
			}),
		);

		const [a, b, c] = await Promise.all([
			loadPriceCard("openai", "openai/gpt-5-nano", "text.generate"),
			loadPriceCard("openai", "openai/gpt-5-nano", "text.generate"),
			loadPriceCard("openai", "openai/gpt-5-nano", "text.generate"),
		]);

		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(c).not.toBeNull();
		expect(executeCount).toBe(1);
		expect(getSupabaseAdminMock).toHaveBeenCalledTimes(1);
	});

	it("reuses warm L1 cache across repeated loads", async () => {
		let executeCount = 0;
		getSupabaseAdminMock.mockReturnValue(
			createQueryResult(true, () => {
				executeCount += 1;
			}),
		);

		const first = await loadPriceCard(
			"openai",
			"openai/gpt-5-nano",
			"text.generate",
		);
		const second = await loadPriceCard(
			"openai",
			"openai/gpt-5-nano",
			"text.generate",
		);
		const third = await loadPriceCard(
			"openai",
			"openai/gpt-5-nano",
			"text.generate",
		);

		expect(first).not.toBeNull();
		expect(second).toBe(first);
		expect(third).toBe(first);
		expect(executeCount).toBe(1);
		expect(getSupabaseAdminMock).toHaveBeenCalledTimes(1);
	});

	it("reuses negative cache across repeated misses", async () => {
		let executeCount = 0;
		getSupabaseAdminMock.mockReturnValue(
			createQueryResult(false, () => {
				executeCount += 1;
			}),
		);

		const first = await loadPriceCard(
			"openai",
			"openai/missing-model",
			"text.generate",
		);
		const second = await loadPriceCard(
			"openai",
			"openai/missing-model",
			"text.generate",
		);
		const third = await loadPriceCard(
			"openai",
			"openai/missing-model",
			"text.generate",
		);

		expect(first).toBeNull();
		expect(second).toBeNull();
		expect(third).toBeNull();
		expect(executeCount).toBe(1);
		expect(getSupabaseAdminMock).toHaveBeenCalledTimes(1);
	});

	it("keeps warm-cache price-card loads under 2ms p95 in test runtime", async () => {
		getSupabaseAdminMock.mockReturnValue(
			createQueryResult(true, () => {}),
		);

		await loadPriceCard("openai", "openai/gpt-5-nano", "text.generate");

		const samples: number[] = [];
		const iterations = 300;
		for (let i = 0; i < iterations; i += 1) {
			const started = performance.now();
			await loadPriceCard("openai", "openai/gpt-5-nano", "text.generate");
			samples.push(performance.now() - started);
		}

		const p50 = percentile(samples, 50);
		const p95 = percentile(samples, 95);
		const p99 = percentile(samples, 99);
		const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;

		console.log(
			`[perf][pricing-loader] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
		);

		expect(p95).toBeLessThan(2);
		expect(getSupabaseAdminMock).toHaveBeenCalledTimes(1);
	});
});
