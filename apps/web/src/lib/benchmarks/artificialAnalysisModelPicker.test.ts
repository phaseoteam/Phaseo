import { dashboardDefaultModels, dashboardDefaultEfforts, dashboardModelCategory, dashboardModelTier, toggleDashboardModels } from "./artificialAnalysisModelPicker";
import type { DashboardRow } from "./artificialAnalysisDashboard";
const model = (name: string, extra: Partial<DashboardRow> = {}) => ({ modelName: name, modelId: name, ...extra } as DashboardRow);
it("uses curated frontier tiers without inferring a size from a score", () => {
	expect(dashboardModelTier(model("Claude Haiku 5.5", { intelligence: 100 }))).toBe("small");
	expect(dashboardModelTier(model("Claude Sonnet 5.5"))).toBe("medium");
	expect(dashboardModelCategory(model("MiniMax M3.1 Flash"))).toBe("notable");
	expect(dashboardModelCategory(model("Open model", { isOpenWeights: true }))).toBe("openWeights");
	expect(dashboardModelCategory(model("GPT-6 Astra", { deprecated: true }))).toBe("older");
});
it("toggles a whole group without clearing other selected models", () => {
	expect(toggleDashboardModels(new Set(["a", "b", "c"]), ["a", "b"])).toEqual(["c"]);
	expect(toggleDashboardModels(new Set(["a", "c"]), ["a", "b"])).toEqual(["a", "c", "b"]);
});
it("restores frontier defaults, with a usable fallback for another publication", () => {
	expect(dashboardDefaultModels([model("Claude Sonnet 5.5"), model("GPT-6 Astra"), model("Old model")])).toEqual(["GPT-6 Astra"]);
	expect(dashboardDefaultModels([model("Other")])).toEqual(["Other"]);
});

it("starts with reasoning configurations and keeps non-reasoning available as an opt-in", () => {
	expect(dashboardDefaultEfforts(["none", "low", "high", "max", "default"])).toEqual(["low", "high", "max", "default"]);
});
