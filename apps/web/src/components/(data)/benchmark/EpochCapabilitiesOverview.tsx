import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { epochDashboardQuery } from "./EpochCapabilitiesOverview.functions";
import { EpochDashboard } from "./EpochDashboard";

export function EpochCapabilitiesOverview({ benchmark }: { benchmark: BenchmarkPage }) {
	const { data } = useSuspenseQuery(epochDashboardQuery(benchmark));
	return <EpochDashboard data={data} />;
}
