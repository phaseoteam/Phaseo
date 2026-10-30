import { queryOptions } from "@tanstack/react-query";
import type { BenchmarkCard } from "@/lib/fetchers/benchmarks/types";
import { fetchFrontendBenchmarks } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export const benchmarksQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "benchmarks", true],
		queryFn: async () => (await fetchFrontendBenchmarks(true)) as BenchmarkCard[],
	});
