import { createFileRoute } from "@tanstack/react-router";
import NewBenchmarkPage from "@/features/internal/data/benchmarks/new/NewBenchmarkPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/benchmarks/new/")({
	component: NewBenchmarkPage,
});
