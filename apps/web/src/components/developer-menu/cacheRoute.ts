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
	label: string;
	description: string;
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
			label: "Landing pages",
			description: "Homepage metrics and model highlights",
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
			label: "This model",
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
			label: "This API provider",
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
			label: "This organisation",
			description: targetId,
			affectsSearch: true,
		};
	}

	if (section === "benchmarks") {
		const targetId = decodeSegment(firstId) ?? undefined;
		return {
			scope: "benchmark",
			targetId,
			label: targetId ? "This benchmark" : "All benchmarks",
			description: targetId ?? "Benchmark catalogue and model scores",
			affectsSearch: true,
		};
	}

	if (section === "apps") {
		const targetId = decodeSegment(firstId) ?? undefined;
		return {
			scope: "apps",
			targetId,
			label: targetId ? "This app" : "All apps",
			description: targetId ?? "App data, rankings, images, and usage",
			affectsSearch: false,
		};
	}

	if (section === "rankings") {
		return { scope: "rankings", label: "Rankings", description: "Model and app rankings", affectsSearch: false };
	}
	if (section === "updates") {
		return { scope: "updates", label: "Updates", description: "Model, web, and video update feeds", affectsSearch: false };
	}
	if (section === "pricing") {
		return { scope: "pricing", label: "Pricing", description: "Public pricing projections", affectsSearch: false };
	}
	if (["models", "api-providers", "organisations", "families", "countries", "subscription-plans", "compare"].includes(section ?? "")) {
		return {
			scope: "catalogue",
			label: "Models and providers",
			description: "Catalogue, reference data, compare, and search",
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
