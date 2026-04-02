import { describe, expect, it } from "vitest";
import type { PriceCard } from "@pipeline/pricing/types";
import { computeVideoPricedUsage } from "./video-pricing";

function makeCard(rules: Array<Record<string, unknown>>): PriceCard {
	return {
		provider: "minimax",
		model: "minimax/hailuo-2.3",
		endpoint: "video.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: rules as any,
	};
}

describe("video-pricing", () => {
	it("uses output_video_seconds meter when available", () => {
		const card = makeCard([
			{
				pricing_plan: "standard",
				meter: "output_video_seconds",
				unit: "seconds",
				unit_size: 6,
				price_per_unit: "0.28",
				currency: "USD",
				match: [
					{ path: "video_params.resolution", op: "eq", value: "768P" },
					{ path: "video_params.seconds", op: "eq", value: 6 },
				],
				priority: 100,
			},
		]);

		const priced = computeVideoPricedUsage({
			seconds: 6,
			card,
			model: "minimax/hailuo-2.3",
			requestOptions: {
				video_params: {
					resolution: "768P",
				},
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("0.28");
	});

	it("falls back to legacy output_video meter when seconds meter is absent", () => {
		const card = makeCard([
			{
				pricing_plan: "standard",
				meter: "output_video",
				unit: "video",
				unit_size: 1,
				price_per_unit: "0.56",
				currency: "USD",
				match: [
					{ path: "video_params.resolution", op: "eq", value: "768P" },
					{ path: "video_params.seconds", op: "eq", value: 10 },
				],
				priority: 100,
			},
		]);

		const priced = computeVideoPricedUsage({
			seconds: 10,
			card,
			model: "minimax/hailuo-2.3",
			requestOptions: {
				video_params: {
					resolution: "768p",
				},
			},
		});

		expect((priced as any)?.pricing?.total_usd_str).toBe("0.56");
	});
});

