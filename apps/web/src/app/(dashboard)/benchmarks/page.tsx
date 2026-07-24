import BenchmarksDisplay from "@/components/(data)/benchmarks/BenchmarksDisplay";
import type { BenchmarkCard } from "@/lib/fetchers/benchmarks/types";
import { fetchFrontendBenchmarks } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
	title: "Benchmarks",
	description:
		"Explore a comprehensive directory of AI model benchmarks. Compare benchmark scores, see usage statistics, and discover which benchmarks are most popular across state-of-the-art AI models. Make informed decisions with Phaseo.",
	keywords: [
		"AI benchmarks",
		"AI model benchmarks",
		"benchmark scores",
		"compare AI models",
		"AI model evaluation",
		"machine learning benchmarks",
		"Phaseo",
	],
	alternates: {
		canonical: "/benchmarks",
	},
};

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
