import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
	buildVeniceChangelogDiscordSection,
	matchVeniceChangelogEntry,
	parseVeniceChangelog,
	runVeniceChangelogCheck,
	selectVeniceChangelogItems,
	veniceChangelogEntryKey,
	type VeniceChangelogEntry,
	type VeniceRouteRow,
} from "./venice-changelog";

const fixture = readFileSync(
	path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "venice-changelog.md"),
	"utf8",
);

function route(id: string, slug: string, overrides: Partial<VeniceRouteRow> = {}): VeniceRouteRow {
	return {
		provider_model_id: id,
		provider_slug: id.split(":")[0],
		provider_model_slug: slug,
		status: "active",
		effective_to: null,
		...overrides,
	};
}

function find(entries: VeniceChangelogEntry[], kind: VeniceChangelogEntry["kind"], modelId: string): VeniceChangelogEntry {
	const entry = entries.find((candidate) => candidate.kind === kind && candidate.modelId === modelId);
	if (!entry) throw new Error(`missing ${kind} ${modelId}`);
	return entry;
}

describe("parseVeniceChangelog", () => {
	const entries = parseVeniceChangelog(fixture);

	it("returns one entry per dated model bullet id, for every kind", () => {
		const kinds = new Set(entries.map((entry) => entry.kind));
		expect(kinds).toEqual(new Set(["added", "deprecated", "removed", "price_change", "removal_cancelled"]));
		expect(entries).toHaveLength(27);
	});

	it("reads removal dates and replacements from deprecations", () => {
		expect(find(entries, "deprecated", "gemma-4-uncensored")).toEqual({
			date: "2026-11-10",
			kind: "deprecated",
			modelId: "gemma-4-uncensored",
			modelName: "Gemma 4 Uncensored",
			removalDate: "2026-11-18",
			replacementId: "google-gemma-4-26b-a4b-it",
			detail: "removed on November 18, 2026; use `google-gemma-4-26b-a4b-it` instead",
		});
		expect(find(entries, "deprecated", "kimi-k2-5")).toMatchObject({ date: "2026-11-04", removalDate: "2026-11-18", replacementId: null });
	});

	it("never treats the replacement id as a subject of the entry", () => {
		expect(entries.some((entry) => entry.modelId === "google-gemma-4-26b-a4b-it")).toBe(false);
	});

	it("reads plain-name removals and multi-id bullets", () => {
		expect(find(entries, "removed", "claude-opus-4-8-fast")).toMatchObject({
			date: "2026-11-13",
			modelName: "Claude Opus 4.8 Fast",
			removalDate: null,
			detail: "",
		});
		const seedance = entries.filter((entry) => entry.kind === "removed" && entry.modelId.startsWith("seedance-1-5-pro"));
		expect(seedance.map((entry) => entry.modelId)).toEqual([
			"seedance-1-5-pro-text-to-video-basic",
			"seedance-1-5-pro-image-to-video-basic",
		]);
	});

	it("keeps raw price-change text, unescaping Markdown", () => {
		expect(find(entries, "price_change", "kimi-k3-1-pro").detail).toBe(
			"input $3.75 to $2.00, output $18.75 to $10.00, cache read $0.375 to $0.20 per 1M tokens",
		);
		expect(find(entries, "added", "seedream-v5-5-edit").detail).toBe("from $0.03 per edit");
		// Two price changes for one model on one day are distinct entries.
		const seedreamEdit = entries.filter((entry) => entry.kind === "price_change" && entry.modelId === "seedream-v5-5-edit");
		expect(seedreamEdit).toHaveLength(2);
	});

	it("reads cancelled removals", () => {
		expect(find(entries, "removal_cancelled", "deepseek-v4-1-flash")).toMatchObject({ date: "2026-11-10" });
	});

	it("skips monthly API prose but resumes at the next day heading", () => {
		const ids = new Set(entries.map((entry) => entry.modelId));
		for (const proseId of ["gpt-4o", "default", "openai-gpt-4o-2024-11-20", "llama-3.3-70b"]) {
			expect(ids.has(proseId)).toBe(false);
		}
		expect(find(entries, "deprecated", "claude-sonnet-4-5")).toMatchObject({ date: "2026-10-01", removalDate: "2026-10-30" });
		expect(entries.filter((entry) => entry.modelId === "hermes-3-llama-3.1-405b").map((entry) => [entry.date, entry.removalDate])).toEqual([
			["2026-11-02", null],
			["2026-10-01", "2026-11-02"],
		]);
	});

	it("returns nothing for a page without day headings", () => {
		expect(parseVeniceChangelog("**October 2026**\n\n* **Feature** — `gpt-4o`: `x` now works")).toEqual([]);
	});

	it("keys change when Venice moves a removal date", () => {
		const entry = find(entries, "deprecated", "gemma-4-uncensored");
		expect(veniceChangelogEntryKey(entry)).not.toBe(veniceChangelogEntryKey({ ...entry, removalDate: "2026-11-25" }));
		expect(veniceChangelogEntryKey(entry)).toBe(veniceChangelogEntryKey({ ...entry, modelName: "Renamed" }));
	});
});

describe("matchVeniceChangelogEntry", () => {
	const entries = parseVeniceChangelog(fixture);

	it("asks for an end date on a deprecated route without one", () => {
		const item = matchVeniceChangelogEntry(find(entries, "deprecated", "gemma-4-uncensored"), [
			route("venice:venice/gemma-4-uncensored", "gemma-4-uncensored"),
		]);
		expect(item.routeIds).toEqual(["venice:venice/gemma-4-uncensored"]);
		expect(item.actions).toEqual([
			"set effective_to 2026-11-18 on venice:venice/gemma-4-uncensored; Venice suggests `google-gemma-4-26b-a4b-it`",
		]);
	});

	it("treats a route already ending by the removal date as handled", () => {
		const item = matchVeniceChangelogEntry(find(entries, "deprecated", "gemma-4-uncensored"), [
			route("venice:venice/gemma-4-uncensored", "gemma-4-uncensored", { effective_to: "2026-11-18 00:00:00+00" }),
		]);
		expect(item.actions).toEqual([]);
	});

	it("flags a later end date than the removal date", () => {
		const item = matchVeniceChangelogEntry(find(entries, "deprecated", "kimi-k2-5"), [
			route("venice:moonshotai/kimi-k2.5", "kimi-k2-5", { effective_to: "2026-12-01T00:00:00Z" }),
		]);
		expect(item.actions).toEqual(["set effective_to 2026-11-18 on venice:moonshotai/kimi-k2.5"]);
	});

	it("asks to retire live routes for removed models and ignores retired ones", () => {
		const entry = find(entries, "removed", "mercury-2");
		expect(matchVeniceChangelogEntry(entry, [route("venice:inception/mercury-2", "mercury-2")]).actions).toEqual([
			"set effective_to 2026-11-09 and retire venice:inception/mercury-2 (removed upstream)",
		]);
		expect(matchVeniceChangelogEntry(entry, [
			route("venice:inception/mercury-2", "mercury-2", { status: "retired", effective_to: "2026-11-09T00:00:00Z" }),
			route("venice-e2ee:inception/mercury-2", "mercury-2", { status: "disabled" }),
		]).actions).toEqual([]);
	});

	it("matches venice-e2ee routes and reports unrouted additions", () => {
		const entry = find(entries, "added", "e2ee-kimi-k3-1-pro-p");
		expect(matchVeniceChangelogEntry(entry, []).actions).toEqual([
			"no Phaseo route for `e2ee-kimi-k3-1-pro-p`; review for onboarding",
		]);
		expect(matchVeniceChangelogEntry(entry, [
			route("venice-e2ee:moonshotai/kimi-k3.1-pro", "e2ee-kimi-k3-1-pro-p"),
		])).toMatchObject({ routeIds: ["venice-e2ee:moonshotai/kimi-k3.1-pro"], actions: [] });
	});

	it("asks for a pricing check on routed price changes", () => {
		const item = matchVeniceChangelogEntry(find(entries, "price_change", "qwen-4-max"), [
			route("venice:qwen/qwen4-max", "qwen-4-max", { status: "degraded" }),
		]);
		expect(item.actions).toHaveLength(1);
		expect(item.actions[0]).toMatch(/^check pricing on venice:qwen\/qwen4-max: input \$1\.875 to \$1\.50/);
	});

	it("asks to review an end date when a removal is cancelled", () => {
		const entry = find(entries, "removal_cancelled", "deepseek-v4-1-flash");
		expect(matchVeniceChangelogEntry(entry, [route("venice:deepseek-v4-1-flash", "deepseek-v4-1-flash")]).actions).toEqual([]);
		expect(matchVeniceChangelogEntry(entry, [
			route("venice:deepseek-v4-1-flash", "deepseek-v4-1-flash", { effective_to: "2026-11-15T00:00:00Z" }),
		]).actions).toEqual(["review effective_to 2026-11-15 on venice:deepseek-v4-1-flash (Venice cancelled the removal)"]);
	});
});

describe("selectVeniceChangelogItems", () => {
	const entries = parseVeniceChangelog(fixture);
	const routes = [
		route("venice:venice/gemma-4-uncensored", "gemma-4-uncensored"),
		route("venice:moonshotai/kimi-k2.5", "kimi-k2-5", { effective_to: "2026-11-18T00:00:00Z" }),
		route("venice:inception/mercury-2", "mercury-2"),
		route("venice:moonshotai/kimi-k3.1-pro", "kimi-k3-1-pro"),
	];

	it("reports only open lifecycle actions on a baseline run", () => {
		const { items, newEntries } = selectVeniceChangelogItems({ entries, seenKeys: null, routes });
		expect(newEntries).toBe(entries.length);
		expect(items.map((item) => `${item.entry.kind}:${item.entry.modelId}`)).toEqual([
			"deprecated:gemma-4-uncensored",
			"removed:mercury-2",
		]);
	});

	it("lets the newest lifecycle entry for a model win", () => {
		const history = parseVeniceChangelog([
			"**November 10, 2026**", "", "**No longer scheduled for removal**", "",
			"* DeepSeek V4.1 Flash: `deepseek-v4-1-flash`", "",
			"**November 6, 2026**", "", "**Deprecated**", "",
			"* DeepSeek V4.1 Flash: `deepseek-v4-1-flash`, removed on November 15, 2026; use `deepseek-v4-1-flash-1017` instead",
			"* DeepSeek V3.2: `deepseek-v3.2`, removed on October 28, 2026", "",
			"**October 7, 2026**", "", "**Deprecated**", "",
			"* DeepSeek V3.2: `deepseek-v3.2`, removed on October 21, 2026",
		].join("\n"));
		const { items } = selectVeniceChangelogItems({
			entries: history,
			seenKeys: null,
			routes: [
				route("venice:deepseek-v4-1-flash", "deepseek-v4-1-flash"),
				route("venice:deepseek/deepseek-v3.2", "deepseek-v3.2"),
			],
		});
		expect(items.map((item) => item.actions)).toEqual([["set effective_to 2026-10-28 on venice:deepseek/deepseek-v3.2"]]);
	});

	it("reports every unseen entry after the baseline", () => {
		const seenKeys = new Set(entries.filter((entry) => entry.date < "2026-11-17").map(veniceChangelogEntryKey));
		const { items, newEntries } = selectVeniceChangelogItems({ entries, seenKeys, routes });
		expect(newEntries).toBe(2);
		expect(items.map((item) => `${item.entry.kind}:${item.entry.modelId}:${item.actions.length}`)).toEqual([
			"added:e2ee-kimi-k3-1-pro-p:1",
			"price_change:qwen-4-max:0",
		]);
	});
});

describe("buildVeniceChangelogDiscordSection", () => {
	it("lists actions first with the changelog link, then entries needing nothing", () => {
		const entries = parseVeniceChangelog(fixture);
		const { items } = selectVeniceChangelogItems({
			entries: entries.filter((entry) => entry.date === "2026-11-17"),
			seenKeys: new Set(),
			routes: [],
		});
		const section = buildVeniceChangelogDiscordSection({
			enabled: true,
			executed: true,
			baselineInitialized: false,
			unchanged: false,
			entriesParsed: entries.length,
			newEntries: items.length,
			items,
			updatesDetected: items.length,
		});
		expect(section).toBe([
			"Venice changelog: 2 new entries, 1 needs action (https://docs.venice.ai/changelog).",
			"- 2026-11-17 added `e2ee-kimi-k3-1-pro-p`: no Phaseo route for `e2ee-kimi-k3-1-pro-p`; review for onboarding",
			"No route change needed: price change qwen-4-max",
		].join("\n"));
	});
});

describe("runVeniceChangelogCheck", () => {
	it("baselines, then skips route lookups while the entries are unchanged", async () => {
		const loadRoutes = vi.fn(async () => [route("venice:venice/gemma-4-uncensored", "gemma-4-uncensored")]);
		const first = await runVeniceChangelogCheck({ previous: undefined, fetchMarkdown: async () => fixture, loadRoutes });
		expect(first.summary).toMatchObject({ baselineInitialized: true, updatesDetected: 1, entriesParsed: 27 });
		expect(first.stateToSave?.providerId).toBe("venice-changelog");
		expect(first.stateToSave?.contentLines).toHaveLength(27);

		const previous = { fingerprint: first.stateToSave!.fingerprint, content_lines: first.stateToSave!.contentLines };
		const second = await runVeniceChangelogCheck({ previous, fetchMarkdown: async () => `${fixture}\n\n**November 2026**\n\n* **New Prose** — text`, loadRoutes });
		expect(second.summary).toMatchObject({ unchanged: true, updatesDetected: 0 });
		expect(second.stateToSave).toBeNull();
		expect(loadRoutes).toHaveBeenCalledTimes(1);

		const added = fixture.replace(
			"**November 17, 2026**\n\n**Added**\n",
			"**November 17, 2026**\n\n**Added**\n\n* New Model: `new-model`, $1.00 input and $2.00 output per 1M tokens\n",
		);
		const third = await runVeniceChangelogCheck({ previous, fetchMarkdown: async () => added, loadRoutes });
		expect(third.summary).toMatchObject({ baselineInitialized: false, newEntries: 1, updatesDetected: 1 });
		expect(third.summary.items[0].actions).toEqual(["no Phaseo route for `new-model`; review for onboarding"]);
	});

	it("fails loudly when the page no longer parses", async () => {
		await expect(runVeniceChangelogCheck({ previous: undefined, fetchMarkdown: async () => "<html></html>", loadRoutes: async () => [] }))
			.rejects.toThrow(/no model entries/);
	});
});
