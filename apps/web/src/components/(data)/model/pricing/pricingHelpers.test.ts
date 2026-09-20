import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import {
	buildProviderSections,
	buildProviderTablePriceSummary,
	calculateDailyAveragePricingMeterPrice,
	getAvailableProviderTablePriceDirections,
	getUtcPricingScheduleTimes,
} from "./pricingHelpers";

function makeProviderPricing(): ProviderPricing {
	return {
		provider: {
			api_provider_id: "openai",
			api_provider_name: "OpenAI",
			provider_family_id: "openai",
			offer_label: null,
			offer_scope: "global",
			colour: null,
			link: null,
			country_code: null,
			residency_mode: "unknown",
			default_execution_regions: null,
			default_data_regions: null,
			zero_data_retention: false,
			residency_source_url: null,
			residency_notes: null,
			regional_pricing_mode: "unknown",
			regional_pricing_uplift_percent: null,
			pricing_source_url: null,
			regional_pricing_notes: null,
			prompt_training_policy: null,
			prompt_training_notes: null,
			prompt_training_source_url: null,
			user_identifier_policy: null,
			user_identifier_notes: null,
			privacy_policy_url: null,
			terms_of_service_url: null,
		},
		provider_models: [
			{
				id: "openai:gpt-5.5:responses",
				api_provider_id: "openai",
				model_id: "openai/gpt-5.5",
				endpoint: "responses",
				capability_status: "active",
				is_active_gateway: true,
				input_modalities: "text",
				output_modalities: "text",
				context_length: 400000,
				max_input_tokens: 400000,
				max_output_tokens: 128000,
			},
			{
				id: "openai:gpt-5.5:batch",
				api_provider_id: "openai",
				model_id: "openai/gpt-5.5",
				endpoint: "batch",
				capability_status: "active",
				is_active_gateway: true,
				input_modalities: "text",
				output_modalities: "text",
				context_length: 400000,
				max_input_tokens: 400000,
				max_output_tokens: 128000,
			},
		],
		pricing_rules: [
			{
				id: "std-input-short",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "usage.input_tokens", op: "lte", value: 272000 }],
			},
			{
				id: "std-input-long",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 10,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "usage.input_tokens", op: "gt", value: 272000 }],
			},
			{
				id: "prio-input-short",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "priority",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 12.5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "usage.input_tokens", op: "lt", value: 272001 }],
			},
			{
				id: "prio-input-long",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "priority",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 25,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "usage.input_tokens", op: "gte", value: 272001 }],
			},
		],
	};
}

describe("buildProviderSections", () => {
	test("classifies decisions endpoint token pricing as input and output", () => {
		const provider = makeProviderPricing();
		provider.provider.api_provider_id = "typesafe";
		provider.provider.api_provider_name = "TypeSafe";
		provider.provider.provider_family_id = "typesafe";
		provider.provider_models = [
			{
				...provider.provider_models[0],
				id: "typesafe:typesafe/jev-1.13.0:decisions.make",
				api_provider_id: "typesafe",
				model_id: "typesafe/jev-1.13.0",
				endpoint: "decisions.make",
				input_modalities: "text",
				output_modalities: "decisions",
			},
		];
		provider.pricing_rules = [
			{
				...provider.pricing_rules[0],
				id: "typesafe-input",
				model_key: "typesafe:typesafe/jev-1.13.0:decisions.make",
				meter: "input_tokens",
				price_per_unit: 0.042,
				match: [],
			},
			{
				...provider.pricing_rules[0],
				id: "typesafe-output",
				model_key: "typesafe:typesafe/jev-1.13.0:decisions.make",
				meter: "output_tokens",
				price_per_unit: 0,
				match: [],
			},
		];

		const sections = buildProviderSections(
			provider,
			"standard",
			new Date("2026-09-20T12:00:00.000Z"),
		);

		expect(sections.decisionTokens?.in).toEqual([
			expect.objectContaining({ per1M: 0.042 }),
		]);
		expect(sections.decisionTokens?.out).toEqual([
			expect.objectContaining({ per1M: 0 }),
		]);
		expect(sections.otherRules).toHaveLength(0);
		expect(buildProviderTablePriceSummary(sections, "input").primary).toMatchObject({
			label: "decisions",
			price: 0.042,
			unitLabel: "Per 1M tokens",
			unitShortLabel: "/M",
		});
		expect(buildProviderTablePriceSummary(sections, "output").primary).toMatchObject({
			label: "decisions",
			price: 0,
			formattedPrice: "Free",
		});
	});

	test("normalizes duration summaries to a per-second rate", () => {
		const provider = makeProviderPricing();
		provider.provider_models = [{
			...provider.provider_models[0],
			id: "openai:openai/video-example:video.generate",
			model_id: "openai/video-example",
			endpoint: "video.generate",
			input_modalities: "video",
			output_modalities: "video",
		}];
		provider.pricing_rules = [
			{
				...provider.pricing_rules[0],
				id: "video-input-minute",
				model_key: "openai:openai/video-example:video.generate",
				meter: "input_video_minutes",
				unit: "minute",
				unit_size: 1,
				price_per_unit: 0.6,
				match: [],
			},
			{
				...provider.pricing_rules[0],
				id: "video-input-second",
				model_key: "openai:openai/video-example:video.generate",
				meter: "input_video_seconds",
				unit: "second",
				unit_size: 1,
				price_per_unit: 0.02,
				match: [],
			},
		];

		const sections = buildProviderSections(provider, "standard");

		expect(buildProviderTablePriceSummary(sections, "input").primary).toMatchObject({
			label: "video",
			price: 0.01,
			formattedPrice: "$0.01",
			unitLabel: "Per second",
			unitShortLabel: "/sec",
		});
	});

	test("uses duration pricing as the base summary for audio models", () => {
		const provider = makeProviderPricing();
		provider.provider_models = [{
			...provider.provider_models[0],
			id: "openai:openai/audio-example:audio.transcribe",
			model_id: "openai/audio-example",
			endpoint: "audio.transcribe",
			input_modalities: "audio",
			output_modalities: "text",
		}];
		provider.pricing_rules = [{
			...provider.pricing_rules[0],
			id: "audio-input-minute",
			model_key: "openai:openai/audio-example:audio.transcribe",
			meter: "input_audio_minutes",
			unit: "minute",
			unit_size: 1,
			price_per_unit: 0.6,
			match: [],
		}];

		const sections = buildProviderSections(provider, "standard");

		expect(sections.otherRules).toHaveLength(1);
		expect(buildProviderTablePriceSummary(sections, "input").primary).toMatchObject({
			label: "audio",
			price: 0.01,
			unitLabel: "Per second",
			unitShortLabel: "/sec",
		});
	});

	test("surfaces per-request web search pricing in provider sheet sections", () => {
		const provider = makeProviderPricing();
		provider.pricing_rules.push({
			id: "std-web-search",
			model_key: "openai:openai/gpt-5.5:responses",
			pricing_plan: "standard",
			meter: "native_web_search_requests",
			unit: "request",
			unit_size: 1,
			price_per_unit: 0.01,
			currency: "USD",
			note: "Web search content tokens are billed at the model's input-token rate.",
			priority: 100,
			effective_from: "2026-08-20T00:00:00.000Z",
			effective_to: null,
			match: [],
		});

		const sections = buildProviderSections(
			provider,
			"standard",
			new Date("2026-08-20T12:00:00.000Z"),
		);

		expect(sections.requests).toEqual([
			expect.objectContaining({
				meter: "native_web_search_requests",
				price: 0.01,
				unitLabel: "Per request",
			}),
		]);
	});

	test("shows only the base conditional context price in the provider table summary", () => {
		const sections = buildProviderSections(makeProviderPricing(), "standard", new Date("2026-02-01T00:00:00.000Z"));
		const summary = buildProviderTablePriceSummary(sections, "input");

		expect(summary.primary).toMatchObject({
			label: "text",
			price: 5,
		});
		expect(summary.secondary).toBeNull();
		expect(summary.extraCount).toBe(0);
	});

	test("does not compare marked-up priority pricing with standard", () => {
		const sections = buildProviderSections(makeProviderPricing(), "priority");
		const inputTiers = sections.textTokens?.in ?? [];

		expect(inputTiers).toHaveLength(2);
		expect(inputTiers[0]).toMatchObject({
			per1M: 12.5,
			basePer1M: null,
			comparisonKind: null,
			comparisonDirection: null,
			label: "< 272k",
		});
		expect(inputTiers[1]).toMatchObject({
			per1M: 25,
			basePer1M: null,
			comparisonKind: null,
			comparisonDirection: null,
			label: "≥ 272k",
		});
	});

	test("does not compare Batch pricing with Standard", () => {
		const provider = makeProviderPricing();
		provider.pricing_rules = [
			{
				id: "std-input-default",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "std-input-long",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 10,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "input_tokens", op: "gt", value: 272000 }],
			},
			{
				id: "batch-input-short",
				model_key: "openai:openai/gpt-5.5:batch",
				pricing_plan: "batch",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 2.5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [
					{
						path: "input_tokens",
						op: "lt",
						value: 272000,
						or_group: 1,
						and_index: 1,
					},
				],
			},
			{
				id: "batch-input-long",
				model_key: "openai:openai/gpt-5.5:batch",
				pricing_plan: "batch",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [
					{
						path: "input_tokens",
						op: "gte",
						value: 272000,
						or_group: 1,
						and_index: 1,
					},
				],
			},
		];

		const inputTiers = buildProviderSections(provider, "batch").textTokens?.in ?? [];

		expect(inputTiers).toHaveLength(2);
		expect(inputTiers[0]).toMatchObject({
			per1M: 2.5,
			basePer1M: null,
			comparisonKind: null,
		});
		expect(inputTiers[1]).toMatchObject({
			per1M: 5,
			basePer1M: null,
			comparisonKind: null,
		});
	});

	test("keeps hidden fast sibling standard pricing out of the standard view", () => {
		const provider = makeProviderPricing();
		provider.provider.api_provider_id = "venice";
		provider.provider.api_provider_name = "Venice";
		provider.provider.provider_family_id = "venice";
		provider.provider_models = [
			{
				id: "venice:anthropic/claude-opus-5:text.generate",
				api_provider_id: "venice",
				model_id: "anthropic/claude-opus-5",
				provider_model_slug: "claude-opus-5",
				endpoint: "text.generate",
				capability_status: "active",
				is_active_gateway: true,
				input_modalities: "text,image",
				output_modalities: "text",
				context_length: 1_000_000,
				max_input_tokens: 1_000_000,
				max_output_tokens: 128_000,
			},
			{
				id: "venice:anthropic/claude-opus-5-fast:text.generate",
				api_provider_id: "venice",
				model_id: "anthropic/claude-opus-5-fast",
				provider_model_slug: "claude-opus-5-fast",
				endpoint: "text.generate",
				capability_status: "deranked_lvl2",
				is_active_gateway: false,
				input_modalities: "text,image",
				output_modalities: "text",
				context_length: 1_000_000,
				max_input_tokens: 1_000_000,
				max_output_tokens: 128_000,
			},
		];
		provider.pricing_rules = [
			{
				id: "venice-std-input",
				model_key: "venice:anthropic/claude-opus-5:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 6,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-05-29T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "venice-priority-input",
				model_key: "venice:anthropic/claude-opus-5:text.generate",
				pricing_plan: "priority",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 12,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-05-29T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "venice-hidden-fast-std-input",
				model_key: "venice:anthropic/claude-opus-5-fast:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 12,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-05-29T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
		];

		const standardSections = buildProviderSections(provider, "standard");
		const prioritySections = buildProviderSections(provider, "priority");

		expect(standardSections.textTokens?.in?.[0]).toMatchObject({
			per1M: 6,
		});
		expect(prioritySections.textTokens?.in?.[0]).toMatchObject({
			per1M: 12,
			basePer1M: null,
			comparisonKind: null,
		});
	});

	test("presents a higher-priority promotional rate as a discount without an end date", () => {
		const provider = makeProviderPricing();
		provider.pricing_rules = [
			{
				id: "inkling-input-list",
				model_key: "thinking-machines:thinking-machines/inkling-64k:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 3.74,
				currency: "USD",
				note: "Undiscounted list price",
				priority: 100,
				effective_from: "2026-07-15T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "inkling-input-promotion",
				model_key: "thinking-machines:thinking-machines/inkling-64k:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 1.87,
				currency: "USD",
				note: "Limited-time 50% promotion",
				priority: 200,
				effective_from: "2026-07-15T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
		];

		const sections = buildProviderSections(provider, "standard");

		expect(sections.textTokens?.in).toEqual([
			expect.objectContaining({
				per1M: 1.87,
				basePer1M: 3.74,
				comparisonKind: "discount",
				comparisonDirection: "cheaper",
				discountEndsAt: null,
			}),
		]);
	});

	test("labels split Anthropic cache write TTL pricing clearly", () => {
		const provider = makeProviderPricing();
		provider.provider.api_provider_id = "anthropic";
		provider.provider.api_provider_name = "Anthropic";
		provider.pricing_rules = [
			{
				id: "anthropic-cache-write-5m",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "cached_write_text_tokens_5m",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 3.75,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "anthropic-cache-write-1h",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "cached_write_text_tokens_1h",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 6,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
		];

		const sections = buildProviderSections(provider, "standard");

		expect(sections.textTokens?.write).toEqual([
			expect.objectContaining({ per1M: 3.75, label: "5 min TTL" }),
			expect.objectContaining({ per1M: 6, label: "1 hour TTL" }),
		]);
		expect(buildProviderTablePriceSummary(sections, "cachewrite")).toMatchObject({
			primary: expect.objectContaining({
				price: 3.75,
				unitLabel: "Per 1M tokens",
				unitShortLabel: "/M",
			}),
		});
		expect(getAvailableProviderTablePriceDirections([sections])).toEqual([
			"cachewrite",
		]);
	});

	test("shows off-peak pricing first outside configured UTC windows", () => {
		const provider = makeProviderPricing();
		provider.pricing_rules = [{
			...provider.pricing_rules[0]!,
			id: "deepseek-input",
			price_per_unit: 0.28,
			billing_timestamp_basis: "provider_accept",
			match: [],
			time_windows: [
				{
					label: "Peak",
					timezone: "UTC",
					start_time: "01:00",
					end_time: "04:00",
					price_per_unit: 0.87,
				},
				{
					label: "Peak",
					timezone: "UTC",
					start_time: "06:00",
					end_time: "10:00",
					price_per_unit: 0.87,
				},
			],
		}];

		const sections = buildProviderSections(
			provider,
			"standard",
			new Date("2026-07-17T05:30:00.000Z"),
		);
		const tier = sections.textTokens?.in[0];

		expect(tier).toMatchObject({
			per1M: 0.28,
		});
		expect(buildProviderTablePriceSummary(sections, "input").primary).toMatchObject({
			price: 0.28,
		});
	});

	test("shows peak pricing first from the inclusive start to exclusive end", () => {
		const provider = makeProviderPricing();
		provider.pricing_rules = [{
			...provider.pricing_rules[0]!,
			id: "deepseek-input",
			price_per_unit: 0.28,
			billing_timestamp_basis: "provider_accept",
			match: [],
			time_windows: [{
				label: "Peak",
				timezone: "UTC",
				start_time: "01:00",
				end_time: "04:00",
				price_per_unit: 0.87,
			}],
		}];

		const atStart = buildProviderSections(
			provider,
			"standard",
			new Date("2026-07-17T01:00:00.000Z"),
		);
		const atEnd = buildProviderSections(
			provider,
			"standard",
			new Date("2026-07-17T04:00:00.000Z"),
		);

		expect(atStart.textTokens?.in[0]).toMatchObject({
			per1M: 0.87,
		});
		expect(buildProviderTablePriceSummary(atStart, "input")).toMatchObject({
			sortValue: 0.87,
		});
		expect(buildProviderTablePriceSummary(atEnd, "input").sortValue).toBe(0.28);
	});

	test("keeps weekday-constrained peak windows off-peak on weekends", () => {
		const provider = makeProviderPricing();
		provider.pricing_rules = [{
			...provider.pricing_rules[0]!,
			id: "deepseek-weekday-input",
			price_per_unit: 0.22,
			match: [],
			time_windows: [{
				label: "Peak",
				timezone: "UTC",
				days_of_week: ["mon", "tue", "wed", "thu", "fri"],
				start_time: "06:00",
				end_time: "10:00",
				price_per_unit: 0.44,
			}],
		}];

		const sunday = buildProviderSections(provider, "standard", new Date("2026-08-23T06:30:00Z"));
		const monday = buildProviderSections(provider, "standard", new Date("2026-08-24T06:30:00Z"));

		expect(buildProviderTablePriceSummary(sunday, "input").sortValue).toBe(0.22);
		expect(buildProviderTablePriceSummary(monday, "input").sortValue).toBe(0.44);
	});

	test("averages recurring UTC pricing windows into one daily chart rate", () => {
		expect(calculateDailyAveragePricingMeterPrice({
			price_per_unit: "0.22",
			time_windows: [
				{ label: "Peak", timezone: "UTC", start_time: "01:00", end_time: "04:00", price_per_unit: 0.44 },
				{ label: "Peak", timezone: "UTC", start_time: "06:00", end_time: "10:00", price_per_unit: 0.44 },
			],
		})).toBeCloseTo((0.22 * 17 + 0.44 * 7) / 24, 12);
	});

	test("includes all-day weekend off-peak rates in the recurring average", () => {
		expect(calculateDailyAveragePricingMeterPrice({
			price_per_unit: "0.22",
			time_windows: [
				{ label: "Peak", timezone: "UTC", days_of_week: ["mon", "tue", "wed", "thu", "fri"], start_time: "01:00", end_time: "04:00", price_per_unit: 0.44 },
				{ label: "Peak", timezone: "UTC", days_of_week: ["mon", "tue", "wed", "thu", "fri"], start_time: "06:00", end_time: "10:00", price_per_unit: 0.44 },
			],
		})).toBeCloseTo((0.22 * (7 * 24 - 5 * 7) + 0.44 * 5 * 7) / (7 * 24), 12);
	});

	test("returns distinct UTC boundaries for a recurring pricing chart", () => {
		expect(getUtcPricingScheduleTimes([
			{ label: "Peak", timezone: "UTC", start_time: "01:00", end_time: "04:00", price_per_unit: 0.44 },
			{ label: "Peak", timezone: "UTC", start_time: "06:00", end_time: "10:00", price_per_unit: 0.44 },
		])).toEqual(["00:00", "01:00", "04:00", "06:00", "10:00"]);
	});
});
