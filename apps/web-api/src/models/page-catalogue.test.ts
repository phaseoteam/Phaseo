import { describe, expect, it } from "vitest";
import { mergeModelWeeklyMetrics } from "@/models/page-catalogue";

describe("mergeModelWeeklyMetrics", () => {
	it("replaces catalogue placeholders with v2 rollup metrics", () => {
		const rows = mergeModelWeeklyMetrics([
			{
				model_id: "poolside/laguna-s-2.1",
				popularity_tokens_week: null,
				throughput_week: null,
				latency_week: null,
			},
			{ model_id: "catalogue/only", popularity_tokens_week: null },
		], [
			{
				model_slug: "poolside/laguna-s-2.1",
				popularity_tokens_week: 12_345,
				weekly_usage_metric: "tokens",
				weekly_usage_quantity: 12_345,
				weekly_usage_unit: "tokens",
				throughput_week: 8.75,
				latency_week: 245.5,
			},
		]);

		expect(rows[0]).toMatchObject({
			model_id: "poolside/laguna-s-2.1",
			popularity_tokens_week: 12_345,
			weekly_usage_metric: "tokens",
			weekly_usage_quantity: 12_345,
			weekly_usage_unit: "tokens",
			throughput_week: 8.75,
			latency_week: 245.5,
		});
		expect(rows[1]).toEqual({
			model_id: "catalogue/only",
			popularity_tokens_week: null,
		});
	});
});
