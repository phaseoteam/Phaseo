import { MetadataRoute } from "next";
import {
	getHelpArticleParams,
	getHelpCategoryParams,
} from "@/lib/content/helpCenter";
import { getMigrationPosts } from "@/lib/content/migrations";
import {
	fetchFrontendAPIProviders,
	fetchFrontendBenchmarks,
	fetchFrontendCountrySummaries,
	fetchFrontendMarketplacePresets,
	fetchFrontendModels,
	fetchFrontendOrganisations,
	fetchFrontendPublicAppIds,
	fetchFrontendSubscriptionPlans,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { SITE_URL } from "@/lib/seo";

// Cache sitemap output at the edge to avoid repeated compute (and Fast Origin Transfer)
// from crawlers hitting `/sitemap.xml` frequently.
export const revalidate = 86400; // 1 day (must be a literal for static analysis)

type SitemapEntry = MetadataRoute.Sitemap[number];
type ChangeFrequency = NonNullable<SitemapEntry["changeFrequency"]>;

type SitemapItem = {
    url: string;
    lastModified: string;
    changeFrequency: ChangeFrequency;
    priority: number;
};

type RouteSuffix = {
    suffix: string;
    changeFrequency: ChangeFrequency;
    priority: number;
};

type ModelSitemapSource = {
	model_id?: string | null;
	updated_at?: string | null;
	primary_date?: string | null;
	announcement_date?: string | null;
};

const baseUrl = SITE_URL;

const staticRoutes: Array<{
    path: string;
    changeFrequency: ChangeFrequency;
    priority: number;
}> = [
        { path: "/", changeFrequency: "daily", priority: 1 },
        { path: "/rankings", changeFrequency: "daily", priority: 0.95 },
        { path: "/models", changeFrequency: "weekly", priority: 0.9 },
        { path: "/api-providers", changeFrequency: "weekly", priority: 0.8 },
        { path: "/apps", changeFrequency: "weekly", priority: 0.75 },
        { path: "/benchmarks", changeFrequency: "weekly", priority: 0.8 },
        { path: "/organisations", changeFrequency: "weekly", priority: 0.75 },
        { path: "/countries", changeFrequency: "weekly", priority: 0.75 },
        { path: "/families", changeFrequency: "weekly", priority: 0.75 },
        { path: "/subscription-plans", changeFrequency: "weekly", priority: 0.75 },
        { path: "/pricing", changeFrequency: "weekly", priority: 0.75 },
        { path: "/methodology", changeFrequency: "monthly", priority: 0.68 },
        { path: "/how-ai-stats-calculates-model-pricing", changeFrequency: "monthly", priority: 0.65 },
        { path: "/how-ai-stats-measures-latency-throughput", changeFrequency: "monthly", priority: 0.65 },
        { path: "/how-ai-stats-normalises-ai-benchmarks", changeFrequency: "monthly", priority: 0.65 },
        { path: "/how-ai-stats-tracks-provider-availability", changeFrequency: "monthly", priority: 0.65 },
        { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
		{ path: "/compare", changeFrequency: "weekly", priority: 0.7 },
		{ path: "/migrate", changeFrequency: "weekly", priority: 0.7 },
		{ path: "/migrate/openrouter", changeFrequency: "weekly", priority: 0.65 },
		{ path: "/migrate/vercel-ai-gateway", changeFrequency: "weekly", priority: 0.65 },
		{ path: "/migrate/requesty", changeFrequency: "weekly", priority: 0.65 },
		{ path: "/migrate/llmgateway", changeFrequency: "weekly", priority: 0.65 },
		{ path: "/gateway/marketplace", changeFrequency: "weekly", priority: 0.6 },
        { path: "/contribute", changeFrequency: "monthly", priority: 0.6 },
        { path: "/roadmap", changeFrequency: "monthly", priority: 0.6 },
        { path: "/about", changeFrequency: "monthly", priority: 0.55 },
        { path: "/contact", changeFrequency: "monthly", priority: 0.55 },
        { path: "/works-with", changeFrequency: "weekly", priority: 0.6 },
        { path: "/performance", changeFrequency: "monthly", priority: 0.55 },
        { path: "/monitor", changeFrequency: "weekly", priority: 0.55 },
        { path: "/models/collections", changeFrequency: "weekly", priority: 0.55 },
        { path: "/tools", changeFrequency: "monthly", priority: 0.65 },
        { path: "/tools/json-formatter", changeFrequency: "monthly", priority: 0.55 },
        { path: "/tools/markdown-preview", changeFrequency: "monthly", priority: 0.55 },
        { path: "/tools/pricing-calculator", changeFrequency: "weekly", priority: 0.6 },
        { path: "/tools/nano-banana-parser", changeFrequency: "monthly", priority: 0.55 },
        { path: "/tools/request-builder", changeFrequency: "monthly", priority: 0.55 },
        { path: "/chat", changeFrequency: "weekly", priority: 0.55 },
        { path: "/chat/image", changeFrequency: "weekly", priority: 0.5 },
        { path: "/chat/video", changeFrequency: "weekly", priority: 0.5 },
        { path: "/chat/audio", changeFrequency: "weekly", priority: 0.5 },
        { path: "/chat/moderation", changeFrequency: "weekly", priority: 0.5 },
        { path: "/chat/embeddings", changeFrequency: "weekly", priority: 0.5 },
        { path: "/help", changeFrequency: "weekly", priority: 0.6 },
        { path: "/updates/models", changeFrequency: "weekly", priority: 0.55 },
        { path: "/updates/web", changeFrequency: "weekly", priority: 0.55 },
        { path: "/updates/youtube", changeFrequency: "weekly", priority: 0.55 },
        { path: "/updates/calendar", changeFrequency: "weekly", priority: 0.55 },
        { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
        { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    ];

const MODEL_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "monthly", priority: 0.78 },
    { suffix: "/quickstart", changeFrequency: "monthly", priority: 0.65 },
    { suffix: "/benchmarks", changeFrequency: "monthly", priority: 0.65 },
    { suffix: "/providers", changeFrequency: "monthly", priority: 0.6 },
    { suffix: "/family", changeFrequency: "monthly", priority: 0.6 },
    { suffix: "/performance", changeFrequency: "monthly", priority: 0.6 },
];

const PROVIDER_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.75 },
    { suffix: "/models", changeFrequency: "weekly", priority: 0.65 },
];

const ORGANISATION_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.7 },
];

const PLAN_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.7 },
];

const BENCHMARK_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.7 },
];

const COUNTRY_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.65 },
];

const MARKETPLACE_PRESET_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.55 },
];

const APP_SUFFIXES: RouteSuffix[] = [
	{ suffix: "", changeFrequency: "weekly", priority: 0.55 },
];

function buildRouteUrl(route: string): string {
    if (route.startsWith("http")) {
        return route;
    }
    return `${baseUrl}${route}`;
}

function createItem(
    route: string,
    changeFrequency: ChangeFrequency,
    priority: number,
    lastModified: string,
): SitemapItem {
    return {
        url: buildRouteUrl(route),
        lastModified,
        changeFrequency,
        priority,
    };
}

function normalizeSingleSegmentSlugs(list?: string[], label?: string): string[] {
	const normalized = new Set<string>();
	let dropped = 0;

	(list ?? []).forEach((slug) => {
		if (!slug) {
			return;
		}
		const cleaned = slug.trim().replace(/^\/+|\/+$/g, "");
		if (!cleaned) {
			return;
		}
		if (cleaned.includes("/")) {
			dropped += 1;
			return;
		}
		normalized.add(cleaned);
	});

	if (dropped > 0) {
		console.warn(
			`[sitemap] dropped ${dropped} malformed ${
				label ?? "single segment"
			} slug(s)`,
		);
	}

	return [...normalized].sort();
}

function normalizeModelRouteSlugs(models?: ModelSitemapSource[]): string[] {
	const normalized = new Set<string>();
	let dropped = 0;

	(models ?? []).forEach((model) => {
		const rawModelId = String(model?.model_id ?? "")
			.trim()
			.replace(/^\/+|\/+$/g, "");
		if (!rawModelId) {
			return;
		}

		const parts = rawModelId.split("/").filter(Boolean);
		if (parts.length !== 2) {
			dropped += 1;
			return;
		}

		normalized.add(rawModelId);
	});

	if (dropped > 0) {
		console.warn(
			`[sitemap] dropped ${dropped} malformed model slug(s) that do not match /models/{organisationId}/{modelId}`,
		);
	}

	return [...normalized].sort();
}

function fromSettled<T>(
	result: PromiseSettledResult<T>,
	label: string,
	fallback: T
): T {
	if (result.status === "fulfilled") {
		return result.value;
	}
	console.warn(`[sitemap] failed to load ${label}`, result.reason);
	return fallback;
}

function applySuffixes(
    prefix: string,
    slugs: string[],
    suffixes: RouteSuffix[],
    lastModified: string,
): SitemapItem[] {
    if (!slugs.length) {
        return [];
    }
    const items: SitemapItem[] = [];
    slugs.forEach((slug) => {
        suffixes.forEach((suffix) => {
            const route = suffix.suffix
                ? `${prefix}/${slug}${suffix.suffix}`
                : `${prefix}/${slug}`;
            items.push(
                createItem(route, suffix.changeFrequency, suffix.priority, lastModified),
            );
        });
    });
    return items;
}

function resolveLastModified(
	...candidates: Array<string | null | undefined>
): string | null {
	let latest: string | null = null;
	let latestMs = Number.NEGATIVE_INFINITY;

	for (const candidate of candidates) {
		if (!candidate) continue;
		const parsed = Date.parse(candidate);
		if (!Number.isFinite(parsed) || parsed <= latestMs) continue;
		latestMs = parsed;
		latest = candidate;
	}

	return latest;
}

function applySuffixesWithEntries<T extends { slug: string; lastModified?: string | null }>(
	prefix: string,
	entries: T[],
	suffixes: RouteSuffix[],
	fallbackLastModified: string,
): SitemapItem[] {
	if (!entries.length) {
		return [];
	}

	const items: SitemapItem[] = [];
	for (const entry of entries) {
		for (const suffix of suffixes) {
			const route = suffix.suffix
				? `${prefix}/${entry.slug}${suffix.suffix}`
				: `${prefix}/${entry.slug}`;
			items.push(
				createItem(
					route,
					suffix.changeFrequency,
					suffix.priority,
					entry.lastModified ?? fallbackLastModified,
				),
			);
		}
	}

	return items;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const lastModified =
		process.env.NEXT_PUBLIC_DEPLOY_TIME ?? new Date().toISOString();
	const staticItems = staticRoutes.map((route) =>
		createItem(route.path, route.changeFrequency, route.priority, lastModified),
	);

	const [
		modelsResult,
		apiProvidersResult,
		organisationsResult,
		benchmarksResult,
		plansResult,
		countriesResult,
		marketplacePresetsResult,
		publicAppsResult,
		helpCategoryResult,
		helpArticleResult,
	] = await Promise.allSettled([
		fetchFrontendModels(),
		fetchFrontendAPIProviders(),
		fetchFrontendOrganisations(),
		fetchFrontendBenchmarks(false),
		fetchFrontendSubscriptionPlans(),
		fetchFrontendCountrySummaries(),
		fetchFrontendMarketplacePresets(),
		fetchFrontendPublicAppIds(),
		getHelpCategoryParams(),
		getHelpArticleParams(),
	]);

	const modelsForSitemap = fromSettled(modelsResult, "models for sitemap", []);
	const modelSlugs = normalizeModelRouteSlugs(modelsForSitemap);
	const modelEntries = modelSlugs.map((slug) => {
		const source = modelsForSitemap.find(
			(model) => String(model.model_id ?? "").trim() === slug,
		);
		return {
			slug,
			lastModified:
				resolveLastModified(
					source?.updated_at,
					source?.primary_date,
					source?.announcement_date,
				) ?? lastModified,
		};
	});
	const providersForSitemap = fromSettled(
		apiProvidersResult,
		"api providers for sitemap",
		[],
	);
	const providerSlugs = normalizeSingleSegmentSlugs(
		providersForSitemap.map((provider) =>
			String(provider.api_provider_id ?? "").trim()
		),
		"api provider",
	);
	const providerEntries = providerSlugs.map((slug) => {
		const source = providersForSitemap.find(
			(provider) => String(provider.api_provider_id ?? "").trim() === slug,
		);
		return {
			slug,
			lastModified:
				resolveLastModified(source?.last_updated_at) ?? lastModified,
		};
	});
	const organisationSlugs = normalizeSingleSegmentSlugs(
		fromSettled(organisationsResult, "organisations for sitemap", []).map(
			(organisation) => String(organisation.organisation_id ?? "").trim()
		),
		"organisation",
	);
	const benchmarkSlugs = normalizeSingleSegmentSlugs(
		fromSettled(benchmarksResult, "benchmarks for sitemap", []).map(
			(benchmark) => String(benchmark.benchmark_id ?? "").trim()
		),
		"benchmark",
	);
	const planSlugs = normalizeSingleSegmentSlugs(
		fromSettled(plansResult, "subscription plans for sitemap", []).map(
			(plan) => String(plan.plan_id ?? "").trim()
		),
		"subscription plan",
	);
	const countrySlugs = normalizeSingleSegmentSlugs(
		fromSettled(countriesResult, "countries for sitemap", []).map(
			(country) => String(country.iso ?? "").trim()
		),
		"country",
	);
	const marketplacePresetSlugs = normalizeSingleSegmentSlugs(
		fromSettled(
			marketplacePresetsResult,
			"marketplace presets for sitemap",
			[],
		).map((preset) => String(preset.id ?? "").trim()),
		"marketplace preset",
	);
	const publicAppIds = normalizeSingleSegmentSlugs(
		fromSettled(publicAppsResult, "public apps for sitemap", []),
		"public app",
	);

	const dynamicItems = [
		...applySuffixesWithEntries(
			"/models",
			modelEntries,
			MODEL_SUFFIXES,
			lastModified,
		),
		...applySuffixesWithEntries(
			"/api-providers",
			providerEntries,
			PROVIDER_SUFFIXES,
			lastModified
		),
		...applySuffixes(
			"/organisations",
			organisationSlugs,
			ORGANISATION_SUFFIXES,
			lastModified
		),
		...applySuffixes(
			"/benchmarks",
			benchmarkSlugs,
			BENCHMARK_SUFFIXES,
			lastModified
		),
		...applySuffixes(
			"/subscription-plans",
			planSlugs,
			PLAN_SUFFIXES,
			lastModified
		),
		...applySuffixes(
			"/countries",
			countrySlugs,
			COUNTRY_SUFFIXES,
			lastModified
		),
		...applySuffixes(
			"/gateway/marketplace",
			marketplacePresetSlugs,
			MARKETPLACE_PRESET_SUFFIXES,
			lastModified
		),
	];

	const appItems = applySuffixes("/apps", publicAppIds, APP_SUFFIXES, lastModified);
	const migrationItems = getMigrationPosts().map((post) =>
		createItem(`/migrate/${post.slug}`, "weekly", 0.6, post.updatedAt || lastModified),
	);

	const helpCategoryParams = fromSettled(
		helpCategoryResult,
		"help categories for sitemap",
		[]
	);
	const helpArticleParams = fromSettled(
		helpArticleResult,
		"help articles for sitemap",
		[]
	);
	const helpCategoryItems = helpCategoryParams
		.filter(
			(entry) =>
				entry.category &&
				entry.category !== "__placeholder__",
		)
		.map((entry) =>
			createItem(
				`/help/${entry.category}`,
				"weekly",
				0.55,
				lastModified,
			),
		);
	const helpArticleItems = helpArticleParams
		.filter(
			(entry) =>
				entry.category &&
				entry.slug &&
				entry.category !== "__placeholder__" &&
				entry.slug !== "__placeholder__",
		)
		.map((entry) =>
			createItem(
				`/help/${entry.category}/${entry.slug}`,
				"monthly",
				0.5,
				lastModified,
			),
		);

	return [
		...staticItems,
		...helpCategoryItems,
		...helpArticleItems,
		...dynamicItems,
		...appItems,
		...migrationItems,
	];
}
