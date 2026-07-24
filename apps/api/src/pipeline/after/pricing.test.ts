import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { PriceCard, PriceRule } from "../pricing";
import { calculatePricing, loadProviderPricing } from "./pricing";
import { shapeUsageForClient } from "../usage";

const loadPriceCardMock = vi.hoisted(() => vi.fn());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const deepSeekV4ProPricingPath = path.join(
	repoRoot,
	"packages/data/catalog/src/data/pricing/deepseek/deepseek-deepseek-v4-pro/text.generate/pricing.json",
);

vi.mock("../pricing", async () => {
	const actual = await vi.importActual<typeof import("../pricing")>("../pricing");
	return {
		...actual,
		loadPriceCard: (...args: Parameters<typeof actual.loadPriceCard>) =>
			loadPriceCardMock(...args),
	};
});

const IMAGE_CARD: PriceCard = {
	provider: "openai",
	model: "openai/gpt-image-1-mini",
	endpoint: "images.generations",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "output_image",
			unit: "image",
			unit_size: 1,
			price_per_unit: "0.036",
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [
				{ path: "image_params.quality", op: "eq", value: "high", or_group: 1, and_index: 1 },
				{ path: "image_params.resolution", op: "eq", value: "1024x1024", or_group: 1, and_index: 2 },
			],
			priority: 100,
		},
	],
};

const TTS_CARD: PriceCard = {
	provider: "openai",
	model: "openai/gpt-4o-mini-tts",
	endpoint: "audio.speech",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "input_text_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: "0.6",
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
		},
		{
			meter: "output_audio_tokens",
			unit: "token",
			unit_size: 1_000_000,
			price_per_unit: "12",
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
		},
	],
};

function loadActiveCatalogPriceCard(pricingPath: string, nowIso = "2026-07-01T00:00:00.000Z"): PriceCard {
	const raw = JSON.parse(fs.readFileSync(pricingPath, "utf8"));
	const rules = raw.rules
		.filter((rule: Record<string, unknown>) => {
			const effectiveFrom = typeof rule.effective_from === "string" ? rule.effective_from : null;
			const effectiveTo = typeof rule.effective_to === "string" ? rule.effective_to : null;
			return (!effectiveFrom || effectiveFrom <= nowIso) && (!effectiveTo || effectiveTo > nowIso);
		})
		.map((rule: Record<string, unknown>): PriceRule => ({
			id: `${String(raw.api_provider_id)}:${String(raw.api_model_id)}:${String(rule.pricing_plan)}:${String(rule.meter)}`,
			pricing_plan: String(rule.pricing_plan),
			meter: rule.meter as PriceRule["meter"],
			unit: String(rule.unit),
			unit_size: Number(rule.unit_size),
			price_per_unit: String(rule.price_per_unit),
			currency: String(rule.currency),
			match: Array.isArray(rule.match) ? rule.match as PriceRule["match"] : [],
			priority: Number(rule.priority ?? 0),
			billing_timestamp_basis: rule.billing_timestamp_basis as PriceRule["billing_timestamp_basis"],
			time_windows: Array.isArray(rule.time_windows)
				? rule.time_windows as PriceRule["time_windows"]
				: undefined,
		}));

	return {
		provider: String(raw.api_provider_id),
		model: String(raw.api_model_id),
		endpoint: String(raw.capability_id),
		effective_from: raw.effective_from ?? null,
		effective_to: raw.effective_to ?? null,
		currency: "USD",
		version: null,
		rules,
	};
}

function activateDeepSeekV4ProPeakWindows(card: PriceCard): PriceCard {
	const peakPricesByMeter: Record<string, string> = {
		input_text_tokens: "0.87",
		cached_read_text_tokens: "0.00725",
		output_text_tokens: "1.74",
	};

	return {
		...card,
		rules: card.rules.map((rule) => ({
			...rule,
			billing_timestamp_basis: "provider_accept",
			time_windows: [
				{
					label: "peak",
					timezone: "UTC",
					start_time: "01:00",
					end_time: "04:00",
					price_per_unit: peakPricesByMeter[rule.meter],
				},
				{
					label: "peak",
					timezone: "UTC",
					start_time: "06:00",
					end_time: "10:00",
					price_per_unit: peakPricesByMeter[rule.meter],
				},
			],
		})),
	};
}

describe("after/pricing calculatePricing", () => {
	beforeEach(() => {
		loadPriceCardMock.mockReset();
	});

	it("passes image request options through to rule matching", () => {
		const result = calculatePricing(
			{ output_image: 1 },
			IMAGE_CARD,
			{ size: "1024x1024", quality: "high" },
		);

		expect(result.totalNanos).toBe(36_000_000);
		expect(result.totalCents).toBe(3);
		expect(result.pricedUsage?.pricing?.lines?.[0]?.dimension).toBe("output_image");
	});

	it("does not match image rules when request options disagree", () => {
		const result = calculatePricing(
			{ output_image: 1 },
			IMAGE_CARD,
			{ size: "1536x1024", quality: "high" },
		);

		expect(result.totalNanos).toBe(0);
		expect(result.totalCents).toBe(0);
		expect(result.pricedUsage?.pricing?.lines ?? []).toHaveLength(0);
	});

	it("infers image pricing qualifiers from output tokens when the request used auto defaults", () => {
		const result = calculatePricing(
			{
				output_image: 1,
				output_tokens: 4160,
			},
			IMAGE_CARD,
			{ size: "auto", quality: "auto" },
		);

		expect(result.totalNanos).toBe(36_000_000);
		expect(result.totalCents).toBe(3);
		expect(result.pricedUsage?.pricing?.lines?.[0]?.dimension).toBe("output_image");
	});

	it("prices raw audio token meters even when client shaping moves them into details", () => {
		const rawUsage = {
			input_text_tokens: 10,
			output_audio_tokens: 71,
			inputTokens: 10,
			outputTokens: 71,
			totalTokens: 81,
			output_audio_seconds: 3.552,
		};
		const mergedUsage = {
			...rawUsage,
			...shapeUsageForClient(rawUsage, { endpoint: "audio.speech", body: {} }),
		};

		const result = calculatePricing(
			mergedUsage,
			TTS_CARD,
			{},
		);

		expect(result.totalNanos).toBe(858_000);
		expect(result.pricedUsage?.pricing?.lines?.map((line: any) => line.dimension)).toEqual([
			"input_text_tokens",
			"output_audio_tokens",
		]);
	});

	it("uses upstream start time for provider-accept pricing windows", () => {
		const upstreamWindowCard: PriceCard = {
			...TTS_CARD,
			provider: "deepseek",
			model: "deepseek/deepseek-v4-pro",
			endpoint: "text.generate",
			rules: [
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "1",
					currency: "USD",
					pricing_plan: "standard",
					note: null,
					match: [],
					priority: 100,
					billing_timestamp_basis: "provider_accept",
					time_windows: [
						{
							label: "upstream-peak",
							timezone: "UTC",
							start_time: "06:00",
							end_time: "10:00",
							price_per_unit: "3",
						},
					],
				},
			],
		};

		const result = calculatePricing(
			{ input_text_tokens: 1_000_000 },
			upstreamWindowCard,
			{},
			null,
			{
				startedAtMs: Date.parse("2026-07-20T05:30:00Z"),
				upstreamStartMs: Date.parse("2026-07-20T06:30:00Z"),
				completedAtMs: Date.parse("2026-07-20T11:30:00Z"),
			} as any,
		);

		expect(result.totalNanos).toBe(3_000_000_000);
		expect(result.totalCents).toBe(300);
		expect(result.pricedUsage?.pricing?.lines?.[0]).toMatchObject({
			unit_price_usd: "3.000000000",
			billing_timestamp_basis: "provider_accept",
			billing_timestamp_basis_configured: "provider_accept",
			billing_timestamp_ms: Date.parse("2026-07-20T06:30:00Z"),
			billing_timestamp_iso: "2026-07-20T06:30:00.000Z",
			pricing_time_window: {
				label: "upstream-peak",
				timezone: "UTC",
				start_time: "06:00",
				end_time: "10:00",
			},
		});
	});

	it("applies DeepSeek V4 Pro peak pricing from gateway upstream-start metadata", () => {
		const card = activateDeepSeekV4ProPeakWindows(
			loadActiveCatalogPriceCard(deepSeekV4ProPricingPath),
		);

		const result = calculatePricing(
			{
				input_text_tokens: 1_000_000,
				cached_read_text_tokens: 1_000_000,
				output_text_tokens: 1_000_000,
			},
			card,
			{},
			null,
			{
				startedAtMs: Date.parse("2026-07-20T05:30:00Z"),
				upstreamStartMs: Date.parse("2026-07-20T06:30:00Z"),
				completedAtMs: Date.parse("2026-07-20T11:30:00Z"),
			} as any,
		);

		expect(result.totalNanos).toBe(2_617_250_000);
		expect(result.totalCents).toBe(261);
		expect(result.pricedUsage?.pricing?.total_usd_str).toBe("2.61725");
		expect(result.pricedUsage?.pricing?.lines).toEqual([
			expect.objectContaining({
				dimension: "input_text_tokens",
				unit_price_usd: "0.870000000",
				billing_timestamp_basis: "provider_accept",
				pricing_time_window: {
					label: "peak",
					timezone: "UTC",
					start_time: "06:00",
					end_time: "10:00",
				},
			}),
			expect.objectContaining({
				dimension: "cached_read_text_tokens",
				unit_price_usd: "0.007250000",
				billing_timestamp_basis: "provider_accept",
				pricing_time_window: {
					label: "peak",
					timezone: "UTC",
					start_time: "06:00",
					end_time: "10:00",
				},
			}),
			expect.objectContaining({
				dimension: "output_text_tokens",
				unit_price_usd: "1.740000000",
				billing_timestamp_basis: "provider_accept",
				pricing_time_window: {
					label: "peak",
					timezone: "UTC",
					start_time: "06:00",
					end_time: "10:00",
				},
			}),
		]);
	});

	it("uses the request service tier for pricing when usage does not echo it", () => {
		const priorityCard: PriceCard = {
			...TTS_CARD,
			provider: "venice",
			model: "anthropic/claude-opus-4.8",
			endpoint: "text.generate",
			rules: [
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "6",
					currency: "USD",
					pricing_plan: "standard",
					note: null,
					match: [],
					priority: 100,
				},
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "12",
					currency: "USD",
					pricing_plan: "priority",
					note: null,
					match: [],
					priority: 100,
				},
			],
		};

		const result = calculatePricing(
			{ input_text_tokens: 1_000_000 },
			priorityCard,
			{ service_tier: "priority" },
		);

		expect(result.totalNanos).toBe(12_000_000_000);
	});

	it("uses standard pricing for explicit standard service tier", () => {
		const priorityCard: PriceCard = {
			...TTS_CARD,
			provider: "venice",
			model: "anthropic/claude-opus-4.8",
			endpoint: "text.generate",
			rules: [
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "6",
					currency: "USD",
					pricing_plan: "standard",
					note: null,
					match: [],
					priority: 100,
				},
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "12",
					currency: "USD",
					pricing_plan: "priority",
					note: null,
					match: [],
					priority: 100,
				},
			],
		};

		const result = calculatePricing(
			{ input_text_tokens: 1_000_000, service_tier: "standard" },
			priorityCard,
			{ service_tier: "standard" },
		);

		expect(result.totalNanos).toBe(6_000_000_000);
		expect(result.pricedUsage?.pricing?.lines?.[0]?.unit_price_usd).toBe("6.000000000");
	});

	it("prefers a non-standard usage service tier over a conflicting standard request tier", () => {
		const priorityCard: PriceCard = {
			...TTS_CARD,
			provider: "venice",
			model: "anthropic/claude-opus-4.8",
			endpoint: "text.generate",
			rules: [
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "6",
					currency: "USD",
					pricing_plan: "standard",
					note: null,
					match: [],
					priority: 100,
				},
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "12",
					currency: "USD",
					pricing_plan: "priority",
					note: null,
					match: [],
					priority: 100,
				},
			],
		};

		const result = calculatePricing(
			{ input_text_tokens: 1_000_000, service_tier: "priority" },
			priorityCard,
			{ service_tier: "standard" },
		);

		expect(result.totalNanos).toBe(12_000_000_000);
	});

	it("prefers an observed default service tier over a conflicting priority request tier", () => {
		const priorityCard: PriceCard = {
			...TTS_CARD,
			provider: "venice",
			model: "anthropic/claude-opus-4.8",
			endpoint: "text.generate",
			rules: [
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "6",
					currency: "USD",
					pricing_plan: "standard",
					note: null,
					match: [],
					priority: 100,
				},
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1_000_000,
					price_per_unit: "12",
					currency: "USD",
					pricing_plan: "priority",
					note: null,
					match: [],
					priority: 100,
				},
			],
		};

		const result = calculatePricing(
			{ input_text_tokens: 1_000_000, service_tier: "default" },
			priorityCard,
			{ service_tier: "priority" },
		);

		expect(result.totalNanos).toBe(6_000_000_000);
		expect(result.pricedUsage?.pricing?.lines?.[0]?.unit_price_usd).toBe("6.000000000");
	});

	it("prefers the remapped provider-model pricing card when present in context", async () => {
		const ctx = {
			model: "anthropic/claude-opus-4.8",
			capability: "text.generate",
			pricing: {
				"venice:anthropic/claude-opus-5-fast": {
					...TTS_CARD,
					provider: "venice",
					model: "anthropic/claude-opus-5-fast",
				},
			},
		} as any;

		const card = await loadProviderPricing(ctx, {
			provider: "venice",
			apiModelId: "anthropic/claude-opus-5-fast",
			pricingKey: "venice:anthropic/claude-opus-5-fast",
			generationTimeMs: 0,
			kind: "completed",
			bill: { usage: {} } as any,
			upstream: new Response(null, { status: 200 }),
		});

		expect(card?.model).toBe("anthropic/claude-opus-5-fast");
		expect(loadPriceCardMock).not.toHaveBeenCalled();
	});

	it("falls back to loading the remapped api model pricing when context pricing is missing", async () => {
		loadPriceCardMock.mockResolvedValue({
			...TTS_CARD,
			provider: "venice",
			model: "anthropic/claude-opus-5-fast",
		});

		const card = await loadProviderPricing(
			{
				model: "anthropic/claude-opus-5",
				capability: "text.generate",
				pricing: {},
			} as any,
			{
				provider: "venice",
				apiModelId: "anthropic/claude-opus-5-fast",
				generationTimeMs: 0,
				kind: "completed",
				bill: { usage: {} } as any,
				upstream: new Response(null, { status: 200 }),
			},
		);

		expect(loadPriceCardMock).toHaveBeenCalledWith(
			"venice",
			"anthropic/claude-opus-5-fast",
			"text.generate",
		);
		expect(card?.model).toBe("anthropic/claude-opus-5-fast");
	});

	it("loads remapped api model pricing before provider-level base pricing fallback", async () => {
		loadPriceCardMock.mockResolvedValue({
			...TTS_CARD,
			provider: "venice",
			model: "anthropic/claude-opus-5-fast",
		});

		const card = await loadProviderPricing(
			{
				model: "anthropic/claude-opus-5",
				capability: "text.generate",
				pricing: {
					venice: {
						...TTS_CARD,
						provider: "venice",
						model: "anthropic/claude-opus-4.8",
					},
				},
			} as any,
			{
				provider: "venice",
				apiModelId: "anthropic/claude-opus-5-fast",
				pricingKey: "venice:anthropic/claude-opus-5-fast",
				generationTimeMs: 0,
				kind: "completed",
				bill: { usage: {} } as any,
				upstream: new Response(null, { status: 200 }),
			},
		);

		expect(loadPriceCardMock).toHaveBeenCalledWith(
			"venice",
			"anthropic/claude-opus-5-fast",
			"text.generate",
		);
		expect(card?.model).toBe("anthropic/claude-opus-5-fast");
	});
});
