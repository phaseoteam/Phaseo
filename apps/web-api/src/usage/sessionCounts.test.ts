import { describe, expect, it } from "vitest";
import { collectSessionCounts } from "./sessionCounts";

describe("session count aggregation", () => {
	it("counts apps, models, and model-provider pairs independently per session", () => {
		const row = { session_id: "s", app_id: "app", model_id: "a", provider: "p" };
		const result = collectSessionCounts([row, row, { ...row, provider: "q" }, { ...row, model_id: "b", provider: "q" }, { ...row, session_id: "other" }]);
		expect(result.get("s")).toEqual({ app_counts: [{ app_id: "app", request_count: 4 }], model_counts: [{ model_id: "a", request_count: 3 }, { model_id: "b", request_count: 1 }], model_provider_counts: [{ model_id: "a", provider: "p", request_count: 2 }, { model_id: "a", provider: "q", request_count: 1 }, { model_id: "b", provider: "q", request_count: 1 }] });
		expect(result.get("other")?.model_counts[0].request_count).toBe(1);
	});
	it("handles missing provider or app without losing model counts", () => {
		const result = collectSessionCounts([{ session_id: "s", app_id: null, model_id: "a", provider: null }, { session_id: null, app_id: "app", model_id: "b", provider: "p" }]);
		expect(result.size).toBe(1);
		expect(result.get("s")).toEqual({ app_counts: [], model_counts: [{ model_id: "a", request_count: 1 }], model_provider_counts: [] });
	});
});
