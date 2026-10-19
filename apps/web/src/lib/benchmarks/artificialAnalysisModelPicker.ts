import type { DashboardRow } from "./artificialAnalysisDashboard";

// Presentation groups mirror the current frontier picker; scores never decide size tiers.
const frontier = /^(GPT-6(?:\.|\s)|Claude (?:Opus 5\.5|Fable 5\.1|Sonnet 5\.5|Haiku 5\.5)|Gemini (?:4 Argon|3\.8 Flash)|Grok 4\.7|Muse Wonder)/i;
const notable = /(?:Muse Spark 1\.3|Kimi K3|GLM.?5\.3|DeepSeek.?V4(?:\.1)?|MiMo.?V2\.6|MiniMax.?M3\.1)/i;
export function dashboardModelCategory(row: DashboardRow): "frontier" | "notable" | "openWeights" | "older" | "other" {
	if (row.deprecated) return "older";
	if (frontier.test(row.modelName)) return "frontier";
	if (notable.test(row.modelName)) return "notable";
	return row.isOpenWeights ? "openWeights" : "other";
}
export function dashboardModelTier(row: DashboardRow): "small" | "medium" | "large" {
	return /Luna|Haiku/i.test(row.modelName) ? "small" : /Sonnet|Flash/i.test(row.modelName) ? "medium" : "large";
}
export function dashboardDefaultModels(models: DashboardRow[]) {
	const current = models.filter((row) => dashboardModelCategory(row) === "frontier" && !/Sonnet|3\.8 Flash/i.test(row.modelName));
	return (current.length ? current : models.slice(0, 10)).map((row) => row.modelId);
}
export function toggleDashboardModels(selected: Set<string>, ids: string[]) {
	const next = new Set(selected);
	const remove = ids.every((id) => selected.has(id));
	for (const id of ids) if (remove) next.delete(id); else next.add(id);
	return [...next];
}

export function dashboardDefaultEfforts(efforts: string[]) {
	return efforts.filter((effort) => effort !== "none");
}
