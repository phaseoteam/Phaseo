import BenchmarksDisplay from "@/components/(data)/benchmarks/BenchmarksDisplay";
import type { BenchmarkCard } from "@/lib/fetchers/benchmarks/types";
import { fetchFrontendBenchmarks } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.benchmarks");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/benchmarks",
		title: t("title"),
		description: t("description"),
		keywords: ["AI benchmarks", "AI model benchmarks", "benchmark scores", "compare AI models", "Phaseo"],
	});
}

async function BenchmarksSection() {
	const benchmarks = (await fetchFrontendBenchmarks(true)) as BenchmarkCard[];
	return <BenchmarksDisplay benchmarks={benchmarks} />;
}

function BenchmarksFallback() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-9 w-56" />
			<Skeleton className="h-11 w-full" />
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<Skeleton key={index} className="h-40 w-full rounded-xl" />
				))}
			</div>
		</div>
	);
}

export default function BenchmarksPage() {
	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<Suspense fallback={<BenchmarksFallback />}>
					<BenchmarksSection />
				</Suspense>
			</div>
		</main>
	);
}
