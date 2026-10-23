import type { Metadata } from "next";

import { Suspense } from "react";

import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { fetchFrontendCompareUsage, fetchFrontendCompareView } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import CompareDashboard from "@/components/(data)/compare/CompareDashboard";
import { decodeModelIdFromUrl } from "@/components/(data)/compare/compareUrl";
import { toCompareModelOption } from "@/components/(data)/compare/types";
import type { CompareView, CompareViewUsageByModel } from "@/components/(data)/compare/view/types";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.compare");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/compare",
		title: t("title"),
		description: t("description"),
		keywords: ["AI model comparison", "compare AI models", "AI benchmarks", "AI model pricing", "Phaseo"],
		openGraph: { type: "website" },
	});
}

type PageProps = {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

const normalizeSelection = (value: string | string[] | undefined): string[] => {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter(Boolean);
	return [value];
};

const EMPTY_VIEW: CompareView = { models: [], benchmarks: [] };

/** Only the fields the page renders, so the client props stay small. */
function pickUsageFields(usage: Awaited<ReturnType<typeof fetchFrontendCompareUsage>>): CompareViewUsageByModel {
	return Object.fromEntries(Object.entries(usage).map(([id, entry]) => [id, {
		periodDays: entry.periodDays,
		tokens30d: entry.tokens30d,
		totalRequests: entry.totalRequests,
		latencyP50Ms30m: entry.latencyP50Ms30m,
		throughputP50TokPerSec30m: entry.throughputP50TokPerSec30m,
		latencyWindow: entry.latencyWindow ?? null,
		throughputWindow: entry.throughputWindow ?? null,
	}]));
}

function CompareDashboardFallback() {
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
			<div className="h-9 w-64 animate-pulse rounded-md bg-muted/50" />
			<div className="mt-3 h-5 w-full max-w-xl animate-pulse rounded-md bg-muted/40" />
			<div className="mt-8 grid gap-3 sm:grid-cols-2">
				<div className="h-12 animate-pulse rounded-md border border-border/70 bg-muted/20" />
				<div className="h-12 animate-pulse rounded-md border border-border/70 bg-muted/20" />
			</div>
		</div>
	);
}

async function ComparePageContent({ searchParams }: PageProps) {
	const resolvedSearchParams = await searchParams;
	const ids = [...new Set(normalizeSelection(resolvedSearchParams?.models).map(decodeModelIdFromUrl).filter(Boolean))].slice(0, 4);

	const [view, usage] = ids.length
		? await Promise.all([
				fetchFrontendCompareView(ids),
				fetchFrontendCompareUsage(ids).then(pickUsageFields).catch((error) => {
					// Usage only fills the "On Phaseo" rows; the comparison still renders without it.
					// eslint-disable-next-line no-console
					console.warn("[compare] Gateway usage unavailable", error);
					return {} as CompareViewUsageByModel;
				}),
			])
		: [EMPTY_VIEW, {} as CompareViewUsageByModel];

	// The pickers load the full model list in the browser when opened, so the
	// page only carries options for the models it compares.
	return (
		<CompareDashboard
			selectedOptions={view.models.map(toCompareModelOption)}
			view={view}
			usage={usage}
		/>
	);
}

export default function Page({ searchParams }: PageProps = {}) {
	return (
		<main className="flex min-h-screen flex-col">
			<section className="w-full">
				<Suspense fallback={<CompareDashboardFallback />}>
					<ComparePageContent searchParams={searchParams} />
				</Suspense>
			</section>
		</main>
	);
}
