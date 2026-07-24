export const CACHE_SCOPE_IDS = [
	"search",
	"catalogue",
	"model",
	"provider",
	"organisation",
	"benchmark",
	"apps",
	"landing",
	"rankings",
	"updates",
	"pricing",
	"all-public",
] as const;

export type CacheScopeId = (typeof CACHE_SCOPE_IDS)[number];

export type CacheScopeDefinition = {
	id: CacheScopeId;
	label: string;
	description: string;
	targetLabel?: string;
	targetPlaceholder?: string;
	targetRequired: boolean;
	affectsSearch: boolean;
	danger: "normal" | "high";
	tags: readonly string[];
};

const SEARCH_TAGS = ["web-api-search", "web-api-cache-generation"] as const;

const CATALOGUE_TAGS = [
	"web-api-models",
	"web-api-models-v2",
	"web-api-model-details",
	"web-api-model-benchmarks",
	"web-api-model-timelines",
	"web-api-model-subscriptions",
	"web-api-model-pricing",
	"web-api-model-performance",
	"web-api-model-pricing-history",
	"web-api-model-usage-daily",
	"web-api-model-realtime",
	"web-api-model-token-trajectories",
	"web-api-model-provider-health",
	"web-api-provider-routing-health",
	"web-api-model-notices",
	"web-api-model-apps",
	"web-api-catalog-pricing",
	"web-api-free-router-overview",
	"web-api-compare",
	"web-api-reference-data",
	"web-api-organisations",
	"web-api-organisations-details",
	"web-api-organisations-headers",
	"web-api-organisations-models",
	"web-api-benchmarks",
	"web-api-providers",
	"web-api-families",
	"web-api-subscription-plans",
	"web-api-countries",
	"web-api-collections",
	"web-api-search",
	"web-api-cache-generation",
] as const;

const ALL_PUBLIC_TAGS = [
	...CATALOGUE_TAGS,
	"web-api-sources",
	"web-api-updates",
	"web-api-updates-web",
	"web-api-updates-youtube",
	"web-api-updates-latest",
	"web-api-model-updates",
	"web-api-apps",
	"web-api-app-ids",
	"web-api-app-images",
	"web-api-app-model-mappings",
	"web-api-app-rankings",
	"web-api-app-usage",
	"web-api-marketplace",
	"web-api-marketplace-presets",
	"web-api-landing",
	"web-api-landing-stats",
	"web-api-landing-model-stats",
	"web-api-landing-main-models",
	"web-api-gateway-showcase",
	"web-api-rankings",
	"web-api-ranking-metadata",
	"web-api-pricing-models",
	"web-api-gateway-models",
	"web-api-monitor-history",
	"web-api-og",
] as const;

const DEFINITIONS: Record<CacheScopeId, CacheScopeDefinition> = {
	search: {
		id: "search",
		label: "Global search",
		description: "Refresh the compact Ctrl+K model and navigation index.",
		targetRequired: false,
		affectsSearch: true,
		danger: "normal",
		tags: SEARCH_TAGS,
	},
	catalogue: {
		id: "catalogue",
		label: "Models and providers",
		description: "Refresh public catalogue, model, provider, reference, compare, and search data.",
		targetRequired: false,
		affectsSearch: true,
		danger: "normal",
		tags: CATALOGUE_TAGS,
	},
	model: {
		id: "model",
		label: "One model",
		description: "Refresh one model plus catalogue surfaces that can list it.",
		targetLabel: "Model ID",
		targetPlaceholder: "openai/gpt-5",
		targetRequired: true,
		affectsSearch: true,
		danger: "normal",
		tags: CATALOGUE_TAGS,
	},
	provider: {
		id: "provider",
		label: "One API provider",
		description: "Refresh one provider plus catalogue and search surfaces.",
		targetLabel: "Provider ID",
		targetPlaceholder: "openai",
		targetRequired: true,
		affectsSearch: true,
		danger: "normal",
		tags: Array.from(new Set(["web-api-providers", "web-api-provider-telemetry", "web-api-provider-updates", ...CATALOGUE_TAGS])),
	},
	organisation: {
		id: "organisation",
		label: "One organisation",
		description: "Refresh one organisation plus catalogue and search surfaces.",
		targetLabel: "Organisation ID",
		targetPlaceholder: "anthropic",
		targetRequired: true,
		affectsSearch: true,
		danger: "normal",
		tags: CATALOGUE_TAGS,
	},
	benchmark: {
		id: "benchmark",
		label: "Benchmarks",
		description: "Refresh all benchmark data, or include one benchmark-specific tag.",
		targetLabel: "Benchmark ID (optional)",
		targetPlaceholder: "mmlu-pro",
		targetRequired: false,
		affectsSearch: true,
		danger: "normal",
		tags: ["web-api-benchmarks", "web-api-model-benchmarks", "web-api-reference-data", ...SEARCH_TAGS],
	},
	apps: {
		id: "apps",
		label: "Apps",
		description: "Refresh public app data, rankings, images, usage, and landing references.",
		targetLabel: "App ID (optional)",
		targetPlaceholder: "App UUID",
		targetRequired: false,
		affectsSearch: false,
		danger: "normal",
		tags: ["web-api-apps", "web-api-app-ids", "web-api-app-images", "web-api-app-model-mappings", "web-api-app-rankings", "web-api-app-usage", "web-api-landing"],
	},
	landing: {
		id: "landing",
		label: "Landing pages",
		description: "Refresh public landing metrics, model highlights, and gateway showcase.",
		targetRequired: false,
		affectsSearch: false,
		danger: "normal",
		tags: ["web-api-landing", "web-api-landing-stats", "web-api-landing-model-stats", "web-api-landing-main-models", "web-api-gateway-showcase"],
	},
	rankings: {
		id: "rankings",
		label: "Rankings",
		description: "Refresh model and app ranking data and metadata.",
		targetRequired: false,
		affectsSearch: false,
		danger: "normal",
		tags: ["web-api-rankings", "web-api-ranking-metadata", "web-api-app-rankings"],
	},
	updates: {
		id: "updates",
		label: "Updates",
		description: "Refresh model, web, YouTube, and latest-update feeds.",
		targetRequired: false,
		affectsSearch: false,
		danger: "normal",
		tags: ["web-api-updates", "web-api-updates-web", "web-api-updates-youtube", "web-api-updates-latest", "web-api-model-updates"],
	},
	pricing: {
		id: "pricing",
		label: "Pricing",
		description: "Refresh catalogue, model, subscription, and public pricing projections.",
		targetRequired: false,
		affectsSearch: false,
		danger: "normal",
		tags: ["web-api-pricing-models", "web-api-catalog-pricing", "web-api-model-pricing", "web-api-model-pricing-history", "web-api-subscription-plans"],
	},
	"all-public": {
		id: "all-public",
		label: "All public Worker data",
		description: "Incident recovery only. Purge every named public Worker cache family.",
		targetRequired: false,
		affectsSearch: true,
		danger: "high",
		tags: ALL_PUBLIC_TAGS,
	},
};

function dynamicTag(prefix: string, targetId: string) {
	return `${prefix}${encodeURIComponent(targetId).replace(/%/g, "")}`.slice(0, 128);
}

export function isCacheScopeId(value: string): value is CacheScopeId {
	return CACHE_SCOPE_IDS.includes(value as CacheScopeId);
}

export function listCacheScopes(): CacheScopeDefinition[] {
	return CACHE_SCOPE_IDS.map((id) => DEFINITIONS[id]);
}

export function resolveCacheScope(scope: CacheScopeId, rawTargetId?: string | null) {
	const definition = DEFINITIONS[scope];
	const targetId = rawTargetId?.trim() || null;
	if (definition.targetRequired && !targetId) {
		throw new Error(`${definition.targetLabel ?? "Target"} is required`);
	}
	if (targetId && targetId.length > 200) throw new Error("Target is too long");

	const tags = [...definition.tags];
	if (targetId) {
		if (scope === "model") tags.push(dynamicTag("web-api-model-", targetId));
		if (scope === "provider") tags.push(dynamicTag("web-api-provider-", targetId));
		if (scope === "organisation") tags.push(dynamicTag("web-api-organisation-", targetId));
		if (scope === "benchmark") tags.push(dynamicTag("web-api-benchmark-", targetId));
		if (scope === "apps") tags.push(dynamicTag("web-api-app-", targetId));
	}

	return {
		definition,
		targetId,
		tags: Array.from(new Set(tags)),
	};
}

export const LEGACY_ALLOWED_CACHE_TAGS: ReadonlySet<string> = new Set(ALL_PUBLIC_TAGS);
