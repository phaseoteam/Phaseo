import { queryOptions } from "@tanstack/react-query";
import type { BenchmarkCard } from "@/lib/fetchers/benchmarks/types";
import { fetchFrontendBenchmarkDirectory, fetchFrontendBenchmarks } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const benchmarksQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "benchmarks", true],
		queryFn: async () => (await fetchFrontendBenchmarks(true)) as BenchmarkCard[],
	});

/** Counts and freshness per benchmark, aggregated in the database; an empty list falls back to the plain list. */
export const benchmarkDirectoryQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "benchmark-directory"],
		queryFn: () => fetchFrontendBenchmarkDirectory().catch(() => []),
	});
