import { describe, it, expect, vi } from "vitest";
import { groupModelsByReleaseMonth, pickerAvailability, searchModels } from "./ModelCombobox";
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
		const monthLabel = vi.fn((date: Date) => date.toISOString().slice(0, 7));
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

describe("pickerAvailability", () => {
	const typed = (id: string, input: string, output: string) => ({ id, name: id, input_types: input, output_types: output }) as CompareModelOption;
	const clef = typed("cloudflare/clef", "text,image", "decisions");
	const elephant = typed("baselabs/elephant-1", "text,image", "decisions");
	const grok = typed("spacex-ai/grok-imagine-video-1.5", "text,image", "video");
	const untyped = typed("lab/unknown", "", "");

	it("lets anything join an empty selection", () => {
		expect(pickerAvailability(grok, null, [])).toEqual({ available: true });
	});

	it("matches on output type, and says what a mismatched model returns", () => {
		const required = new Set(["decisions"]);
		expect(pickerAvailability(elephant, required, [clef.id])).toEqual({ available: true });
		expect(pickerAvailability(grok, required, [clef.id])).toEqual({ available: false, reason: "returns", returns: ["video"] });
		expect(pickerAvailability(untyped, required, [clef.id])).toEqual({ available: false, reason: "returns", returns: [] });
	});

	it("always lets a selected model be removed, and blocks additions to a mixed selection", () => {
		expect(pickerAvailability(clef, new Set(), [clef.id, grok.id])).toEqual({ available: true });
		expect(pickerAvailability(elephant, new Set(), [clef.id, grok.id])).toEqual({ available: false, reason: "mixed" });
	});
});
