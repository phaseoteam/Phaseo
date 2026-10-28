import { describe, expect, it } from "vitest";
import { emptyModelFilters, filterModels } from "./modelFilters";
import type { ModelOption } from "../../shared/workspace";

const now = Date.parse("2026-10-05T12:00:00Z");
const models: ModelOption[] = [
	{ id: "openai/new", name: "New GPT", organisationId: "openai", organisationName: "OpenAI", releaseDate: "2026-10-04" },
	{ id: "other/model:free", name: "Free model", organisationId: "other", releaseDate: "2026-09-01" },
	{ id: "other/future", name: "Future model", releaseDate: "2026-10-06" },
	{ id: "other/unknown", name: "Unknown date", releaseDate: "invalid" },
];
describe("model filters", () => {
	it("combines search, organization and quick filters", () => {
		expect(filterModels(models, "GPT openai", { ...emptyModelFilters, organisation: "openai", new: true, favorites: true }, ["openai/new"], now).map(model => model.id)).toEqual(["openai/new"]);
		expect(filterModels(models, "", { ...emptyModelFilters, organisation: "openai", free: true }, [], now)).toEqual([]);
	});
	it("matches the web's free suffix and fourteen-day New window", () => {
		expect(filterModels(models, "", { ...emptyModelFilters, free: true }, [], now).map(model => model.id)).toEqual(["other/model:free"]);
		expect(filterModels(models, "", { ...emptyModelFilters, new: true }, [], now).map(model => model.id)).toEqual(["openai/new"]);
	});
	it("filters the complete catalog before limiting rendered results", () => {
		const large = Array.from({ length: 300 }, (_, index) => ({ id: `owner/${index}`, name: `Model ${index}` }));
		expect(filterModels(large, "299", emptyModelFilters, [], now).map(model => model.id)).toEqual(["owner/299"]);
		expect(filterModels(models, "", emptyModelFilters, [], now)).toEqual(models);
	});
});
