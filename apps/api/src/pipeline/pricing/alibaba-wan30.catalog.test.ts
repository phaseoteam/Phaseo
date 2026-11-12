import { describe, expect, it } from "vitest";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import { computeBill } from "./engine";
import type { PriceCard, PriceRule } from "./types";

// Resolution-tiered rules copied from the alibaba-cloud Wan 3.0 video.generate price cards.
const resolutionRule = (meter: string, resolution: string, price: number) => ({
	meter,
	unit: "second",
	unit_size: 1,
	price_per_unit: price,
	currency: "USD",
	pricing_plan: "standard",
	match: [{ path: "video_params.resolution", op: "eq", or_group: 1, and_index: 1, value: resolution }],
	priority: 100,
});

const resolutionCard = (apiModelId: string, prices: Record<"480P" | "720P" | "1080P", number>) => ({
	api_provider_id: "alibaba-cloud",
	api_model_id: apiModelId,
	capability_id: "video.generate",
	rules: (["output_video_seconds", "input_video_seconds"] as const).flatMap((meter) =>
		(Object.entries(prices) as Array<[string, number]>).map(([resolution, price]) => resolutionRule(meter, resolution, price))),
});

const WAN30_VIDEO = resolutionCard("qwen/wan3.0-video", { "480P": 0.05, "720P": 0.1, "1080P": 0.2 });
const WAN30_VIDEO_PRIME = resolutionCard("qwen/wan3.0-video-prime", { "480P": 0.068, "720P": 0.14, "1080P": 0.28 });

function loadCard(raw: ReturnType<typeof resolutionCard>): PriceCard {
	return {
		provider: raw.api_provider_id,
		model: raw.api_model_id,
		endpoint: raw.capability_id,
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: raw.rules.map((rule: Record<string, unknown>, index: number): PriceRule => ({
			id: `${String(rule.meter)}:${index}`,
			pricing_plan: String(rule.pricing_plan),
			meter: rule.meter as PriceRule["meter"],
			unit: String(rule.unit),
			unit_size: Number(rule.unit_size),
			price_per_unit: String(rule.price_per_unit),
			currency: String(rule.currency),
			match: Array.isArray(rule.match) ? rule.match as PriceRule["match"] : [],
			priority: Number(rule.priority ?? 0),
		})),
	};
}

describe("Alibaba Cloud Wan 3.0 pricing", () => {
	it("bills standard output and reference-video input seconds at the selected resolution", () => {
		const card = loadCard(WAN30_VIDEO);
		const priced = computeBill(
			{ output_video_seconds: 10, input_video_seconds: 8 },
			card,
			buildVideoPricingRequestOptions({ resolution: "720P", input_video_seconds: 8 }),
		);

		expect(priced.pricing.total_usd_str).toBe("1.8");
		expect(priced.pricing.lines.map((line) => line.dimension).sort()).toEqual([
			"input_video_seconds",
			"output_video_seconds",
		]);
	});

	it("uses the higher Prime rate for 1080P output", () => {
		const card = loadCard(WAN30_VIDEO_PRIME);
		const priced = computeBill(
			{ output_video_seconds: 5 },
			card,
			buildVideoPricingRequestOptions({ resolution: "1080P" }),
		);

		expect(priced.pricing.total_usd_str).toBe("1.4");
	});
});
