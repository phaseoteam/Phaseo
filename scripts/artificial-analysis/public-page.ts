import { createHash } from "node:crypto";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Decode JSON transport only. Never execute scripts downloaded from the source. */
export function extractPublicModels(html: string, sourceUrl: string, fetchedAt: string | null) {
	const records = new Map<string, unknown>();
	let stream = "";
	for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
		const push = match[1].match(/^self\.__next_f\.push\((\[1,[\s\S]*\])\)\s*;?$/);
		if (!push) continue;
		const chunk: unknown = JSON.parse(push[1]);
		if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === "string") stream += chunk[1];
	}
	for (const line of stream.split("\n")) {
		const match = line.match(/^([\da-f]+):([\s\S]*)$/);
		if (!match) continue;
		try { records.set(match[1], JSON.parse(match[2])); } catch { /* Flight module and text records are not model JSON. */ }
	}
	const resolve = (value: unknown, seen = new Set<string>()): unknown => {
		if (typeof value === "string" && /^\$[\da-f]+$/.test(value)) {
			const id = value.slice(1);
			if (seen.has(id) || !records.has(id)) throw new Error(`Unresolved public data reference ${id}`);
			return resolve(records.get(id), new Set([...seen, id]));
		}
		if (Array.isArray(value)) return value.map((item) => resolve(item, seen));
		if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, seen)]));
		return value === "$undefined" ? null : value;
	};
	const numeric = (value: unknown, label: string, nonnegative = false) => {
		if (value === null || value === undefined || value === "$undefined") return null;
		if (typeof value !== "number" || !Number.isFinite(value) || (nonnegative && value < 0)) throw new Error(`Invalid ${label}`);
		return value;
	};
	const numericObject = (value: unknown, label: string) => {
		if (value === null || value === undefined) return null;
		if (!object(value)) throw new Error(`Invalid ${label}`);
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, numeric(item, `${label}.${key}`, true)]));
	};
	const models = new Map<string, JsonObject>();
	const walk = (value: unknown) => {
		if (!value || typeof value !== "object") return;
		if (object(value) && Object.hasOwn(value, "intelligenceIndex") && (Object.hasOwn(value, "canonicalIntelligenceIndexTokenCount") || Object.hasOwn(value, "intelligenceIndexEvaluations")) && typeof value.slug === "string") {
			const row = resolve(value) as JsonObject;
			if (typeof row.id !== "string" || !row.id || typeof row.name !== "string" || !/^[a-zA-Z0-9._-]+$/.test(row.slug as string)) throw new Error("Invalid public model identity");
			const evaluations = row.intelligenceIndexEvaluations;
			if (evaluations !== null && evaluations !== undefined && !Array.isArray(evaluations)) throw new Error("Invalid evaluation list");
			const result = {
				id: row.id, slug: row.slug, name: row.name, effort: row.effort ?? null,
				creator: row.creator ?? null,
				intelligenceIndex: numeric(row.intelligenceIndex, "intelligenceIndex"),
				intelligenceIndexIsEstimated: row.intelligenceIndexIsEstimated ?? null,
				totalTokens: numericObject(row.canonicalIntelligenceIndexTokenCount, "totalTokens"),
				outputTokensPerTask: numericObject(row.intelligenceIndexOutputTokensPerTask, "outputTokensPerTask"),
				totalCostUsd: numericObject(row.intelligenceIndexCost, "totalCostUsd"),
				costPerTaskUsd: object(row.intelligenceIndexCostPerTask) ? numericObject(row.intelligenceIndexCostPerTask.cost, "costPerTaskUsd") : null,
				timePerTaskSeconds: numeric(row.intelligenceIndexTimePerTask, "timePerTaskSeconds", true),
				evaluations: (evaluations as unknown[] | null | undefined ?? []).map((evaluation) => {
					if (!object(evaluation) || typeof evaluation.slug !== "string" || !evaluation.slug) throw new Error("Invalid evaluation identity");
					return { slug: evaluation.slug, score: numeric(evaluation.score, "score"), outputTokensPerTask: numeric(evaluation.outputTokensPerTask, "outputTokensPerTask", true), costPerTaskUsd: numeric(evaluation.costPerTask, "costPerTask", true), timePerTaskSeconds: numeric(evaluation.timePerTask, "timePerTask", true) };
				}),
			};
			const previous = models.get(row.id);
			if (previous && JSON.stringify(previous) !== JSON.stringify(result)) throw new Error(`Conflicting public rows for ${row.id}`);
			models.set(row.id, result);
			return;
		}
		for (const item of Object.values(value)) walk(item);
	};
	for (const record of records.values()) walk(record);
	if (!models.size) throw new Error("No model data found; public page format may have changed");
	const versions = [...new Set([...html.matchAll(/(?:Intelligence Index|Current version:)[\s\S]{0,30}?v(\d+\.\d+(?:\.\d+)?)/g)].map((match) => match[1]))];
	return { source: "artificial_analysis_public_page", sourceUrl, fetchedAt, sha256: createHash("sha256").update(html).digest("hex"), methodologyVersions: versions, coverage: "page_selection_only", models: [...models.values()] };
}
