import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const methodologyVersions = (html: string) => [...new Set([...html.matchAll(/(?:Intelligence Index|Current version:)[\s\S]{0,30}?v(\d+\.\d+(?:\.\d+)?)/g)].map((match) => match[1]))];

export function publicDataManifest(html: string) {
	const stream = [...html.matchAll(/<script\b[^>]*>self\.__next_f\.push\((\[1,[\s\S]*?\])\)\s*;?<\/script>/g)].map((match) => JSON.parse(match[1])[1]).join("");
	const manifests: Array<{ path: string; key: string }> = [];
	const walk = (value: unknown) => {
		if (!value || typeof value !== "object") return;
		if (object(value) && Object.hasOwn(value, "initialModels") && object(value.manifest)) {
			const { path, key } = value.manifest;
			if (typeof path !== "string" || !/^\/data\/[a-f\d]+\.txt$/.test(path) || typeof key !== "string" || !/^[a-f\d]{64}$/.test(key)) throw new Error("Invalid public model manifest");
			manifests.push({ path, key });
		}
		for (const item of Object.values(value)) walk(item);
	};
	for (const line of stream.split("\n")) {
		const match = line.match(/^[a-f\d]+:([\s\S]*)$/);
		if (!match) continue;
		let value: unknown;
		try { value = JSON.parse(match[1]); } catch { continue; }
		walk(value);
	}
	const unique = [...new Map(manifests.map((manifest) => [JSON.stringify(manifest), manifest])).values()];
	if (unique.length !== 1) throw new Error("Expected one full-model data manifest; page format may have changed");
	return unique[0];
}

/** Same public data decoding used by AA's unauthenticated browser client. */
export function decodePublicData(bytes: Buffer, keyHex: string) {
	if (!/^[a-f\d]{64}$/.test(keyHex) || bytes.length < 17) throw new Error("Invalid public dataset envelope");
	const key = Buffer.from(keyHex, "hex");
	const iv = createHash("sha256").update(key).digest().subarray(0, 12);
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(bytes.subarray(-16));
	const compressed = Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]);
	const data: unknown = JSON.parse(gunzipSync(compressed, { maxOutputLength: 50_000_000 }).toString("utf8"));
	if (!object(data) || !Array.isArray(data.models) || !data.models.length) throw new Error("Full model dataset is empty or malformed");
	return data.models;
}

export function extractFullPublicModels(html: string, bytes: Buffer, sourceUrl: string, fetchedAt: string) {
	const manifest = publicDataManifest(html);
	const models = decodePublicData(bytes, manifest.key);
	const stream = `<script>self.__next_f.push(${JSON.stringify([1, `a:${JSON.stringify(models)}\n`]).replace(/</g, "\\u003c")})</script>`;
	const snapshot = extractPublicModels(stream, sourceUrl, fetchedAt);
	if (snapshot.models.length !== models.length) throw new Error("Full dataset contains missing or duplicate model identities");
	return { ...snapshot, methodologyVersions: methodologyVersions(html), sha256: createHash("sha256").update(bytes).digest("hex"), pageSha256: createHash("sha256").update(html).digest("hex"), dataUrl: new URL(manifest.path, sourceUrl).href, coverage: "full_frontend_dataset" };
}

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
				id: row.id, slug: row.slug, name: row.name, effort: object(row.effort) && typeof row.effort.slug === "string" ? row.effort.slug : typeof row.effort === "string" ? row.effort : null,
				creator: row.creator ?? null,
				intelligenceIndex: numeric(row.intelligenceIndex, "intelligenceIndex"),
				intelligenceIndexIsEstimated: row.intelligenceIndexIsEstimated ?? null,
				capabilityScores: object(row.capabilities) ? Object.fromEntries(Object.entries(row.capabilities).map(([key, value]) => [key, numeric(value, `capabilities.${key}`)])) : null,
				modelDetails: Object.fromEntries(["releaseDate", "knowledgeCutoffDate", "isReasoning", "isOpenWeights", "openSourceCategorization", "parameters", "inferenceParametersActiveBillions", "sizeClass", "contextWindowTokens", "licenseName", "licenseUrl", "modelWeightsSourceUrl", "deprecated", "inputModalityText", "inputModalityImage", "inputModalitySpeech", "inputModalityVideo", "outputModalityText", "outputModalityImage", "outputModalitySpeech", "outputModalityVideo"].filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])),
				pricing: Object.fromEntries(["price1mInputTokens", "price1mOutputTokens", "cacheHitPrice", "cacheWritePrice", "cacheHitDiscountPercent"].filter((key) => Object.hasOwn(row, key)).map((key) => [key, numeric(row[key], key, true)])),
				performance: Object.fromEntries(["timescaleData", "outputSpeedVariance", "timeToFirstChunkVariance", "performanceByPromptType", "endToEndResponseTime", "timeToFirstAnswerToken", "performanceDataSource"].filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])),
				breakdowns: Object.fromEntries(["openness", "briefcaseBreakdown"].filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])),
				sourceData: row,
				benchmarkScores: Object.fromEntries(["omniscience", "omniscienceAccuracy", "omniscienceHallucinationRate", "mlcrOverall", "gdpPdfAllPass", "gdpval", "gdpvalNormalized", "itBenchSre", "tau2", "tauBanking", "terminalbenchHard", "terminalBench21", "terminalBench40", "frontierCode", "terminalBenchScience", "hleDiamond", "scicode", "lcr", "ifbench", "hle", "gpqa", "critpt", "apexAgents", "mmmuPro", "livecodebench", "aime25", "analystAgent", "automationBenchPartialScore", "enterpriseOpsGym", "harveyLab"].filter((key) => Object.hasOwn(row, key)).map((key) => [key, numeric(row[key], key)])),
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
	return { source: "artificial_analysis_public_page", sourceUrl, fetchedAt, sha256: createHash("sha256").update(html).digest("hex"), methodologyVersions: methodologyVersions(html), coverage: "page_selection_only", models: [...models.values()] };
}
