import { groupModelsByReleaseMonth, searchModels } from "./ModelCombobox";
import type { CompareModelOption } from "./types";

const model = (id: string, name: string, releaseDate: string | null) =>
	({ id, name, release_date: releaseDate }) as CompareModelOption;

describe("groupModelsByReleaseMonth", () => {
	const models = [
		model("a/old", "Old", "2025-11-03"),
		model("a/beta", "beta", "2026-01-10"),
		model("a/undated", "Undated", null),
		model("a/alpha", "Alpha", "2026-01-10"),
		model("a/newest", "Newest", "2026-01-28"),
		model("a/bad-date", "Bad date", "not a date"),
	];

	it("orders months newest first with undated models last, and models newest first then by name", () => {
		const groups = groupModelsByReleaseMonth(models, (date) => `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`, "Unknown");
		expect(groups.map((group) => [group.monthKey, group.monthLabel])).toEqual([
			["2026-01", "2026-1"],
			["2025-11", "2025-11"],
			["unknown", "Unknown"],
		]);
		expect(groups[0].models.map((m) => m.id)).toEqual(["a/newest", "a/alpha", "a/beta"]);
		// Undated models tie on date, so they sort by name.
		expect(groups[2].models.map((m) => m.id)).toEqual(["a/bad-date", "a/undated"]);
	});

	it("labels each month once, not once per model", () => {
		const monthLabel = jest.fn((date: Date) => date.toISOString().slice(0, 7));
		groupModelsByReleaseMonth(models, monthLabel, "Unknown");
		expect(monthLabel).toHaveBeenCalledTimes(2);
	});
});

describe("searchModels", () => {
	// Real catalogue names from 21 Oct 2026.
	const qwen = (id: string, name: string, releaseDate: string | null, routed: boolean) =>
		({ id, name, release_date: releaseDate, provider: { provider_id: "qwen", name: "Qwen" }, routed }) as CompareModelOption;
	const catalogue = [
		qwen("qwen/qwen-max", "Qwen Max", null, false),
		qwen("qwen/qwen3-max", "Qwen3 Max", null, true),
		qwen("qwen/qwen3.8-max-0902", "Qwen 3.8 Max 0902", "2026-09-02", true),
		qwen("qwen/qwen3.7-max-preview", "Qwen 3.7 Max Preview", "2026-05-25", false),
		qwen("qwen/qwen3.8-coder", "Qwen 3.8 Coder", "2026-08-01", true),
	];

	it("matches every word in any order, so \"qwen max\" finds Qwen 3.8 Max", () => {
		expect(searchModels(catalogue, "qwen max").map((m) => m.id)).toEqual([
			"qwen/qwen3.8-max-0902",
			"qwen/qwen3-max",
			"qwen/qwen3.7-max-preview",
			"qwen/qwen-max",
		]);
		expect(searchModels(catalogue, "max 3.8").map((m) => m.id)).toEqual(["qwen/qwen3.8-max-0902"]);
	});

	it("puts models Phaseo routes first", () => {
		expect(searchModels(catalogue, "qwen")[0]!.routed).toBe(true);
		expect(searchModels(catalogue, "  ")).toBe(catalogue);
	});
});
