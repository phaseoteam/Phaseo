import type { Metadata } from "next";

import { Suspense, use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import CompareDashboard from "@/components/(data)/compare/CompareDashboard";
import { decodeModelIdFromUrl } from "@/components/(data)/compare/compareUrl";
import { toCompareModelOption } from "@/components/(data)/compare/types";
import { compareSelectionQuery } from "./page.queries";

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

function ComparePageContent({ searchParams }: PageProps) {
	const resolvedSearchParams = searchParams && "then" in searchParams ? use(searchParams) : searchParams;
	const ids = [...new Set(normalizeSelection(resolvedSearchParams?.models).map(decodeModelIdFromUrl).filter(Boolean))].slice(0, 4);

	// With nothing selected, the page lists the curated head-to-head pages instead.
	const { data: { view, usage, pairs } } = useSuspenseQuery(compareSelectionQuery(ids));

	// The pickers load the full model list in the browser when opened, so the
	// page only carries options for the models it compares.
	return (
		<CompareDashboard
			selectedOptions={view.models.map(toCompareModelOption)}
			view={view}
			usage={usage}
			pairs={pairs}
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
