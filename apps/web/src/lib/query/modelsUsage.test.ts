import type { ModelsPageData, ModelsPageModel } from "@/components/(data)/models/Models/modelsDisplay.types";
import { withModelsUsage, type ModelWeeklyMetrics } from "./modelsUsage";

const data = {
	models: [
		{ model_id: "public/model", name: "Public" },
		{ model_id: "phaseo/free", name: "Free Router", router_requests_30d: null },
		{ model_id: "private/model", name: "Private", gateway_tiers: ["private"] },
	] as ModelsPageModel[],
	facets: { statusCounts: { active: 3 } },
} as ModelsPageData;

describe("progressive catalogue usage", () => {
	it("keeps the existing catalogue while optional requests are pending or fail", () => {
		expect(withModelsUsage(data, undefined, undefined)).toBe(data);
	});

	it("merges independent statistics without changing filters or private model values", () => {
		const metrics = [
			{ model_slug: "public/model", weekly_usage_quantity: 42 },
			{ model_slug: "private/model", weekly_usage_quantity: 999 },
		] as ModelWeeklyMetrics[];
		const result = withModelsUsage(data, metrics, { summary: { routedRequests30d: 8, totalCostNanos30d: 100 } });
		expect(result.facets).toBe(data.facets);
		expect(result.models[0]).toMatchObject({ name: "Public", weekly_usage_quantity: 42 });
		expect(result.models[1].router_requests_30d).toBe(8);
		expect(result.models[2]).toBe(data.models[2]);
		expect(data.models[0].weekly_usage_quantity).toBeUndefined();
		expect(data.models[1].router_requests_30d).toBeNull();
	});

	it("shows weekly values even when Free Router usage is unavailable", () => {
		const result = withModelsUsage(data, [{ model_slug: "public/model", weekly_usage_quantity: 42 } as ModelWeeklyMetrics], undefined);
		expect(result.models[0].weekly_usage_quantity).toBe(42);
		expect(result.models[1].router_requests_30d).toBeNull();
	});
});
