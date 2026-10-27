import { describe, expect, it } from "vitest";
import { computeBill, computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const card: PriceCard = {
	provider: "openai",
	model: "openai/gpt-image-1-mini",
	endpoint: "image.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			pricing_plan: "standard",
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: "2.0",
			currency: "USD",
			match: [],
			priority: 100,
		},
	],
};

describe("pricing engine unit_size handling", () => {
	it("pro-rates partial units in computeBillSummary", () => {
		const result = computeBillSummary(
			{ input_text_tokens: 8 },
			card,
			{},
			"standard",
		);

		expect(result.lines).toHaveLength(1);
		expect(result.lines[0].billable_units).toBeCloseTo(0.000008, 12);
		expect(result.lines[0].line_nanos).toBe(16_000);
		expect(result.lines[0].line_cost_usd).toBe("0.000016000");
		expect(result.cost_usd_str).toBe("0.000016000");
		expect(result.cost_cents).toBe(1); // ceil from nanos in summary
	});

	it("preserves nanos totals in computeBill output", () => {
		const priced = computeBill(
			{ input_text_tokens: 8 },
			card,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(16_000);
		expect(priced.pricing.total_usd_str).toBe("0.000016");
		expect(priced.pricing.total_cents).toBe(0); // floor at persistence/charge stage
		expect(priced.pricing.lines).toHaveLength(1);
		expect(priced.pricing.lines[0].line_nanos).toBe(16_000);
	});

	it("prices output_image_tokens directly using per-million token rate", () => {
		const imageTokenCard: PriceCard = {
			provider: "google-ai-studio",
			model: "google/gemini-3.1-flash-image-preview",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [
				{
					pricing_plan: "standard",
					meter: "output_image_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "60.0",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};

		const priced = computeBill(
			{ output_image_tokens: 2240 },
			imageTokenCard,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(134_400_000);
		expect(priced.pricing.total_cents).toBe(13);
		expect(priced.pricing.lines[0].dimension).toBe("output_image_tokens");
		expect(priced.pricing.lines[0].line_nanos).toBe(134_400_000);
	});

	it("prices page-based OCR meters", () => {
		const ocrCard: PriceCard = {
			provider: "mistral",
			model: "mistral/ocr-3",
			endpoint: "ocr",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [
				{
					pricing_plan: "standard",
					meter: "input_pages",
					unit: "page",
					unit_size: 1000,
					price_per_unit: "2.0",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};

		const priced = computeBill(
			{ input_pages: 3 },
			ocrCard,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(6_000_000);
		expect(priced.pricing.lines[0].dimension).toBe("input_pages");
		expect(priced.pricing.lines[0].billable_units).toBeCloseTo(0.003, 12);
	});

	it("prices managed web search request and extra-result meters", () => {
		const webSearchCard: PriceCard = {
			provider: "gateway",
			model: "gateway/server-tools",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [
				{
					pricing_plan: "standard",
					meter: "server_tool_web_search_requests",
					unit: "request",
					unit_size: 1,
					price_per_unit: "0.005",
					currency: "USD",
					match: [],
					priority: 100,
				},
				{
					pricing_plan: "standard",
					meter: "server_tool_web_search_extra_results",
					unit: "result",
					unit_size: 1,
					price_per_unit: "0.001",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};

		const priced = computeBill(
			{
				server_tool_web_search_requests: 2,
				server_tool_web_search_extra_results: 3,
			},
			webSearchCard,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(13_000_000);
		expect(priced.pricing.lines.map((line: any) => line.dimension)).toEqual([
			"server_tool_web_search_requests",
			"server_tool_web_search_extra_results",
		]);
	});

	it("prices managed image generation and apply patch request meters", () => {
		const serverToolCard: PriceCard = {
			provider: "gateway",
			model: "gateway/server-tools",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [
				{
					pricing_plan: "standard",
					meter: "server_tool_image_generation_requests",
					unit: "request",
					unit_size: 1,
					price_per_unit: "0.02",
					currency: "USD",
					match: [],
					priority: 100,
				},
				{
					pricing_plan: "standard",
					meter: "server_tool_apply_patch_requests",
					unit: "request",
					unit_size: 1,
					price_per_unit: "0.001",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};

		const priced = computeBill(
			{
				server_tool_use: {
					image_generation_requests: 1,
					apply_patch_requests: 2,
				},
			},
			serverToolCard,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(22_000_000);
		expect(priced.pricing.lines.map((line: any) => line.dimension)).toEqual([
			"server_tool_image_generation_requests",
			"server_tool_apply_patch_requests",
		]);
	});

	it("prices provider-native web search and fetch usage separately from managed tools", () => {
		const nativeToolCard: PriceCard = {
			provider: "anthropic",
			model: "claude-sonnet",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [
				{
					pricing_plan: "standard",
					meter: "native_web_search_requests",
					unit: "request",
					unit_size: 1,
					price_per_unit: "0.01",
					currency: "USD",
					match: [],
					priority: 100,
				},
				{
					pricing_plan: "standard",
					meter: "native_web_fetch_requests",
					unit: "request",
					unit_size: 1,
					price_per_unit: "0.002",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};

		const priced = computeBill(
			{
				server_tool_use: {
					web_search_requests: 1,
					web_fetch_requests: 2,
				},
			},
			nativeToolCard,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(14_000_000);
		expect(priced.pricing.lines.map((line: any) => line.dimension)).toEqual([
			"native_web_search_requests",
			"native_web_fetch_requests",
		]);
	});

	it("does not infer native web meters when managed server-tool meters are explicit", () => {
		const mixedCard: PriceCard = {
			provider: "gateway",
			model: "server-tools",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [
				{
					pricing_plan: "standard",
					meter: "server_tool_web_fetch_requests",
					unit: "request",
					unit_size: 1,
					price_per_unit: "0.001",
					currency: "USD",
					match: [],
					priority: 100,
				},
				{
					pricing_plan: "standard",
					meter: "native_web_fetch_requests",
					unit: "request",
					unit_size: 1,
					price_per_unit: "0.002",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};

		const priced = computeBill(
			{
				server_tool_web_fetch_requests: 2,
				server_tool_use: {
					web_fetch_requests: 2,
				},
			},
			mixedCard,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(2_000_000);
		expect(priced.pricing.lines.map((line: any) => line.dimension)).toEqual([
			"server_tool_web_fetch_requests",
		]);
	});

	it("applies default provider-native web search pricing when no model rule exists", () => {
		const card: PriceCard = {
			provider: "openai",
			model: "gpt-5",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [],
		};

		const priced = computeBill(
			{
				server_tool_use: {
					web_search_requests: 3,
				},
			},
			card,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(30_000_000);
		expect(priced.pricing.lines[0]).toMatchObject({
			dimension: "native_web_search_requests",
			quantity: 3,
			unit_price_usd: "0.010000000",
		});
	});

	it("applies zero-cost default provider-native web fetch pricing for Anthropic", () => {
		const card: PriceCard = {
			provider: "anthropic",
			model: "claude-sonnet",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [],
		};

		const priced = computeBill(
			{
				server_tool_use: {
					web_fetch_requests: 2,
				},
			},
			card,
			{},
			"standard",
		);

		expect(priced.pricing.total_nanos).toBe(0);
		expect(priced.pricing.lines[0]).toMatchObject({
			dimension: "native_web_fetch_requests",
			quantity: 2,
			unit_price_usd: "0.000000000",
		});
	});

	const emptyCard = (provider: string): PriceCard => ({
		provider,
		model: "model",
		endpoint: "text.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: [],
	});

	it.each(["anthropic-us", "anthropic-aws", "anthropic-aws-us", "openai-eu"])(
		"bills native web search at the documented 10 USD per 1,000 on %s when the card has no row",
		(provider) => {
			const priced = computeBill({ server_tool_use: { web_search_requests: 2 } }, emptyCard(provider), {}, "standard");
			expect(priced.pricing.total_nanos).toBe(20_000_000);
			expect(priced.pricing.lines[0]).toMatchObject({ dimension: "native_web_search_requests", quantity: 2 });
		},
	);

	it("bills Claude Platform on AWS web fetch at $0, as on the Claude API", () => {
		const priced = computeBill({ server_tool_use: { web_fetch_requests: 1 } }, emptyCard("anthropic-aws"), {}, "standard");
		expect(priced.pricing.lines[0]).toMatchObject({ dimension: "native_web_fetch_requests", unit_price_usd: "0.000000000" });
	});

	it("does not invent a web search price for providers without a documented one", () => {
		const priced = computeBill({ server_tool_use: { web_search_requests: 2 } }, emptyCard("amazon-bedrock"), {}, "standard");
		expect(priced.pricing.total_nanos).toBe(0);
	});

	it("bills xAI server-side tools at the documented per-call and per-item prices", () => {
		const priced = computeBill(
			{ server_tool_use: { web_search_requests: 2, code_execution_requests: 1, x_search_posts: 10, x_search_users: 3 } },
			emptyCard("spacex-ai"),
			{},
			"standard",
		);
		const byMeter = Object.fromEntries(priced.pricing.lines.map((line: any) => [line.dimension, line.line_nanos]));
		expect(byMeter).toEqual({
			native_web_search_requests: 10_000_000,
			native_code_execution_requests: 5_000_000,
			native_x_search_posts: 50_000_000,
			native_x_search_users: 30_000_000,
		});
	});

	it("bills Meta web search queries at $2.50 per 1,000 when the card has no row", () => {
		const priced = computeBill({ native_web_search_requests: 4 }, emptyCard("meta"), {}, "standard");
		expect(priced.pricing.total_nanos).toBe(10_000_000);
	});

	it("lets a price row match Claude's reported inference_geo", () => {
		const tokenRule = (price: string, match: any[] = []) => ({
			pricing_plan: "standard",
			meter: "input_text_tokens" as const,
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: price,
			currency: "USD",
			match,
			priority: 100,
		});
		const geoCard: PriceCard = {
			...emptyCard("anthropic"),
			rules: [tokenRule("2"), tokenRule("2.2", [{ path: "inference_geo", op: "eq", value: "us" }])],
		};
		const usd = (usage: Record<string, unknown>) => computeBill(usage, geoCard, {}, "standard").pricing.total_nanos / 1e9;
		expect(usd({ input_text_tokens: 1_000_000, inference_geo: "us" })).toBe(2.2);
		expect(usd({ input_text_tokens: 1_000_000, inference_geo: "global" })).toBe(2);
		expect(usd({ input_text_tokens: 1_000_000 })).toBe(2);
	});
});
