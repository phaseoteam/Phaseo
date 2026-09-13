export const METRICS = [
	{ id: "aa-intelligence-index", name: "Artificial Analysis Intelligence Index", field: "artificial_analysis_intelligence_index", higherBetter: true },
	{ id: "aa-coding-index", name: "Artificial Analysis Coding Index", field: "artificial_analysis_coding_index", higherBetter: true },
	{ id: "aa-agentic-index", name: "Artificial Analysis Agentic Index", field: "artificial_analysis_agentic_index", higherBetter: true },
	{ id: "aa-intelligence-index-cost", name: "Artificial Analysis Evaluation Cost (USD)", field: "total_cost", higherBetter: false },
] as const;

const supportedMajorVersions = new Set([4, 5]);
export const benchmarkId = (metric: typeof METRICS[number], version: number) => `${metric.id}-v${Math.floor(version)}`;
export type SourceModel = {
	id: string; name: string; slug: string;
	model_creator: { id: string; name: string };
	evaluations: Record<string, number | null> | null;
	artificial_analysis_intelligence_index_cost: { total_cost: number | null; cost_per_task?: { total_cost: number | null } } | null;
};
export type CatalogModel = {
	model_id: string; api_model_id?: string | null; organisation_id?: string | null; name?: string | null;
	benchmarks?: Array<Record<string, unknown>> | null;
};
export type MappingConfig = {
	// Canonical model ID -> stable Artificial Analysis model ID used to identify
	// the evaluated model family. All reasoning configurations in that family
	// are retained. null opts out.
	models: Record<string, string | null>;
	// Canonical organisation ID -> Artificial Analysis creator name or ID.
	creators: Record<string, string>;
};
const normalized = (value: string) => value.toLowerCase().replace(/\+/g, "plus").replace(/[^a-z0-9]+/g, "");
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const REASONING_EFFORTS = ["xhigh", "minimal", "medium", "high", "low", "max", "none"] as const;
const CONFIGURATION_GROUP = /\(([^)]*)\)/g;

function isReasoningConfiguration(value: string) {
	const normalizedValue = value.toLowerCase().replace(/[_-]+/g, " ").trim();
	return /\b(reasoning|thinking|effort)\b/.test(normalizedValue)
		|| REASONING_EFFORTS.some((effort) => normalizedValue === effort);
}

export function reasoningVariant(source: Pick<SourceModel, "name" | "slug">): string | null {
	for (const match of source.name.matchAll(CONFIGURATION_GROUP)) {
		const configuration = match[1]?.toLowerCase().replace(/[_-]+/g, " ") ?? "";
		for (const effort of REASONING_EFFORTS) {
			if (new RegExp(`\\b${effort}\\b`).test(configuration)) return effort;
		}
		if (/\bnon reasoning\b/.test(configuration)) return "none";
		if (/\b(reasoning|thinking)\b/.test(configuration)) return "reasoning";
	}
	return source.slug.toLowerCase().match(/-(xhigh|minimal|medium|high|low|max|none)(?:-effort)?$/)?.[1] ?? null;
}

function reasoningFamilyName(source: Pick<SourceModel, "name">) {
	return normalized(source.name.replace(CONFIGURATION_GROUP, (full, configuration: string) =>
		isReasoningConfiguration(configuration) ? "" : full));
}

export async function fetchModels(apiKey: string, fetcher: typeof fetch = fetch) {
	const models: SourceModel[] = [];
	const ids = new Set<string>();
	let version: number | undefined;
	for (let page = 1; page <= 100; page++) {
		const response = await fetcher(`https://artificialanalysis.ai/api/v2/language/models/free?page=${page}`, {
			headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) throw new Error(`Artificial Analysis returned HTTP ${response.status} on page ${page}; no data was written.`);
		const body = await response.json();
		if (!finite(body.intelligence_index_version) || !supportedMajorVersions.has(Math.floor(body.intelligence_index_version))) throw new Error("Unsupported Intelligence Index version. Add a new benchmark family before importing a new major version.");
		version ??= body.intelligence_index_version;
		if (version !== body.intelligence_index_version || body.pagination?.page !== page || typeof body.pagination?.has_more !== "boolean" || !Array.isArray(body.data)) throw new Error("Invalid or inconsistent Artificial Analysis pagination/version; no data was written.");
		for (const model of body.data) {
			if (!model || typeof model.id !== "string" || !model.id || typeof model.name !== "string" || typeof model.slug !== "string" || !/^[a-zA-Z0-9._-]+$/.test(model.slug) || typeof model.model_creator?.name !== "string" || typeof model.model_creator?.id !== "string" || ids.has(model.id)) throw new Error("Invalid or duplicate Artificial Analysis model; no data was written.");
			if (!Object.hasOwn(model, "evaluations") || !Object.hasOwn(model, "artificial_analysis_intelligence_index_cost")) throw new Error(`Missing benchmark fields for ${model.id}.`);
			for (const metric of METRICS) {
				const container = metric.field === "total_cost" ? model.artificial_analysis_intelligence_index_cost : model.evaluations;
				const score = container === null ? null : container?.[metric.field];
				if (score !== null && !finite(score)) throw new Error(`Invalid ${metric.field} for ${model.id}.`);
				if (metric.field === "total_cost" && finite(score) && score < 0) throw new Error(`Negative evaluation cost for ${model.id}.`);
			}
			ids.add(model.id); models.push(model);
		}
		if (!body.pagination.has_more) {
			if (!models.length) throw new Error("Artificial Analysis returned no models; no data was written.");
			if (version === undefined) throw new Error("Artificial Analysis did not return an index version.");
			return { models, version };
		}
	}
	throw new Error("Artificial Analysis pagination exceeded the daily request budget; no data was written.");
}

export function matchModel(model: CatalogModel, sources: SourceModel[], config: MappingConfig) {
	if (Object.hasOwn(config.models, model.model_id)) {
		const id = config.models[model.model_id];
		if (id === null) return { status: "excluded" as const, sources: [], candidates: [] };
		const source = sources.find((source) => source.id === id);
		if (!source) throw new Error(`Mapping for ${model.model_id} refers to missing Artificial Analysis ID ${id}.`);
		const family = reasoningFamilyName(source);
		const configurations = sources.filter((candidate) =>
			candidate.model_creator.id === source.model_creator.id
			&& reasoningFamilyName(candidate) === family);
		return { status: "matched" as const, source, sources: configurations, candidates: configurations };
	}
	const organisation = model.organisation_id ?? model.model_id.split("/")[0];
	const creators = new Set([organisation, config.creators[organisation]].filter((value): value is string => Boolean(value)).map(normalized));
	const eligible = sources.filter((source) => [source.model_creator.name, source.model_creator.id].some((value) => creators.has(normalized(value))));
	const ids = [model.model_id.split("/").at(-1), model.api_model_id?.split("/").at(-1), model.name].filter((id): id is string => Boolean(id)).map(normalized);
	// Never strip dates, quantization, thinking or effort suffixes: they change what was evaluated.
	const candidates = eligible.filter((source) => normalized(source.slug) === normalized(source.name)
		&& ids.includes(normalized(source.name)));
	return candidates.length === 1 ? { status: "matched" as const, source: candidates[0], sources: candidates, candidates }
		: { status: candidates.length ? "ambiguous" as const : "unmatched" as const, sources: [], candidates };
}

export function metricValue(source: SourceModel, metric: typeof METRICS[number]) {
	const value = metric.field === "total_cost" ? source.artificial_analysis_intelligence_index_cost?.total_cost : source.evaluations?.[metric.field];
	return finite(value) ? value : null;
}
export function matchModels(models: CatalogModel[], sources: SourceModel[], config: MappingConfig) {
	const explicitIds = Object.values(config.models).filter((id) => id !== null);
	if (new Set(explicitIds).size !== explicitIds.length) throw new Error("Each Artificial Analysis source must have only one explicit catalog mapping.");
	const initialMatches = models.map((model) => matchModel(model, sources, config));
	const directOwners = new Map<string, Set<string>>();
	for (let index = 0; index < initialMatches.length; index++) {
		const sourceId = initialMatches[index].source?.id;
		if (!sourceId) continue;
		const owners = directOwners.get(sourceId) ?? new Set<string>();
		owners.add(models[index].model_id);
		directOwners.set(sourceId, owners);
	}
	// A reasoning configuration with its own canonical catalogue model remains
	// attached to that model rather than being absorbed by a mapped family.
	const matches = initialMatches.map((match, index) => {
		if (!match.source || !Object.hasOwn(config.models, models[index].model_id)) return match;
		const familySources = match.sources.filter((source) => {
			const owners = directOwners.get(source.id);
			return !owners || owners.has(models[index].model_id);
		});
		return { ...match, sources: familySources, candidates: familySources };
	});
	const explicitlyMappedSources = new Map<string, string>();
	for (let index = 0; index < matches.length; index++) {
		if (!Object.hasOwn(config.models, models[index].model_id)) continue;
		for (const source of matches[index].sources ?? []) {
			const previous = explicitlyMappedSources.get(source.id);
			if (previous && previous !== models[index].model_id) {
				throw new Error(`Artificial Analysis source ${source.id} maps to both ${previous} and ${models[index].model_id}.`);
			}
			explicitlyMappedSources.set(source.id, models[index].model_id);
		}
	}
	return matches.map((match, index) => {
		if (!match.source || Object.hasOwn(config.models, models[index].model_id)) return match;
		const explicitOwner = explicitlyMappedSources.get(match.source.id);
		if (explicitOwner && explicitOwner !== models[index].model_id) {
			return { status: "ambiguous" as const, sources: [], candidates: match.candidates };
		}
		if (matches.some((other, otherIndex) => otherIndex !== index && other.source?.id === match.source.id)) {
			return { status: "ambiguous" as const, sources: [], candidates: match.candidates };
		}
		return match;
	});
}

export function resultsFor(source: SourceModel, version: number, allSources: SourceModel[], updated_at = new Date().toISOString()) {
	return METRICS.flatMap((metric) => {
		const score = metricValue(source, metric);
		if (score === null) return [];
		const scores = allSources.map((entry) => metricValue(entry, metric)).filter(finite);
		const rank = 1 + scores.filter((other) => metric.higherBetter ? other > score : other < score).length;
		const perTask = source.artificial_analysis_intelligence_index_cost?.cost_per_task?.total_cost;
		return [{ benchmark_id: benchmarkId(metric, version), score, is_self_reported: false, updated_at, variant: reasoningVariant(source),
			other_info: `${source.name}; Artificial Analysis ID ${source.id}; Intelligence Index v${version}${metric.field === "total_cost" && finite(perTask) ? `; USD ${perTask} per task` : ""}`,
			source_link: `https://artificialanalysis.ai/models/${source.slug}`, rank }];
	});
}
export function resultsForConfigurations(sources: SourceModel[], version: number, allSources: SourceModel[], updated_at = new Date().toISOString()) {
	return sources.flatMap((source) => resultsFor(source, version, allSources, updated_at));
}
export function mergeResults(model: CatalogModel, results: Array<Record<string, unknown>>, version: number) {
	const managed = new Set(METRICS.map((metric) => benchmarkId(metric, version)));
	return [...(model.benchmarks ?? []).filter((result) => !managed.has(String(result.benchmark_id))), ...results];
}
