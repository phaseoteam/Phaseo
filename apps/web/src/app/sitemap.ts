import { MetadataRoute } from "next";
import manifestData from "@/data/manifest.json";
import {
	getHelpArticleParams,
	getHelpCategoryParams,
} from "@/lib/content/helpCenter";
import { getPublicAppIdsCached } from "@/lib/fetchers/apps/getAppDetails";

// Cache sitemap output at the edge to avoid repeated compute (and Fast Origin Transfer)
// from crawlers hitting `/sitemap.xml` frequently.
export const revalidate = 86400; // 1 day (must be a literal for static analysis)

type ManifestFile = {
    organisations?: string[];
    models?: Record<string, string[]>;
    benchmarks?: string[];
    api_providers?: string[];
    subscription_plans?: string[];
};

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

const manifest = manifestData as ManifestFile;
const baseUrl = (
	process.env.NEXT_PUBLIC_WEBSITE_URL ??
	process.env.WEBSITE_URL ??
	"https://ai-stats.phaseo.app"
).replace(/\/$/, "");

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
        { path: "/families", changeFrequency: "weekly", priority: 0.75 },
        { path: "/subscription-plans", changeFrequency: "weekly", priority: 0.75 },
        { path: "/compare", changeFrequency: "weekly", priority: 0.7 },
		{ path: "/migrate", changeFrequency: "weekly", priority: 0.7 },
		{ path: "/gateway", changeFrequency: "weekly", priority: 0.7 },
		{ path: "/gateway/marketplace", changeFrequency: "weekly", priority: 0.6 },
        { path: "/contribute", changeFrequency: "monthly", priority: 0.6 },
        { path: "/roadmap", changeFrequency: "monthly", priority: 0.6 },
        { path: "/tools", changeFrequency: "monthly", priority: 0.65 },
        { path: "/tools/json-formatter", changeFrequency: "monthly", priority: 0.55 },
        { path: "/tools/markdown-preview", changeFrequency: "monthly", priority: 0.55 },
        { path: "/tools/request-builder", changeFrequency: "monthly", priority: 0.55 },
        { path: "/help", changeFrequency: "weekly", priority: 0.6 },
        { path: "/updates", changeFrequency: "weekly", priority: 0.65 },
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
    { suffix: "/pricing", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/family", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/timeline", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/performance", changeFrequency: "weekly", priority: 0.6 },
];

const PROVIDER_SUFFIXES: RouteSuffix[] = [
    { suffix: "", changeFrequency: "weekly", priority: 0.75 },
    { suffix: "/text-models", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/image-models", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/video-models", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/audio-models", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/embeddings-models", changeFrequency: "weekly", priority: 0.6 },
    { suffix: "/moderations-models", changeFrequency: "weekly", priority: 0.6 },
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

function normalizeSlugs(list?: string[]): string[] {
    const normalized = new Set<string>();
    (list ?? []).forEach((slug) => {
        if (!slug) {
            return;
        }
        const cleaned = slug.trim();
        if (cleaned) {
            normalized.add(cleaned);
        }
    });
    return [...normalized].sort();
}

function getModelSlugs(map?: ManifestFile["models"]): string[] {
    const normalized = new Set<string>();
    if (!map) {
        return [];
    }
    Object.entries(map).forEach(([, list]) => {
        (list ?? []).forEach((slug) => {
            if (!slug) {
                return;
            }
            const cleaned = slug.trim();
            if (cleaned) {
                normalized.add(`${cleaned}`);
            }
        });
    });
    return [...normalized].sort();
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

function generateItems(
    getSlugs: () => string[],
    prefix: string,
    suffixes: RouteSuffix[],
    lastModified: string,
): SitemapItem[] {
    const slugs = getSlugs();
    return applySuffixes(prefix, slugs, suffixes, lastModified);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const lastModified =
		process.env.NEXT_PUBLIC_DEPLOY_TIME ?? new Date().toISOString();
	const staticItems = staticRoutes.map((route) =>
		createItem(route.path, route.changeFrequency, route.priority, lastModified),
	);

	const dynamicItems = [
		...generateItems(
			() => getModelSlugs(manifest.models),
			"/models",
			MODEL_SUFFIXES,
			lastModified,
		),
		...generateItems(
			() => normalizeSlugs(manifest.api_providers),
			"/api-providers",
			PROVIDER_SUFFIXES,
			lastModified,
		),
		...generateItems(
			() => normalizeSlugs(manifest.organisations),
			"/organisations",
			ORGANISATION_SUFFIXES,
			lastModified,
		),
		...generateItems(
			() => normalizeSlugs(manifest.benchmarks),
			"/benchmarks",
			BENCHMARK_SUFFIXES,
			lastModified,
		),
		...generateItems(
			() => normalizeSlugs(manifest.subscription_plans),
			"/subscription-plans",
			PLAN_SUFFIXES,
			lastModified,
		),
	];

	const publicAppIds = await getPublicAppIdsCached();
	const appItems = applySuffixes("/apps", publicAppIds, APP_SUFFIXES, lastModified);

	const [helpCategoryParams, helpArticleParams] = await Promise.all([
		getHelpCategoryParams(),
		getHelpArticleParams(),
	]);
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
