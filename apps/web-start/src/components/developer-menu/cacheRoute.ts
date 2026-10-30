export type DeveloperCacheScope =
	| "apps"
	| "benchmark"
	| "catalogue"
	| "landing"
	| "model"
	| "organisation"
	| "pricing"
	| "provider"
	| "rankings"
	| "updates";

export type PageCacheTarget = {
	scope: DeveloperCacheScope;
	labelKey: string;
	descriptionKey?: string;
	description?: string;
	targetId?: string;
	affectsSearch: boolean;
};

function decodeSegment(value: string | undefined) {
	if (!value) return null;
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

export function getPageCacheTarget(pathname: string): PageCacheTarget | null {
	const segments = pathname.split("/").filter(Boolean);
	const [section, firstId, secondId] = segments;

	if (segments.length === 0) {
		return {
			scope: "landing",
			labelKey: "landingPages",
			descriptionKey: "homepageMetricsAndHighlights",
			affectsSearch: false,
		};
	}

	if (section === "models" && firstId && secondId && !["collections", "table"].includes(firstId)) {
		const organisationId = decodeSegment(firstId);
		const modelSlug = decodeSegment(secondId);
		if (!organisationId || !modelSlug) return null;
		const targetId = `${organisationId}/${modelSlug}`;
		return {
			scope: "model",
			targetId,
			labelKey: "thisModel",
			description: targetId,
			affectsSearch: true,
		};
	}

	if (section === "api-providers" && firstId) {
		const targetId = decodeSegment(firstId);
		if (!targetId) return null;
		return {
			scope: "provider",
			targetId,
			labelKey: "thisApiProvider",
			description: targetId,
			affectsSearch: true,
		};
	}

	if (section === "organisations" && firstId) {
		const targetId = decodeSegment(firstId);
		if (!targetId) return null;
		return {
			scope: "organisation",
			targetId,
			labelKey: "thisOrganisation",
			description: targetId,
			affectsSearch: true,
		};
	}

	if (section === "benchmarks") {
		const targetId = decodeSegment(firstId) ?? undefined;
		return {
			scope: "benchmark",
			targetId,
			labelKey: targetId ? "thisBenchmark" : "allBenchmarks",
			descriptionKey: targetId ? undefined : "benchmarkCatalogueAndScores",
			description: targetId,
			affectsSearch: true,
		};
	}

	if (section === "apps") {
		const targetId = decodeSegment(firstId) ?? undefined;
		return {
			scope: "apps",
			targetId,
			labelKey: targetId ? "thisApp" : "allApps",
			descriptionKey: targetId ? undefined : "appDataRankingsImagesUsage",
			description: targetId,
			affectsSearch: false,
		};
	}

	if (section === "rankings") {
		return { scope: "rankings", labelKey: "rankings", descriptionKey: "modelAndAppRankings", affectsSearch: false };
	}
	if (section === "updates") {
		return { scope: "updates", labelKey: "updates", descriptionKey: "modelUpdateFeeds", affectsSearch: false };
	}
	if (section === "pricing") {
		return { scope: "pricing", labelKey: "pricing", descriptionKey: "publicPricingProjections", affectsSearch: false };
	}
	if (["models", "api-providers", "organisations", "families", "countries", "subscription-plans", "compare"].includes(section ?? "")) {
		return {
			scope: "catalogue",
			labelKey: "modelsAndProviders",
			descriptionKey: "catalogueReferenceCompareSearch",
			affectsSearch: true,
		};
	}

	return null;
}

export function getCacheControlHref(target: PageCacheTarget | null) {
	if (!target) return "/internal/cache";
	const params = new URLSearchParams({ scope: target.scope });
	if (target.targetId) params.set("target", target.targetId);
	return `/internal/cache?${params.toString()}`;
}
