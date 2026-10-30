import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import { fetchEpochDashboard } from "@/lib/benchmarks/epochDashboardData";
import { EpochDashboard } from "./EpochDashboard";

export async function EpochCapabilitiesOverview({ benchmark }: { benchmark: BenchmarkPage }) {
	return <EpochDashboard data={await fetchEpochDashboard(benchmark)} />;
}
