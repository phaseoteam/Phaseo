import { createFileRoute } from "@tanstack/react-router";
import BenchmarksPage from "@/features/internal/data/benchmarks/BenchmarksPage";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/benchmarks/")({
	component: BenchmarksPage,
});
