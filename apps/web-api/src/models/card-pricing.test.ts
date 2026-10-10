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

	it("shows the cheapest provider with a From label and keeps the range for the hover card", () => {
		const row = card([
			tokens("input_text_tokens", 3),
			tokens("input_text_tokens", 3.3),
			tokens("output_text_tokens", 15),
			tokens("output_text_tokens", 16.5),
		]);
		expect(row.pricing_summary).toEqual({ kind: "tokens", from: true, input: 3, output: 15, unit: "1M tokens" });
		expect(row.pricing_detail_rows).toEqual([
			{ label: "Input Text Tokens", value: "$3–$3.30 / 1M tokens" },
			{ label: "Output Text Tokens", value: "$15–$16.50 / 1M tokens" },
		]);
	});

	it("lists every meter in the hover card, standard tier first", () => {
		const rows = Array.from({ length: 8 }, (_, index) => tokens(`input_text_tokens_${index}`, index + 1));
		const row = card([tokens("input_text_tokens", 1, { service_tier: "priority" }), ...rows]);
		const details = row.pricing_detail_rows as Array<{ label: string }>;
		expect(details).toHaveLength(9);
		expect(details.at(-1)?.label).toBe("Input Text Tokens (Priority)");
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

	it("passes preformatted rows through untouched", () => {
		const rows = [{ label: "Custom contract", value: "Contact provider" }];
		const row = normalizeModelsPagePricing({ pricing_detail_rows: rows });
		expect(row.pricing_detail_rows).toEqual(rows);
		expect(row.pricing_summary).toBeUndefined();
	});
});
