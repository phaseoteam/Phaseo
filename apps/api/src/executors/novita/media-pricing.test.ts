import { describe, expect, it } from "vitest";
import { computeBillSummary } from "@/pipeline/pricing/engine";
import type { PriceCard } from "@/pipeline/pricing/types";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";

function card(rules: PriceCard["rules"]): PriceCard {
	return { provider: "novita", model: "reviewed-media", endpoint: "video.generate", currency: "USD", effective_from: null, effective_to: null, version: null, rules };
}
describe("Novita media pricing contracts", () => {
	it.each([
		["std", false, "0.084", 0.42], ["std", true, "0.126", 0.63],
		["pro", false, "0.112", 0.56], ["pro", true, "0.168", 0.84],
	] as const)("prices Kling %s audio=%s by seconds", (_tier, audio, rate, expected) => {
		const pricing = card([{ meter: "output_video_seconds", pricing_plan: "standard", unit: "second", unit_size: 1, price_per_unit: rate, currency: "USD", match: [{ path: "audio", op: "eq", value: audio }] }]);
		const options = buildVideoPricingRequestOptions({ seconds: 5, audio });
		expect(computeBillSummary({ output_video_seconds: 5 }, pricing, options).cost_usd).toBe(expected);
		expect(computeBillSummary({ output_video_seconds: 5 }, pricing, { audio: !audio }).lines).toEqual([]);
	});
	it("prices Fish speech by input characters", () => {
		const pricing = card([{ meter: "input_characters", pricing_plan: "standard", unit: "character", unit_size: 1_000_000, price_per_unit: "15", currency: "USD", match: [] }]);
		expect(computeBillSummary({ input_characters: 1000, requests: 1 }, pricing).cost_usd).toBe(0.015);
	});
});
