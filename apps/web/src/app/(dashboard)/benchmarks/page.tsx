import BenchmarksDisplay from "@/components/(data)/benchmarks/BenchmarksDisplay";
import {
	BenchmarkCard,
	getAllBenchmarksCached,
} from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
	title: "AI Model Benchmarks - Compare Scores & Evaluations",
	description:
		"Explore a comprehensive directory of AI model benchmarks. Compare benchmark scores, see usage statistics, and discover which benchmarks are most popular across state-of-the-art AI models. Make informed decisions with AI Stats.",
	keywords: [
		"AI benchmarks",
		"AI model benchmarks",
		"benchmark scores",
		"compare AI models",
		"AI model evaluation",
		"machine learning benchmarks",
		"AI Stats",
	],
	alternates: {
		canonical: "/benchmarks",
	},
};

async function BenchmarksSection() {
	const benchmarks = (await getAllBenchmarksCached(true)) as BenchmarkCard[];
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
