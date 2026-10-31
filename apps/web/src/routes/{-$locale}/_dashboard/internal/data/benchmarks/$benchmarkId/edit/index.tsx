import { createFileRoute } from "@tanstack/react-router";
import EditBenchmarkPage from "@/features/internal/data/benchmarks/benchmarkId/edit/EditBenchmarkPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/benchmarks/$benchmarkId/edit/")({
	component: EditBenchmarkPage,
});
