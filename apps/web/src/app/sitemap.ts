import { MetadataRoute } from "next";
import {
	getHelpArticleParams,
	getHelpCategoryParams,
} from "@/lib/content/helpCenter";
import { getPublicAppIdsCached } from "@/lib/fetchers/apps/getAppDetails";
import { getAllModelsCached } from "@/lib/fetchers/models/getAllModels";
import { getAllAPIProvidersCached } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import { getAllOrganisationsCached } from "@/lib/fetchers/organisations/getAllOrganisations";
import { getAllBenchmarksCached } from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import { getAllSubscriptionPlansCached } from "@/lib/fetchers/subscription-plans/getAllSubscriptionPlans";
import { getCountrySummariesCached } from "@/lib/fetchers/countries/getCountrySummaries";
import { SITE_URL } from "@/lib/seo";
import { createAdminClient } from "@/utils/supabase/admin";

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
};

type PresetSitemapSource = {
	id?: string | null;
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
        { path: "/benchmarks", changeFrequency: "weekly", priority: 0.8 },
        { path: "/organisations", changeFrequency: "weekly", priority: 0.75 },
        { path: "/countries", changeFrequency: "weekly", priority: 0.75 },
        { path: "/families", changeFrequency: "weekly", priority: 0.75 },
        { path: "/subscription-plans", changeFrequency: "weekly", priority: 0.75 },
        { path: "/pricing", changeFrequency: "weekly", priority: 0.75 },
        { path: "/compare", changeFrequency: "weekly", priority: 0.7 },
		{ path: "/migrate", changeFrequency: "weekly", priority: 0.7 },
		{ path: "/gateway", changeFrequency: "weekly", priority: 0.7 },
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
        { path: "/chat/unified", changeFrequency: "weekly", priority: 0.5 },
        { path: "/help", changeFrequency: "weekly", priority: 0.6 },
        { path: "/updates/models", changeFrequency: "weekly", priority: 0.55 },
        { path: "/updates/web", changeFrequency: "weekly", priority: 0.55 },
        { path: "/updates/youtube", changeFrequency: "weekly", priority: 0.55 },
        { path: "/updates/calendar", changeFrequency: "weekly", priority: 0.55 },
        { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
        { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    ];

const MODEL_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.78 },
    { suffix: "/quickstart", changeFrequency: "weekly", priority: 0.65 },
    { suffix: "/benchmarks", changeFrequency: "weekly", priority: 0.65 },
    { suffix: "/providers", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/family", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/timeline", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/performance", changeFrequency: "weekly", priority: 0.6 },
];

const PROVIDER_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.75 },
    { suffix: "/models", changeFrequency: "weekly", priority: 0.65 },
];

const ORGANISATION_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.7 },
    { suffix: "/models", changeFrequency: "weekly", priority: 0.6 },
];

const PLAN_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.7 },
    { suffix: "/features", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/models", changeFrequency: "weekly", priority: 0.6 },
];

const BENCHMARK_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.7 },
];

const COUNTRY_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.65 },
    { suffix: "/models", changeFrequency: "weekly", priority: 0.55 },
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

async function getPublicMarketplacePresetIds(): Promise<string[]> {
	try {
		const supabase = createAdminClient();
		const { data, error } = await supabase
			.from("presets")
			.select("id")
			.eq("visibility", "public");

		if (error) {
			console.warn(
				"[sitemap] failed to load marketplace presets for sitemap",
				error
			);
			return [];
		}

		return normalizeSingleSegmentSlugs(
			(data as PresetSitemapSource[] | null | undefined)?.map(
				(preset) => String(preset.id ?? "").trim()
			) ?? [],
			"marketplace preset"
		);
	} catch (error) {
		console.warn("[sitemap] failed to load marketplace presets for sitemap", error);
		return [];
	}
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
		getAllModelsCached(false),
		getAllAPIProvidersCached(),
		getAllOrganisationsCached(),
		getAllBenchmarksCached(false),
		getAllSubscriptionPlansCached(),
		getCountrySummariesCached(false),
		getPublicMarketplacePresetIds(),
		getPublicAppIdsCached(),
		getHelpCategoryParams(),
		getHelpArticleParams(),
	]);

	const modelSlugs = normalizeModelRouteSlugs(
		fromSettled(modelsResult, "models for sitemap", [])
	);
	const providerSlugs = normalizeSingleSegmentSlugs(
		fromSettled(apiProvidersResult, "api providers for sitemap", []).map(
			(provider) => String(provider.api_provider_id ?? "").trim()
		),
		"api provider",
	);
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
	const marketplacePresetSlugs = fromSettled(
		marketplacePresetsResult,
		"marketplace presets for sitemap",
		[]
	);
	const publicAppIds = normalizeSingleSegmentSlugs(
		fromSettled(publicAppsResult, "public apps for sitemap", []),
		"public app",
	);

	const dynamicItems = [
		...applySuffixes("/models", modelSlugs, MODEL_SUFFIXES, lastModified),
		...applySuffixes(
			"/api-providers",
			providerSlugs,
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
	];
}
