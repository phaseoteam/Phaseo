import { cacheLife, cacheTag } from "next/cache";
import {
	fetchFrontendComparePairs,
	fetchFrontendComparePeers,
	fetchFrontendCompareUsage,
	fetchFrontendCompareView,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { ComparePairLink } from "./ComparePairSummary";
import type { CompareView, CompareViewUsageByModel } from "./view/types";

/** Only the fields the page renders, so the client props stay small. */
export function pickUsageFields(usage: Awaited<ReturnType<typeof fetchFrontendCompareUsage>>): CompareViewUsageByModel {
	return Object.fromEntries(Object.entries(usage).map(([id, entry]) => [id, {
		periodDays: entry.periodDays,
		tokens30d: entry.tokens30d,
		totalRequests: entry.totalRequests,
		latencyP50Ms30m: entry.latencyP50Ms30m,
		throughputP50TokPerSec30m: entry.throughputP50TokPerSec30m,
		latencyWindow: entry.latencyWindow ?? null,
		throughputWindow: entry.throughputWindow ?? null,
		...(entry.activity30d ? { activity30d: entry.activity30d } : {}),
	}]));
}

/** Everything a comparison renders. Usage and leaderboard ranks are optional: the comparison still renders without them. */
export async function loadCompareData(ids: string[]): Promise<{ view: CompareView; usage: CompareViewUsageByModel }> {
	const [view, usage, peers] = await Promise.all([
		fetchFrontendCompareView(ids),
		fetchFrontendCompareUsage(ids).then(pickUsageFields).catch((error) => {
			// eslint-disable-next-line no-console
			console.warn("[compare] Gateway usage unavailable", error);
			return {} as CompareViewUsageByModel;
		}),
		fetchFrontendComparePeers(ids).catch((error) => {
			// eslint-disable-next-line no-console
			console.warn("[compare] Leaderboard ranks unavailable", error);
			return [];
		}),
	]);
	return { view: { ...view, peers }, usage };
}

/**
 * A pair page's data, cached for an hour. Pair pages are what crawlers visit,
 * so each one renders from the cache instead of reading the web API per hit.
 */
export async function loadComparePairData(ids: [string, string]) {
	"use cache";
	cacheLife({ revalidate: 60 * 60, expire: 24 * 60 * 60 });
	cacheTag("frontend:compare-models");
	const [data, pairs] = await Promise.all([loadCompareData(ids), loadComparePairs()]);
	const related = pairs.filter((pair) => {
		const pairIds = pair.models.map((model) => model.id);
		return pairIds.some((id) => ids.includes(id)) && !ids.every((id) => pairIds.includes(id));
	}).slice(0, 8);
	return { ...data, related };
}

/** The curated comparisons that get their own pages, for links and the sitemap. */
export async function loadComparePairs(): Promise<ComparePairLink[]> {
	"use cache";
	cacheLife({ revalidate: 60 * 60, expire: 24 * 60 * 60 });
	cacheTag("frontend:compare-models");
	return fetchFrontendComparePairs().catch((error) => {
		// eslint-disable-next-line no-console
		console.warn("[compare] Curated pairs unavailable", error);
		return [];
	});
}
