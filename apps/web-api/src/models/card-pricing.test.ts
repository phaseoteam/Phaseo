import { describe, expect, it } from "vitest";
import { formatUsd, normalizeModelsPagePricing } from "@/models/card-pricing";

type Meter = Record<string, unknown>;

const tokens = (meter_key: string, perMillion: number, extra: Meter = {}): Meter => ({
	label: meter_key, meter_key, price: perMillion, unit: "token", unit_quantity: 1_000_000,
	display_unit: "1M tokens", service_tier: "standard", ...extra,
});

const usage = (meter_key: string, price: number, unit: string, unit_quantity = 1, extra: Meter = {}): Meter => ({
	label: meter_key, meter_key, price, unit, unit_quantity, display_unit: "billing unit",
	service_tier: "standard", ...extra,
});

const card = (rows: Meter[], outputs: string[] = ["text"]) => normalizeModelsPagePricing({
	gateway_output_modalities: outputs,
	pricing_detail_rows: rows,
	lowest_input_price: 0.01,
	lowest_output_price: 0.01,
});

describe("formatUsd", () => {
	it("shows cents for fractional amounts and keeps sub-cent rates visible", () => {
		expect(formatUsd(0)).toBe("$0");
		expect(formatUsd(15)).toBe("$15");
		expect(formatUsd(2.5)).toBe("$2.50");
		expect(formatUsd(0.5)).toBe("$0.50");
		expect(formatUsd(0.035)).toBe("$0.035");
		expect(formatUsd(1.125)).toBe("$1.125");
		expect(formatUsd(0.006)).toBe("$0.006");
		expect(formatUsd(0.000123456)).toBe("$0.000123");
	});
});

describe("normalizeModelsPagePricing", () => {
	it("headlines standard input and output token rates, ignoring cache and batch meters", () => {
		const row = card([
			tokens("input_text_tokens", 3),
			tokens("output_text_tokens", 15),
			tokens("cached_read_text_tokens", 0.3),
			tokens("cached_write_text_tokens", 3.75),
			tokens("input_text_tokens", 1.5, { service_tier: "batch" }),
			tokens("output_text_tokens", 7.5, { service_tier: "batch" }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 3, output: 15, unit: "1M tokens" });
		expect(row).toMatchObject({
			lowest_input_price: 3, lowest_output_price: 15,
			lowest_standard_input_price_unit: "1M tokens", lowest_from_price: 3,
		});
	});

	it("shows only the cheapest provider, in the pill and the hover card", () => {
		const row = card([
			tokens("input_text_tokens", 3.3, { provider: "bedrock" }),
			tokens("output_text_tokens", 16.5, { provider: "bedrock" }),
			tokens("input_text_tokens", 3, { provider: "anthropic" }),
			tokens("output_text_tokens", 15, { provider: "anthropic" }),
			tokens("cached_read_text_tokens", 0.3, { provider: "anthropic" }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 3, output: 15, unit: "1M tokens" });
		expect(row.pricing_detail_rows).toEqual([
			{ label: "Input Text Tokens", value: "$3 / 1M tokens" },
			{ label: "Output Text Tokens", value: "$15 / 1M tokens" },
			{ label: "Cached Read Text Tokens", value: "$0.30 / 1M tokens" },
		]);
		expect(row).toMatchObject({ lowest_input_price: 3, lowest_output_price: 15 });
	});

	it("groups providers by the page RPC's anonymous provider number", () => {
		const row = card([
			tokens("input_tokens", 0.09, { provider_group: 1 }),
			tokens("output_tokens", 0.4, { provider_group: 1 }),
			tokens("input_tokens", 0.038, { provider_group: 2 }),
			tokens("output_tokens", 0.2, { provider_group: 2 }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 0.038, output: 0.2, unit: "1M tokens" });
	});

	it("ranks a provider pricing both token sides ahead of one pricing only input", () => {
		const row = card([
			tokens("input_text_tokens", 10, { provider_group: 1 }),
			tokens("input_text_tokens", 6, { provider_group: 2 }),
			tokens("output_text_tokens", 6, { provider_group: 2 }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 6, output: 6, unit: "1M tokens" });
	});

	it("does not call a model Free because one provider lists only a $0 input price", () => {
		const row = card([
			tokens("input_text_tokens", 0, { provider_group: 1 }),
			tokens("input_text_tokens", 3, { provider_group: 2 }),
			tokens("output_text_tokens", 15, { provider_group: 2 }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 3, output: 15, unit: "1M tokens" });
	});

	it("keeps a genuinely free per-image provider ahead of a paid token provider", () => {
		const row = card([
			usage("output_image", 0, "image", 1, { modality: "image", provider_group: 1 }),
			tokens("input_text_tokens", 1, { provider_group: 2 }),
			tokens("output_image_tokens", 30, { modality: "image", provider_group: 2 }),
		], ["image"]);
		expect(row.pricing_summary).toEqual({ kind: "free" });
	});

	it("does not let a $0 input-only provider make a media model Free", () => {
		const row = card([
			tokens("input_text_tokens", 0, { provider_group: 1 }),
			usage("output_image", 0.04, "image", 1, { modality: "image", provider_group: 2 }),
		], ["image"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: false, price: 0.04, unit: "image" });
	});

	it("keeps a free input-only provider for an input-priced model", () => {
		const row = card([
			tokens("input_tokens", 0, { provider_group: 1 }),
			usage("requests", 0.001, "request", 1, { provider_group: 2 }),
		], ["embeddings"]);
		expect(row.pricing_summary).toEqual({ kind: "free" });
	});

	it("keeps an embeddings model input-priced even if one provider lists an output meter", () => {
		const row = card([
			tokens("input_tokens", 0.02, { provider_group: 1 }),
			tokens("input_tokens", 0.1, { provider_group: 2 }),
			tokens("output_tokens", 0.1, { provider_group: 2 }),
		], ["embeddings"]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 0.02, output: null, unit: "1M tokens" });
	});

	it("does not treat a provider with only a $0 tool fee as a free model", () => {
		const row = card([
			usage("web_search", 0, "request", 1, { provider_group: 1 }),
			tokens("input_text_tokens", 3, { provider_group: 2 }),
			tokens("output_text_tokens", 15, { provider_group: 2 }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 3, output: 15, unit: "1M tokens" });
	});

	it("does not let a $0 output-only provider beat a paid input price on an embeddings model", () => {
		const row = card([
			tokens("output_tokens", 0, { provider_group: 1 }),
			tokens("input_tokens", 0.02, { provider_group: 2 }),
		], ["embeddings"]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 0.02, output: null, unit: "1M tokens" });
	});

	it("uses a provider's base rate when it has short- and long-context SKUs, without From", () => {
		const row = card([
			tokens("input_text_tokens", 2, { provider: "openai" }),
			tokens("output_text_tokens", 10, { provider: "openai" }),
			tokens("input_text_tokens", 4, { provider: "openai" }),
			tokens("output_text_tokens", 15, { provider: "openai" }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 2, output: 10, unit: "1M tokens" });
		expect(row.pricing_detail_rows).toEqual([
			{ label: "Input Text Tokens", value: "$2 / 1M tokens" },
			{ label: "Output Text Tokens", value: "$10 / 1M tokens" },
		]);
	});

	it("leaves batch, flex and other service tiers out of the hover card", () => {
		const row = card([
			tokens("input_text_tokens", 2),
			tokens("output_text_tokens", 10),
			tokens("input_text_tokens", 1, { service_tier: "batch" }),
			tokens("input_text_tokens", 1, { service_tier: "flex" }),
			tokens("input_text_tokens", 12, { service_tier: "ultrafast" }),
		]);
		expect(row.pricing_detail_rows).toEqual([
			{ label: "Input Text Tokens", value: "$2 / 1M tokens" },
			{ label: "Output Text Tokens", value: "$10 / 1M tokens" },
		]);
	});

	it("labels free models as Free", () => {
		expect(card([tokens("input_text_tokens", 0), tokens("output_text_tokens", 0)]).pricing_summary)
			.toEqual({ kind: "free" });
	});

	it("shows input-only token pricing without an in/out split", () => {
		expect(card([tokens("input_tokens", 0.02)], ["embeddings"]).pricing_summary)
			.toEqual({ kind: "tokens", from: false, input: 0.02, output: null, unit: "1M tokens" });
	});

	it("keeps per-minute audio pricing per minute", () => {
		expect(card([usage("input_audio", 0.006, "minute", 1, { modality: "audio" })]).pricing_summary)
			.toEqual({ kind: "usage", from: false, price: 0.006, unit: "min" });
		expect(card([usage("input_audio", 0.36, "second", 3600, { modality: "audio" })]).pricing_summary)
			.toEqual({ kind: "usage", from: false, price: 0.36, unit: "hr" });
	});

	it("uses compact batch units for character pricing", () => {
		expect(card([usage("input_characters", 0.022, "character", 1000)], ["audio"]).pricing_summary)
			.toEqual({ kind: "usage", from: false, price: 0.022, unit: "1K characters" });
		expect(card([usage("input_characters", 15, "character", 1_000_000)], ["audio"]).pricing_summary)
			.toEqual({ kind: "usage", from: false, price: 15, unit: "1M characters" });
	});

	it("headlines the cheapest image size instead of giving up", () => {
		const row = card([
			tokens("input_text_tokens", 5),
			usage("output_image_1024", 0.04, "image", 1, { modality: "image" }),
			usage("output_image_1792", 0.08, "image", 1, { modality: "image" }),
		], ["image"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: true, price: 0.04, unit: "image" });
	});

	it("does not say From for a single image price alongside input meters", () => {
		const row = card([
			tokens("input_text_tokens", 5),
			usage("output_image", 0.04, "image", 1, { modality: "image" }),
		], ["image"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: false, price: 0.04, unit: "image" });
	});

	it("headlines per-second video pricing across audio variants", () => {
		const row = card([
			usage("output_video_audio", 0.4, "second", 1, { modality: "video" }),
			usage("output_video", 0.2, "second", 1, { modality: "video" }),
		], ["video"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: true, price: 0.2, unit: "sec" });
	});

	it("does not advertise tool fees in the pill", () => {
		const row = card([
			tokens("input_text_tokens", 2),
			tokens("output_text_tokens", 8),
			usage("web_search", 10, "request", 1000),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 2, output: 8, unit: "1M tokens" });
		expect(row.pricing_detail_rows).toContainEqual({ label: "Web Search", value: "$10 / 1K requests" });
	});

	it("keeps provider pass-through cost meters out of the headline", () => {
		const row = card([
			usage("bfl_credits", 0.01, "credit", 1, { modality: "image" }),
			usage("deepinfra_cost_usd", 1, "usd"),
		], ["image"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: false, price: 0.01, unit: "credit" });
		expect(row.pricing_detail_rows).toContainEqual({ label: "Deepinfra Cost Usd", value: "At provider cost" });
		expect(card([usage("deepinfra_cost_usd", 1, "usd")], ["image"]).pricing_summary).toBeNull();
	});

	it("keeps token pricing from provider tiers ahead of a standard-tier tool fee", () => {
		const row = card([
			tokens("input_text_tokens", 0.5, { service_tier: "upstream-1" }),
			tokens("output_text_tokens", 1.5, { service_tier: "upstream-1" }),
			usage("native_web_search_requests", 0.0006, "request"),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 0.5, output: 1.5, unit: "1M tokens" });
		expect(row).toMatchObject({ lowest_input_price: 0.5, lowest_output_price: 1.5, lowest_from_price: 0.5 });
	});

	it("prefers full-price tiers over batch when there is no standard tier", () => {
		const row = card([
			tokens("input_text_tokens", 1, { service_tier: "batch" }),
			tokens("output_text_tokens", 4, { service_tier: "batch" }),
			tokens("input_text_tokens", 2, { service_tier: "on-demand" }),
			tokens("output_text_tokens", 8, { service_tier: "on-demand" }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 2, output: 8, unit: "1M tokens" });
		expect(row).toMatchObject({ lowest_input_price: 2, lowest_output_price: 8 });
	});

	it("calls a model with free tokens and a paid tool fee Free", () => {
		const row = card([
			tokens("input_text_tokens", 0),
			tokens("output_text_tokens", 0),
			usage("native_web_search_requests", 0.01, "request"),
		]);
		expect(row.pricing_summary).toEqual({ kind: "free" });
	});

	it("does not call a model Free because of a zero-priced standard-tier tool meter", () => {
		const row = card([
			usage("included_requests", 0, "request"),
			tokens("input_text_tokens", 1, { service_tier: "upstream-1" }),
			tokens("output_text_tokens", 4, { service_tier: "upstream-1" }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 1, output: 4, unit: "1M tokens" });
	});

	it("bases compatibility token prices on text meters, not other-modality tokens", () => {
		const row = card([
			tokens("input_text_tokens", 3),
			tokens("input_audio_tokens", 0),
			tokens("output_text_tokens", 15),
		]);
		expect(row).toMatchObject({ lowest_input_price: 3, lowest_output_price: 15, lowest_from_price: 3 });
	});

	it("keeps descriptive provider display units", () => {
		const row = card([
			{ ...usage("output_music", 0.15, "request", 1, { modality: "audio" }), display_unit: "1 track (up to 5 minutes)" },
		], ["audio"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: false, price: 0.15, unit: "track (up to 5 minutes)" });
		expect(card([{ ...tokens("input_text_tokens", 2), display_unit: "per million tokens" }]).pricing_summary)
			.toMatchObject({ kind: "tokens", input: 2 });
	});

	it("keeps text-generation compatibility prices on operation-priced models", () => {
		const row = normalizeModelsPagePricing({
			gateway_output_modalities: ["text"],
			operation_pricing: [{ capability: "text.generate", input: 3, output: 15 }, { capability: "decisions.make", input: 1, output: 2 }],
			lowest_input_price: 3, lowest_output_price: 15,
			lowest_standard_input_price: 3, lowest_standard_output_price: 15,
			lowest_standard_input_price_unit: "billing unit", lowest_standard_output_price_unit: "billing unit",
			lowest_from_price: null, lowest_from_price_unit: "billing unit",
			pricing_detail_rows: [
				tokens("input_text_tokens", 3), tokens("output_text_tokens", 15),
				tokens("input_text_tokens", 1), tokens("output_text_tokens", 2),
			],
		});
		expect(row).toMatchObject({
			lowest_input_price: 3, lowest_output_price: 15,
			lowest_standard_input_price: 3, lowest_standard_output_price: 15,
			lowest_standard_input_price_unit: "1M tokens", lowest_standard_output_price_unit: "1M tokens",
			lowest_standard_input_price_label: "Input", lowest_standard_output_price_label: "Output",
			lowest_from_price: null, lowest_from_price_unit: null,
		});
	});

	it("sorts usage-priced models by the unit the card shows", () => {
		const row = card([
			tokens("input_audio_tokens", 3, { modality: "audio" }),
			usage("input_audio", 0.006, "minute", 1, { modality: "audio" }),
		]);
		expect(row.pricing_summary).toMatchObject({ kind: "usage", price: 0.006, unit: "min" });
		expect(row).toMatchObject({
			lowest_input_price: 0.006, lowest_standard_input_price_unit: "min",
			lowest_output_price: null, lowest_from_price: 0.006, lowest_from_price_unit: "min",
		});
	});

	it("sorts a speech model by the output rate it headlines, not the same-unit input", () => {
		const row = card([
			tokens("input_text_tokens", 0.5),
			tokens("output_audio_tokens", 9, { modality: "audio" }),
		], ["audio"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: false, price: 9, unit: "1M tokens" });
		expect(row).toMatchObject({ lowest_input_price: null, lowest_output_price: 9, lowest_from_price: 9 });
	});

	it("headlines token-billed media output over text output on a media-only model", () => {
		const row = card([
			tokens("input_text_tokens", 0.5),
			tokens("output_text_tokens", 2),
			tokens("output_image_tokens", 30, { modality: "image" }),
		], ["image"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: false, price: 30, unit: "1M tokens" });
		expect(row).toMatchObject({ lowest_output_price: 30, lowest_input_price: null });
	});

	it("keeps text rates as the headline on text-and-image models", () => {
		const row = card([
			tokens("input_text_tokens", 0.5),
			tokens("output_text_tokens", 2),
			tokens("output_image_tokens", 30, { modality: "image" }),
		], ["text", "image"]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 0.5, output: 2, unit: "1M tokens" });
		expect(row.pricing_detail_rows).toContainEqual({ label: "Output Image Tokens", value: "$30 / 1M tokens" });
	});

	it("chooses each token side's tier independently", () => {
		const row = card([
			tokens("input_text_tokens", 0),
			tokens("output_text_tokens", 6, { service_tier: "on-demand" }),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: false, input: 0, output: 6, unit: "1M tokens" });
	});

	it("headlines a paid generation request when token rows are $0 placeholders", () => {
		const row = card([
			tokens("input_text_tokens", 0),
			tokens("output_text_tokens", 0),
			usage("requests", 0.08, "request"),
		], ["text", "audio"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: false, price: 0.08, unit: "request" });
	});

	it("finds a paid generation request priced only in a provider tier", () => {
		const row = card([
			tokens("input_text_tokens", 0),
			tokens("output_text_tokens", 0),
			usage("requests", 0.08, "request", 1, { service_tier: "upstream-1" }),
		], ["text", "audio"]);
		expect(row.pricing_summary).toEqual({ kind: "usage", from: false, price: 0.08, unit: "request" });
	});

	it("passes preformatted rows through untouched", () => {
		const rows = [{ label: "Custom contract", value: "Contact provider" }];
		const row = normalizeModelsPagePricing({ pricing_detail_rows: rows });
		expect(row.pricing_detail_rows).toEqual(rows);
		expect(row.pricing_summary).toBeUndefined();
	});
});
