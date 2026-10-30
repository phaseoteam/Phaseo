import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";

// The Epoch CSVs are fetched server-side only (`server-only` module, no
// browser CORS). POST so client navigations can send the page's benchmark,
// which the dashboard falls back to when Epoch is unavailable.
const getEpochDashboard = createServerFn({ method: "POST" })
	.validator((benchmark: BenchmarkPage) => benchmark)
	.handler(async ({ data: benchmark }) => {
		const { fetchEpochDashboard } = await import("@/lib/benchmarks/epochDashboardData");
		return fetchEpochDashboard(benchmark);
	});

export const epochDashboardQuery = (benchmark: BenchmarkPage) =>
	queryOptions({
		queryKey: [
			"phaseo-web",
			"catalogue-benchmark",
			"epoch-dashboard",
			benchmark.id,
			benchmark.results.length,
			benchmark.results.map((result) => result.updated_at ?? "").sort().at(-1) ?? "",
		] as const,
		queryFn: () => getEpochDashboard({ data: benchmark }),
	});
