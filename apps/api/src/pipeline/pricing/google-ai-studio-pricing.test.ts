import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildImagePricingRequestOptions } from "@core/image-request-options";
import { computeBill } from "./engine";
import type { PriceCard, PriceRule } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const flashLitePreviewPricingPath = path.join(
	repoRoot,
	"packages/data/catalog/src/data/pricing/google-ai-studio/google-gemini-3.1-flash-lite-preview/text.generate/pricing.json",
);
const geminiProImagePricingPath = path.join(
	repoRoot,
	"packages/data/catalog/src/data/pricing/google-ai-studio/google-gemini-3-pro-image/images.generations/pricing.json",
);

function loadActivePriceCard(nowIso: string, pricingPath = flashLitePreviewPricingPath): PriceCard {
	const raw = JSON.parse(fs.readFileSync(pricingPath, "utf8"));
	const rules = raw.rules
		.filter((rule: Record<string, unknown>) => {
			const effectiveFrom = typeof rule.effective_from === "string" ? rule.effective_from : null;
			const effectiveTo = typeof rule.effective_to === "string" ? rule.effective_to : null;
			return (!effectiveFrom || effectiveFrom <= nowIso) && (!effectiveTo || effectiveTo > nowIso);
		})
		.map((rule: Record<string, unknown>): PriceRule => ({
			id: `${String(rule.pricing_plan)}:${String(rule.meter)}`,
			pricing_plan: String(rule.pricing_plan),
			meter: rule.meter as PriceRule["meter"],
			unit: String(rule.unit),
			unit_size: Number(rule.unit_size),
			price_per_unit: String(rule.price_per_unit),
			currency: String(rule.currency),
			match: Array.isArray(rule.match) ? rule.match as PriceRule["match"] : [],
			priority: Number(rule.priority ?? 0),
		}));

	return {
		provider: raw.api_provider_id,
		model: raw.api_model_id,
		endpoint: raw.capability_id,
		effective_from: raw.effective_from ?? null,
		effective_to: raw.effective_to ?? null,
		currency: "USD",
		version: null,
		rules,
	};
}

describe("Google AI Studio Gemini 3.1 Flash Lite Preview pricing", () => {
	it("keeps standard text, image, audio, video input and text output meters billable after May 25", () => {
		const card = loadActivePriceCard("2026-05-31T00:00:00.000Z");
		const priced = computeBill(
			{
				input_text_tokens: 1_000_000,
				input_image_tokens: 1_000_000,
				input_audio_tokens: 1_000_000,
				input_video_tokens: 1_000_000,
				output_text_tokens: 1_000_000,
			},
			card,
		);

		expect(priced.pricing.total_usd_str).toBe("2.75");
		expect(priced.pricing.lines.map((line: { dimension: string }) => line.dimension).sort()).toEqual([
			"input_audio_tokens",
			"input_image_tokens",
			"input_text_tokens",
			"input_video_tokens",
			"output_text_tokens",
		]);
	});
});

describe("Google AI Studio Gemini 3 Pro Image pricing", () => {
	it("bills image output tokens when Gemini image size is supplied through quality", () => {
		const card = loadActivePriceCard("2026-05-31T00:00:00.000Z", geminiProImagePricingPath);
		const requestOptions = buildImagePricingRequestOptions({
			size: "1:1",
			quality: "1K",
		});

		const priced = computeBill(
			{
				input_text_tokens: 100,
				output_text_tokens: 1_000_000,
				output_image_tokens: 1_000_000,
			},
			card,
			requestOptions,
		);

		expect(requestOptions).toMatchObject({
			size: "1:1",
			resolution: "1K",
			quality: "1K",
			image_params: {
				resolution: "1K",
				quality: "1K",
			},
		});
		expect(priced.pricing.total_usd_str).toBe("132.0002");
		expect(priced.pricing.lines.map((line: { dimension: string }) => line.dimension).sort()).toEqual([
			"input_text_tokens",
			"output_image_tokens",
			"output_text_tokens",
		]);
	});
});
