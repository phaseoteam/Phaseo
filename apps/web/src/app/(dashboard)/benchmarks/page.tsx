import BenchmarksDisplay from "@/components/(data)/benchmarks/BenchmarksDisplay";
import {
	BenchmarkCard,
	getAllBenchmarksCached,
} from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";

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

export default async function BenchmarksPage() {
	"use cache";
	cacheLife({
		stale: 60 * 60 * 24 * 7,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 365,
	});

	const benchmarks = (await getAllBenchmarksCached(true)) as BenchmarkCard[];

	return (
		<main className="flex min-h-screen flex-col">
			<div className="container mx-auto px-4 py-8">
				<BenchmarksDisplay benchmarks={benchmarks} />
			</div>
		</main>
	);
}
