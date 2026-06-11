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
});
