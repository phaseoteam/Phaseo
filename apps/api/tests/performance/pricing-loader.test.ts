import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PricingRuleRow = {
	rule_id: string;
	model_key: string;
	capability_id: string;
	pricing_plan: string;
	meter: string;
	unit: string;
	unit_size: number;
	price_per_unit: string;
	currency: string;
	note: string | null;
	match: unknown[];
	priority: number;
	effective_from: string | null;
	effective_to: string | null;
	updated_at: string;
};

type QueryResult = {
	data: PricingRuleRow[] | null;
	error: unknown;
};

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

function createPricingRuleRows(): PricingRuleRow[] {
	return [
		{
			rule_id: "rule_input",
			model_key: "openai:openai/gpt-5-nano:text.generate",
			capability_id: "text.generate",
			pricing_plan: "standard",
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.000001",
			currency: "USD",
			note: null,
			match: [],
			priority: 100,
			effective_from: null,
			effective_to: null,
			updated_at: "2026-01-01T00:00:00.000Z",
		},
		{
			rule_id: "rule_output",
			model_key: "openai:openai/gpt-5-nano:text.generate",
			capability_id: "text.generate",
			pricing_plan: "standard",
			meter: "output_text_tokens",
			unit: "token",
			unit_size: 1,
			price_per_unit: "0.000002",
			currency: "USD",
			note: null,
			match: [],
			priority: 90,
			effective_from: null,
			effective_to: null,
			updated_at: "2026-01-01T00:00:05.000Z",
		},
	];
}

function createQueryResult(rows: PricingRuleRow[], onExecute: () => void): {
	from: (table: string) => any;
} {
	return {
		from(table: string) {
			expect(table).toBe("data_api_pricing_rules");
			const state = {
				then(resolve: (value: QueryResult) => unknown) {
					onExecute();
					return Promise.resolve(
						resolve({
							data: rows,
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
		const rows = createPricingRuleRows();
		let executeCount = 0;
		getSupabaseAdminMock.mockReturnValue(
			createQueryResult(rows, () => {
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
		const rows = createPricingRuleRows();
		let executeCount = 0;
		getSupabaseAdminMock.mockReturnValue(
			createQueryResult(rows, () => {
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
			createQueryResult([], () => {
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
		const rows = createPricingRuleRows();
		getSupabaseAdminMock.mockReturnValue(
			createQueryResult(rows, () => {}),
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
